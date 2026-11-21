# Screening Room

An entertainment web app for browsing movies and TV series, bookmarking what you want to watch, and getting recommendations based on what you save.

> Developed an entertainment web app with content organization, bookmarking, and personalized recommendations. Demonstrates third-party API integration, caching strategies for rate-limited APIs, and recommendation algorithms based on user interaction patterns.

## Features

| Area | What it does |
|---|---|
| Browse | Home, Movies, TV Series and Bookmarks pages, all with poster grids and infinite scroll |
| Search | A search bar on every page. Home searches everything, Movies and TV search their own type, and Bookmarks filters your saved list locally |
| Filters | Movies and TV filter by genre (multi-select), sort (popular, top rated, newest) and decade. TV adds a still-airing or ended filter. Filters live in the URL, so a filtered view can be shared |
| Bookmarks | Add or remove from any poster, with optimistic updates. Bookmarks are split into movies and series, and sort by date saved or title |
| Ratings and reviews | Rate 1 to 10 with an optional review. Each title shows the average rating and the reviews posted in the app |
| Recommendations | A "For you" shelf that explains each pick ("Because you bookmarked…", "Popular with people who saved…") |
| Bookmarked together | Detail pages show what other people saved alongside this title |
| Social | Friend requests by email, sharing a title with a note, a shared-with-you inbox, and viewing a friend's bookmarks |
| Season alerts | New seasons or announced air dates for bookmarked series appear in the bell icon |
| `/stats` | Live cache hit rate, upstream calls, queue depth, 429s and retries |

## Architecture

```
 Browser (React client components, TanStack Query)
   │  infinite queries, optimistic bookmark mutations
   ▼
 Next.js route handlers  /api/*  ── Zod validation ── inbound sliding-window limiter (per user or IP)
   │
   ├─ catalog.ts ─► tmdb client ─► TieredCache ─► TokenBucket ─► withRetry ─► api.themoviedb.org
   │                                 │  tier 1: in-process LRU
   │                                 │  tier 2: Postgres ApiCache (shared by all instances, survives restarts)
   │
   ├─ recs/  signals → GenreAffinity · item-item CF → ItemSimilarity · hybrid blend
   ├─ alerts.ts  TvSnapshot diff → Alert  (Vercel Cron, daily)
   └─ Prisma 7 + Neon Postgres (pg adapter)
```

**Stack:** Next.js 16 (App Router, Cache Components), React 19, TypeScript, Tailwind CSS 4, Prisma 7 with Neon Postgres, iron-session, TanStack Query, Zod, Vitest and MSW. Deployed on Vercel.

**On serverless:** the in-memory cache tier and the inbound rate limiter are per instance, so they're best-effort; the Postgres cache tier is shared. Work that should outlive a response (rebuilding similarity, background season checks) runs in `after()`.

## Working with a rate-limited API

All TMDB traffic goes through one function, `tmdb.get()` in `src/lib/tmdb/client.ts`.

**Two-tier cache** (`src/lib/tmdb/cache.ts`):
- Lookups check an in-memory LRU first, then the Postgres `ApiCache` table, so the cache survives restarts and is shared across serverless instances.
- TTL depends on how volatile the data is:

  | Data | TTL |
  |---|---|
  | Genres and configuration | 7 days |
  | Title details | 24 hours |
  | Lists | 1 hour |
  | Search | 10 minutes |
  | TV status, for alerts | 6 hours |

- **Stale-while-revalidate.** An expired entry is returned immediately while it refreshes in the background.
- **Request coalescing.** Ten simultaneous requests for the same key make one upstream call.
- **Serve-stale-on-error.** If TMDB is down or answers 429, any stored copy, however old, is served instead of failing.

**Outbound limiting** (`rateLimiter.ts`):
- A token bucket (default 35 requests per second, `TMDB_MAX_RPS`) queues requests rather than dropping them.
- A 429 pauses the whole bucket for `Retry-After`.
- Failed calls retry with exponential backoff plus jitter (3 tries). A 404 is not retried.

**Inbound limiting** (`ratelimit-inbound.ts`):
- Sliding windows per user or IP: search 30 per minute, browsing 120, writes 60.
- Over the limit, the API returns 429 with `Retry-After`.
- This keeps one client from draining the shared TMDB quota.

**Image loading.** A custom `next/image` loader maps requested widths onto TMDB's CDN size buckets (w185 to w1280), so images aren't optimized twice.

## Recommendations from implicit signals

