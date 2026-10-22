import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canManageCommunity, homePathFor } from "@/lib/auth/rules";
import { prisma } from "@/lib/db";
import { isTakingOrders } from "@/lib/rounds";

/**
 * Stable link to a round, used by invite links and notifications. Residents of the round's
 * community go to its page while it takes orders (the grocery list or the Service Day), and to
 * their order afterwards; its Society Managers go to the round's dashboard, and everyone else to
 * their own portal.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/round/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/round/${id}`)}`, request.url));
  const round = await prisma.orderRound.findUnique({ where: { id }, select: { kind: true, communityId: true, status: true, cutoffAt: true } });
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));
  if (!round) return to(homePathFor(user));
  if (user.role === "RESIDENT" && user.flat?.community.id === round.communityId) {
    if (!isTakingOrders(round, new Date())) return to(`/app/orders/${id}`);
    return to(round.kind === "SERVICE" ? `/app/services/${id}` : `/app/groceries?round=${id}`);
  }
  if (user.role === "MANAGER" && canManageCommunity({ role: user.role, communityId: user.staff?.community.id ?? null }, round.communityId)) {
    return to(`/manager/rounds/${id}`);
  }
  return to(homePathFor(user));
}
