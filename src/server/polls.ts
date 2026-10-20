import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { canManageCommunity } from "@/lib/auth/rules";
import { prisma } from "@/lib/db";
import { notificationKeys } from "@/lib/notifications";
import { canVote, defaultRoundDates, shouldNotifyThreshold } from "@/lib/polls";
import { startOfIstDay } from "@/lib/time";
import { notify } from "./notifications";
import { lockPoll } from "./round-lock";
import { communityCaptainIds, openRoundInTx, type Actor, type CreateRoundError } from "./rounds";

export const MAX_OPEN_SUGGESTIONS = 3;
export const THRESHOLD_LIMITS = { min: 2, max: 500 } as const;

export type PollInput = {
  kind: "SERVICE" | "PRODUCT";
  title: string;
  description?: string;
  serviceId?: string | null;
  productId?: string | null;
  threshold?: number | null;
};

export type PollError =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_TITLE"
  | "INVALID_THRESHOLD"
  | "UNKNOWN_SERVICE"
  | "UNKNOWN_PRODUCT"
  | "NOT_OPEN"
  | "NOT_SUGGESTED"
  | "TOO_MANY_SUGGESTIONS"
  | "CANNOT_CONVERT";

async function checkInput(input: PollInput): Promise<{ errors: PollError[]; defaultThreshold: number }> {
  const errors: PollError[] = [];
  const title = input.title.trim();
  if (title.length < 3 || title.length > 80) errors.push("INVALID_TITLE");
  let defaultThreshold = 10;
  if (input.kind === "SERVICE") {
    const service = input.serviceId ? await prisma.service.findFirst({ where: { id: input.serviceId, active: true }, select: { minFlats: true } }) : null;
    if (!service) errors.push("UNKNOWN_SERVICE");
    else defaultThreshold = service.minFlats;
  } else if (input.productId) {
    const product = await prisma.product.findFirst({ where: { id: input.productId, active: true }, select: { minOrderQty: true } });
    if (!product) errors.push("UNKNOWN_PRODUCT");
  }
  const t = input.threshold;
  if (t != null && (!Number.isSafeInteger(t) || t < THRESHOLD_LIMITS.min || t > THRESHOLD_LIMITS.max)) errors.push("INVALID_THRESHOLD");
  return { errors, defaultThreshold };
}

/** A captain (or admin) publishes a poll. The threshold defaults to the service's minimum flats. */
export async function createPoll(actor: Actor, input: PollInput, now: Date): Promise<{ ok: true; pollId: string } | { ok: false; errors: PollError[] }> {
  const communityId = actor.communityId;
  if (!communityId || !canManageCommunity(actor, communityId)) return { ok: false, errors: ["FORBIDDEN"] };
  const { errors, defaultThreshold } = await checkInput(input);
  if (errors.length) return { ok: false, errors };
  const poll = await prisma.interestPoll.create({
    data: {
      communityId,
      kind: input.kind,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      serviceId: input.kind === "SERVICE" ? input.serviceId : null,
      productId: input.kind === "PRODUCT" ? input.productId || null : null,
      threshold: input.threshold ?? defaultThreshold,
      status: "OPEN",
      publishedById: actor.id,
      publishedAt: now,
      createdAt: now,
    },
  });
  return { ok: true, pollId: poll.id };
}

/** A resident suggests a poll; it waits in the captain's queue. */
export async function suggestPoll(
  user: { id: string; name: string | null; communityId: string },
  input: Omit<PollInput, "threshold">,
  now: Date,
): Promise<{ ok: true; pollId: string } | { ok: false; errors: PollError[] }> {
  const { errors, defaultThreshold } = await checkInput({ ...input, threshold: null });
  const pending = await prisma.interestPoll.count({ where: { suggestedById: user.id, status: "SUGGESTED" } });
  if (pending >= MAX_OPEN_SUGGESTIONS) errors.push("TOO_MANY_SUGGESTIONS");
  if (errors.length) return { ok: false, errors };
  return prisma.$transaction(async (tx) => {
    const poll = await tx.interestPoll.create({
      data: {
        communityId: user.communityId,
        kind: input.kind,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        serviceId: input.kind === "SERVICE" ? input.serviceId : null,
        productId: input.kind === "PRODUCT" ? input.productId || null : null,
        threshold: defaultThreshold,
        status: "SUGGESTED",
        suggestedById: user.id,
        createdAt: now,
      },
    });
    await notify(
      tx,
      await communityCaptainIds(tx, user.communityId),
      { type: "POLL_SUGGESTION", params: { poll: poll.title, by: user.name ?? "A neighbour" }, href: "/captain/polls" },
      { dedupeKey: notificationKeys.pollSuggestion(poll.id), now },
    );
    return { ok: true as const, pollId: poll.id };
  });
}

