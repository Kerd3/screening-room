"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False on the server and during hydration, true afterwards.
 *
 * Sections of the page hydrate at different times (each Suspense boundary on
 * its own), and they share one query cache. Without this, a section that
 * hydrates late can see data an earlier section already fetched (like the
 * signed-in user) and render differently from the server HTML, which is a
 * hydration error. Gating on this keeps the first client render identical.
 */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
