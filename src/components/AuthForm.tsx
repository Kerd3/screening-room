"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, fetchJson } from "@/lib/client/fetcher";

/** Only same-site paths, so ?next= can't redirect off the app. */
function safeNext(raw: string | null) {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  const isLogin = mode === "login";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await fetchJson(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify(data) });
      await qc.invalidateQueries();
      router.push(next);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError("Check the highlighted fields.");
        setFieldErrors(err.issues ?? {});
      } else {
        setError(err instanceof Error ? err.message : "That didn't work. Try again.");
      }
      setPending(false);
    }
  }

  const input =
    "mt-2 h-12 w-full rounded-[10px] border border-line bg-stall px-4 text-paper placeholder:text-usher focus:border-tungsten/60 focus:outline-none aria-[invalid=true]:border-exit";

  return (
    <div className="w-full max-w-sm">
      <h1 className="display text-[64px] text-paper">{isLogin ? "Log in" : "Sign up"}</h1>
      <p className="mt-2 text-usher">
        {isLogin ? "Pick up your bookmarks and recommendations." : "Save titles, rate them, and get picks from what you save."}
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
        {!isLogin && (
          <Field label="Name" name="name" errors={fieldErrors.name}>
            <input id="name" name="name" autoComplete="name" required className={input} aria-invalid={!!fieldErrors.name} />
          </Field>
        )}
        <Field label="Email" name="email" errors={fieldErrors.email}>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={input}
            aria-invalid={!!fieldErrors.email}
          />
        </Field>
        <Field
          label="Password"
          name="password"
          hint={isLogin ? undefined : "At least 8 characters."}
          errors={fieldErrors.password}
        >
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            required
            minLength={isLogin ? undefined : 8}
            className={input}
            aria-invalid={!!fieldErrors.password}
          />
        </Field>

        {error && (
          <p role="alert" className="text-[15px] text-exit">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="h-12 w-full rounded-full bg-tungsten text-base font-semibold text-velvet transition-colors duration-150 hover:bg-[#f5c46a] disabled:opacity-50"
        >
          {pending ? (isLogin ? "Logging in…" : "Creating account…") : isLogin ? "Log in" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-[15px] text-usher">
        {isLogin ? "New here? " : "Already have an account? "}
        <Link
          href={`/${isLogin ? "register" : "login"}${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-paper underline decoration-tungsten underline-offset-4"
        >
          {isLogin ? "Create an account" : "Log in"}
        </Link>
      </p>
    </div>
  );
}

function Field({
  label,
  name,
  hint,
  errors,
  children,
}: {
  label: string;
  name: string;
  hint?: string;
  errors?: string[];
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-[15px] font-medium text-paper">
        {label}
      </label>
      {children}
      {errors?.length ? (
        <p className="mt-2 text-sm text-exit">{errors[0]}</p>
      ) : (
        hint && <p className="mt-2 text-sm text-usher">{hint}</p>
      )}
    </div>
  );
}
