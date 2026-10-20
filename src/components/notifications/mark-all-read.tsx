"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { markAllReadAction, type MarkAllReadState } from "@/server/actions/notifications";

export function MarkAllReadButton({ label }: { label: string }) {
  const toast = useToast();
  // The toast is raised here rather than in an effect: the refresh that follows removes this button.
  const [, formAction, pending] = useActionState(async (prev: MarkAllReadState) => {
    const next = await markAllReadAction(prev);
    if (next.message) toast({ tone: "success", title: next.message });
    return next;
  }, { runs: 0, marked: 0 });

  return (
    <form action={formAction}>
      <Button variant="secondary" size="sm" loading={pending}>
        {label}
      </Button>
    </form>
  );
}
