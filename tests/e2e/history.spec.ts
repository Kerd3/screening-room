import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("marking a title as watched adds it to the watch history", async ({ page }) => {
  await signUp(page);
  await page.goto("/title/movie/603"); // The Matrix
  // The button flips at once (optimistic); wait for the save before leaving the page.
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/watched") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Mark as watched" }).click();
  await expect(page.getByRole("button", { name: "Watched" })).toHaveAttribute("aria-pressed", "true");
  expect((await saved).status()).toBe(201);

  await page.goto("/watched");
  await expect(page.getByRole("heading", { level: 1, name: "Watch history" })).toBeVisible();
  await expect(page.locator("main article").filter({ hasText: "The Matrix" })).toBeVisible();

  // Watched titles are never recommended.
  const recs = await (await page.request.get("/api/recommendations?limit=20")).json();
  expect(recs.items.map((i: { id: number }) => i.id)).not.toContain(603);
});

test("imports a Letterboxd export from Settings", async ({ page }) => {
  await signUp(page);
  await page.goto("/settings#import");
  await page.getByText("Choose a CSV file").locator("input[type=file]").setInputFiles({
    name: "watched.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      'Date,Name,Year,Letterboxd URI\n2024-06-01,The Godfather,1972,https://boxd.it/a\n2024-06-02,"Crouching Tiger, Hidden Dragon",2000,https://boxd.it/b\n',
    ),
  });
  await expect(page.getByText("watched.csv: Letterboxd export, 2 titles")).toBeVisible();
  await page.getByRole("button", { name: "Import 2 titles" }).click();
  await expect(page.getByText(/Imported 2 titles/)).toBeVisible({ timeout: 30_000 });

  await page.getByRole("link", { name: "See your watch history" }).click();
  await expect(page.locator("main article").filter({ hasText: "The Godfather" })).toBeVisible();
  await expect(page.locator("main article").filter({ hasText: "Crouching Tiger" })).toBeVisible();
});

test("rejects files that aren't Letterboxd or IMDb exports", async ({ page }) => {
  await signUp(page);
  await page.goto("/settings#import");
  await page.getByText("Choose a CSV file").locator("input[type=file]").setInputFiles({
    name: "other.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Title,Year\nHeat,1995\n"),
  });
  await expect(page.locator("main").getByRole("alert")).toContainText("doesn't look like a Letterboxd or IMDb export");
});
