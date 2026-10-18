import { connection } from "next/server";
import { prisma } from "@/lib/db";

// Liveness plus a database round trip. Returns counts only, no personal data.
export async function GET() {
  await connection();
  try {
    const [societies, openRounds] = await Promise.all([
      prisma.society.count(),
      prisma.orderRound.count({ where: { status: "OPEN" } }),
    ]);
    return Response.json({ ok: true, societies, openRounds });
  } catch {
    return Response.json({ ok: false, error: "database unavailable" }, { status: 503 });
  }
}
