"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ApiError } from "@/lib/client/fetcher";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            // Retrying won't help with a missing token, bad input or a signed-out user.
            retry: (count, err) =>
              !(err instanceof ApiError && err.status < 500 && err.status !== 429) &&
              !(err instanceof ApiError && err.code === "TMDB_NOT_CONFIGURED") &&
              count < 2,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
