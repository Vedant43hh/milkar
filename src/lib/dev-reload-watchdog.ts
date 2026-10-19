// Development-only early warning for a dev-server reload loop: the same page requested many
// times in a few seconds. Production never calls this.

const WINDOW_MS = 10_000;
const THRESHOLD = 20;
const QUIET_MS = 60_000;

const hits = new Map<string, number[]>();
let lastWarned: number | null = null;

/** Records a page request; returns a warning message the first time a path looks like a reload loop. */
export function recordPageRequest(path: string, now: number = Date.now()): string | null {
  const recent = (hits.get(path) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(path, recent);
  if (recent.length < THRESHOLD || (lastWarned !== null && now - lastWarned < QUIET_MS)) return null;
  lastWarned = now;
  return (
    `[milkar] ${path} was requested ${recent.length} times in ${WINDOW_MS / 1000}s. ` +
    "The dev server looks stuck in a hot-reload loop (a Next.js dev-mode bug, never in production). " +
    "Stop `npm run dev` and start it again, and close extra tabs on this app."
  );
}

export function resetWatchdog(): void {
  hits.clear();
  lastWarned = null;
}
