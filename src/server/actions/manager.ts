"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { t, type MessageKey } from "@/i18n";
import type { ActionResult } from "@/lib/action-result";
import { requirePortal } from "@/lib/auth/current-user";
import { setFlash } from "@/lib/flash";
import { formatINR } from "@/lib/pricing/money";
import { istDateToUtc, istLocalToUtc } from "@/lib/time";
import { collectPickup, reportDeliveryIssue } from "@/server/distribution";
import { finalizeRound } from "@/server/finalize";
import { resolveServiceIssue } from "@/server/issues";
import { decideJoinRequest } from "@/server/registration";
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
import { inviteAssistant, removeAssistant, removeResident, updateCommunitySettings, type SettingsInput } from "@/server/team";
import { moveVisit } from "@/server/visits";
import type { ManagerUser } from "@/server/session";

/** Result of a create form: errors to show (translated), and the values to put back in the fields. */
export type FormState = { errors?: string[]; values?: Record<string, string>; checked?: string[] };

/** Every error code has a message; the compiler checks the key exists. */
const errorKey = (code: CreateRoundError | RoundActionError | PollError): MessageKey => `manager.errors.${code}`;
const errorText = (code: CreateRoundError | RoundActionError | PollError) => t(errorKey(code));

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

const unique = (items: string[]) => [...new Set(items)];

export async function createGroceryRoundAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePortal("manager");
  const values = fieldValues(formData);
  const checked = formData.getAll("product").map(String);
  const cutoffAt = istInstant(formData.get("cutoffAt"));
  const deliveryAt = istInstant(formData.get("deliveryAt"));
  if (!cutoffAt || !deliveryAt) return { errors: [t("manager.errors.invalidDate")], values, checked };

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
  if (!result.ok) return { errors: unique(result.errors.map(errorText)), values, checked };
  await setFlash("success", "manager.flash.roundOpened");
  redirect(`/manager/rounds/${result.roundId}`);
}

export async function createServiceRoundAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePortal("manager");
  const values = fieldValues(formData);
  const cutoffAt = istInstant(formData.get("cutoffAt"));
  const rawDays = ["day1", "day2", "day3"].map((key) => formData.get(key)).filter((v) => v && String(v).trim() !== "");
  const days = rawDays.map(istDay);
  if (!cutoffAt || days.some((d) => d === null)) return { errors: [t("manager.errors.invalidDate")], values };

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
  if (!result.ok) return { errors: unique(result.errors.map(errorText)), values };
  await setFlash("success", "manager.flash.roundOpened");
  redirect(`/manager/rounds/${result.roundId}`);
}

export async function extendCutoffAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("manager");
  const cutoffAt = istInstant(formData.get("cutoffAt"));
  if (!cutoffAt) return { ok: false, message: t("manager.errors.invalidDate") };
  const result = await extendCutoff(actorOf(user), String(formData.get("roundId") ?? ""), cutoffAt, new Date());
  if (!result.ok) return { ok: false, message: errorText(result.error) };
  refresh();
  return { ok: true, message: t("manager.actions.extended") };
}

/** Stops orders and runs the cutoff job for this round straight away, so the results show at once. */
export async function closeRoundAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("manager");
  const roundId = String(formData.get("roundId") ?? "");
  const closedAt = new Date();
  const result = await closeRoundNow(actorOf(user), roundId, closedAt);
  if (!result.ok) return { ok: false, message: errorText(result.error) };
  refresh();
  try {
    const outcome = await finalizeRound(roundId, closedAt);
    if (outcome.status === "FINALIZED") return { ok: true, message: t("manager.actions.closedFinalized", { amount: formatINR(outcome.refundsPaise) }) };
  } catch (error) {
    // Orders are closed either way; the scheduled cutoff job finalizes it on its next run.
    console.error(`[milkar] finalizing round ${roundId} after closing it failed:`, error);
  }
  return { ok: true, message: t("manager.actions.closed") };
}

export async function cancelRoundAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("manager");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);
  const result = await cancelRound(actorOf(user), String(formData.get("roundId") ?? ""), reason, new Date());
  if (!result.ok) return { ok: false, message: errorText(result.error) };
  refresh();
  return { ok: true, message: t("manager.actions.cancelled", { amount: formatINR(result.refundedPaise ?? 0) }) };
}

export async function createPollAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePortal("manager");
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
  if (!result.ok) return { errors: unique(result.errors.map(errorText)), values };
  await setFlash("success", "manager.flash.pollCreated");
  redirect("/manager/polls");
}

export async function publishSuggestionAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("manager");
  const threshold = String(formData.get("threshold") ?? "").trim();
  const result = await publishSuggestion(actorOf(user), String(formData.get("pollId") ?? ""), threshold === "" ? null : Number(threshold), new Date());
  if (!result.ok) return { ok: false, message: errorText(result.error) };
  refresh();
  return { ok: true, message: t("manager.polls.published") };
}

export async function closePollAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("manager");
  const result = await closePoll(actorOf(user), String(formData.get("pollId") ?? ""));
  if (!result.ok) return { ok: false, message: errorText(result.error) };
  refresh();
  return { ok: true, message: t(formData.get("suggestion") ? "manager.polls.dismissed" : "manager.polls.pollClosed") };
}

/** One tap: opens the round and goes to its dashboard. Tapping twice lands on the same round. */
export async function convertPollAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("manager");
  const result = await convertPollToRound(actorOf(user), String(formData.get("pollId") ?? ""), new Date());
  if (!result.ok) return { ok: false, message: errorText(result.errors?.[0] ?? result.error) };
  if (result.created) await setFlash("success", "manager.flash.roundOpened");
  redirect(`/manager/rounds/${result.roundId}`);
}

