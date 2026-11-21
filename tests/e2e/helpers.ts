import { expect, type Page } from "@playwright/test";

/** Test-only account data; global teardown deletes every e2e.* user. */
export const E2E_PASSWORD = "e2e-password-2026";

export function newUser(name = "Test Viewer") {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  return { name, email: `e2e.${id}@example.com`, password: E2E_PASSWORD };
}

/** Registers through the API; the page's browser context gets the session cookie. */
export async function signUp(page: Page, user = newUser()) {
  const res = await page.request.post("/api/auth/register", { data: user });
  expect(res.status(), await res.text()).toBe(201);
  return user;
}

/** Bookmarks a title directly through the API (faster setup than the UI). */
export async function bookmark(page: Page, type: "movie" | "tv", tmdbId: number) {
  const res = await page.request.post("/api/bookmarks", { data: { type, tmdbId } });
  expect(res.status(), await res.text()).toBe(201);
}

export async function me(page: Page) {
  const res = await page.request.get("/api/me");
  return (await res.json()) as { user: { name: string; email: string } | null };
}

export const cards = (page: Page) => page.locator("main article");

export const accountButton = (page: Page) => page.getByRole("button", { name: /^Account menu for/ });
