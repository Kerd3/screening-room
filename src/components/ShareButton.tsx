"use client";

import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { fetchJson } from "@/lib/client/fetcher";
import type { MediaItem } from "@/lib/tmdb/types";

export interface Friend {
  id: string;
  name: string;
  email: string;
}

export function ShareButton({ item }: { item: MediaItem }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [friendId, setFriendId] = useState("");
  const [note, setNote] = useState("");
  const friends = useQuery({
    queryKey: ["friends"],
    queryFn: () => fetchJson<{ friends: Friend[] }>("/api/friends"),
    select: (d) => d.friends,
  });
  const send = useMutation({
    mutationFn: () =>
      fetchJson("/api/shares", {
        method: "POST",
        body: JSON.stringify({ toUserId: friendId, type: item.mediaType, tmdbId: item.id, note }),
      }),
    onSuccess: () => setNote(""),
  });
  const recipient = friends.data?.find((f) => f.id === friendId);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          send.reset();
          dialog.current?.showModal();
        }}
        className="inline-flex h-11 items-center gap-2 rounded-full border border-paper/25 px-5 text-[15px] font-semibold text-paper transition-colors duration-150 hover:bg-paper/10"
      >
        <Send className="size-4" aria-hidden />
        Share
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="share-title"
        className="m-auto w-[min(480px,calc(100vw-32px))] rounded-panel bg-stall-raised p-0 text-paper backdrop:bg-black/60"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <h2 id="share-title" className="mr-auto text-xl font-semibold">
              Share {item.title}
            </h2>
            <button
              onClick={() => dialog.current?.close()}
              className="-m-2 flex size-11 items-center justify-center rounded-full text-usher hover:bg-stall hover:text-paper"
            >
              <X className="size-5" aria-hidden />
              <span className="sr-only">Close</span>
            </button>
          </div>

          {send.isSuccess ? (
            <p role="status" className="mt-4 text-usher">
              Sent to <span className="text-paper">{recipient?.name}</span>. It shows up in their shares.
            </p>
          ) : friends.data && friends.data.length === 0 ? (
            <p className="mt-4 text-usher">
              You haven&rsquo;t added any friends yet.{" "}
              <Link href="/friends" className="font-medium text-paper underline decoration-tungsten underline-offset-4">
                Add a friend
              </Link>{" "}
              by email to share titles with them.
            </p>
          ) : (
            <form
              className="mt-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (friendId) send.mutate();
              }}
            >
              <div>
                <label htmlFor="share-to" className="block text-[15px] font-medium">
                  Send to
                </label>
                <select
                  id="share-to"
                  required
                  value={friendId}
                  onChange={(e) => setFriendId(e.target.value)}
                  className="mt-2 h-11 w-full rounded-full border border-line bg-stall px-4 text-paper"
                >
                  <option value="">Choose a friend</option>
                  {friends.data?.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="share-note" className="block text-[15px] font-medium">
                  Note <span className="font-normal text-usher">(optional)</span>
                </label>
                <textarea
                  id="share-note"
                  rows={3}
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Why they'd like it"
                  className="mt-2 w-full rounded-panel border border-line bg-stall p-3 text-paper placeholder:text-usher focus:border-tungsten/60 focus:outline-none"
                />
              </div>
              {send.isError && (
                <p role="alert" className="text-exit">
                  {send.error.message}
                </p>
              )}
              <button
                type="submit"
                disabled={!friendId || send.isPending}
                className="h-11 rounded-full bg-tungsten px-6 text-[15px] font-semibold text-velvet hover:bg-[#f5c46a] disabled:opacity-40"
              >
                {send.isPending ? "Sending…" : recipient ? `Send to ${recipient.name}` : "Send"}
              </button>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
