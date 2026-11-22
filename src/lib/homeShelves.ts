/**
 * The requests Home makes first. Shared by the client (which fetches them) and
 * the server page (which preloads them from the HTML so the fetches start
 * before the JavaScript has loaded). Plain module: usable on both sides.
 */
export const HOME_SHELF_URLS = [
  "/api/trending?type=all",
  "/api/trending?type=movie&page=2",
  "/api/trending?type=tv",
] as const;
