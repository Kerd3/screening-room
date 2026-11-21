import Link from "next/link";
import { Suspense } from "react";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col px-4 py-8 md:px-8">
      <Link href="/" className="display text-[28px] text-tungsten" aria-label="Screening Room home">
        SR
      </Link>
      <main className="flex flex-1 items-center justify-center py-12">
        <Suspense>{children}</Suspense>
      </main>
    </div>
  );
}
