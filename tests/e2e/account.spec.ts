import { expect, test } from "@playwright/test";
import { accountButton, me, newUser, signUp } from "./helpers";

test.describe("register and sign in", () => {
  test("registers through the form and lands signed in", async ({ page }) => {
    const user = newUser("Ada Viewer");
    await page.goto("/register");
    await page.getByLabel("Name").fill(user.name);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL("/");
    await expect(accountButton(page)).toHaveAccessibleName("Account menu for Ada Viewer");
    expect((await me(page)).user?.email).toBe(user.email);
  });

  test("shows field errors from the server next to the fields", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Name").fill("Short Password");
    await page.getByLabel("Email").fill(newUser().email);
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
    await expect(page).toHaveURL(/\/register/);
  });

  test("refuses a second account with the same email", async ({ page }) => {
    const user = await signUp(page);
    await page.context().clearCookies();
    await page.goto("/register");
    await page.getByLabel("Name").fill(user.name);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Create account" }).click();

    // Scoped to the form: Next.js also renders a (silent) route-announcer alert.
    await expect(page.locator("main").getByRole("alert")).toContainText("already exists");
  });

  test("logs back in and returns to the page that asked for it", async ({ page }) => {
    const user = await signUp(page);
    await page.context().clearCookies();

    await page.goto("/bookmarks"); // protected: the proxy sends signed-out visitors to /login
    await expect(page).toHaveURL(/\/login\?next=%2Fbookmarks/);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL("/bookmarks");
    await expect(accountButton(page)).toBeVisible();
  });

  test("rejects a wrong password without saying which part was wrong", async ({ page }) => {
    const user = await signUp(page);
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page.locator("main").getByRole("alert")).toHaveText("Email or password is incorrect.");
  });
});

test.describe("account menu", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
    await page.goto("/");
  });

  test("clicking the avatar opens a menu and does not sign out", async ({ page }) => {
    const user = (await me(page)).user!;
    await accountButton(page).click();

    const menu = page.getByRole("menu", { name: "Account" });
    await expect(menu).toBeVisible();
    await expect(menu).toContainText(user.email);
    await expect(accountButton(page)).toHaveAttribute("aria-expanded", "true");

    // Escape closes it; the session is untouched.
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(accountButton(page)).toBeFocused();
    expect((await me(page)).user).not.toBeNull();
  });

  test("closes when clicking elsewhere", async ({ page }) => {
    await accountButton(page).click();
    await expect(page.getByRole("menu")).toBeVisible();
    // Click empty space at the left of the content, well away from the menu.
    await page.locator("main").click({ position: { x: 4, y: 4 } });
    await expect(page.getByRole("menu")).toBeHidden();
    expect((await me(page)).user).not.toBeNull();
  });

  test("supports the keyboard: arrows move between items", async ({ page }) => {
    await accountButton(page).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Your bookmarks" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Friends and shares" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeFocused();
    await page.keyboard.press("ArrowDown"); // wraps
    await expect(page.getByRole("menuitem", { name: "Your bookmarks" })).toBeFocused();
  });

  test("signs out only from the explicit menu item", async ({ page }) => {
    await accountButton(page).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();

    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "Log in" })).toBeVisible();
    await expect(accountButton(page)).toHaveCount(0);
    expect((await me(page)).user).toBeNull();
  });
});
