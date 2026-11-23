"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type ReactNode } from "react";
import { ImportPanel } from "./ImportPanel";
import { ErrorNotice } from "./Notice";
import { ApiError, fetchJson } from "@/lib/client/fetcher";
import { useMe, type Me } from "@/lib/client/hooks";

interface Preferences {
  bookmarksPublic: boolean;
  alertsEnabled: boolean;
  preferredMediaType: "all" | "movie" | "tv";
  weeklyDigest: boolean;
  /** False until the server has an email provider configured. */
  emailConfigured: boolean;
}

const SHOW_ME = [
  { value: "all", label: "Movies and series" },
  { value: "movie", label: "Movies only" },
  { value: "tv", label: "Series only" },
] as const;

export function SettingsView() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const prefs = useQuery({
    queryKey: ["preferences"],
    queryFn: () => fetchJson<Preferences>("/api/me/preferences"),
  });
  const [status, setStatus] = useState("");

  // Preference changes save immediately and roll back if the server refuses.
  const savePref = useMutation({
    mutationFn: (patch: Partial<Preferences>) =>
      fetchJson<Preferences>("/api/me/preferences", { method: "PATCH", body: JSON.stringify(patch) }),
    onMutate: async (patch) => {
      setStatus("Saving…");
      await qc.cancelQueries({ queryKey: ["preferences"] });
      const prev = qc.getQueryData<Preferences>(["preferences"]);
      if (prev) qc.setQueryData(["preferences"], { ...prev, ...patch });
      return { prev };
    },
    onError: (err, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(["preferences"], ctx.prev);
      setStatus(`Not saved: ${err.message}`);
    },
    onSuccess: (data, patch) => {
      qc.setQueryData(["preferences"], data);
      setStatus("Saved");
      if ("preferredMediaType" in patch) qc.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });

  if (prefs.isError) return <ErrorNotice error={prefs.error} onRetry={() => prefs.refetch()} />;
  // Show a skeleton until real values arrive, so switches never flash a default state.
  if (!prefs.data || !me?.user) return <SettingsSkeleton />;
  const p = prefs.data;

  return (
    <div className="max-w-2xl">
      <h1 className="display text-[64px] text-paper">Settings</h1>
      <p role="status" aria-live="polite" className="mt-2 min-h-6 text-[15px] text-usher">
        {status}
      </p>

      <Section title="Profile">
        <ProfileForm
          key={me.user.name}
          name={me.user.name}
          email={me.user.email}
          onSaved={(user) => {
            qc.setQueryData<Me>(["me"], (old) => (old ? { ...old, user } : old));
            setStatus("Saved");
          }}
        />
      </Section>

      <Section title="Privacy">
        <Switch
          label="Show my bookmarks to friends"
          description="Friends can open your bookmarks from their Friends page. Turn this off to keep your list to yourself."
          checked={p.bookmarksPublic}
          onChange={(v) => savePref.mutate({ bookmarksPublic: v })}
        />
      </Section>

      <Section title="Notifications">
        <Switch
          label="New season alerts"
          description="Get an alert when a series you bookmarked has a new season or a new air date."
          checked={p.alertsEnabled}
          onChange={(v) => savePref.mutate({ alertsEnabled: v })}
        />
        <div className="mt-8">
          <Switch
            label="Weekly email digest"
            description={`Every Monday: new-season news for your shows and five fresh picks, sent to ${me.user.email}.`}
            checked={p.weeklyDigest}
            onChange={(v) => savePref.mutate({ weeklyDigest: v })}
          />
          {p.weeklyDigest && <DigestPreview configured={p.emailConfigured} />}
        </div>
      </Section>

      <Section title="Recommendations">
        <fieldset>
          <legend className="font-medium text-paper">Show me in “For you”</legend>
          <p className="mt-1 text-[15px] text-usher">Your bookmarks and ratings still count either way.</p>
          {/* Stacked full-width on phones, one pill row from 640px up. */}
          <div
            role="radiogroup"
            aria-label="Show me in For you"
            className="mt-4 flex flex-col gap-1 rounded-[24px] bg-stall p-1 sm:inline-flex sm:flex-row sm:rounded-full"
          >
            {SHOW_ME.map((o) => {
              const on = p.preferredMediaType === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => !on && savePref.mutate({ preferredMediaType: o.value })}
                  className={`h-11 rounded-full px-5 text-left text-[15px] font-medium transition-colors duration-150 sm:text-center
                    ${on ? "bg-paper text-velvet" : "text-usher hover:text-paper"}`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      </Section>

      <Section title="Import your history" id="import">
        <ImportPanel />
      </Section>
    </div>
  );
}

function DigestPreview({ configured }: { configured: boolean }) {
  const send = useMutation({
    mutationFn: () => fetchJson<{ sentTo: string }>("/api/digest/preview", { method: "POST" }),
  });
  if (!configured) {
    return (
      <p className="mt-3 text-[15px] text-usher">
        Your choice is saved. Emails start once the site&rsquo;s email service is set up.
      </p>
    );
  }
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => send.mutate()}
        disabled={send.isPending}
        className="h-11 rounded-full border border-line px-5 text-[15px] font-semibold text-paper transition-colors duration-150 hover:bg-stall disabled:opacity-60"
      >
        {send.isPending ? "Sending…" : "Send me a preview"}
      </button>
      <p role="status" aria-live="polite" className="text-[15px] text-usher">
        {send.isSuccess && `Sent to ${send.data.sentTo}.`}
        {send.isError && <span className="text-exit">{send.error.message}</span>}
      </p>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="max-w-2xl" aria-busy="true" aria-label="Loading your settings">
      <h1 className="display text-[64px] text-paper">Settings</h1>
      <div className="mt-8 space-y-10">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} aria-hidden className="space-y-3 border-t border-line pt-8">
            <div className="h-5 w-32 rounded bg-stall" />
            <div className="h-4 w-3/4 rounded bg-stall motion-safe:animate-pulse" />
            <div className="h-11 w-full rounded-full bg-stall motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({ title, children, id: anchor }: { title: string; children: ReactNode; id?: string }) {
  const id = useId();
  return (
    <section id={anchor} aria-labelledby={id} className="scroll-mt-24 border-t border-line py-8 first-of-type:mt-6">
      <h2 id={id} className="mb-6 text-xl font-semibold text-paper">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** An on/off switch with a 44px target; the whole row is clickable. */
function Switch({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-6">
      <div>
        <label htmlFor={id} className="font-medium text-paper">
          {label}
        </label>
        <p id={`${id}-desc`} className="mt-1 text-[15px] text-usher">
          {description}
        </p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={`${id}-desc`}
        onClick={() => onChange(!checked)}
        className="flex h-11 w-16 shrink-0 items-center"
      >
        <span
          aria-hidden
          className={`relative h-7 w-12 rounded-full transition-colors duration-150 ${checked ? "bg-tungsten" : "bg-stall-raised"}`}
        >
          <span
            className={`absolute left-1 top-1 size-5 rounded-full bg-paper transition-transform duration-150 ease-out
              ${checked ? "translate-x-5" : "translate-x-0"}`}
          />
        </span>
      </button>
    </div>
  );
}

function ProfileForm({
  name: initialName,
  email,
  onSaved,
}: {
  name: string;
  email: string;
  onSaved: (user: { id: string; name: string; email: string }) => void;
}) {
  const [name, setName] = useState(initialName);
  const save = useMutation({
    mutationFn: () => fetchJson<{ user: { id: string; name: string; email: string } }>("/api/me", {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
    onSuccess: ({ user }) => onSaved(user),
  });
  const fieldError =
    save.error instanceof ApiError ? (save.error.issues?.name?.[0] ?? save.error.message) : save.error?.message;
  const changed = name.trim() !== initialName && name.trim().length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (changed) save.mutate();
      }}
      className="space-y-6"
    >
      <div>
        <label htmlFor="display-name" className="block font-medium text-paper">
          Display name
        </label>
        <p className="mt-1 text-[15px] text-usher">Friends see this when you share a title or send a request.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <input
            id="display-name"
            value={name}
            maxLength={40}
            onChange={(e) => {
              setName(e.target.value);
              save.reset();
            }}
            aria-invalid={!!fieldError}
            className="h-11 min-w-0 flex-1 rounded-full border border-line bg-stall px-4 text-paper focus:border-tungsten/60 focus:outline-none aria-[invalid=true]:border-exit"
          />
          <button
            type="submit"
            disabled={!changed || save.isPending}
            className="h-11 rounded-full bg-tungsten px-5 text-[15px] font-semibold text-velvet transition-colors duration-150 hover:bg-[#f5c46a] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {save.isPending ? "Saving…" : "Save name"}
          </button>
        </div>
        {fieldError && <p className="mt-2 text-sm text-exit">{fieldError}</p>}
      </div>
      <div>
        <p className="font-medium text-paper">Email</p>
        <p className="mt-1 text-[15px] text-usher">{email}</p>
      </div>
    </form>
  );
}
