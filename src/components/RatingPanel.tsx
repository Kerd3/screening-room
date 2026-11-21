"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Star } from "lucide-react";
import { fetchJson, qs } from "@/lib/client/fetcher";
import { useMe } from "@/lib/client/hooks";
import type { MediaType } from "@/lib/tmdb/types";

interface RatingsResponse {
  mine: { score: number; review: string | null } | null;
  average: number | null;
  count: number;
  reviews: { id: number; name: string; score: number; review: string; updatedAt: string; mine: boolean }[];
}

export function RatingPanel({ type, tmdbId, title }: { type: MediaType; tmdbId: number; title: string }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const queryKey = ["ratings", type, tmdbId];
  const { data } = useQuery({
    queryKey,
    queryFn: () => fetchJson<RatingsResponse>(`/api/ratings?${qs({ type, tmdbId })}`),
  });

  const [score, setScore] = useState<number | null>(null);
  const [review, setReview] = useState("");
  const [savedNote, setSavedNote] = useState("");
  // Load the saved rating into the form whenever the server copy changes.
  const [loadedMine, setLoadedMine] = useState<RatingsResponse["mine"] | undefined>(undefined);
  if (data && data.mine !== loadedMine) {
    setLoadedMine(data.mine);
    if (data.mine) {
      setScore(data.mine.score);
      setReview(data.mine.review ?? "");
    }
  }

  const save = useMutation({
    mutationFn: () =>
      fetchJson("/api/ratings", { method: "PUT", body: JSON.stringify({ type, tmdbId, score, review }) }),
    onSuccess: () => {
      setSavedNote("Rating saved");
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });
  const remove = useMutation({
    mutationFn: () => fetchJson(`/api/ratings?${qs({ type, tmdbId })}`, { method: "DELETE" }),
    onSuccess: () => {
      setScore(null);
      setReview("");
      setSavedNote("Rating removed");
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });

  return (
    <section aria-labelledby="ratings-heading" className="mt-16 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <h2 id="ratings-heading" className="display text-[32px] text-paper">
          Your rating
        </h2>
        {!me?.user ? (
          <p className="mt-4 text-usher">
            <Link href={`/login?next=/title/${type}/${tmdbId}`} className="font-medium text-paper underline decoration-tungsten underline-offset-4">
              Log in
            </Link>{" "}
            to rate {title} and improve your recommendations.
          </p>
        ) : (
          <form
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (score) save.mutate();
            }}
          >
            {/* A fixed 5 x 2 grid, so the scale never wraps as 8 + 2. */}
            <div role="radiogroup" aria-label={`Rate ${title} from 1 to 10`} className="grid w-fit grid-cols-5 gap-2">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={score === n}
                  onClick={() => {
                    setScore(n);
                    setSavedNote("");
                  }}
                  className={`flex size-11 items-center justify-center rounded-full text-[15px] font-semibold transition-colors duration-150
                    ${score !== null && n <= score ? "bg-tungsten text-velvet" : "bg-stall text-usher hover:bg-stall-raised hover:text-paper"}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <label htmlFor="review" className="mt-6 block text-[15px] font-medium text-paper">
              Review <span className="font-normal text-usher">(optional)</span>
            </label>
            <textarea
              id="review"
              value={review}
              onChange={(e) => {
                setReview(e.target.value);
                setSavedNote("");
              }}
              rows={4}
              maxLength={2000}
              placeholder="What stayed with you?"
              className="mt-2 w-full max-w-xl rounded-panel border border-line bg-stall p-4 text-paper placeholder:text-usher focus:border-tungsten/60 focus:outline-none"
            />
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <button
                type="submit"
                disabled={!score || save.isPending}
                className="h-11 rounded-full bg-tungsten px-6 text-[15px] font-semibold text-velvet transition-colors duration-150 hover:bg-[#f5c46a] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {save.isPending ? "Saving…" : "Save rating"}
              </button>
              {data?.mine && (
                <button
                  type="button"
                  onClick={() => remove.mutate()}
                  className="h-11 px-2 text-[15px] text-usher underline-offset-4 hover:text-paper hover:underline"
                >
                  Remove rating
                </button>
              )}
              <span role="status" className="text-[15px] text-usher">
                {save.isError ? save.error.message : savedNote}
              </span>
            </div>
          </form>
        )}
      </div>

      <div>
        <h2 className="display text-[32px] text-paper">Reviews</h2>
        {data && data.count > 0 && (
          <p className="mt-2 flex items-center gap-2 text-usher">
            <Star className="size-4 fill-tungsten text-tungsten" aria-hidden />
            <span>
              <span className="font-semibold text-paper">{data.average?.toFixed(1)}</span> average from{" "}
              {data.count} {data.count === 1 ? "rating" : "ratings"} here
            </span>
          </p>
        )}
        {data?.reviews.length ? (
          <ul className="mt-6 space-y-6">
            {data.reviews.map((r) => (
              <li key={r.id} className="max-w-[65ch]">
                <p className="text-[15px] text-usher">
                  <span className="font-semibold text-paper">{r.mine ? "You" : r.name}</span>
                  <span className="ml-3">{r.score}/10</span>
                  <span className="ml-3">{new Date(r.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                </p>
                <p className="mt-1 whitespace-pre-line text-paper/90">{r.review}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-usher">No reviews here yet.</p>
        )}
      </div>
    </section>
  );
}
