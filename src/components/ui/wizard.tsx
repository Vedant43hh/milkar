"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { tu } from "@/i18n/ui";
import { Button } from "./button";
import { cn } from "./cn";
import { ProgressBar } from "./progress";

export type WizardStep = { id: string; title: string; content: ReactNode };

/**
 * A step-by-step form. Put it inside one <form>: every step stays in the DOM (the hidden ones with
 * `hidden`), so the server action receives all fields at the end. "Next" checks only the current
 * step's fields with the browser's own validation (required, pattern, min…), which shows the
 * message next to the field. The last step shows `submit` instead of "Next".
 */
export function Wizard({ steps, submit }: { steps: WizardStep[]; submit: ReactNode }) {
  const [current, setCurrent] = useState(0);
  const refs = useRef<(HTMLFieldSetElement | null)[]>([]);
  const headingId = useId();
  const moved = useRef(false);

  // After moving between steps, take focus to the new step's title (not on first render).
  useEffect(() => {
    if (!moved.current) return;
    refs.current[current]?.querySelector<HTMLElement>("[data-step-title]")?.focus();
  }, [current]);

  function next() {
    const fields = refs.current[current]?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea") ?? [];
    for (const field of fields) {
      if (!field.checkValidity()) {
        field.reportValidity();
        return;
      }
    }
    moved.current = true;
    setCurrent((c) => Math.min(c + 1, steps.length - 1));
  }

  function back() {
    moved.current = true;
    setCurrent((c) => Math.max(c - 1, 0));
  }

  const last = current === steps.length - 1;
  const stepLabel = tu("wizard.step", { n: current + 1, total: steps.length });
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p id={headingId} className="text-sm font-medium text-muted">
          {stepLabel}
        </p>
        <ProgressBar value={((current + 1) / steps.length) * 100} label={stepLabel} />
      </div>
      {steps.map((step, index) => (
        <fieldset
          key={step.id}
          ref={(el) => {
            refs.current[index] = el;
          }}
          hidden={index !== current}
          aria-describedby={headingId}
          className="min-w-0 space-y-4"
        >
          <legend className="contents">
            <span data-step-title tabIndex={-1} className="block text-xl font-semibold tracking-tight text-fg outline-none">
              {step.title}
            </span>
          </legend>
          {step.content}
        </fieldset>
      ))}
      <div className={cn("flex gap-3", current > 0 ? "justify-between" : "justify-end")}>
        {current > 0 && (
          <Button type="button" variant="secondary" onClick={back} icon={<ArrowLeft aria-hidden className="size-4" />}>
            {tu("wizard.back")}
          </Button>
        )}
        {last ? (
          submit
        ) : (
          <Button type="button" onClick={next}>
            {tu("wizard.next")}
            <ArrowRight aria-hidden className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