There is no viewing history. Preference is inferred from what people save, rate and search for (`src/lib/recs/`).

1. **Signals → genre profile** (`signals.ts`). Each signal adds weight to the title's genres. Weights decay with a 30-day half-life, and TV's combined genres (such as "Sci-Fi & Fantasy") map onto movie genres so one profile covers both.

   | Signal | Weight |
   |---|---|
   | Bookmark | +3 |
   | Rating | (score − 5.5) × 0.8, so a 2/10 counts against the genre |
   | Clicked search result | +1 |
   | Genre word in a search | +0.5 |

2. **Item-item collaborative filtering** (`collaborative.ts`).
   - Each user is a sparse vector: a bookmark counts 1, a rating of 6 or more counts score/10.
   - Similarity is the cosine between title vectors, kept only when at least 2 users share both titles, and limited to the top 30 neighbors per title.
   - Results are stored in `ItemSimilarity` and rebuilt after the response (throttled to once per 30 seconds) whenever a bookmark or rating changes.
   - The same table powers "Bookmarked together".
3. **Content-based** (`recommend.ts`). Candidates come from TMDB's related titles for your five most recent favorites, plus a discover query on your top three genres. Each is scored by cosine between its genres and your profile.
4. **Hybrid blend** (`hybrid.ts`).
   - The score is `0.5·CF + 0.35·content + 0.15·popularity`.
   - Below 5 signals (cold start), the weights shift to `0.15 / 0.7 / 0.15`.
   - Anything you've already bookmarked or rated is excluded.
   - A greedy diversity pass keeps any one genre to 40% of the shelf.
   - Every pick carries the reason from whichever component contributed most.

## Getting started

Requirements: Node 20 or later.

1. Install dependencies. This also generates the Prisma client.

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill it in:
   - **`DATABASE_URL`** and **`DATABASE_URL_UNPOOLED`**: a free Neon Postgres database. Use a development branch, not the production one (see Environments and databases below). `npx vercel env pull .env.local` copies the Development values.
   - **`TMDB_READ_TOKEN`**: free from themoviedb.org → Settings → API → *API Read Access Token*.
   - **`SESSION_PASSWORD`**: any random string of 32 or more characters.
   - **`CRON_SECRET`**: any random string.

   ```bash
   cp .env.example .env
   ```

3. Create the tables.

   ```bash
   npx prisma migrate deploy
   ```

4. Seed the database: about 300 titles and 40 synthetic users, which collaborative filtering needs to have something to learn from.

   ```bash
   npm run db:seed
   ```

5. Start the dev server at http://localhost:3000.

   ```bash
   npm run dev
   ```

**Demo login:** `demo@example.com` / `screening-demo`. The demo account is seeded with three friends, a pending request and some shared titles.

### Environments and databases

Each environment has its own database, so local work and tests never touch live data:

| Environment | Database |
|---|---|
| Production (Vercel) | Neon `main` branch |
| Preview deployments and local development | Neon `dev` branch, a copy of `main` taken when it was created |
| CI (GitHub Actions) | A throwaway Postgres container, created fresh for every run |

To refresh `dev` with current production data, reset the branch from its parent in the Neon console (or with `neonctl branches reset dev --parent`).

### Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request. It runs lint, type-check (`npm run typecheck`) and the unit tests, then builds the app and runs the Playwright suite against the production build. The Playwright report is attached to each run. CI needs one repository secret: `TMDB_READ_TOKEN`.

### Scripts

| Script | What it does |
|---|---|
| `npm test` | Unit tests: rate limiter, cache, TMDB client (MSW), recommendation math, alert diffing |
| `npm run test:e2e` | Playwright browser tests: register and log in, the account menu (desktop and mobile), bookmarking, search on every page, infinite scroll and filters. Starts the dev server if one isn't running. Test users are `e2e.*@example.com` and are deleted afterwards. Set `E2E_DATABASE_URL` to use a separate database, or `E2E_BASE_URL` to test a deployed site |
| `npm run recs:rebuild` | Recompute every genre profile and the similarity table |
| `npm run alerts:check` | Check bookmarked series for new seasons. Production schedulers call `POST /api/cron/check-seasons` with `Authorization: Bearer $CRON_SECRET` |
| `npm run db:studio` | Browse the database |

## Design

The visual direction ("screening room": velvet background, tungsten accent, Big Shoulders display type) and the reasoning behind it are in [design/DESIGN.md](design/DESIGN.md).
