"use client";

import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { tu } from "@/i18n/ui";
import { FLASH_COOKIE, parseFlash } from "@/lib/flash-shared";
import { cn } from "./cn";

export type ToastTone = "success" | "error" | "info" | "celebrate";
type ToastItem = { id: number; tone: ToastTone; title: string; body?: string };
type PushToast = (toast: Omit<ToastItem, "id">) => void;

const ToastContext = createContext<PushToast>(() => {});

export function useToast(): PushToast {
  return useContext(ToastContext);
}

/** Toast stack shown above the bottom tab bar. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((item) => item.id !== id)), []);
  const push = useCallback<PushToast>(
    (toast) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { ...toast, id }]);
      setTimeout(() => dismiss(id), toast.tone === "error" ? 6000 : 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext value={push}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-card border bg-surface py-3 pr-2 pl-4",
              toast.tone === "error" ? "border-danger" : "border-border",
            )}
          >
            <div className="min-w-0 flex-1 text-sm">
              <p className={cn("font-medium", toast.tone === "error" ? "text-danger" : "text-fg")}>{toast.title}</p>
              {toast.body && <p className="mt-0.5 text-muted">{toast.body}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label={tu("ui.dismiss")}
              className="-my-2 inline-flex size-11 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-hover hover:text-fg"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

/**
 * Shows "flash" messages: a short-lived cookie written by a server action before it redirects.
 * Checks after every navigation to a new path. Render inside <Suspense> (it reads the pathname).
 * Actions that stay on the same page should return a result and call useToast() instead.
 */
export function FlashToasts() {
  const push = useToast();
  const pathname = usePathname();

  useEffect(() => {
    const raw = document.cookie.split("; ").find((c) => c.startsWith(`${FLASH_COOKIE}=`));
    if (!raw) return;
    document.cookie = `${FLASH_COOKIE}=; Max-Age=0; Path=/`;
    const flash = parseFlash(decodeURIComponent(raw.slice(FLASH_COOKIE.length + 1)));
    if (flash) push({ tone: flash.tone, title: flash.text });
  }, [pathname, push]);

  return null;
}
