import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { t } from "@/i18n";

const buttonStyles = {
  primary: "bg-teal-700 text-white hover:bg-teal-800 disabled:bg-teal-700/50",
  secondary: "border border-stone-300 bg-white text-stone-800 hover:bg-stone-50 disabled:text-stone-400",
  ghost: "text-teal-800 underline-offset-4 hover:underline disabled:text-stone-400",
} as const;

export function Button({
  variant = "primary",
  className = "",
  type = "submit",
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof buttonStyles }) {
  const size = variant === "ghost" ? "min-h-11 px-1" : "min-h-11 w-full rounded-lg px-4 font-medium";
  return <button type={type} className={`${size} ${buttonStyles[variant]} ${className}`} {...props} />;
}

export function ButtonLink({ className = "", ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={`flex min-h-11 w-full items-center justify-center rounded-lg bg-teal-700 px-4 font-medium text-white hover:bg-teal-800 ${className}`}
      {...props}
    />
  );
}

export function Label(props: ComponentProps<"label">) {
  return <label className="mb-1 block text-sm font-medium text-stone-700" {...props} />;
}

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return (
    <input
      className={`min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-base text-stone-900 placeholder:text-stone-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20 ${className}`}
      {...props}
    />
  );
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return (
    <select
      className={`min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-base text-stone-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20 ${className}`}
      {...props}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-stone-200 bg-white p-4 ${className}`}>{children}</section>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
      {children}
    </p>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{children}</p>;
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="animate-pulse space-y-3" aria-label={t("common.loading")}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-11 rounded-lg bg-stone-200/70" />
      ))}
    </div>
  );
}

/** Page frame: slim header with the wordmark, then a single mobile-width column. */
export function AppShell({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <Link href="/" className="text-lg font-semibold tracking-tight text-teal-800">
            {t("app.name")}
          </Link>
          {right}
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 py-6">{children}</main>
    </div>
  );
}
