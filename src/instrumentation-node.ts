// Node.js-only startup checks, imported from instrumentation.ts.
import { tickIntervalMs } from "./lib/cron";
import { assertSafeBoot, getEnv } from "./lib/env";

try {
  assertSafeBoot();
} catch (error) {
  // Exit instead of serving 500s, so a misconfigured deployment fails loudly.
  console.error(`[milkar] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

startJobTicker();

/**
 * With CRON_TICK_SECONDS set, the server runs the scheduled jobs itself: shortly after it starts,
 * then on that interval. One run at a time per process; the jobs are safe to overlap across servers.
 */
function startJobTicker() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const every = tickIntervalMs(getEnv().CRON_TICK_SECONDS);
  const state = globalThis as { milkarJobTicker?: boolean };
  if (!every || state.milkarJobTicker) return;
  state.milkarJobTicker = true;

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const { runScheduledJobs } = await import("./server/jobs");
      const report = await runScheduledJobs(new Date());
      if (report.finalized.length > 0 || report.reminders > 0 || report.expiredHolds > 0) {
        console.info(`[milkar] jobs: ${report.finalized.length} round(s) finalized, ${report.reminders} reminder(s), ${report.expiredHolds} hold(s) expired`);
      }
    } catch (error) {
      console.error("[milkar] scheduled jobs failed:", error);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 5_000).unref();
  setInterval(tick, every).unref();
}