type Poll = Prisma.InterestPollGetPayload<object>;

/** Locks the poll and checks the actor may manage it. */
async function managedPoll(tx: Prisma.TransactionClient, actor: Actor, pollId: string): Promise<{ poll: Poll; error?: never } | { poll?: never; error: "NOT_FOUND" | "FORBIDDEN" }> {
  if (!(await lockPoll(tx, pollId))) return { error: "NOT_FOUND" };
  const poll = await tx.interestPoll.findUniqueOrThrow({ where: { id: pollId } });
  if (!canManageCommunity(actor, poll.communityId)) return { error: "FORBIDDEN" };
  return { poll };
}

/** Publishes a resident's suggestion as a poll, optionally with a different threshold. */
export async function publishSuggestion(actor: Actor, pollId: string, threshold: number | null, now: Date): Promise<{ ok: true } | { ok: false; error: PollError }> {
  if (threshold != null && (!Number.isSafeInteger(threshold) || threshold < THRESHOLD_LIMITS.min || threshold > THRESHOLD_LIMITS.max)) {
    return { ok: false, error: "INVALID_THRESHOLD" };
  }
  return prisma.$transaction(async (tx) => {
    const found = await managedPoll(tx, actor, pollId);
    if (found.error) return { ok: false, error: found.error };
    if (found.poll.status !== "SUGGESTED") return { ok: false, error: "NOT_SUGGESTED" };
    await tx.interestPoll.update({
      where: { id: pollId },
      data: { status: "OPEN", publishedById: actor.id, publishedAt: now, threshold: threshold ?? found.poll.threshold },
    });
    return { ok: true };
  });
}

/** Dismisses a suggestion or closes an open poll. */
export async function closePoll(actor: Actor, pollId: string): Promise<{ ok: true } | { ok: false; error: PollError }> {
  return prisma.$transaction(async (tx) => {
    const found = await managedPoll(tx, actor, pollId);
    if (found.error) return { ok: false, error: found.error };
    if (found.poll.status !== "SUGGESTED" && found.poll.status !== "OPEN") return { ok: false, error: "NOT_OPEN" };
    await tx.interestPoll.update({ where: { id: pollId }, data: { status: "CLOSED" } });
    return { ok: true };
  });
}

export type VoteResult = { ok: true; votes: number; threshold: number } | { ok: false; error: "NOT_FOUND" | "NOT_OPEN" };

/**
 * One vote per flat (family members share it). Votes on a poll run one at a time under the poll's
 * lock, so the count is exact and the vote that reaches the threshold prompts the captains once.
 */
export async function castVote(user: { id: string; flatId: string; communityId: string }, pollId: string, now: Date): Promise<VoteResult> {
  return prisma.$transaction(async (tx) => {
    if (!(await lockPoll(tx, pollId))) return { ok: false, error: "NOT_FOUND" };
    const poll = await tx.interestPoll.findUniqueOrThrow({ where: { id: pollId } });
    if (poll.communityId !== user.communityId) return { ok: false, error: "NOT_FOUND" };
    if (!canVote(poll, now)) return { ok: false, error: "NOT_OPEN" };
    await tx.pollVote.createMany({ data: [{ pollId, flatId: user.flatId, userId: user.id, createdAt: now }], skipDuplicates: true });
    const votes = await tx.pollVote.count({ where: { pollId } });
    if (shouldNotifyThreshold(poll, votes)) {
      await tx.interestPoll.update({ where: { id: pollId }, data: { thresholdNotifiedAt: now } });
      await notify(
        tx,
        await communityCaptainIds(tx, poll.communityId),
        { type: "POLL_THRESHOLD", params: { poll: poll.title, votes }, href: "/captain/polls" },
        { dedupeKey: notificationKeys.pollThreshold(poll.id), now },
      );
    }
    return { ok: true, votes, threshold: poll.threshold };
  });
}

