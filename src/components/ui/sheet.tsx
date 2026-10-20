"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { tu } from "@/i18n/ui";

const DIALOG =
  "fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-border bg-surface p-0 text-fg shadow-raised backdrop:bg-overlay open:animate-slide-up md:inset-0 md:m-auto md:max-w-md md:rounded-2xl";

function Frame({ dialog, title, children, onClose }: { dialog: RefObject<HTMLDialogElement | null>; title: string; children: ReactNode; onClose?: () => void }) {
  const titleId = useId();
  // A modal dialog makes the rest of the document inert. If its page goes away (navigation, or
  // Next keeping the page hidden for back/forward), close it so the next page stays usable.
  useEffect(() => {
    const element = dialog.current;
    return () => element?.close();
  }, [dialog]);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        // Backdrop click, or a link inside the sheet was followed.
        if (target === dialog.current || target.closest("a[href]")) dialog.current?.close();
      }}
      className={DIALOG}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-4 py-2">
        <h2 id={titleId} className="font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          aria-label={tu("ui.close")}
          className="inline-flex size-11 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>
      <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
    </dialog>
  );
}

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
      <Frame dialog={ref} title={title}>
        {children}
      </Frame>
    </>
  );
}

/** The same sheet, opened and closed by its parent (e.g. after fetching what it shows). */
export function SheetDialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <Frame dialog={ref} title={title} onClose={onClose}>
      {children}
    </Frame>
  );
}
