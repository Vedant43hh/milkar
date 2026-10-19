// Phase 1: the migrated schema enforces the constraints the money logic relies on.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { truncateAll } from "../../prisma/truncate";

beforeEach(async () => {
  await truncateAll(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function makeUser(phone = "+919999900001") {
  return prisma.user.create({ data: { phone, name: "Test" } });
}

describe("database constraints", () => {
  it("rejects a reused wallet idempotency key, so a credit can never be paid twice", async () => {
    const user = await makeUser();
    const data = { userId: user.id, amountPaise: 2500, type: "TIER_REFUND" as const, idempotencyKey: "TIER_REFUND:item-1" };
    await prisma.walletTransaction.create({ data });
    await expect(prisma.walletTransaction.create({ data })).rejects.toThrow();
    const balance = await prisma.walletTransaction.aggregate({ where: { userId: user.id }, _sum: { amountPaise: true } });
    expect(balance._sum.amountPaise).toBe(2500);
  });

  it("keeps phone numbers and flats unique", async () => {
    await makeUser("+919999900002");
    await expect(makeUser("+919999900002")).rejects.toThrow();

    const community = await prisma.community.create({
      data: { name: "Test CHS", code: "TEST1", address: "x", city: "Pune", pincode: "411001" },
    });
    await prisma.flat.create({ data: { communityId: community.id, tower: "A", number: "101" } });
    await expect(prisma.flat.create({ data: { communityId: community.id, tower: "A", number: "101" } })).rejects.toThrow();
  });

  it("numbers rounds sequentially", async () => {
    const captain = await makeUser();
    const community = await prisma.community.create({
      data: { name: "Test CHS", code: "TEST2", address: "x", city: "Pune", pincode: "411001" },
    });
    const base = {
      communityId: community.id,
      createdById: captain.id,
      kind: "GROCERY" as const,
      title: "Round",
      cutoffAt: new Date(),
      deliveryAt: new Date(),
      marginBps: 300,
      reductionFreezeMinutes: 720,
    };
    const first = await prisma.orderRound.create({ data: base });
    const second = await prisma.orderRound.create({ data: base });
    expect(second.number).toBe(first.number + 1);
  });
});
