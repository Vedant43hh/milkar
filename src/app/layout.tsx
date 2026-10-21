import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { THEME_SCRIPT, VIEW_TRANSITION_SCRIPT } from "@/components/theme-script";
import { FlashToasts, ToastProvider } from "@/components/ui/toast";
import { t } from "@/i18n";
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
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1d1914" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script sets class="dark" before React hydrates, so the attribute can differ.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: VIEW_TRANSITION_SCRIPT }} />
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
