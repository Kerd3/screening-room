export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    /** Per-field validation messages from a 400 response. */
    readonly issues?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`, body.code, body.issues);
  }
  return body as T;
}

export function qs(params: Record<string, string | number | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  return sp.toString();
}
