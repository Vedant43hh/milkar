"use client";

import { ArrowRight } from "lucide-react";
import { useState, useTransition } from "react";
import { interpolate } from "@/i18n/interpolate";
import { finishTourAction } from "@/server/actions/onboarding";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { SheetDialog } from "../ui/sheet";

export type TourCard = { title: string; body: string };
export type TourText = { title: string; skip: string; next: string; done: string; step: string };

/**
 * Accounts that finished or skipped the tour in this tab. The shell can re-render the tour (with
 * fresh state) before the server has saved that it was seen; this keeps it from coming back.
 */
const dismissed = new Set<string>();

/**
 * The first-login tour: a few cards about this portal, skippable at any point. Finishing or
 * skipping saves that it was seen, so it never comes back.
 */
export function OnboardingTour({ userId, cards, text }: { userId: string; cards: readonly TourCard[]; text: TourText }) {
  const [open, setOpen] = useState(() => !dismissed.has(userId));
  const [index, setIndex] = useState(0);
  const [, start] = useTransition();
  const card = cards[index];
  const last = index === cards.length - 1;

  // Called by the buttons, and again by the dialog's close event: save it once.
  const finish = () => {
    setOpen(false);
    if (dismissed.has(userId)) return;
    dismissed.add(userId);
    start(() => finishTourAction());
  };

  return (
    <SheetDialog open={open} onClose={finish} title={text.title}>
      <div className="space-y-5">
        <div className="space-y-2" aria-live="polite">
          <p className="text-sm font-medium text-muted">{interpolate(text.step, { n: index + 1, total: cards.length })}</p>
          <h3 className="text-base font-semibold text-fg">{card.title}</h3>
          <p className="text-sm text-muted">{card.body}</p>
        </div>
        <div aria-hidden className="flex gap-1.5">
          {cards.map((c, i) => (
            <span key={c.title} className={cn("h-1.5 rounded-full", i === index ? "w-6 bg-accent" : "w-1.5 bg-border-field")} />
          ))}
        </div>
        <div className="flex gap-3">
          {/* Closing natively (no script needed): the sheet reports the close and finish() runs. */}
          <form method="dialog" className="contents">
            <Button variant="ghost">{text.skip}</Button>
          </form>
          <Button type="button" block onClick={() => (last ? finish() : setIndex(index + 1))}>
            {last ? text.done : text.next}
            {!last && <ArrowRight aria-hidden className="size-4" />}
          </Button>
        </div>
      </div>
    </SheetDialog>
  );
}
