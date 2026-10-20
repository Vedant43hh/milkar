import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** A resident's wallet balance: the sum of their ledger. */
export async function walletBalance(db: Db, userId: string): Promise<number> {
  const { _sum } = await db.walletTransaction.aggregate({ where: { userId }, _sum: { amountPaise: true } });
  return _sum.amountPaise ?? 0;
}

/**
 * Locks a resident's row until the transaction ends. Anything that spends wallet money takes this
 * lock (after the round lock), so two checkouts can never spend the same balance twice.
 */
export async function lockUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
}
