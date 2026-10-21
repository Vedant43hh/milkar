import { Suspense, type ReactNode } from "react";
import { AccountMenu, ThemeMenu } from "./account-menu";
import { Logo } from "./logo";

/**
 * Landing, login and join pages: logo, account or theme menu, one column. Kept apart from the
 * portal shells so these pages don't download the portals' navigation.
 */
export function PublicShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const width = wide ? "max-w-5xl" : "max-w-md";
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border bg-surface">
        <div className={`mx-auto flex h-14 ${width} items-center justify-between px-3`}>
          <Logo />
          <Suspense fallback={<ThemeMenu />}>
            <AccountMenu portal={null} />
          </Suspense>
        </div>
      </header>
      <main className={`mx-auto ${width} animate-fade-in px-4 py-8`}>{children}</main>
    </div>
  );
}
