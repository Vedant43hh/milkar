// Fast gate: requests without a session cookie go to /login. It does not validate the session;
// every page and server action still checks access through src/lib/auth/current-user.ts.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/rules";
import { recordPageRequest } from "@/lib/dev-reload-watchdog";

// The landing page, welcome, login, registration and invite links are public; every portal needs a session.
const PUBLIC_PATHS = [/^\/$/, /^\/welcome(?:\/|$)/, /^\/login(?:\/|$)/, /^\/register(?:\/|$)/, /^\/join(?:\/|$)/, /^\/offline(?:\/|$)/, /^\/design(?:\/|$)/];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (process.env.NODE_ENV === "development" && request.method === "GET" && request.headers.get("sec-fetch-dest") === "document") {
    const warning = recordPageRequest(pathname);
    if (warning) console.warn(warning);
  }
  if (PUBLIC_PATHS.some((pattern) => pattern.test(pathname))) return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    // Everything except API routes, Next internals and static files.
    "/((?!api/|_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|sw\\.js|icons/|.*\\.(?:png|svg|ico|jpg|webp|txt|xml)$).*)",
  ],
};
