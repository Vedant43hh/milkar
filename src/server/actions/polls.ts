"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { t, type MessageKey } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { setFlash } from "@/lib/flash";
import { castVote, suggestPoll, withdrawVote, type PollError } from "@/server/polls";

export type VoteOutcome = { ok: boolean; message: string };

/** "I'd join this" or taking the flat's vote back. */
export async function toggleVoteAction(pollId: string, vote: boolean): Promise<VoteOutcome> {
  const user = await requirePortal("app");
  const who = { id: user.id, flatId: user.flatId, communityId: user.flat.community.id };
  const result = vote ? await castVote(who, pollId, new Date()) : await withdrawVote(who, pollId, new Date());
  if (!result.ok) return { ok: false, message: t(`polls.errors.${result.error}`) };
  refresh();
  return { ok: true, message: vote ? t("polls.joinedToast", { votes: result.votes, threshold: result.threshold }) : t("polls.leftToast") };
}

export type SuggestState = { errors?: string[]; values?: Record<string, string> };

const SUGGESTION_ERRORS: Partial<Record<PollError, MessageKey>> = {
  INVALID_TITLE: "polls.errors.INVALID_TITLE",
  UNKNOWN_SERVICE: "polls.errors.UNKNOWN_SERVICE",
  UNKNOWN_PRODUCT: "polls.errors.UNKNOWN_PRODUCT",
  TOO_MANY_SUGGESTIONS: "polls.errors.TOO_MANY_SUGGESTIONS",
};

export async function suggestPollAction(_prev: SuggestState, formData: FormData): Promise<SuggestState> {
  const user = await requirePortal("app");
  const values = { title: String(formData.get("title") ?? ""), target: String(formData.get("target") ?? ""), description: String(formData.get("description") ?? "") };
  const [kind, id] = values.target.split(":");
  const result = await suggestPoll(
    { id: user.id, name: user.name, communityId: user.flat.community.id },
    { kind: kind === "service" ? "SERVICE" : "PRODUCT", title: values.title, description: values.description, serviceId: kind === "service" ? id : null },
    new Date(),
  );
  if (!result.ok) return { errors: [...new Set(result.errors.map((e) => t(SUGGESTION_ERRORS[e] ?? "polls.errors.generic")))], values };
  await setFlash("success", "polls.form.sent");
  redirect("/app/polls");
}
