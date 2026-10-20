import { connection } from "next/server";
import { isCronAuthorized } from "@/lib/cron";
import { getEnv } from "@/lib/env";
import { runScheduledJobs } from "@/server/jobs";

// The scheduled jobs (cutoff, reminders, expired holds), for Vercel Cron or any scheduler that
// sends "Authorization: Bearer $CRON_SECRET". Returns counts only.
export async function GET(request: Request) {
  await connection();
  if (!isCronAuthorized(request.headers.get("authorization"), getEnv().CRON_SECRET)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const report = await runScheduledJobs(new Date());
  return Response.json({
    ok: true,
    finalized: report.finalized.map((f) => f.roundId),
    reminders: report.reminders,
    expiredHolds: report.expiredHolds,
  });
}
