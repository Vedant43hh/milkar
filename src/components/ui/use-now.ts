"use client";

import { useSyncExternalStore } from "react";

// One shared clock for every countdown on the page: a single 1-second timer that runs only
// while something is subscribed. The server snapshot is null, so server HTML and hydration
// never depend on the current time.

let now = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

function getSnapshot(): number {
  if (now === 0) now = Date.now();
  return now;
}

function getServerSnapshot(): null {
  return null;
}

/** Current time in ms, updated every second; null during server render and hydration. */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
