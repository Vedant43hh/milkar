import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { SERVICE_WORKER_SCRIPT, THEME_SCRIPT, VIEW_TRANSITION_SCRIPT } from "@/components/theme-script";
import { FlashToasts, ToastProvider } from "@/components/ui/toast";
import { t } from "@/i18n";
import { PAGE_COLOR } from "@/lib/theme-colors";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: t("app.name"), template: `%s · ${t("app.name")}` },
  description: t("app.description"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: PAGE_COLOR.light },
    { media: "(prefers-color-scheme: dark)", color: PAGE_COLOR.dark },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script sets class="dark" before React hydrates, so the attribute can differ.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: VIEW_TRANSITION_SCRIPT }} />
        {process.env.NODE_ENV === "production" && <script dangerouslySetInnerHTML={{ __html: SERVICE_WORKER_SCRIPT }} />}
      </head>
      <body className="min-h-dvh antialiased">
        <ToastProvider>
          {children}
          <Suspense fallback={null}>
            <FlashToasts />
          </Suspense>
        </ToastProvider>
      </body>
    </html>
  );
}
