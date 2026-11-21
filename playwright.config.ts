import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a running app.
 *
 *   npm run test:e2e                       starts `npm run dev` (or reuses one on :3000)
 *   E2E_BASE_URL=https://… npm run test:e2e  runs against a deployed site instead
 *   E2E_DATABASE_URL=postgres://…          points the dev server at a separate test database
 *   E2E_WEB_COMMAND="npm run start"         serves a production build instead of `next dev` (CI)
 *
 * Tests create throwaway users (e2e.*@example.com); global teardown deletes them.
 */
const PORT = Number(process.env.E2E_PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  // One worker: tests share the inbound rate limits and the TMDB quota.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // The account menu sits in a different place on phones, so check it there too.
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /account\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // CI builds first and sets E2E_WEB_COMMAND="npm run start" to test the production build.
        command: process.env.E2E_WEB_COMMAND ?? "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 180_000,
        env: process.env.E2E_DATABASE_URL ? { DATABASE_URL: process.env.E2E_DATABASE_URL } : {},
      },
});
