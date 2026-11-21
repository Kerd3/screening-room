import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function createClient() {
  // Neon's pooled connection string: safe for many short-lived serverless functions.
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// Reuse one client across hot reloads in dev and warm invocations in production.
const globalForDb = globalThis as unknown as { __db?: PrismaClient };
export const db = globalForDb.__db ?? createClient();
globalForDb.__db = db;
