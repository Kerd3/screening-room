import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { titleToMediaItem } from "@/lib/catalog";
import { db } from "@/lib/db";
import { emailConfigured, sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/og";
import { getRecommendations } from "@/lib/recs/recommend";
import { tmdbImage } from "@/lib/tmdb/images";
import type { MediaItem } from "@/lib/tmdb/types";

const DAY = 24 * 60 * 60 * 1000;
/** Users handled per cron run, to stay well inside the function time limit. */
export const DIGEST_BATCH = 25;

// ---------------------------------------------------------------------------
// One-click unsubscribe: a link signed with the session secret, so it works
// from the email without signing in and can't be forged for another user.

function sign(userId: string) {
  return createHmac("sha256", process.env.SESSION_PASSWORD ?? "").update(`digest-unsub:${userId}`).digest("base64url");
}

export function unsubscribeUrl(userId: string) {
  return `${siteUrl()}/api/digest/unsubscribe?u=${encodeURIComponent(userId)}&t=${sign(userId)}`;
}

export function verifyUnsubscribe(userId: string, token: string) {
  if (!process.env.SESSION_PASSWORD) return false;
  const a = Buffer.from(sign(userId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Content

export interface DigestContent {
  name: string;
  alerts: { message: string; item: MediaItem }[];
  picks: { item: MediaItem; reason?: string }[];
  unseenShares: number;
}

export async function loadDigest(userId: string, now = new Date()): Promise<DigestContent | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!user) return null;
  const [alerts, unseenShares, recs] = await Promise.all([
    db.alert.findMany({
      where: { userId, createdAt: { gte: new Date(now.getTime() - 7 * DAY) } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { title: true },
    }),
    db.share.count({ where: { toUserId: userId, seenAt: null } }),
    getRecommendations(userId, 5).catch(() => ({ items: [] as MediaItem[], reasons: {} as Record<string, string> })),
  ]);
  return {
    name: user.name,
    alerts: alerts.map((a) => ({ message: a.message, item: titleToMediaItem(a.title) })),
    picks: recs.items.slice(0, 5).map((item) => ({
      item,
      reason: (recs.reasons as Record<string, string | undefined>)[`${item.mediaType}:${item.id}`],
    })),
    unseenShares,
  };
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const titleUrl = (i: MediaItem) => `${siteUrl()}/title/${i.mediaType}/${i.id}`;

/** Renders the email. Returns null when there's nothing worth sending. */
export function renderDigest(d: DigestContent, unsubscribe: string) {
  if (!d.alerts.length && !d.picks.length && !d.unseenShares) return null;
  const site = siteUrl();

  const card = (i: MediaItem, line?: string) => {
    // Small size bucket: the email shows posters at 56px wide (112px on retina).
    const poster = tmdbImage(i.posterPath, "poster")?.replace("/w780/", "/w154/");
    return `<tr><td style="padding:10px 0;vertical-align:top;width:64px">${
      poster ? `<img src="${poster}" width="56" height="84" alt="" style="border-radius:6px;display:block">` : ""
    }</td><td style="padding:10px 0 10px 12px;vertical-align:top"><a href="${titleUrl(i)}" style="color:#ede6d8;font-weight:600;text-decoration:none">${escape(
      i.title,
    )}${i.year ? ` (${i.year})` : ""}</a>${line ? `<div style="color:#9c94a8;font-size:14px;margin-top:4px">${escape(line)}</div>` : ""}</td></tr>`;
  };
  const section = (title: string, rows: string) =>
    `<h2 style="font-size:18px;color:#ede6d8;margin:28px 0 4px">${title}</h2><table role="presentation" cellpadding="0" cellspacing="0" width="100%">${rows}</table>`;

  const html = `<!doctype html><html><body style="margin:0;background:#1b1726;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#ede6d8">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<p style="color:#f0b44c;font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:13px;margin:0">Screening Room</p>
<h1 style="font-size:26px;margin:8px 0 0">Your week, ${escape(d.name)}</h1>
${d.alerts.length ? section("New on your shows", d.alerts.map((a) => card(a.item, a.message)).join("")) : ""}
${d.picks.length ? section("Picked for you", d.picks.map((p) => card(p.item, p.reason)).join("")) : ""}
${
  d.unseenShares
    ? `<p style="margin:28px 0 0">Friends shared <a href="${site}/friends" style="color:#f0b44c">${d.unseenShares} ${d.unseenShares === 1 ? "title" : "titles"}</a> with you.</p>`
    : ""
}
<p style="margin:36px 0 0;color:#9c94a8;font-size:13px">You get this weekly because you turned it on in Settings.
<a href="${unsubscribe}" style="color:#9c94a8">Unsubscribe</a> · <a href="${site}/settings" style="color:#9c94a8">Settings</a></p>
</div></body></html>`;

  const text = [
    `Your week on Screening Room, ${d.name}`,
    ...(d.alerts.length ? ["", "New on your shows:", ...d.alerts.map((a) => `- ${a.item.title}: ${a.message} ${titleUrl(a.item)}`)] : []),
    ...(d.picks.length ? ["", "Picked for you:", ...d.picks.map((p) => `- ${p.item.title}${p.reason ? ` (${p.reason})` : ""} ${titleUrl(p.item)}`)] : []),
    ...(d.unseenShares ? ["", `Friends shared ${d.unseenShares} title(s) with you: ${site}/friends`] : []),
    "",
    `Unsubscribe: ${unsubscribe}`,
  ].join("\n");

  const subject = d.alerts.length
    ? `New season news for ${d.alerts[0].item.title}${d.alerts.length > 1 ? ` and ${d.alerts.length - 1} more` : ""}`
    : "Your weekly picks from Screening Room";
  return { subject, html, text };
}

/** Builds and sends one user's digest. Returns false when there was nothing to send. */
export async function sendDigestTo(userId: string, email: string) {
  const content = await loadDigest(userId);
  const unsubscribe = unsubscribeUrl(userId);
  const rendered = content && renderDigest(content, unsubscribe);
  if (!rendered) return false;
  await sendEmail({
    to: email,
    ...rendered,
    headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  });
  return true;
}

/**
 * The weekly cron job: sends to opted-in users who haven't had a digest in the
 * last six days, oldest first, a batch at a time.
 */
export async function sendWeeklyDigests(now = new Date()) {
  if (!emailConfigured()) return { skipped: "Email isn't configured (RESEND_API_KEY, DIGEST_FROM)." };
  const users = await db.user.findMany({
    where: {
      preference: { weeklyDigest: true },
      OR: [{ digestSentAt: null }, { digestSentAt: { lt: new Date(now.getTime() - 6 * DAY) } }],
    },
    orderBy: { digestSentAt: { sort: "asc", nulls: "first" } },
    take: DIGEST_BATCH,
    select: { id: true, email: true },
  });
  let sent = 0, empty = 0;
  const failed: string[] = [];
  for (const u of users) {
    try {
      if (await sendDigestTo(u.id, u.email)) sent++;
      else empty++;
      // Marked either way, so a user with nothing new isn't retried every run.
      await db.user.update({ where: { id: u.id }, data: { digestSentAt: now } });
    } catch (err) {
      failed.push(err instanceof Error ? err.message : String(err));
    }
  }
  // A total failure (bad API key, unverified domain) should fail the cron run
  // so the Sentry monitor reports it.
  if (users.length && failed.length === users.length) throw new Error(`Every digest failed: ${failed[0]}`);
  return { candidates: users.length, sent, empty, failed: failed.length };
}
