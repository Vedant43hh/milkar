"use client";

import { X } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";
import { t } from "@/i18n";

/**
 * Modal sheet on the native <dialog> element: a bottom sheet on phones, a centred dialog on
 * larger screens. Focus trapping, Escape and the backdrop come from the browser.
 * Closes when a link inside it is followed, so navigation menus behave. (It deliberately doesn't
 * read the pathname: that would force a Suspense boundary on every page that shows a sheet.)
 */
export function Sheet({
  title,
  triggerLabel,
  trigger,
  triggerClassName,
  children,
}: {
  title: string;
  /**
   * Screen-reader text added after the trigger's visible content (needed for icon-only triggers).
   * Leave it out when the trigger already shows words.
   */
  triggerLabel?: string;
  trigger: ReactNode;
  /** Replaces the default round icon-button look, e.g. buttonClasses({ variant: "secondary" }). */
  triggerClassName?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => ref.current?.showModal()}
        className={triggerClassName ?? "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full"}
      >
        {trigger}
        {/* Hidden text rather than aria-label, so the accessible name always includes what's visible. */}
        {triggerLabel && <span className="sr-only">{triggerLabel}</span>}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          // Backdrop click, or a link inside the sheet was followed.
          if (target === ref.current || target.closest("a[href]")) ref.current?.close();
        }}
        className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-border bg-surface p-0 text-fg shadow-raised backdrop:bg-overlay open:animate-slide-up md:inset-0 md:m-auto md:max-w-md md:rounded-2xl"
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-surface px-4 py-2">
          <h2 id={titleId} className="font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label={t("common.close")}
            className="inline-flex size-11 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </dialog>
    </>
  );
}
