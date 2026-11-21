import { expect, test } from "@playwright/test";
import { bookmark, signUp } from "./helpers";

test("signed-in pages hydrate without errors", async ({ page }) => {
  // Smoke test: React reports hydration mismatches as console errors (minified
  // #418/#423/#425 in production). The specific "user cached before a section
  // hydrates" race is timing-dependent here, so it's pinned down
  // deterministically in src/lib/client/hooks.test.ts.
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await signUp(page);
  await bookmark(page, "movie", 603);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "For you" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.goto("/movies");
  await page.waitForLoadState("networkidle");

  expect(errors.filter((e) => /hydrat|#418|#423|#425/i.test(e))).toEqual([]);
});

test("title pages get their own tab title", async ({ page }) => {
  await page.goto("/title/movie/603");
  await expect(page.getByRole("heading", { level: 1, name: "The Matrix" })).toBeVisible();
  await expect(page).toHaveTitle("The Matrix (1999) | Screening Room");
});

test("link previews: crawlers get per-title tags and a working image", async ({ request }) => {
  // LinkedIn's crawler; Next.js sends bots fully rendered <head> metadata.
  const ua = { "user-agent": "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)" };
  const html = await (await request.get("/title/movie/603", { headers: ua })).text();
  const meta = (prop: string) => html.match(new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`))?.[1];

  expect(meta("og:title")).toBe("The Matrix (1999)");
  expect(meta("og:description")?.length).toBeGreaterThan(20);
  expect(meta("twitter:card")).toBe("summary_large_image");
  const image = meta("og:image");
  expect(image).toMatch(/\/title\/movie\/603\/opengraph-image/);

  const res = await request.get(new URL(image!).pathname + new URL(image!).search);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");

  const home = await (await request.get("/", { headers: ua })).text();
  expect(home).toMatch(/<meta property="og:image" content="[^"]*\/opengraph-image/);
});

test("friends' bookmark buttons say whose list they open", async ({ page, browser }) => {
  const owner = await signUp(page, { name: "Kiri Tane", email: `e2e.kiri${Date.now()}@example.com`, password: "e2e-password-2026" });
  const friendContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const friend = await friendContext.newPage();
  await signUp(friend);
  await friend.request.post("/api/friends", { data: { email: owner.email } });
  const { incoming } = await (await page.request.get("/api/friends")).json();
  await page.request.patch("/api/friends", { data: { requestId: incoming[0].requestId, action: "accept" } });

  await friend.goto("/friends");
  await expect(friend.getByRole("button", { name: "See Kiri Tane’s bookmarks" })).toBeVisible();
  await friendContext.close();
});
