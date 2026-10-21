// Phase 9: one portal per role, enforced on the server. Every server action checks the caller's
// portal before doing anything: a signed-in user of any other role gets a 403, a signed-out
// visitor is sent to log in. Loaders only ever return the caller's own data.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Portal, Role } from "@/lib/auth/rules";
import { ROLES, portalFor } from "@/lib/auth/rules";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/server/session";
import { truncateAll } from "../../prisma/truncate";
import { makeCatalogue, makeManager, makeNeighbourhood, nextPhone } from "./helpers";

// Only the session lookup is faked: the real requirePortal / requireUser code runs.
let sessionUser: SessionUser | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (sessionUser ? { value: "token" } : undefined), set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("@/server/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/session")>()),
  findSessionUser: async () => sessionUser,
}));

const community = { id: "c1", name: "Test CHS", code: "TEST", city: "Pune", status: "APPROVED" as const, unitLabel: "Flat", blockLabel: "Tower" };

/** A fully set-up account of each role, as the session would load it. */
function userWith(role: Role): SessionUser {
  return {
    id: `user-${role}`,
    name: role,
    phone: "+919999999999",
    role,
    onboardedAt: null,
    flatId: role === "RESIDENT" ? "f1" : null,
    flat: role === "RESIDENT" ? { id: "f1", tower: "A", number: "101", community } : null,
    staff: role === "MANAGER" ? { kind: "PRIMARY", community } : null,
    vendor: role === "VENDOR" || role === "TECHNICIAN" ? { id: "v1", name: "CoolCare", kind: "SERVICES", verificationStatus: "VERIFIED" } : null,
  };
}

/** Server-action modules and the portal they belong to. Auth and notification actions serve every role. */
const ACTION_MODULES: { portal: Portal; name: string; load: () => Promise<Record<string, unknown>> }[] = [
  { portal: "manager", name: "manager", load: () => import("@/server/actions/manager") },
  { portal: "app", name: "shop", load: () => import("@/server/actions/shop") },
  { portal: "app", name: "polls", load: () => import("@/server/actions/polls") },
  { portal: "app", name: "services", load: () => import("@/server/actions/services") },
];

/** What a call ended with: Next's digest for interrupts (403, redirect), or the error message. */
async function outcome(call: () => Promise<unknown>): Promise<string> {
  try {
    await call();
    return "completed";
  } catch (error) {
    const digest = (error as { digest?: string }).digest;
    return digest ?? String(error);
  }
}

beforeAll(() => {
  // forbidden() refuses to run unless Next's authInterrupts flag is on (next.config.ts sets it).
  process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS = "true";
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("server actions check the portal first", () => {
  for (const { portal, name, load } of ACTION_MODULES) {
    it(`${name} actions refuse every other role with a 403`, async () => {
      const actions = Object.entries(await load()).filter(([, value]) => typeof value === "function") as [string, (...args: unknown[]) => Promise<unknown>][];
      expect(actions.length).toBeGreaterThan(0);
      for (const [action, fn] of actions) {
        for (const role of ROLES.filter((r) => portalFor(r) !== portal)) {
          sessionUser = userWith(role);
          expect(await outcome(() => fn("x", new FormData(), {})), `${action} as ${role}`).toBe("NEXT_HTTP_ERROR_FALLBACK;403");
        }
        sessionUser = null;
        const signedOut = await outcome(() => fn("x", new FormData(), {}));
        expect(signedOut, `${action} signed out`).toMatch(/^NEXT_REDIRECT;.*\/login/);
      }
    });
  }
});

describe("loaders return only the caller's own data", () => {
  beforeEach(async () => {
    await truncateAll(prisma);
  });

  it("a technician sees only the visits assigned to them", async () => {
    const { technicianVisits } = await import("@/server/technician");
    const hood = await makeNeighbourhood("TECH1", 2);
    const { services } = await makeCatalogue();
    const [ravi, irfan] = await Promise.all(
      ["Ravi", "Irfan"].map((name) => prisma.user.create({ data: { phone: nextPhone(), name, role: "TECHNICIAN", vendorId: services.id } })),
    );
    const round = await prisma.orderRound.create({
      data: { communityId: hood.community.id, createdById: hood.manager.id, kind: "SERVICE", title: "AC Day", cutoffAt: new Date(), deliveryAt: new Date(), marginBps: 300, reductionFreezeMinutes: 720 },
    });
    const now = new Date();
    const startsAt = new Date(now.getTime() + 60_000);
    for (const [i, tech] of [ravi, irfan].entries()) {
      const flat = hood.community.flats[i];
      const slot = await prisma.serviceSlot.create({ data: { roundId: round.id, startsAt: new Date(startsAt.getTime() + i * 1000), endsAt: new Date(startsAt.getTime() + 3_600_000), capacity: 2 } });
      const booking = await prisma.serviceBooking.create({ data: { roundId: round.id, flatId: flat.id, slotId: slot.id, userId: hood.residents[i].id, status: "ACTIVE" } });
      await prisma.serviceVisit.create({
        data: { roundId: round.id, bookingId: booking.id, flatId: flat.id, slotId: slot.id, startsAt: slot.startsAt, endsAt: slot.endsAt, completionCode: "1234", technicianId: tech.id },
      });
    }
    const forRavi = [...(await technicianVisits(ravi.id, "today", now)), ...(await technicianVisits(ravi.id, "upcoming", now))];
    expect(forRavi).toHaveLength(1);
    expect(forRavi[0].flat.number).toBe(hood.community.flats[0].number);
  });

  it("a Society Manager can't open another community's round", async () => {
    const { getRoundDashboard } = await import("@/server/rounds");
    const mine = await makeNeighbourhood("MINE1", 2);
    const theirs = await makeNeighbourhood("THEIR1", 2);
    const assistant = await makeManager(mine.community.id, "Assistant", "ASSISTANT");
    const round = await prisma.orderRound.create({
      data: { communityId: theirs.community.id, createdById: theirs.manager.id, kind: "GROCERY", title: "Theirs", cutoffAt: new Date(), deliveryAt: new Date(), marginBps: 300, reductionFreezeMinutes: 720 },
    });
    expect(await getRoundDashboard(mine.actor, round.id)).toBeNull();
    expect(await getRoundDashboard({ id: assistant.id, role: "MANAGER", communityId: mine.community.id }, round.id)).toBeNull();
    expect(await getRoundDashboard(theirs.actor, round.id)).not.toBeNull();
  });
});
