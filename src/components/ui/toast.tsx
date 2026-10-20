"use client";

import { CircleAlert, CircleCheck, Info, PartyPopper, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { tu } from "@/i18n/ui";
import { FLASH_COOKIE, parseFlash } from "@/lib/flash-shared";
import { Celebration } from "./celebrate";
import { cn } from "./cn";

export type ToastTone = "success" | "error" | "info" | "celebrate";
type ToastItem = { id: number; tone: ToastTone; title: string; body?: string };
type PushToast = (toast: Omit<ToastItem, "id">) => void;

const ToastContext = createContext<PushToast>(() => {});

export function useToast(): PushToast {
  return useContext(ToastContext);
}

const icons = {
  success: <CircleCheck aria-hidden className="size-5 text-success" />,
  error: <CircleAlert aria-hidden className="size-5 text-danger" />,
  info: <Info aria-hidden className="size-5 text-brand" />,
  celebrate: <PartyPopper aria-hidden className="size-5 text-accent-soft-fg" />,
};

/** Toast stack shown above the bottom tab bar. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // A celebrate toast (a price unlock) gets the confetti overlay instead of a toast card.
  const [celebration, setCelebration] = useState<string | null>(null);
  const endCelebration = useCallback(() => setCelebration(null), []);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((item) => item.id !== id)), []);
  const push = useCallback<PushToast>(
    (toast) => {
      if (toast.tone === "celebrate") {
        setCelebration(toast.title);
        return;
      }
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { ...toast, id }]);
      setTimeout(() => dismiss(id), toast.tone === "error" ? 6000 : 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext value={push}>
      {children}
      {celebration && <Celebration message={celebration} onDone={endCelebration} />}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-control border bg-surface p-3 shadow-raised",
              toast.tone === "celebrate" ? "border-accent" : "border-border",
            )}
          >
            {icons[toast.tone]}
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium text-fg">{toast.title}</p>
              {toast.body && <p className="mt-0.5 text-muted">{toast.body}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label={tu("ui.dismiss")}
              className="-m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-subtle hover:text-fg"
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
