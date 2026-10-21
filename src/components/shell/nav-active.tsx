"use client";

import { usePathname } from "next/navigation";
import type { Portal } from "@/lib/auth/rules";
import { PORTAL_NAV, type TabPortal } from "./nav-config";
import { SideNavList, TabList } from "./nav-lists";

// Thin wrappers that highlight the current page. Render inside <Suspense> with the matching
// nav-lists component (pathname "") as the fallback.

export function ActiveTabBar({ portal }: { portal: TabPortal }) {
  return <TabList portal={portal} pathname={usePathname()} />;
}

export function ActiveSideNav({ portal }: { portal: Portal }) {
  return <SideNavList items={PORTAL_NAV[portal]} pathname={usePathname()} />;
}
