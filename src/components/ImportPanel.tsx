"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { ApiError, fetchJson } from "@/lib/client/fetcher";
import { chunk, parseImport, type ImportKind, type ParsedImport } from "@/lib/importCsv";

const BATCH = 50;

type Phase =
  | { step: "idle" }
  | { step: "ready"; file: string; parsed: ParsedImport }
  | { step: "importing"; done: number; total: number }
  | { step: "done"; imported: number; unmatched: string[]; cancelled: boolean };

const SOURCE_NAME = { letterboxd: "Letterboxd", imdb: "IMDb" } as const;

/**
 * Letterboxd and IMDb import. The file is read in the browser and sent in
 * batches of 50, so large histories don't hit server time limits and the
 * progress bar shows real progress.
 */
export function ImportPanel() {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ step: "idle" });
  const [kind, setKind] = useState<Exclude<ImportKind, "ratings">>("watched");
  const [error, setError] = useState("");
  const cancelled = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    setError("");
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setError("That file is over 5 MB. Export files are usually much smaller.");
    try {
      const parsed = parseImport(await file.text());
      if (!parsed.rows.length) return setError("No titles found in that file.");
      setPhase({ step: "ready", file: file.name, parsed });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    }
  }

  async function run(parsed: ParsedImport) {
    const finalKind: ImportKind = parsed.hasRatings ? "ratings" : kind;
    const batches = chunk(parsed.rows, BATCH);
    cancelled.current = false;
    let imported = 0;
    const unmatched: string[] = [];
    setPhase({ step: "importing", done: 0, total: parsed.rows.length });

    for (let i = 0; i < batches.length && !cancelled.current; i++) {
      try {
        const r = await postBatch({ source: parsed.source, kind: finalKind, rows: batches[i] });
        imported += r.imported;
        unmatched.push(...r.unmatched);
      } catch (e) {
        setError(e instanceof Error ? e.message : "The import stopped.");
        break;
      }
      setPhase({ step: "importing", done: Math.min((i + 1) * BATCH, parsed.rows.length), total: parsed.rows.length });
    }
    setPhase({ step: "done", imported, unmatched, cancelled: cancelled.current });
    for (const key of ["watched", "bookmarks", "recommendations"]) qc.invalidateQueries({ queryKey: [key] });
    // Ratings live in per-title queries; refresh them too.
    qc.invalidateQueries({ queryKey: ["ratings"] });
  }

  function reset() {
    setPhase({ step: "idle" });
    setError("");
    if (input.current) input.current.value = "";
  }

  return (
    <div className="space-y-5">
      <p className="text-[15px] text-usher">
        Bring your history from Letterboxd (Settings, Import &amp; Export, Export your data) or IMDb (Your ratings or Your
        watchlist, then Export). Upload one CSV at a time: <span className="text-paper">watched</span>,{" "}
        <span className="text-paper">diary</span>, <span className="text-paper">ratings</span> or{" "}
        <span className="text-paper">watchlist</span>. Anything you already rated here is kept as it is.
      </p>

      {phase.step === "idle" && (
        <label className="flex h-11 w-fit cursor-pointer items-center gap-2 rounded-full bg-tungsten px-5 text-[15px] font-semibold text-velvet transition-colors duration-150 hover:bg-[#f5c46a] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-paper">
          <Upload className="size-5" aria-hidden />
          Choose a CSV file
          <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      )}

      {phase.step === "ready" && (
        <div className="space-y-4 rounded-panel bg-stall p-5">
          <p className="text-paper">
            <span className="font-semibold">{phase.file}</span>: {SOURCE_NAME[phase.parsed.source]} export,{" "}
            {phase.parsed.rows.length} {phase.parsed.rows.length === 1 ? "title" : "titles"}
            {phase.parsed.skipped > 0 && <span className="text-usher"> ({phase.parsed.skipped} rows skipped, such as TV episodes)</span>}
          </p>
          {phase.parsed.hasRatings ? (
            <p className="text-[15px] text-usher">This file has ratings. They&rsquo;ll be added as ratings, and the titles to your watch history.</p>
          ) : (
            <fieldset>
              <legend className="font-medium text-paper">This file is</legend>
              <div role="radiogroup" aria-label="This file is" className="mt-3 inline-flex flex-wrap gap-1 rounded-[24px] bg-velvet p-1 sm:rounded-full">
                {(
                  [
                    ["watched", "Films I've watched"],
                    ["watchlist", "My watchlist (adds bookmarks)"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={kind === v}
                    onClick={() => setKind(v)}
                    className={`h-11 rounded-full px-4 text-[15px] font-medium transition-colors duration-150 ${kind === v ? "bg-paper text-velvet" : "text-usher hover:text-paper"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => run(phase.parsed)}
              className="h-11 rounded-full bg-tungsten px-5 text-[15px] font-semibold text-velvet transition-colors duration-150 hover:bg-[#f5c46a]"
            >
              Import {phase.parsed.rows.length} {phase.parsed.rows.length === 1 ? "title" : "titles"}
            </button>
            <button type="button" onClick={reset} className="h-11 rounded-full border border-line px-5 text-[15px] font-semibold text-paper hover:bg-stall-raised">
              Choose another file
            </button>
          </div>
        </div>
      )}

      {phase.step === "importing" && (
        <div className="space-y-3 rounded-panel bg-stall p-5">
          <p className="text-paper" aria-live="polite">
            Matching titles with TMDB… {phase.done} of {phase.total}
          </p>
          <progress value={phase.done} max={phase.total} aria-label="Import progress" className="h-2 w-full overflow-hidden rounded-full accent-tungsten" />
          <button type="button" onClick={() => (cancelled.current = true)} className="h-11 rounded-full border border-line px-5 text-[15px] font-semibold text-paper hover:bg-stall-raised">
            Stop after this batch
          </button>
        </div>
      )}

      {phase.step === "done" && (
        <div className="space-y-3 rounded-panel bg-stall p-5" role="status">
          <p className="text-paper">
            {phase.cancelled ? "Stopped. " : ""}Imported <span className="font-semibold">{phase.imported}</span>{" "}
            {phase.imported === 1 ? "title" : "titles"}.{" "}
            <Link href={kind === "watchlist" ? "/bookmarks" : "/watched"} className="font-medium underline decoration-tungsten underline-offset-4">
              See your {kind === "watchlist" ? "bookmarks" : "watch history"}
            </Link>
          </p>
          {phase.unmatched.length > 0 && (
            <details className="text-[15px] text-usher">
              <summary className="cursor-pointer">
                {phase.unmatched.length} couldn&rsquo;t be matched on TMDB
              </summary>
              <ul className="mt-2 max-h-48 list-disc overflow-auto pl-5">
                {phase.unmatched.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </details>
          )}
          <button type="button" onClick={reset} className="h-11 rounded-full border border-line px-5 text-[15px] font-semibold text-paper hover:bg-stall-raised">
            Import another file
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-[15px] text-exit">
          {error}
        </p>
      )}
    </div>
  );
}

/** Posts one batch, waiting and retrying once if the server says to slow down. */
async function postBatch(body: unknown): Promise<{ imported: number; unmatched: string[] }> {
  const send = () => fetchJson<{ imported: number; unmatched: string[] }>("/api/import", { method: "POST", body: JSON.stringify(body) });
  try {
    return await send();
  } catch (e) {
    if (e instanceof ApiError && e.status === 429) {
      await new Promise((r) => setTimeout(r, 30_000));
      return send();
    }
    throw e;
  }
}
