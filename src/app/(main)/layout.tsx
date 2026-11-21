import { Suspense } from "react";
import { Nav, NavFallback } from "@/components/Nav";
import { SearchBar } from "@/components/SearchBar";

export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-tungsten focus:px-4 focus:py-2 focus:text-velvet"
      >
        Skip to content
      </a>
      {/* usePathname is runtime data on dynamic routes, so Nav streams in behind a boundary. */}
      <Suspense fallback={<NavFallback />}>
        <Nav />
      </Suspense>
      <div className="px-4 pb-24 pt-6 md:px-8 lg:ml-[88px] lg:pt-8">
        <div className="mx-auto max-w-[1440px]">
          <Suspense fallback={<div className="h-12" />}>
            <SearchBar />
          </Suspense>
          <main id="content" className="mt-8">
            <Suspense>{children}</Suspense>
          </main>
        </div>
      </div>
    </>
  );
}
