import { connection } from "next/server";
import { prisma } from "@/lib/db";

// Liveness plus a database round trip. Returns counts only, no personal data.
export async function GET() {
  await connection();
  try {
    const [communities, openRounds] = await Promise.all([
      prisma.community.count(),
      prisma.orderRound.count({ where: { status: "OPEN" } }),
    ]);
    return Response.json({ ok: true, communities, openRounds });
  } catch {
    return Response.json({ ok: false, error: "database unavailable" }, { status: 503 });
  }
}
