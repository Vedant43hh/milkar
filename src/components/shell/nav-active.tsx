"use client";

import { usePathname } from "next/navigation";
import { RESIDENT_NAV, STAFF_NAV, type StaffArea } from "./nav-config";
import { ResidentTabList, SideNavList } from "./nav-lists";

// Thin wrappers that highlight the current page. Render inside <Suspense> with the matching
// nav-lists component (pathname "") as the fallback.

export function ActiveResidentTabBar() {
  return <ResidentTabList pathname={usePathname()} />;
}

export function ActiveResidentSideNav() {
  return <SideNavList items={RESIDENT_NAV} pathname={usePathname()} />;
}

export function ActiveStaffNav({ area }: { area: StaffArea }) {
  return <SideNavList items={STAFF_NAV[area]} pathname={usePathname()} />;
}
