import { execSync } from "node:child_process";

/**
 * Deletes the throwaway e2e.* users (and, by cascade, their bookmarks, ratings
 * and searches), then rebuilds recommendations without them. Runs through tsx
 * so it reuses the app's own database client.
 */
export default function globalTeardown() {
  if (process.env.E2E_BASE_URL && !process.env.E2E_CLEANUP_DATABASE_URL) {
    console.log("Remote run: skipping cleanup (set E2E_CLEANUP_DATABASE_URL to enable).");
    return;
  }
  const url = process.env.E2E_CLEANUP_DATABASE_URL ?? process.env.E2E_DATABASE_URL;
  execSync("npx tsx --conditions=react-server scripts/cleanup-e2e.ts", {
    stdio: "inherit",
    env: { ...process.env, ...(url ? { DATABASE_URL: url } : {}) },
  });
}
