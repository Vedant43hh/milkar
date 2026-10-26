import "server-only";
import type { CommunityType } from "@/generated/prisma/client";
import { canManageCommunity } from "@/lib/auth/rules";
import { prisma } from "@/lib/db";
import { canManageTeam } from "@/lib/manager-rules";
import { notificationKeys } from "@/lib/notifications";
import { normalizeIndianMobile } from "@/lib/phone";
import { isUniqueViolation } from "./db-errors";
import { notify } from "./notifications";
import type { Actor } from "./rounds";

// A community's team and settings, and who lives there. The primary Society Manager invites and
// removes assistants and edits the community's details; assistants (and the primary) look after
// residents, rounds, distribution, visits and complaints.

export type TeamError = "FORBIDDEN" | "NOT_FOUND" | "INVALID_NAME" | "INVALID_PHONE" | "ALREADY_REGISTERED" | "NOT_AN_ASSISTANT";

/** The actor runs this community's team: its primary Society Manager (or an admin). */
function runsTeam(actor: Actor, communityId: string): boolean {
  return actor.role === "ADMIN" || (canManageCommunity(actor, communityId) && canManageTeam(actor.staffKind));
}

export async function listTeam(communityId: string) {
  return prisma.communityStaff.findMany({
    where: { communityId },
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
    select: { id: true, kind: true, createdAt: true, user: { select: { id: true, name: true, phone: true } } },
  });
}

/** A new assistant manager: a fresh account for that phone, which logs in with an OTP. */
export async function inviteAssistant(actor: Actor, communityId: string, input: { name: string; phone: string }, now: Date): Promise<{ ok: true; userId: string } | { ok: false; error: TeamError }> {
  if (!runsTeam(actor, communityId)) return { ok: false, error: "FORBIDDEN" };
  const name = input.name.trim();
  if (name.length < 2 || name.length > 60) return { ok: false, error: "INVALID_NAME" };
  const phone = normalizeIndianMobile(input.phone);
  if (!phone) return { ok: false, error: "INVALID_PHONE" };
  try {
    const user = await prisma.user.create({
      data: { phone, name, role: "MANAGER", createdAt: now, staffRole: { create: { communityId, kind: "ASSISTANT", addedById: actor.id, createdAt: now } } },
      select: { id: true },
    });
    return { ok: true, userId: user.id };
  } catch (error) {
    // One portal per account: a number already on Milkar can't become a manager too.
    if (isUniqueViolation(error, "phone")) return { ok: false, error: "ALREADY_REGISTERED" };
    throw error;
  }
}

/** An assistant leaves the team; their account stays but no longer opens the community. */
export async function removeAssistant(actor: Actor, communityId: string, staffId: string): Promise<{ ok: true } | { ok: false; error: TeamError }> {
  if (!runsTeam(actor, communityId)) return { ok: false, error: "FORBIDDEN" };
  const staff = await prisma.communityStaff.findFirst({ where: { id: staffId, communityId }, select: { kind: true } });
  if (!staff) return { ok: false, error: "NOT_FOUND" };
  if (staff.kind !== "ASSISTANT") return { ok: false, error: "NOT_AN_ASSISTANT" };
  await prisma.communityStaff.delete({ where: { id: staffId } });
  return { ok: true };
}

export type SettingsInput = { name: string; type: CommunityType; address: string; city: string; pincode: string; blockLabel: string; unitLabel: string };
export type SettingsError = "FORBIDDEN" | "INVALID";

const COMMUNITY_TYPES: readonly CommunityType[] = ["APARTMENT_SOCIETY", "GATED_COMMUNITY", "PG_COLIVING", "HOSTEL", "OFFICE_CAMPUS"];

/** The community's details, as residents see them. Primary Society Manager only. */
export async function updateCommunitySettings(actor: Actor, communityId: string, input: SettingsInput): Promise<{ ok: true } | { ok: false; error: SettingsError }> {
  if (!runsTeam(actor, communityId)) return { ok: false, error: "FORBIDDEN" };
  const clean = {
    name: input.name.trim(),
    type: input.type,
    address: input.address.trim(),
    city: input.city.trim(),
    pincode: input.pincode.trim(),
    blockLabel: input.blockLabel.trim(),
    unitLabel: input.unitLabel.trim(),
  };
  const valid =
    clean.name.length >= 3 &&
    clean.name.length <= 80 &&
    COMMUNITY_TYPES.includes(clean.type) &&
    clean.address.length >= 5 &&
    clean.address.length <= 200 &&
    clean.city.length >= 2 &&
    clean.city.length <= 60 &&
    /^[1-9]\d{5}$/.test(clean.pincode) &&
    clean.blockLabel.length >= 2 &&
    clean.blockLabel.length <= 20 &&
    clean.unitLabel.length >= 2 &&
    clean.unitLabel.length <= 20;
  if (!valid) return { ok: false, error: "INVALID" };
  await prisma.community.update({ where: { id: communityId }, data: clean });
  return { ok: true };
}

export type RemoveMemberError = "FORBIDDEN" | "NOT_FOUND" | "HAS_OPEN_ORDERS";

/**
 * Takes a resident out of the community (they moved out, or shouldn't have been let in). Not while
 * they have something on the go: an order in a round still open, or awaiting delivery or a visit.
 */
export async function removeResident(actor: Actor, communityId: string, userId: string, now: Date): Promise<{ ok: true } | { ok: false; error: RemoveMemberError }> {
  if (!canManageCommunity(actor, communityId)) return { ok: false, error: "FORBIDDEN" };
  const resident = await prisma.user.findFirst({ where: { id: userId, role: "RESIDENT", flat: { communityId } }, select: { id: true, flatId: true } });
  if (!resident) return { ok: false, error: "NOT_FOUND" };
  const onTheGo = await prisma.orderItem.count({
    where: { userId, quantity: { gt: 0 }, status: { in: ["ACTIVE", "CONFIRMED"] }, round: { communityId, status: { in: ["OPEN", "FINALIZING", "FINALIZED"] } } },
  });
  if (onTheGo > 0) return { ok: false, error: "HAS_OPEN_ORDERS" };
  const community = await prisma.community.findUniqueOrThrow({ where: { id: communityId }, select: { name: true } });
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { flatId: null } });
    await notify(
      tx,
      [userId],
      { type: "MEMBER_REMOVED", params: { community: community.name }, href: "/app/join" },
      { dedupeKey: notificationKeys.memberRemoved(userId, now.getTime()), now },
    );
  });
  return { ok: true };
}

/** The community's details, for the settings form. */
export async function getCommunityDetails(communityId: string) {
  return prisma.community.findUniqueOrThrow({
    where: { id: communityId },
    select: { name: true, type: true, address: true, city: true, pincode: true, blockLabel: true, unitLabel: true },
  });
}
