import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import { SERVICE_WORKER_SCRIPT } from "@/components/head-scripts";
import { FlashToasts, ToastProvider } from "@/components/ui/toast";
import { t } from "@/i18n";
import { PAGE_COLOR } from "@/lib/theme-colors";
import "./globals.css";

// One font for the whole app, self-hosted by Next.js at build time (no request to Google at runtime).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: t("app.name"), template: `%s · ${t("app.name")}` },
  description: t("app.description"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: PAGE_COLOR,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
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
