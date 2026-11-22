import { afterEach, describe, expect, it, vi } from "vitest";

const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureException, flush: vi.fn(async () => true) }));

const { reportError } = await import("./report");

describe("reportError", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    captureException.mockClear();
  });

  it("does nothing when Sentry isn't configured (local dev, CI)", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    await reportError(new Error("boom"));
    expect(captureException).not.toHaveBeenCalled();
  });

  it("sends the error with its tags when a DSN is set", async () => {
    vi.stubEnv("SENTRY_DSN", "https://key@o0.ingest.sentry.io/0");
    const err = new Error("boom");
    await reportError(err, { kind: "api" });
    expect(captureException).toHaveBeenCalledWith(err, { tags: { kind: "api" } });
  });

  it("never throws, even if reporting fails", async () => {
    vi.stubEnv("SENTRY_DSN", "https://key@o0.ingest.sentry.io/0");
    captureException.mockImplementationOnce(() => {
      throw new Error("network down");
    });
    await expect(reportError(new Error("boom"))).resolves.toBeUndefined();
  });
});
