import { Redis } from "@upstash/redis";

/**
 * Shared Upstash Redis client, or null when it isn't configured (local
 * development and CI), in which case callers fall back to in-memory state.
 * Reads the Upstash names and the ones the Vercel Marketplace integration sets.
 */
export function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const g = globalThis as unknown as { __redis?: Redis };
  return (g.__redis ??= new Redis({ url, token }));
}
