import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const { useMe } = await import("./hooks");

function Probe() {
  const me = useMe();
  return createElement("span", null, me.data?.user ? `signed in as ${me.data.user.name}` : "unknown");
}

describe("useMe during hydration", () => {
  it("ignores an already-cached user on the first render, so it matches the server HTML", () => {
    // Another part of the page may have fetched the user before this one hydrates.
    const client = new QueryClient();
    client.setQueryData(["me"], { user: { id: "u1", name: "Riley", email: "riley@example.com" } });

    // The server snapshot is what hydration uses for the first client render.
    const html = renderToString(createElement(QueryClientProvider, { client }, createElement(Probe)));
    expect(html).toContain("unknown");
    expect(html).not.toContain("signed in");
  });
});
