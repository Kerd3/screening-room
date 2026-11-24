import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ProfileShelf } from "@/components/ProfileShelf";
import { loadPublicProfile } from "@/lib/publicProfile";

export async function generateMetadata({ params }: PageProps<"/u/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  await connection(); // profiles change and can be made private at any time
  const p = await loadPublicProfile(handle);
  if (!p) return { title: "Profile not found", robots: { index: false } };
  const description = p.topGenres.length
    ? `${p.name} watches a lot of ${p.topGenres.join(", ")}. See their favorites on Screening Room.`
    : `${p.name}'s favorites and recent watches on Screening Room.`;
  return {
    title: `${p.name}'s profile`,
    description,
    alternates: { canonical: `/u/${p.handle}` },
    openGraph: { type: "profile", title: `${p.name} on Screening Room`, description, url: `/u/${p.handle}` },
    twitter: { card: "summary_large_image", title: `${p.name} on Screening Room`, description },
  };
}

export default function ProfilePage({ params }: PageProps<"/u/[handle]">) {
  return (
    <Suspense fallback={<div className="h-40 w-full rounded-panel bg-stall" aria-busy="true" />}>
      <Profile params={params} />
    </Suspense>
  );
}

async function Profile({ params }: { params: PageProps<"/u/[handle]">["params"] }) {
  const { handle } = await params;
  await connection();
  const p = await loadPublicProfile(handle);
  // Same message for "no such profile" and "private", so visitors can't tell
  // which (the metadata above also marks it noindex).
  if (!p) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="display text-[48px] text-paper">Profile not available</h1>
        <p className="mt-4 text-usher">This profile is private or doesn&rsquo;t exist.</p>
        <Link href="/" className="mt-8 inline-flex h-11 items-center rounded-full border border-line px-5 font-semibold text-paper hover:bg-stall">
          Go to Screening Room
        </Link>
      </div>
    );
  }

  const since = new Date(p.memberSince).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const stats = [
    [p.counts.watched, "watched"],
    [p.counts.rated, "rated"],
    [p.counts.bookmarked, "bookmarked"],
  ] as const;

  return (
    <article>
      <header className="mb-12 flex flex-wrap items-end gap-x-8 gap-y-4">
        <div
          aria-hidden
          className="flex size-24 items-center justify-center rounded-full bg-stall-raised text-[40px] font-semibold text-tungsten"
        >
          {p.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="mr-auto">
          <h1 className="display text-[64px] text-paper">{p.name}</h1>
          <p className="mt-1 text-usher">Member since {since}</p>
          {p.topGenres.length > 0 && (
            <p className="mt-3 text-paper/90">
              Mostly watches <span className="text-lilac">{p.topGenres.join(", ")}</span>
            </p>
          )}
        </div>
        <dl className="flex gap-8">
          {stats.map(([n, label]) => (
            <div key={label}>
              <dt className="text-sm text-usher">{label[0].toUpperCase() + label.slice(1)}</dt>
              <dd className="display text-[40px] text-paper">{n}</dd>
            </div>
          ))}
        </dl>
      </header>

      {p.favorites.length === 0 && p.recent.length === 0 ? (
        <p className="text-usher">{p.name} hasn&rsquo;t rated or watched anything yet.</p>
      ) : (
        <>
          <ProfileShelf
            title="Favorites"
            items={p.favorites}
            notes={Object.fromEntries(p.favorites.map((f) => [`${f.mediaType}:${f.id}`, `Rated ${f.score}/10`]))}
          />
          <ProfileShelf title="Recently watched" items={p.recent} />
        </>
      )}
    </article>
  );
}
