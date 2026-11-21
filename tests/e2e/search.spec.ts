import { expect, test } from "@playwright/test";
import { cards } from "./helpers";

test("searches movies and series from Home", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "Search for movies or TV series" });
  await search.fill("Inception");

  await expect(page).toHaveURL(/\/\?q=Inception/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Found [\d,]+ results? for ‘Inception’$/);
  await expect(page.getByRole("heading", { name: "Inception", exact: true }).first()).toBeVisible();
});

test("the Movies page searches movies only", async ({ page }) => {
  await page.goto("/movies");
  await page.getByRole("searchbox", { name: "Search for movies" }).fill("star wars");

  await expect(page).toHaveURL(/\/movies\?q=star\+wars|\/movies\?q=star%20wars/);
  await expect(cards(page).first()).toBeVisible();
  await expect(cards(page).filter({ hasText: "Series" })).toHaveCount(0);
});

test("the TV page searches series only", async ({ page }) => {
  await page.goto("/tv");
  await page.getByRole("searchbox", { name: "Search for TV series" }).fill("the office");

  await expect(cards(page).first()).toBeVisible();
  await expect(cards(page).filter({ hasText: "Movie" })).toHaveCount(0);
});

test("explains when nothing matches", async ({ page }) => {
  await page.goto("/?q=qzxqzxnotatitle");
  await expect(page.getByRole("heading", { name: /Nothing found for/ })).toBeVisible();
});

test("searching from a title page goes to Home results", async ({ page }) => {
  await page.goto("/title/movie/603");
  await expect(page.getByRole("heading", { level: 1, name: "The Matrix" })).toBeVisible();
  const search = page.getByRole("searchbox");
  await search.fill("matrix");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/\?q=matrix$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/for ‘matrix’/);
});

test("clearing the search returns to the page's normal view", async ({ page }) => {
  await page.goto("/movies?q=alien");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/for ‘alien’/);
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page).toHaveURL(/\/movies$/);
  await expect(page.getByRole("heading", { level: 1, name: "Movies" })).toBeVisible();
});

test("the search survives back and forward navigation", async ({ page }) => {
  await page.goto("/tv?q=severance");
  await expect(page.getByRole("searchbox")).toHaveValue("severance");
  await page.getByRole("link", { name: "Movies" }).first().click();
  await expect(page).toHaveURL(/\/movies$/);
  await page.goBack();
  await expect(page.getByRole("searchbox")).toHaveValue("severance");
});

test.describe("browsing", () => {
  test("loads more posters as you scroll", async ({ page }) => {
    await page.goto("/movies");
    await expect(cards(page)).toHaveCount(20);
    await cards(page).last().scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 4000);
    await expect.poll(() => cards(page).count()).toBeGreaterThan(20);
  });

  test("genre filters are kept in the URL", async ({ page }) => {
    await page.goto("/movies");
    await page.getByRole("button", { name: "Science Fiction" }).click();
    await expect(page).toHaveURL(/genres=878/);
    await expect(page.getByRole("button", { name: "Science Fiction" })).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(page.getByRole("button", { name: "Science Fiction" })).toHaveAttribute("aria-pressed", "true");
  });
});
