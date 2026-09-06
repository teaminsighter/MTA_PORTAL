import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/*
 * Route protection.
 *
 * Public routes (matched by the exclusion in `config.matcher` below):
 *   - /signin
 *   - /api/auth/*         Auth.js callbacks
 *   - /_next/*            Next.js static / image / hmr
 *   - /favicon.ico
 *
 * Everything else runs through auth() and redirects unauthenticated
 * requests to /signin with ?from=<original>. Once §12 lands (Phase 1
 * step 4), server actions layer a role check on top; the middleware only
 * asserts "signed in at all".
 */
export default auth((req) => {
  if (!req.auth) {
    const url = new URL("/signin", req.nextUrl);
    if (req.nextUrl.pathname !== "/") {
      url.searchParams.set("from", req.nextUrl.pathname + req.nextUrl.search);
    }
    return NextResponse.redirect(url);
  }
});

export const config = {
  matcher: [
    "/((?!api/auth|api/health|signin|_next/static|_next/image|_next/hmr|favicon.ico).*)",
  ],
};
