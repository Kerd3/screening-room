"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { GRID } from "./InfiniteGrid";
import { MediaCard } from "./MediaCard";
import { EmptyState, ErrorNotice } from "./Notice";
import { fetchJson } from "@/lib/client/fetcher";
import { itemKey, useBookmarkKeys } from "@/lib/client/hooks";
import type { MediaItem } from "@/lib/tmdb/types";
import type { Friend } from "./ShareButton";

interface FriendsResponse {
  friends: Friend[];
  incoming: { requestId: number; user: Friend; createdAt: string }[];
  outgoing: { requestId: number; user: Friend; createdAt: string }[];
}
interface SharesResponse {
  shares: { id: number; from: string; note: string | null; createdAt: string; unseen: boolean; item: MediaItem }[];
}

const pill = "h-11 rounded-full px-5 text-[15px] font-semibold transition-colors duration-150";

export function FriendsView() {
  const qc = useQueryClient();
  const bookmarks = useBookmarkKeys();
  const friends = useQuery({ queryKey: ["friends"], queryFn: () => fetchJson<FriendsResponse>("/api/friends") });
  const shares = useQuery({ queryKey: ["shares"], queryFn: () => fetchJson<SharesResponse>("/api/shares") });
  const [email, setEmail] = useState("");
  const [viewing, setViewing] = useState<Friend | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["friends"] });
    qc.invalidateQueries({ queryKey: ["me"] });
  };
  const add = useMutation({
    mutationFn: () => fetchJson<{ status: string; name: string }>("/api/friends", { method: "POST", body: JSON.stringify({ email }) }),
    onSuccess: () => {
      setEmail("");
      refresh();
    },
  });
  const respond = useMutation({
    mutationFn: (v: { requestId: number; action: "accept" | "decline" }) =>
      fetchJson("/api/friends", { method: "PATCH", body: JSON.stringify(v) }),
    onSuccess: refresh,
  });

  // Opening this page counts as seeing the shared titles.
  const unseen = shares.data?.shares.some((s) => s.unseen);
  useEffect(() => {
    if (unseen) void fetchJson("/api/shares/seen", { method: "POST" }).then(() => qc.invalidateQueries({ queryKey: ["me"] }));
  }, [unseen, qc]);

  if (friends.isError) return <ErrorNotice error={friends.error} onRetry={() => friends.refetch()} />;

  return (
    <>
      <h1 className="display text-[64px] text-paper">Friends</h1>

      <div className="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-12">
          <section aria-labelledby="add-friend">
            <h2 id="add-friend" className="text-xl font-semibold text-paper">
              Add a friend
            </h2>
            <form
              className="mt-4 flex flex-wrap gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                add.mutate();
              }}
            >
              <label htmlFor="friend-email" className="sr-only">
                Friend&rsquo;s email
              </label>
              <input
                id="friend-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="friend@example.com"
                className="h-11 min-w-0 flex-1 rounded-full border border-line bg-stall px-4 text-paper placeholder:text-usher focus:border-tungsten/60 focus:outline-none"
              />
              <button type="submit" disabled={add.isPending} className={`${pill} bg-tungsten text-velvet hover:bg-[#f5c46a] disabled:opacity-50`}>
                Send request
              </button>
            </form>
            <p role="status" className="mt-2 text-[15px] text-usher">
              {add.isError
                ? <span className="text-exit">{add.error.message}</span>
                : add.data?.status === "ACCEPTED"
                  ? `You and ${add.data.name} are now friends.`
                  : add.data
                    ? `Request sent to ${add.data.name}. They'll see it next time they open Friends.`
                    : "Use the email they signed up with."}
            </p>
          </section>

          {friends.data && friends.data.incoming.length > 0 && (
            <section aria-labelledby="requests">
              <h2 id="requests" className="text-xl font-semibold text-paper">
                Requests
              </h2>
              <ul className="mt-4 space-y-3">
                {friends.data.incoming.map((r) => (
                  <li key={r.requestId} className="flex flex-wrap items-center gap-3 rounded-panel bg-stall p-4">
                    <span className="mr-auto">
                      <span className="font-semibold text-paper">{r.user.name}</span>
                      <span className="block text-sm text-usher">{r.user.email}</span>
                    </span>
                    <button onClick={() => respond.mutate({ requestId: r.requestId, action: "accept" })} className={`${pill} bg-paper text-velvet hover:bg-white`}>
                      Accept
                    </button>
                    <button onClick={() => respond.mutate({ requestId: r.requestId, action: "decline" })} className={`${pill} text-usher hover:bg-stall-raised hover:text-paper`}>
                      Decline
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="your-friends">
            <h2 id="your-friends" className="text-xl font-semibold text-paper">
              Your friends
            </h2>
            {friends.data?.friends.length ? (
              <ul className="mt-4 divide-y divide-line">
                {friends.data.friends.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 py-3">
                    <span className="flex size-10 items-center justify-center rounded-full bg-stall font-semibold" aria-hidden>
                      {f.name.slice(0, 1)}
                    </span>
                    <span className="mr-auto font-medium text-paper">{f.name}</span>
                    <button
                      onClick={() => setViewing(f)}
                      aria-pressed={viewing?.id === f.id}
                      aria-label={`See ${f.name}’s bookmarks`}
                      className="h-11 px-2 text-[15px] text-usher underline-offset-4 hover:text-paper hover:underline aria-pressed:text-tungsten"
                    >
                      See bookmarks
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-usher">No friends yet. Add someone by the email they signed up with.</p>
            )}
            {friends.data && friends.data.outgoing.length > 0 && (
              <p className="mt-4 text-sm text-usher">
                Waiting on {friends.data.outgoing.map((o) => o.user.name).join(", ")}
              </p>
            )}
          </section>
        </div>

        <div>
          {viewing ? (
            <FriendBookmarks friend={viewing} bookmarks={bookmarks} onClose={() => setViewing(null)} />
          ) : (
            <section aria-labelledby="shared">
              <h2 id="shared" className="text-xl font-semibold text-paper">
                Shared with you
              </h2>
              {shares.data?.shares.length ? (
                <ul className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-6 gap-y-10">
                  {shares.data.shares.map((s) => (
                    <li key={s.id}>
                      <MediaCard item={s.item} bookmarked={bookmarks.has(itemKey(s.item))} />
                      <p className="mt-2 text-sm text-usher">
                        From <span className="text-paper">{s.from}</span>
                      </p>
                      {s.note && <p className="mt-1 text-sm text-paper/85">&ldquo;{s.note}&rdquo;</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-usher">When a friend shares a title with you, it lands here.</p>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function FriendBookmarks({ friend, bookmarks, onClose }: { friend: Friend; bookmarks: Set<string>; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["friend-bookmarks", friend.id],
    queryFn: () => fetchJson<{ items: MediaItem[] }>(`/api/friends/${friend.id}/bookmarks`),
  });
  return (
    <section aria-labelledby="friend-bm">
      <div className="flex items-center gap-4">
        <h2 id="friend-bm" className="mr-auto text-xl font-semibold text-paper">
          {friend.name}&rsquo;s bookmarks
        </h2>
        <button onClick={onClose} className="h-11 px-2 text-[15px] text-usher hover:text-paper">
          Back to shared titles
        </button>
      </div>
      <div className="mt-6">
        {q.isError ? (
          <ErrorNotice error={q.error} />
        ) : q.data?.items.length === 0 ? (
          <EmptyState title="Nothing saved yet" />
        ) : (
          <div className={GRID}>
            {q.data?.items.map((i) => <MediaCard key={itemKey(i)} item={i} bookmarked={bookmarks.has(itemKey(i))} />)}
          </div>
        )}
      </div>
    </section>
  );
}
