"use client";

import { Check, Hand } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { interpolate } from "@/i18n/interpolate";
import { toggleVoteAction } from "@/server/actions/polls";
import { Button } from "../ui/button";
import { ProgressBar } from "../ui/progress";
import { useToast } from "../ui/toast";

export type PollVoteText = { join: string; joined: string; progress: string; remaining: string; reached: string };

/** Progress towards the poll's threshold and the flat's vote, updated the moment it's tapped. */
export function PollVote({ pollId, voted, votes, threshold, text }: { pollId: string; voted: boolean; votes: number; threshold: number; text: PollVoteText }) {
  const [state, setState] = useOptimistic({ voted, votes });
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const pct = Math.min(100, Math.floor((state.votes * 100) / threshold));
  const progress = interpolate(text.progress, { votes: state.votes, threshold });
  const left = Math.max(threshold - state.votes, 0);

  function toggle() {
    const next = !state.voted;
    startTransition(async () => {
      setState({ voted: next, votes: state.votes + (next ? 1 : -1) });
      const result = await toggleVoteAction(pollId, next);
      toast({ tone: result.ok ? "success" : "error", title: result.message });
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-fg tabular-nums">{progress}</span>
        <span className="text-muted">{left > 0 ? interpolate(text.remaining, { n: left }) : text.reached}</span>
      </div>
      <ProgressBar value={pct} label={progress} tone={left === 0 ? "success" : "accent"} />
      <Button
        type="button"
        size="sm"
        variant={state.voted ? "secondary" : "primary"}
        aria-pressed={state.voted}
        disabled={pending}
        onClick={toggle}
        icon={state.voted ? <Check aria-hidden className="size-4" /> : <Hand aria-hidden className="size-4" />}
      >
        {state.voted ? text.joined : text.join}
      </Button>
    </div>
  );
}
