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
          <span aria-hidden className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-xl font-bold text-brand-soft-fg">
            {index + 1}
          </span>
          <p className="text-xs font-medium text-muted">{interpolate(text.step, { n: index + 1, total: cards.length })}</p>
          <h3 className="text-xl font-semibold tracking-tight text-fg">{card.title}</h3>
          <p className="text-muted">{card.body}</p>
        </div>
        <div aria-hidden className="flex justify-center gap-1.5">
          {cards.map((c, i) => (
            <span key={c.title} className={cn("h-1.5 rounded-full transition-all", i === index ? "w-6 bg-brand" : "w-1.5 bg-border-strong")} />
          ))}
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="ghost" onClick={finish}>
            {text.skip}
          </Button>
          <Button type="button" block onClick={() => (last ? finish() : setIndex(index + 1))}>
            {last ? text.done : text.next}
            {!last && <ArrowRight aria-hidden className="size-4" />}
          </Button>
        </div>
      </div>
    </SheetDialog>
  );
}
