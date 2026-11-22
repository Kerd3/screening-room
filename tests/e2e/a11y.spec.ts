import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { bookmark, signUp } from "./helpers";

/**
 * Automated accessibility checks (axe-core, WCAG 2.2 A and AA rules) on every
 * page, signed out and signed in. Automated tools catch roughly a third of
 * real issues, so this guards regressions; it doesn't replace manual checks.
 */
async function scan(page: Page, label: string) {
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    // Next.js dev/prod tooling outside the app's own markup.
    .exclude("nextjs-portal")
    .analyze();
  const problems = results.violations.map(
    (v) => `${label}: [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}x) e.g. ${v.nodes[0]?.target.join(" ")}`,
  );
  expect(problems, problems.join("\n")).toEqual([]);
}

test.describe("accessibility: signed out", () => {
  const pages: [string, string, (p: Page) => Promise<unknown>][] = [
    ["home", "/", (p) => p.getByRole("heading", { name: "Trending this week" }).waitFor()],
    ["movies", "/movies", (p) => p.locator("main article").first().waitFor()],
    ["tv", "/tv", (p) => p.locator("main article").first().waitFor()],
    ["title", "/title/movie/1726", (p) => p.getByRole("heading", { name: "Where to watch" }).waitFor()],
    ["search", "/?q=dune", (p) => p.locator("main article").first().waitFor()],
    ["login", "/login", (p) => p.getByRole("button", { name: "Log in" }).waitFor()],
    ["register", "/register", (p) => p.getByRole("button", { name: "Create account" }).waitFor()],
  ];
  for (const [label, url, ready] of pages) {
    test(label, async ({ page }) => {
      await page.goto(url);
      await ready(page);
      await scan(page, label);
    });
  }
});

test.describe("accessibility: signed in", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
    await bookmark(page, "movie", 603);
  });
  const pages: [string, string, (p: Page) => Promise<unknown>][] = [
    ["bookmarks", "/bookmarks", (p) => p.locator("main article").first().waitFor()],
    ["friends", "/friends", (p) => p.getByRole("heading", { name: "Add a friend" }).waitFor()],
    ["alerts", "/alerts", (p) => p.getByRole("heading", { name: "No alerts yet" }).waitFor()],
    ["settings", "/settings", (p) => p.getByLabel("Display name").waitFor()],
    ["home (signed in)", "/", (p) => p.getByRole("heading", { name: "For you" }).waitFor()],
  ];
  for (const [label, url, ready] of pages) {
    test(label, async ({ page }) => {
      await page.goto(url);
      await ready(page);
      await scan(page, label);
    });
  }

  test("account menu (open)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^Account menu for/ }).click();
    await page.getByRole("menu").waitFor();
    await scan(page, "account menu");
  });
});
