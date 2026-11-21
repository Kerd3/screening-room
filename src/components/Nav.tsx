"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Bookmark, Film, House, LogIn, Tv, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AccountMenu } from "./AccountMenu";
import { useMe } from "@/lib/client/hooks";
import { fetchJson } from "@/lib/client/fetcher";

const LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/movies", label: "Movies", icon: Film },
  { href: "/tv", label: "TV Series", icon: Tv },
  { href: "/bookmarks", label: "Bookmarks", icon: Bookmark },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me, isPending: meLoading } = useMe();
  const user = me?.user;
  const socialCount = (me?.unseenShares ?? 0) + (me?.pendingFriends ?? 0);

  async function signOut() {
    await fetchJson("/api/auth/logout", { method: "POST" });
    qc.clear();
    router.push("/");
    router.refresh();
  }

  return (
    <nav
      aria-label="Main"
      className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-velvet/90 px-2 py-2 backdrop-blur
                 sm:justify-start sm:gap-1 sm:px-4
                 lg:fixed lg:inset-y-0 lg:left-0 lg:w-[88px] lg:flex-col lg:gap-2 lg:border-b-0 lg:border-r lg:px-0 lg:py-6"
    >
      {/* Below 640px the Home icon doubles as the logo, so all 8 targets keep 44px. */}
      <Link
        href="/"
        className="display hidden px-2 text-[28px] text-tungsten sm:mr-auto sm:block lg:mr-0 lg:mb-8"
        aria-label="Screening Room home"
      >
        SR
      </Link>

      <ul className="flex items-center sm:gap-1 lg:flex-col lg:gap-2">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                title={label}
                className={`flex size-11 items-center justify-center rounded-full transition-colors duration-150
                  lg:h-auto lg:w-[72px] lg:flex-col lg:gap-1 lg:rounded-[10px] lg:py-2
                  ${active ? "text-tungsten" : "text-usher hover:bg-stall hover:text-paper"}`}
              >
                <Icon className="size-5" aria-hidden strokeWidth={active ? 2.25 : 1.75} />
                <span className="sr-only lg:not-sr-only lg:text-[13px] lg:font-medium">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center sm:ml-2 sm:gap-1 lg:mt-auto lg:ml-0 lg:flex-col lg:gap-2">
        {meLoading ? (
          // Neutral placeholder while the session loads, so signed-in users never see "Log in" flash.
          <span aria-hidden className="size-11 rounded-full bg-stall motion-safe:animate-pulse" />
        ) : user ? (
          <>
            <IconLink href="/friends" label="Friends and shares" icon={Users} count={socialCount} />
            <IconLink href="/alerts" label="New season alerts" icon={Bell} count={me?.unreadAlerts ?? 0} />
            <AccountMenu user={user} onSignOut={signOut} />
          </>
        ) : (
          <Link
            href={`/login?next=${encodeURIComponent(pathname)}`}
            className="flex h-11 items-center gap-2 rounded-full px-3 text-[15px] font-medium text-paper hover:bg-stall
                       lg:w-[72px] lg:flex-col lg:gap-1 lg:rounded-[10px] lg:py-2 lg:text-[13px]"
          >
            <LogIn className="size-5" aria-hidden />
            Log in
          </Link>
        )}
      </div>
    </nav>
  );
}

/** Same frame as Nav, used in the static shell until the real nav streams in. */
export function NavFallback() {
  return (
    <div
      aria-hidden
      className="sticky top-0 z-30 flex h-[61px] items-center border-b border-line bg-velvet/90 px-4
                 lg:fixed lg:inset-y-0 lg:left-0 lg:h-auto lg:w-[88px] lg:flex-col lg:border-b-0 lg:border-r lg:px-0 lg:py-6"
    >
      <span className="display px-2 text-[28px] text-tungsten">SR</span>
    </div>
  );
}

function IconLink({
  href,
  label,
  icon: Icon,
  count,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  count: number;
}) {
  return (
    <Link
      href={href}
      title={label}
      className="relative flex size-11 items-center justify-center rounded-full text-usher transition-colors duration-150
                 hover:bg-stall hover:text-paper"
    >
      <Icon className="size-5" aria-hidden strokeWidth={1.75} />
      <span className="sr-only">
        {label}
        {count > 0 ? `, ${count} new` : ""}
      </span>
      {count > 0 && (
        <span
          aria-hidden
          className="absolute right-1 top-1 flex min-w-[18px] items-center justify-center rounded-full bg-tungsten px-1
                     text-[11px] font-semibold leading-[18px] text-velvet"
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
