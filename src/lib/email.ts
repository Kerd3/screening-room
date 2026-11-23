import "server-only";

/**
 * Sends email through Resend's HTTP API (https://resend.com). Inactive until
 * RESEND_API_KEY and DIGEST_FROM are set, so local development and CI never
 * send mail.
 */
export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.DIGEST_FROM);
}

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export class EmailError extends Error {
  name = "EmailError";
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function sendEmail(email: Email, fetchImpl: typeof fetch = fetch) {
  if (!emailConfigured()) throw new EmailError(503, "Email isn't set up on this server.");
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.DIGEST_FROM, ...email }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    // Resend's error body says what went wrong (for example an unverified sender domain).
    const detail = await res.json().then((b: { message?: string }) => b.message).catch(() => undefined);
    throw new EmailError(res.status, `Email provider refused the message (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  return (await res.json()) as { id: string };
}
