import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: sends signed-out visitors to /login before rendering
// a personal page. Real authorization happens in every API route.
const SESSION_COOKIE = "screening_session";

export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const url = new URL("/login", request.url);
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/bookmarks/:path*", "/friends/:path*", "/alerts/:path*", "/settings/:path*"],
};
