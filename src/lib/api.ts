import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z, ZodError } from "zod";
import type { TmdbConfigError, TmdbError } from "@/lib/tmdb";
import type { Limiter } from "@/lib/ratelimit-inbound";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
  }
}

export const unauthorized = () => new HttpError(401, "Sign in to do that.");

/** Wraps a route handler so thrown errors become consistent JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      // Let Next.js's own control-flow errors (prerender bailouts, redirects) through.
      unstable_rethrow(err);
      if (err instanceof HttpError) {
        return Response.json({ error: err.message }, { status: err.status, headers: err.headers });
      }
      if (err instanceof ZodError) {
        return Response.json(
          { error: "Invalid request.", issues: z.flattenError(err).fieldErrors },
          { status: 400 },
        );
      }
      // Matched by name, not instanceof: the TMDB client is a process-wide
      // singleton that can outlive a hot-reloaded copy of its module.
      if (isNamed<TmdbConfigError>(err, "TmdbConfigError")) {
        return Response.json({ error: err.message, code: "TMDB_NOT_CONFIGURED" }, { status: 503 });
      }
      if (isNamed<TmdbError>(err, "TmdbError")) {
        const status = err.status === 404 ? 404 : 502;
        return Response.json({ error: err.message }, { status });
      }
      console.error(err);
      return Response.json({ error: "Something went wrong on the server." }, { status: 500 });
    }
  };
}

function isNamed<T extends Error>(err: unknown, name: string): err is T {
  return err instanceof Error && err.name === name;
}

export function queryOf(req: Request) {
  return Object.fromEntries(new URL(req.url).searchParams);
}

export function clientKey(req: Request, userId?: string) {
  if (userId) return `u:${userId}`;
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `ip:${fwd || req.headers.get("x-real-ip") || "local"}`;
}

export async function enforce(limiter: Limiter, key: string) {
  const r = await limiter.check(key);
  if (!r.ok) {
    throw new HttpError(429, "Too many requests. Wait a moment and try again.", {
      "Retry-After": String(r.retryAfterSec),
    });
  }
}

export const mediaTypeSchema = z.enum(["movie", "tv"]);
