"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { MessageKey } from "@/i18n";
import type { ActionResult } from "@/lib/action-result";
import { requireArea } from "@/lib/auth/current-user";
import { setFlash } from "@/lib/flash";
import { formatINR } from "@/lib/pricing/money";
import { istDateToUtc, istLocalToUtc } from "@/lib/time";
import { closePoll, convertPollToRound, createPoll, publishSuggestion, type PollError } from "@/server/polls";
import {
  actorOf,
  cancelRound,
  closeRoundNow,
  createGroceryRound,
  createServiceRound,
  extendCutoff,
  type CreateRoundError,
  type RoundActionError,
} from "@/server/rounds";

/** Result of a create form: errors to show, and the values to put back in the fields. */
export type FormState = { errors?: MessageKey[]; values?: Record<string, string>; checked?: string[] };

/** Every error code has a message; the compiler checks the key exists. */
const errorKey = (code: CreateRoundError | RoundActionError | PollError): MessageKey => `captain.errors.${code}`;

function istInstant(value: FormDataEntryValue | null): Date | null {
  try {
    return istLocalToUtc(String(value ?? ""));
  } catch {
    return null;
  }
}

function istDay(value: FormDataEntryValue | null): Date | null {
  try {
    return value ? istDateToUtc(String(value)) : null;
  } catch {
    return null;
  }
}

function fieldValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (typeof value === "string" && !key.startsWith("$")) values[key] = value;
  return values;
}

const unique = <T,>(items: T[]) => [...new Set(items)];

export async function createGroceryRoundAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireArea("captain");
  const values = fieldValues(formData);
  const checked = formData.getAll("product").map(String);
  const cutoffAt = istInstant(formData.get("cutoffAt"));
  const deliveryAt = istInstant(formData.get("deliveryAt"));
  if (!cutoffAt || !deliveryAt) return { errors: ["captain.errors.invalidDate"], values, checked };

  const result = await createGroceryRound(
    actorOf(user),
    {
      title: String(formData.get("title") ?? ""),
      cutoffAt,
      deliveryAt,
      requirePickupCode: formData.get("requirePickupCode") === "on",
      products: checked.map((productId) => ({ productId, maxQtyPerFlat: Number(formData.get(`cap:${productId}`)) })),
    },
    new Date(),
  );
  if (!result.ok) return { errors: unique(result.errors.map(errorKey)), values, checked };
  await setFlash("success", "captain.flash.roundOpened");
  redirect(`/captain/rounds/${result.roundId}`);
}

export async function createServiceRoundAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireArea("captain");
  const values = fieldValues(formData);
  const cutoffAt = istInstant(formData.get("cutoffAt"));
  const rawDays = ["day1", "day2", "day3"].map((key) => formData.get(key)).filter((v) => v && String(v).trim() !== "");
  const days = rawDays.map(istDay);
  if (!cutoffAt || days.some((d) => d === null)) return { errors: ["captain.errors.invalidDate"], values };

  const result = await createServiceRound(
    actorOf(user),
    {
      serviceId: String(formData.get("serviceId") ?? ""),
      title: String(formData.get("title") ?? ""),
      cutoffAt,
      days: (days as Date[]).sort((a, b) => a.getTime() - b.getTime()),
      repeatWeekly: formData.get("repeatWeekly") === "on",
    },
    new Date(),
  );
  if (!result.ok) return { errors: unique(result.errors.map(errorKey)), values };
  await setFlash("success", "captain.flash.roundOpened");
  redirect(`/captain/rounds/${result.roundId}`);
}

export async function extendCutoffAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireArea("captain");
  const cutoffAt = istInstant(formData.get("cutoffAt"));
  if (!cutoffAt) return { ok: false, message: "captain.errors.invalidDate" };
  const result = await extendCutoff(actorOf(user), String(formData.get("roundId") ?? ""), cutoffAt, new Date());
  if (!result.ok) return { ok: false, message: errorKey(result.error) };
  refresh();
  return { ok: true, message: "captain.actions.extended" };
}

export async function closeRoundAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireArea("captain");
  const result = await closeRoundNow(actorOf(user), String(formData.get("roundId") ?? ""), new Date());
  if (!result.ok) return { ok: false, message: errorKey(result.error) };
  refresh();
  return { ok: true, message: "captain.actions.closed" };
}

export async function cancelRoundAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireArea("captain");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);
  const result = await cancelRound(actorOf(user), String(formData.get("roundId") ?? ""), reason, new Date());
  if (!result.ok) return { ok: false, message: errorKey(result.error) };
  refresh();
  return { ok: true, message: "captain.actions.cancelled", vars: { amount: formatINR(result.refundedPaise ?? 0) } };
}

export async function createPollAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireArea("captain");
  const values = fieldValues(formData);
  const target = String(formData.get("target") ?? "");
  const [kind, id] = target.split(":");
  const threshold = String(formData.get("threshold") ?? "").trim();
  const result = await createPoll(
    actorOf(user),
    {
      kind: kind === "service" ? "SERVICE" : "PRODUCT",
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      serviceId: kind === "service" ? id : null,
      productId: kind === "product" ? id : null,
      threshold: threshold === "" ? null : Number(threshold),
    },
    new Date(),
  );
  if (!result.ok) return { errors: unique(result.errors.map(errorKey)), values };
  await setFlash("success", "captain.flash.pollCreated");
  redirect("/captain/polls");
}

export async function publishSuggestionAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireArea("captain");
  const threshold = String(formData.get("threshold") ?? "").trim();
  const result = await publishSuggestion(actorOf(user), String(formData.get("pollId") ?? ""), threshold === "" ? null : Number(threshold), new Date());
  if (!result.ok) return { ok: false, message: errorKey(result.error) };
  refresh();
  return { ok: true, message: "captain.polls.published" };
}

export async function closePollAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireArea("captain");
  const result = await closePoll(actorOf(user), String(formData.get("pollId") ?? ""));
  if (!result.ok) return { ok: false, message: errorKey(result.error) };
  refresh();
  return { ok: true, message: formData.get("suggestion") ? "captain.polls.dismissed" : "captain.polls.pollClosed" };
}

/** One tap: opens the round and goes to its dashboard. Tapping twice lands on the same round. */
export async function convertPollAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireArea("captain");
  const result = await convertPollToRound(actorOf(user), String(formData.get("pollId") ?? ""), new Date());
  if (!result.ok) return { ok: false, message: errorKey(result.errors?.[0] ?? result.error) };
  if (result.created) await setFlash("success", "captain.flash.roundOpened");
  redirect(`/captain/rounds/${result.roundId}`);
}