/** Approve or decline someone's request to join this community. */
export async function decideJoinAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("manager");
  const decision = formData.get("decision") === "APPROVED" ? "APPROVED" : "REJECTED";
  const result = await decideJoinRequest(actorOf(user), String(formData.get("requestId") ?? ""), decision, String(formData.get("note") ?? ""), new Date());
  if (!result.ok) return { ok: false, message: t(`approvals.errors.${result.error}`) };
  refresh();
  return { ok: true, message: t(decision === "APPROVED" ? "approvals.residentApproved" : "approvals.residentDeclined") };
}

// ---------- residents, team and settings ----------

/** Take a resident out of the community (not while they have an order on the go). */
export async function removeResidentAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("manager");
  const result = await removeResident(actorOf(user), user.staff.community.id, String(formData.get("userId") ?? ""), new Date());
  if (!result.ok) return { ok: false, message: t(`team.errors.${result.error}`) };
  refresh();
  return { ok: true, message: t("team.residentRemoved") };
}

export async function inviteAssistantAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("manager");
  const result = await inviteAssistant(actorOf(user), user.staff.community.id, { name: String(formData.get("name") ?? ""), phone: String(formData.get("phone") ?? "") }, new Date());
  if (!result.ok) return { ok: false, message: t(`team.errors.${result.error}`) };
  refresh();
  return { ok: true, message: t("team.invited") };
}

export async function removeAssistantAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("manager");
  const result = await removeAssistant(actorOf(user), user.staff.community.id, String(formData.get("staffId") ?? ""));
  if (!result.ok) return { ok: false, message: t(`team.errors.${result.error}`) };
  refresh();
  return { ok: true, message: t("team.removed") };
}

export async function saveSettingsAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("manager");
  const field = (name: string) => String(formData.get(name) ?? "");
  const result = await updateCommunitySettings(actorOf(user), user.staff.community.id, {
    name: field("name"),
    type: field("type") as SettingsInput["type"],
    address: field("address"),
    city: field("city"),
    pincode: field("pincode"),
    blockLabel: field("blockLabel"),
    unitLabel: field("unitLabel"),
  });
  if (!result.ok) return { ok: false, message: t(`team.settingsErrors.${result.error}`) };
  refresh();
  return { ok: true, message: t("team.settingsSaved") };
}

// ---------- distribution day ----------

export async function collectPickupAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("manager");
  const result = await collectPickup(actorOf(user), String(formData.get("roundId") ?? ""), String(formData.get("flatId") ?? ""), String(formData.get("code") ?? ""), new Date());
  if (!result.ok) return { ok: false, message: t(`distribution.errors.${result.error}`) };
  refresh();
  return { ok: true, message: t(result.completed ? "distribution.allCollected" : "distribution.collected") };
}

export async function reportDeliveryIssueAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("manager");
  const result = await reportDeliveryIssue(
    actorOf(user),
    String(formData.get("orderItemId") ?? ""),
    { short: Number(formData.get("short") ?? 0), damaged: Number(formData.get("damaged") ?? 0), note: String(formData.get("note") ?? "") },
    new Date(),
  );
  if (!result.ok) return { ok: false, message: t(`distribution.errors.${result.error}`) };
  refresh();
  return { ok: true, message: result.refundPaise > 0 ? t("distribution.refunded", { amount: formatINR(result.refundPaise) }) : t("distribution.noChange") };
}

// ---------- visit days and complaints ----------

const visitUser = (user: ManagerUser) => ({
  id: user.id,
  role: user.role,
  name: user.name,
  vendorId: null,
  managesCommunityId: user.staff.community.id,
});

/** Call a visit off: everything the flat paid for it comes back, parts included. */
export async function cancelVisitAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("manager");
  const result = await moveVisit(visitUser(user), String(formData.get("visitId") ?? ""), { to: "CANCELLED", reason: String(formData.get("reason") ?? "") }, new Date());
  if (!result.ok) return { ok: false, message: t(`visitBoard.errors.${result.error}`) };
  refresh();
  return { ok: true, message: t("visitBoard.cancelled") };
}

/** After five wrong codes only a manager can say the job was done. */
export async function confirmVisitAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("manager");
  const result = await moveVisit(visitUser(user), String(formData.get("visitId") ?? ""), { to: "COMPLETED" }, new Date());
  if (!result.ok) return { ok: false, message: t(`visitBoard.errors.${result.error}`) };
  refresh();
  return { ok: true, message: t("visitBoard.confirmed") };
}

export async function resolveIssueAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("manager");
  const resolution = String(formData.get("resolution") ?? "");
  if (resolution !== "REVISIT" && resolution !== "REFUND" && resolution !== "REJECT") return { ok: false, message: t("issues.errors.NOT_ALLOWED") };
  const result = await resolveServiceIssue(
    actorOf(user),
    String(formData.get("issueId") ?? ""),
    { resolution, revisitAt: resolution === "REVISIT" ? istInstant(formData.get("revisitAt")) : null, note: String(formData.get("note") ?? "") },
    new Date(),
  );
  if (!result.ok) return { ok: false, message: t(`issues.errors.${result.error}`) };
  refresh();
  if (resolution === "REFUND") return { ok: true, message: t("issues.refunded", { amount: formatINR(result.refundedPaise) }) };
  return { ok: true, message: t(resolution === "REVISIT" ? "issues.revisitBooked" : "issues.closed") };
}
