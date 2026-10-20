"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { tu } from "@/i18n/ui";
import { SegmentedControl } from "./ui/form";

export type ThemeChoice = "system" | "light" | "dark";
export const THEME_STORAGE_KEY = "milkar-theme";

// The saved choice lives in localStorage (applied before paint by THEME_SCRIPT). This store lets
// every toggle on the page stay in sync, including across tabs via the storage event.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function applyTheme(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** System / Light / Dark switch. */
export function ThemeToggle() {
  const choice = useSyncExternalStore(subscribe, readChoice, () => "system" as ThemeChoice);

  function change(next: ThemeChoice) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {}
    applyTheme(next);
    listeners.forEach((l) => l());
  }

  return (
    <SegmentedControl<ThemeChoice>
      name="theme"
      label={tu("theme.label")}
      value={choice}
      onChange={change}
      options={[
        { value: "system", label: <><Monitor aria-hidden className="size-4" />{tu("theme.system")}</> },
        { value: "light", label: <><Sun aria-hidden className="size-4" />{tu("theme.light")}</> },
        { value: "dark", label: <><Moon aria-hidden className="size-4" />{tu("theme.dark")}</> },
      ]}
    />
  );
}
