"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Bookmark, LogOut, Settings, Users } from "lucide-react";

/**
 * The avatar opens this menu instead of signing out directly, so a stray
 * click on the profile picture can't end the session.
 */
export function AccountMenu({
  user,
  onSignOut,
}: {
  user: { name: string; email: string };
  onSignOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const items = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  function close({ restoreFocus = false } = {}) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }

  // Close on outside click or Escape; move focus into the menu when it opens.
  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close({ restoreFocus: true });
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Arrow keys, Home and End move between menu items (WAI-ARIA menu pattern).
  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      list[(n + list.length) % list.length]?.focus();
    };
    if (e.key === "ArrowDown") go(i + 1);
    if (e.key === "ArrowUp") go(i - 1);
    if (e.key === "Home") go(0);
    if (e.key === "End") go(list.length - 1);
    if (e.key === "Tab") setOpen(false);
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
      setOpen(false);
    }
  }

  const item =
    "flex h-11 w-full items-center gap-3 rounded-[10px] px-3 text-left text-[15px] text-paper transition-colors duration-150 hover:bg-stall focus-visible:bg-stall focus-visible:outline-none";

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="Account"
        onClick={() => setOpen((o) => !o)}
        className={`flex size-11 items-center justify-center rounded-full text-[15px] font-semibold text-paper transition-colors duration-150
          ${open ? "bg-stall-raised ring-2 ring-tungsten/60" : "bg-stall hover:bg-stall-raised"}`}
      >
        <span aria-hidden>{user.name.slice(0, 1).toUpperCase()}</span>
        <span className="sr-only">Account menu for {user.name}</span>
      </button>

      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full z-40 mt-2 w-64 origin-top-right rounded-panel border border-line bg-stall-raised p-2
                     shadow-[0_1px_2px_rgb(0_0_0/0.3),0_12px_32px_rgb(0_0_0/0.4)] motion-safe:animate-menu-in
                     lg:left-full lg:right-auto lg:top-auto lg:bottom-0 lg:ml-3 lg:mt-0 lg:origin-bottom-left"
        >
          <div className="px-3 pb-2 pt-1">
            <p className="truncate font-semibold text-paper">{user.name}</p>
            <p className="truncate text-sm text-usher">{user.email}</p>
          </div>
          <div role="separator" className="my-1 h-px bg-line" />
          <Link role="menuitem" href="/bookmarks" onClick={() => close()} className={item}>
            <Bookmark className="size-4 text-usher" aria-hidden />
            Your bookmarks
          </Link>
          <Link role="menuitem" href="/friends" onClick={() => close()} className={item}>
            <Users className="size-4 text-usher" aria-hidden />
            Friends and shares
          </Link>
          <Link role="menuitem" href="/settings" onClick={() => close()} className={item}>
            <Settings className="size-4 text-usher" aria-hidden />
            Settings
          </Link>
          <div role="separator" className="my-1 h-px bg-line" />
          <button role="menuitem" type="button" onClick={signOut} disabled={signingOut} className={`${item} disabled:opacity-60`}>
            <LogOut className="size-4 text-usher" aria-hidden />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