/** Takes the flat's vote back while the poll is open. */
export async function withdrawVote(user: { flatId: string; communityId: string }, pollId: string, now: Date): Promise<VoteResult> {
  return prisma.$transaction(async (tx) => {
    if (!(await lockPoll(tx, pollId))) return { ok: false, error: "NOT_FOUND" };
    const poll = await tx.interestPoll.findUniqueOrThrow({ where: { id: pollId } });
    if (poll.communityId !== user.communityId) return { ok: false, error: "NOT_FOUND" };
    if (!canVote(poll, now)) return { ok: false, error: "NOT_OPEN" };
    await tx.pollVote.deleteMany({ where: { pollId, flatId: user.flatId } });
    return { ok: true, votes: await tx.pollVote.count({ where: { pollId } }), threshold: poll.threshold };
  });
}

export type ConvertResult = { ok: true; roundId: string; created: boolean } | { ok: false; error: PollError; errors?: CreateRoundError[] };

/**
 * One tap: opens a round pre-filled from the poll (cutoff in 3 days at 8 PM, service day in 5) and
 * marks the poll converted. A second tap, or a race, returns the same round.
 */
export async function convertPollToRound(actor: Actor, pollId: string, now: Date): Promise<ConvertResult> {
  return prisma.$transaction(async (tx) => {
    const found = await managedPoll(tx, actor, pollId);
    if (found.error) return { ok: false, error: found.error };
    const { poll } = found;
    if (poll.status === "CONVERTED" && poll.convertedRoundId) return { ok: true, roundId: poll.convertedRoundId, created: false };
    if (poll.status !== "OPEN") return { ok: false, error: "NOT_OPEN" };

    const { cutoffAt, deliveryAt } = defaultRoundDates(now);
    let opened;
    if (poll.kind === "SERVICE" && poll.serviceId) {
      const service = await tx.service.findUniqueOrThrow({ where: { id: poll.serviceId }, select: { weeklyByDefault: true } });
      opened = await openRoundInTx(
        tx,
        actor,
        poll.communityId,
        { kind: "SERVICE", round: { serviceId: poll.serviceId, title: poll.title, cutoffAt, days: [startOfIstDay(deliveryAt)], repeatWeekly: service.weeklyByDefault } },
        now,
      );
    } else if (poll.kind === "PRODUCT" && poll.productId) {
      const product = await tx.product.findUniqueOrThrow({ where: { id: poll.productId }, select: { defaultMaxPerFlat: true } });
      opened = await openRoundInTx(
        tx,
        actor,
        poll.communityId,
        {
          kind: "GROCERY",
          round: { title: poll.title, cutoffAt, deliveryAt, requirePickupCode: true, products: [{ productId: poll.productId, maxQtyPerFlat: product.defaultMaxPerFlat }] },
        },
        now,
      );
    } else {
      return { ok: false, error: "CANNOT_CONVERT" };
    }
    if (!opened.ok) return { ok: false, error: "CANNOT_CONVERT", errors: opened.errors };
    await tx.interestPoll.update({ where: { id: pollId }, data: { status: "CONVERTED", convertedRoundId: opened.roundId, convertedAt: now } });
    return { ok: true, roundId: opened.roundId, created: true };
  });
}

/** Polls for the captain's page, with vote counts. */
export async function listCommunityPolls(communityId: string) {
  return prisma.interestPoll.findMany({
    where: { communityId },
    orderBy: [{ createdAt: "desc" }],
    include: {
      _count: { select: { votes: true } },
      service: { select: { name: true, minFlats: true, vendor: { select: { name: true, verificationStatus: true } } } },
      product: { select: { name: true } },
      suggestedBy: { select: { name: true, flat: { select: { tower: true, number: true } } } },
      convertedRound: { select: { id: true, title: true, status: true } },
    },
  });
}

export type CaptainPoll = Awaited<ReturnType<typeof listCommunityPolls>>[number];

/** Polls residents can see, with whether their flat has voted. Newest first. */
export async function listResidentPolls(communityId: string, flatId: string) {
  const polls = await prisma.interestPoll.findMany({
    where: { communityId, status: { in: ["OPEN", "CONVERTED"] } },
    orderBy: [{ createdAt: "desc" }],
    include: {
      _count: { select: { votes: true } },
      votes: { where: { flatId }, select: { id: true } },
      service: { select: { name: true, vendor: { select: { name: true } } } },
      product: { select: { name: true } },
      convertedRound: { select: { id: true, status: true } },
    },
  });
  return polls.map(({ votes, ...poll }) => ({ ...poll, voted: votes.length > 0 }));
}

export type ResidentPoll = Awaited<ReturnType<typeof listResidentPolls>>[number];

/** What this resident suggested, and what became of it. */
export async function listMySuggestions(userId: string) {
  return prisma.interestPoll.findMany({
    where: { suggestedById: userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, status: true, createdAt: true },
  });
}
