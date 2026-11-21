import type { ReactNode } from "react";
import { ApiError } from "@/lib/client/fetcher";

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h2 className="display text-[40px] text-paper">{title}</h2>
      {children && <div className="mt-4 text-base text-usher">{children}</div>}
    </div>
  );
}

export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (error instanceof ApiError && error.code === "TMDB_NOT_CONFIGURED") {
    return (
      <div className="max-w-2xl rounded-panel border border-tungsten/30 bg-stall p-6">
        <h2 className="text-xl font-semibold text-paper">Connect TMDB to load the catalog</h2>
        <p className="mt-2 text-usher">
          Create a free API key at themoviedb.org (Settings, then API), copy the{" "}
          <span className="text-paper">API Read Access Token</span> into{" "}
          <code className="rounded bg-velvet px-1.5 py-0.5 text-paper">TMDB_READ_TOKEN</code> in{" "}
          <code className="rounded bg-velvet px-1.5 py-0.5 text-paper">.env</code>, and restart the dev
          server.
        </p>
      </div>
    );
  }
  const message =
    error instanceof ApiError && error.status === 429
      ? "You're browsing faster than the catalog allows. Wait a few seconds, then try again."
      : error instanceof Error
        ? error.message
        : "The catalog didn't load.";
  return (
    <div role="alert" className="flex flex-wrap items-center gap-4 rounded-panel bg-stall p-4 text-paper">
      <span>{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="h-11 rounded-full border border-line px-4 text-[15px] font-medium hover:bg-stall-raised"
        >
          Try again
        </button>
      )}
    </div>
  );
}
