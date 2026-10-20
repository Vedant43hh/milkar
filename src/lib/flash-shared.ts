// Flash messages: shown once as a toast after a server action redirects. Shared by server and client.
// The text is translated on the server, so the browser needs no dictionary for it.

export const FLASH_COOKIE = "milkar_flash";

export type FlashTone = "success" | "error" | "info" | "celebrate";
export type Flash = { tone: FlashTone; text: string };

export function parseFlash(raw: string): Flash | null {
  try {
    const value = JSON.parse(raw) as Partial<Flash>;
    if (typeof value.text !== "string" || !["success", "error", "info", "celebrate"].includes(String(value.tone))) return null;
    return { tone: value.tone as FlashTone, text: value.text };
  } catch {
    return null;
  }
}
