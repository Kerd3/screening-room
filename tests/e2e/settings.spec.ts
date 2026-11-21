import { expect, test } from "@playwright/test";
import { accountButton, bookmark, me, signUp } from "./helpers";

const status = (page: import("@playwright/test").Page) => page.locator("main").getByRole("status");

test("signed-out visitors are sent to log in", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings/);
});

test("opens from the account menu", async ({ page }) => {
  await signUp(page);
  await page.goto("/");
  await accountButton(page).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page).toHaveURL("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
});

test("changes the display name everywhere it appears", async ({ page }) => {
  const user = await signUp(page);
  await page.goto("/settings");
  await expect(page.getByText(user.email)).toBeVisible();

  const field = page.getByLabel("Display name");
  await expect(field).toHaveValue(user.name);
  await expect(page.getByRole("button", { name: "Save name" })).toBeDisabled(); // nothing changed yet
  await field.fill("Marisol Vega");
  await page.getByRole("button", { name: "Save name" }).click();

  await expect(status(page)).toHaveText("Saved");
  await expect(accountButton(page)).toHaveAccessibleName("Account menu for Marisol Vega");
  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue("Marisol Vega");
});

test("season alerts can be switched off, and stay off", async ({ page }) => {
  await signUp(page);
  await page.goto("/settings");
  const alerts = page.getByRole("switch", { name: "New season alerts" });
  await expect(alerts).toHaveAttribute("aria-checked", "true");
  await alerts.click();
  await expect(alerts).toHaveAttribute("aria-checked", "false");
  await expect(status(page)).toHaveText("Saved");

  await page.reload();
  await expect(page.getByRole("switch", { name: "New season alerts" })).toHaveAttribute("aria-checked", "false");
});

test("turning off bookmark sharing hides your list from friends", async ({ page, browser }) => {
  // The owner saves a title.
  const owner = await signUp(page, { name: "Owner Person", email: `e2e.owner${Date.now()}@example.com`, password: "e2e-password-2026" });
  await bookmark(page, "movie", 603);
  const ownerId = (await me(page)).user!.id;

  // A friend, in a separate browser session, sends a request; the owner accepts.
  const friendContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const friend = await friendContext.newPage();
  await signUp(friend);
  expect((await friend.request.post("/api/friends", { data: { email: owner.email } })).status()).toBe(201);
  const { incoming } = await (await page.request.get("/api/friends")).json();
  await page.request.patch("/api/friends", { data: { requestId: incoming[0].requestId, action: "accept" } });

  // Sharing is on by default: the friend can open the owner's bookmarks.
  expect((await friend.request.get(`/api/friends/${ownerId}/bookmarks`)).status()).toBe(200);

  // The owner turns sharing off in Settings.
  await page.goto("/settings");
  const share = page.getByRole("switch", { name: "Show my bookmarks to friends" });
  await expect(share).toHaveAttribute("aria-checked", "true");
  await share.click();
  await expect(share).toHaveAttribute("aria-checked", "false");
  await expect(status(page)).toHaveText("Saved");

  // Now the friend is refused, in the API and in the UI.
  expect((await friend.request.get(`/api/friends/${ownerId}/bookmarks`)).status()).toBe(403);
  await friend.goto("/friends");
  await friend.getByRole("button", { name: "See Owner Person’s bookmarks" }).click();
  await expect(friend.getByText("This friend keeps their bookmarks private.")).toBeVisible();
  await friendContext.close();
});

test("'Series only' limits For you picks to series", async ({ page }) => {
  await signUp(page);
  await bookmark(page, "movie", 603); // The Matrix
  await bookmark(page, "tv", 1396); // Breaking Bad
  await bookmark(page, "movie", 27205); // Inception
  await page.goto("/settings");

  await page.getByRole("radio", { name: "Series only" }).click();
  await expect(page.getByRole("radio", { name: "Series only" })).toHaveAttribute("aria-checked", "true");
  await expect(status(page)).toHaveText("Saved");

  const recs = await (await page.request.get("/api/recommendations?limit=20")).json();
  expect(recs.items.length).toBeGreaterThan(0);
  expect(recs.items.every((i: { mediaType: string }) => i.mediaType === "tv")).toBe(true);
});
