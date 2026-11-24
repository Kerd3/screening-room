import { expect, test } from "@playwright/test";
import { bookmark, signUp } from "./helpers";

test("'Not interested' hides a pick for good, and Undo brings it back", async ({ page }) => {
  await signUp(page);
  await bookmark(page, "movie", 603); // The Matrix: gives "For you" something to work with
  await page.goto("/");

  const forYou = page.getByRole("region", { name: "For you" });
  const first = forYou.getByRole("button", { name: /^Not interested in / }).first();
  await expect(first).toBeVisible({ timeout: 30_000 });
  const title = (await first.getAttribute("aria-label"))!.replace("Not interested in ", "");

  const saved = page.waitForResponse((r) => r.url().endsWith("/api/recommendations/dismissed") && r.request().method() === "POST");
  await first.click();
  expect((await saved).status()).toBe(201);
  await expect(forYou.getByRole("status")).toContainText(`Hidden ${title}.`);
  await expect(forYou.getByRole("heading", { name: title, exact: true })).toHaveCount(0);

  // Gone from the server's picks too, not just from this page. Compared at
  // Home's shelf size: the diversity cap depends on the list length, so a
  // top-12 pick isn't always in a top-40 list.
  const picks = async () => {
    const res = await page.request.get("/api/recommendations?limit=12");
    expect(res.status(), await res.text()).toBe(200);
    return (await res.json()).items.map((i: { title: string }) => i.title);
  };
  expect(await picks()).not.toContain(title);

  const undone = page.waitForResponse((r) => r.url().includes("/api/recommendations/dismissed?") && r.request().method() === "DELETE");
  await forYou.getByRole("button", { name: "Undo" }).click();
  expect((await undone).status()).toBe(200);
  await expect(forYou.getByRole("status")).not.toContainText("Hidden");
  await expect.poll(picks).toContain(title);
});

test("a public profile shows favorites to anyone, and disappears when made private", async ({ page, browser }) => {
  const user = await signUp(page);
  const rate = await page.request.put("/api/ratings", { data: { type: "movie", tmdbId: 603, score: 9 } });
  expect(rate.status(), await rate.text()).toBeLessThan(300);

  await page.goto("/settings");
  const toggle = page.getByRole("switch", { name: "Public profile" });
  await expect(toggle).toHaveAttribute("aria-checked", "false"); // private by default
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("main").getByRole("status").first()).toHaveText("Saved");
  const link = page.getByRole("link", { name: "View your profile" });
  const href = (await link.getAttribute("href"))!;
  expect(href).toMatch(/^\/u\/test-viewer-[0-9a-f]{4}$/);

  // A signed-out visitor in a fresh browser context.
  const visitor = await browser.newPage();
  await visitor.goto(href);
  await expect(visitor.getByRole("heading", { level: 1, name: user.name })).toBeVisible();
  await expect(visitor.getByRole("region", { name: "Favorites" }).getByText("The Matrix")).toBeVisible();
  await expect(visitor.getByText("Rated 9/10")).toBeVisible();
  await expect(visitor.getByText(user.email)).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(page.locator("main").getByRole("status").first()).toHaveText("Saved"); // switch flips before the save lands
  await visitor.goto(href);
  await expect(visitor.getByRole("heading", { level: 1, name: "Profile not available" })).toBeVisible();
  await expect(visitor.getByText("The Matrix")).toHaveCount(0);
  await visitor.close();
});
