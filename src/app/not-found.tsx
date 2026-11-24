import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

/** Any URL that doesn't exist. Styled like the rest of the site, with ways back in. */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-velvet px-4 text-paper">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-tungsten">404</p>
        <h1 className="display mt-2 text-[64px]">Nothing showing here</h1>
        <p className="mt-4 text-usher">That page doesn&rsquo;t exist. It may have moved, or the link may be mistyped.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="inline-flex h-11 items-center rounded-full bg-tungsten px-6 text-[15px] font-semibold text-velvet hover:bg-[#f5c46a]">
            Go home
          </Link>
          <Link href="/movies" className="inline-flex h-11 items-center rounded-full border border-line px-6 text-[15px] font-semibold hover:bg-stall">
            Browse movies
          </Link>
        </div>
      </div>
    </main>
  );
}
