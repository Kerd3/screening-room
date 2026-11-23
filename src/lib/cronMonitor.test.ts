import { afterEach, describe, expect, it, vi } from "vitest";

const withMonitor = vi.fn((_slug: string, job: () => unknown) => job());
const flush = vi.fn(async () => true);
vi.mock("@sentry/nextjs", () => ({ withMonitor, flush }));

const { withCronMonitor } = await import("./cronMonitor");

describe("withCronMonitor", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    withMonitor.mockClear();
    flush.mockClear();
  });

  it("just runs the job outside production", async () => {
    vi.stubEnv("SENTRY_DSN", "https://key@o0.ingest.sentry.io/0");
    vi.stubEnv("VERCEL_ENV", "preview");
    await expect(withCronMonitor("job", "0 9 * * *", async () => 42)).resolves.toBe(42);
    expect(withMonitor).not.toHaveBeenCalled();
  });

  it("just runs the job when Sentry isn't configured", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(withCronMonitor("job", "0 9 * * *", async () => 42)).resolves.toBe(42);
    expect(withMonitor).not.toHaveBeenCalled();
  });

  it("checks in with the schedule in production and flushes", async () => {
    vi.stubEnv("SENTRY_DSN", "https://key@o0.ingest.sentry.io/0");
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(withCronMonitor("check-seasons", "0 9 * * *", async () => "ok")).resolves.toBe("ok");
    expect(withMonitor).toHaveBeenCalledWith(
      "check-seasons",
      expect.any(Function),
      expect.objectContaining({ schedule: { type: "crontab", value: "0 9 * * *" }, timezone: "UTC" }),
    );
    expect(flush).toHaveBeenCalled();
  });

  it("still flushes and rethrows when the job fails", async () => {
    vi.stubEnv("SENTRY_DSN", "https://key@o0.ingest.sentry.io/0");
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(
      withCronMonitor("job", "0 9 * * *", async () => {
        throw new Error("TMDB down");
      }),
    ).rejects.toThrow("TMDB down");
    expect(flush).toHaveBeenCalled();
  });
});
