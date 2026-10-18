// Fast gate: requests without a session cookie go to /login. It does not validate the session;
// every page and server action still checks access through src/lib/auth/current-user.ts.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/rules";

const PUBLIC_PATHS = [/^\/login(?:\/|$)/, /^\/join(?:\/|$)/, /^\/offline(?:\/|$)/];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.some((pattern) => pattern.test(pathname))) return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    // Everything except API routes, Next internals and static files.
    "/((?!api/|_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|sw\\.js|icons/|.*\\.(?:png|svg|ico|jpg|webp|txt|xml)$).*)",
  ],
};
