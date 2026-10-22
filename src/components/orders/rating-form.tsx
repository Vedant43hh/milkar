"use client";

import { Star } from "lucide-react";
import { useState } from "react";
import { interpolate } from "@/i18n/interpolate";
import { rateVisitAction } from "@/server/actions/orders";
import { ActionForm, SubmitButton } from "../ui/action-form";
import { cn } from "../ui/cn";
import { Label, Textarea } from "../ui/form";

export type RatingText = { title: string; label: string; star: string; words: readonly string[]; comment: string; commentPlaceholder: string; submit: string };

/** One to five stars (a radio group, so arrow keys work) and an optional comment. */
export function RatingForm({ visitId, text }: { visitId: string; text: RatingText }) {
  const [rating, setRating] = useState(0);
  const commentId = `rating-comment-${visitId}`;
  return (
    <ActionForm action={rateVisitAction} className="space-y-3">
      <input type="hidden" name="visitId" value={visitId} />
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-fg">{text.label}</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              className="flex size-11 cursor-pointer items-center justify-center rounded-full text-accent transition-transform has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus active:scale-90"
            >
              <input type="radio" name="rating" value={n} required checked={rating === n} onChange={() => setRating(n)} className="sr-only" />
              <Star aria-hidden className={cn("size-7", n <= rating ? "fill-current" : "text-border-strong")} />
              <span className="sr-only">{interpolate(text.star, { n, word: text.words[n - 1] })}</span>
            </label>
          ))}
        </div>
        <p aria-live="polite" className="mt-1 min-h-5 text-sm font-medium text-muted">
          {rating > 0 ? text.words[rating - 1] : ""}
        </p>
      </fieldset>
      <div>
        <Label htmlFor={commentId}>{text.comment}</Label>
        <Textarea id={commentId} name="comment" rows={2} maxLength={300} placeholder={text.commentPlaceholder} />
      </div>
      <SubmitButton disabled={rating === 0}>{text.submit}</SubmitButton>
    </ActionForm>
  );
}
