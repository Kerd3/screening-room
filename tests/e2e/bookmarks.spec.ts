import { expect, test } from "@playwright/test";
import { bookmark, cards, signUp } from "./helpers";

// Stable TMDB ids used for setup.
const MATRIX = 603;
const INCEPTION = 27205;
const BREAKING_BAD = 1396;

test("signed-out visitors are sent to log in when they bookmark", async ({ page }) => {
  await page.goto("/movies");
  await page.getByRole("button", { name: /^Bookmark / }).first().click();
  await expect(page).toHaveURL(/\/login\?next=%2Fmovies/);
});

test("bookmarks a movie from the grid, sees it saved, then removes it", async ({ page }) => {
  await signUp(page);
  await page.goto("/movies");
  // Deliberately clicks as soon as posters render, before the session check
  // finishes (this once redirected signed-in users to /login).

  const first = page.getByRole("button", { name: /^Bookmark / }).first();
  const title = (await first.getAttribute("aria-label"))!.replace(/^Bookmark /, "");
  const saving = page.waitForResponse(
    (r) => r.url().includes("/api/bookmarks") && r.request().method() === "POST",
  );
  await first.click();

  // Optimistic update: the same button flips straight away.
  const saved = page.getByRole("button", { name: `Remove ${title} from bookmarks` }).first();
  await expect(saved).toHaveAttribute("aria-pressed", "true");
  expect((await saving).status()).toBe(201);

  // It's on the Bookmarks page, and still there after a reload (it reached the server).
  await page.goto("/bookmarks");
  await expect(page.getByRole("heading", { name: /Bookmarked movies/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();

  await page.getByRole("button", { name: `Remove ${title} from bookmarks` }).click();
  await expect(page.getByRole("heading", { name: "Nothing bookmarked yet" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Nothing bookmarked yet" })).toBeVisible();
});

test("splits bookmarks into movies and series and filters by type", async ({ page }) => {
  await signUp(page);
  await bookmark(page, "movie", MATRIX);
  await bookmark(page, "tv", BREAKING_BAD);
  await page.goto("/bookmarks");

  await expect(page.getByRole("heading", { name: /Bookmarked movies/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Bookmarked TV series/ })).toBeVisible();

  await page.getByRole("radio", { name: "Series" }).click();
  await expect(page.getByRole("heading", { name: "Breaking Bad", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "The Matrix", exact: true })).toHaveCount(0);
});

test("search on the Bookmarks page only looks through your own list", async ({ page }) => {
  await signUp(page);
  await bookmark(page, "movie", MATRIX);
  await bookmark(page, "movie", INCEPTION);
  await page.goto("/bookmarks");

  const search = page.getByRole("searchbox", { name: "Search your bookmarked shows" });
  await search.fill("matrix");
  await expect(page).toHaveURL(/\/bookmarks\?q=matrix/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Found 1 result for ‘matrix’ in your bookmarks",
  );
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "The Matrix", exact: true })).toBeVisible();
});

test("a bookmark shows as saved everywhere the title appears", async ({ page }) => {
  await signUp(page);
  await bookmark(page, "movie", INCEPTION);
  await page.goto(`/title/movie/${INCEPTION}`);
  await expect(page.getByRole("heading", { level: 1, name: "Inception" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bookmarked" })).toHaveAttribute("aria-pressed", "true");
});
