import Link from "next/link";
import { Suspense } from "react";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col px-4 py-8 md:px-8">
      {/* In a header landmark; the name starts with the visible "SR" so voice
          control users can say what they see (WCAG 2.5.3, Label in Name). */}
      <header>
        <Link href="/" className="display text-[28px] text-tungsten" aria-label="SR, Screening Room home">
          SR
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center py-12">
        <Suspense>{children}</Suspense>
      </main>
    </div>
  );
}
