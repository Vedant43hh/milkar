import type { NextConfig } from "next";

// Pages that moved when every role got its own portal. Old links in chats and bookmarks keep working.
const MOVED_TO_APP = ["groceries", "services", "orders", "wallet", "notifications", "polls", "pay"];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The floating dev-tools button sits in a screen corner, and every corner of this app's mobile
  // layout holds a control (tab bar, account menu, staff menu). Compile and runtime errors still show.
  devIndicators: false,
  experimental: {
    // forbidden() renders a portal's forbidden.tsx ("This area is for Society Managers") with a 403.
    authInterrupts: true,
    // Dev-only workaround for a Turbopack HMR "ping-pong": a page request triggers a no-op server
    // compile that wrongly sends another HMR update, so the browser reloads forever (seen here as
    // hundreds of GET /login with "HMR hash mismatch"). Server Fast Refresh off means server-code
    // edits re-render the route instead of hot-patching it; client Fast Refresh is unaffected.
    // Revisit when upgrading Next.js. See https://github.com/vercel/next.js/discussions/77102
    turbopackServerFastRefresh: false,
  },
  async redirects() {
    return [
      { source: "/captain/:path*", destination: "/manager/:path*", permanent: false },
      ...MOVED_TO_APP.map((page) => ({ source: `/${page}/:path*`, destination: `/app/${page}/:path*`, permanent: false })),
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
