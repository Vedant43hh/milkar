"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { tu } from "@/i18n/ui";

export type SheetSide = "bottom" | "left";

const DIALOG: Record<SheetSide, string> = {
  // A bottom sheet on phones, a centred dialog on larger screens.
  bottom:
    "fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-border bg-surface p-0 text-fg shadow-raised backdrop:bg-overlay open:animate-slide-up md:inset-0 md:m-auto md:max-w-md md:rounded-2xl",
  // A drawer from the left edge: the staff portals' sidebar on phones.
  left: "fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-dvh w-[min(20rem,85vw)] max-w-none overflow-y-auto rounded-r-2xl border border-border bg-surface p-0 text-fg shadow-raised backdrop:bg-overlay open:animate-slide-in-left",
};

function Frame({
  dialog,
  title,
  children,
  onClose,
  side = "bottom",
}: {
  dialog: RefObject<HTMLDialogElement | null>;
  title: string;
  children: ReactNode;
  onClose?: () => void;
  side?: SheetSide;
}) {
  const titleId = useId();
  const latestOnClose = useRef(onClose);
  useEffect(() => {
    latestOnClose.current = onClose;
  });

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    // Tell the owner as soon as the sheet closes, however that happened: Escape or the back
    // gesture, the backdrop, a button, a form finishing. The browser's close event comes a moment
    // later (and on Escape the cancel event doesn't always come), so a quick "open it again" could
    // land while the owner still thinks it's open, and nothing would reopen. The open attribute
    // changes at once and observers run before the next tap. If the sheet is open again by then
    // (React re-running effects in development closes and reopens it), nothing closed.
    const watcher = new MutationObserver(() => {
      if (!element.open) latestOnClose.current?.();
    });
    watcher.observe(element, { attributes: true, attributeFilter: ["open"] });
    return () => {
      watcher.disconnect();
      // A modal dialog makes the rest of the document inert. If its page goes away (navigation,
      // or Next keeping the page hidden for back/forward), close it so the next page stays usable.
      element.close();
    };
  }, [dialog]);
  const close = () => dialog.current?.close();
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        // Backdrop click, or a link inside the sheet was followed.
        if (target === dialog.current || target.closest("a[href]")) close();
      }}
      className={DIALOG[side]}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-4 py-2">
        <h2 id={titleId} className="font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={close}
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
  side,
  children,
}: {
  title: string;
  /** Where it slides in from: the bottom (default), or the left edge as a navigation drawer. */
  side?: SheetSide;
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
      <Frame dialog={ref} title={title} side={side}>
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
