import "server-only";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Locks a round's row until the transaction ends. Everything that changes a round's orders or
 * status (checkout, cancel, extend, close, finalize) takes this lock first, so they run one at a
 * time per round. Returns false if the round doesn't exist.
 */
export async function lockRound(tx: Prisma.TransactionClient, roundId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "OrderRound" WHERE id = ${roundId} FOR UPDATE`;
  return rows.length === 1;
}

/** The same for an interest poll: votes and one-tap conversion run one at a time per poll. */
export async function lockPoll(tx: Prisma.TransactionClient, pollId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "InterestPoll" WHERE id = ${pollId} FOR UPDATE`;
  return rows.length === 1;
}
