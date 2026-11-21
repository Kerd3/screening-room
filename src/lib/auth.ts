import "server-only";
import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import { unauthorized } from "@/lib/api";

export interface SessionData {
  userId?: string;
}

export const SESSION_COOKIE = "screening_session";

const password = process.env.SESSION_PASSWORD ?? "";

const sessionOptions: SessionOptions = {
  cookieName: SESSION_COOKIE,
  password,
  ttl: 60 * 60 * 24 * 30, // 30 days
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  },
};

export async function getSession() {
  if (password.length < 32) {
    throw new Error("SESSION_PASSWORD must be set to at least 32 characters in .env");
  }
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

/** The signed-in user's id, or null. For route handlers and server actions. */
export async function getUserId(): Promise<string | null> {
  const session = await getSession();
  return session.userId ?? null;
}

/** Like getUserId, but throws a 401 when nobody is signed in. */
export async function requireUserId(): Promise<string> {
  const id = await getUserId();
  if (!id) throw unauthorized();
  return id;
}
