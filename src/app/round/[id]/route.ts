import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { homePathFor } from "@/lib/auth/rules";
import { prisma } from "@/lib/db";

/**
 * Stable link to a round, used by invite links and notifications. Sends residents of the round's
 * community to its page (the grocery list or the Service Day) and everyone else home.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/round/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/round/${id}`)}`, request.url));
  const round = await prisma.orderRound.findUnique({ where: { id }, select: { kind: true, communityId: true } });
  if (!round || user.flat?.community.id !== round.communityId) return NextResponse.redirect(new URL(homePathFor(user), request.url));
  return NextResponse.redirect(new URL(round.kind === "SERVICE" ? `/services/${id}` : `/groceries?round=${id}`, request.url));
}
