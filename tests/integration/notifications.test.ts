// Phase 4: notifications are stored once per user and dedupe key, and only their owner can read them.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { notificationKeys } from "@/lib/notifications";
import { listNotifications, markAllRead, markRead, notify, unreadCount } from "@/server/notifications";
import { truncateAll } from "../../prisma/truncate";
import { nextPhone } from "./helpers";

const info = vi.spyOn(console, "info");

beforeAll(() => {
  info.mockImplementation(() => {});
});

beforeEach(async () => {
  await truncateAll(prisma);
  info.mockClear();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const users = (n: number) => Promise.all(Array.from({ length: n }, () => prisma.user.create({ data: { phone: nextPhone() } })));
const unlocked = { type: "TIER_UNLOCKED" as const, params: { item: "Sona Masoori Rice", pricePaise: 44000 }, href: "/app/groceries" };
const key = notificationKeys.tierUnlocked("round-1", "product:rice", 50);

describe("notify", () => {
  it("sends a tier unlock once per user, even when retried or raced", async () => {
    const [a, b, c] = await users(3);
    const first = await notify(prisma, [a.id, b.id], unlocked, { dedupeKey: key });
    expect(first).toHaveLength(2);

    // A retry, plus four concurrent sends that also include a newcomer.
    const again = await Promise.all(Array.from({ length: 4 }, () => notify(prisma, [a.id, b.id, c.id], unlocked, { dedupeKey: key })));
    expect(again.flat().map((n) => n.userId)).toEqual([c.id]);
    expect(await prisma.notification.count()).toBe(3);
  });

  it("sends every time without a dedupe key, and skips duplicate recipients", async () => {
    const [a] = await users(1);
    await notify(prisma, [a.id, a.id], unlocked);
    await notify(prisma, [a.id], unlocked);
    expect(await prisma.notification.count({ where: { userId: a.id } })).toBe(2);
  });

  it("works inside a transaction and is rolled back with it", async () => {
    const [a] = await users(1);
    await expect(
      prisma.$transaction(async (tx) => {
        await notify(tx, [a.id], unlocked, { dedupeKey: key });
        throw new Error("payment failed");
      }),
    ).rejects.toThrow("payment failed");
    expect(await prisma.notification.count()).toBe(0);
  });

  it("hands new notifications to the push and SMS stubs", async () => {
    const [a] = await users(1);
    await notify(prisma, [a.id], unlocked, { dedupeKey: key });
    const logged = info.mock.calls.map((call) => String(call[0]));
    if (process.env.NOTIFY_STUBS === "log") {
      expect(logged.some((line) => line.startsWith("[notify:push]") && line.includes("Price unlocked: Sona Masoori Rice"))).toBe(true);
      expect(logged.some((line) => line.startsWith("[notify:sms]"))).toBe(true);
    } else {
      expect(logged.filter((line) => line.startsWith("[notify:"))).toEqual([]);
    }
  });
});

describe("reading notifications", () => {
  it("counts unread, marks one or all read, and newest come first", async () => {
    const [a, b] = await users(2);
    const t0 = new Date("2026-10-19T06:00:00Z");
    await notify(prisma, [a.id], { type: "ROUND_FINALIZED", params: { round: "Old" } }, { now: t0 });
    await notify(prisma, [a.id], { type: "ROUND_FINALIZED", params: { round: "New" } }, { now: new Date(t0.getTime() + 60_000) });
    await notify(prisma, [b.id], unlocked);
    expect(await unreadCount(a.id)).toBe(2);

    const list = await listNotifications(a.id);
    expect(list.map((n) => (n.params as { round: string }).round)).toEqual(["New", "Old"]);

    expect(await markRead(a.id, list[0].id, t0)).toEqual({ href: null });
    expect(await unreadCount(a.id)).toBe(1);
    expect(await markAllRead(a.id, t0)).toBe(1);
    expect(await unreadCount(a.id)).toBe(0);
    expect(await unreadCount(b.id)).toBe(1); // untouched
  });

  it("never lets one user open another user's notification", async () => {
    const [a, b] = await users(2);
    const [mine] = await notify(prisma, [b.id], unlocked);
    expect(await markRead(a.id, mine.id, new Date())).toBeNull();
    expect(await unreadCount(b.id)).toBe(1);
  });
});
