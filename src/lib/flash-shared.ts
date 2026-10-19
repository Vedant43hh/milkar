// Flash messages: shown once as a toast after a server action redirects. Shared by server and client.

export const FLASH_COOKIE = "milkar_flash";

export type Flash = { tone: "success" | "error" | "info" | "celebrate"; key: string; vars?: Record<string, string | number> };

export function parseFlash(raw: string): Flash | null {
  try {
    const value = JSON.parse(raw) as Partial<Flash>;
    if (typeof value.key !== "string" || !["success", "error", "info", "celebrate"].includes(String(value.tone))) return null;
    return { tone: value.tone as Flash["tone"], key: value.key, vars: value.vars };
  } catch {
    return null;
  }
}
