import type { MessageKey } from "@/i18n";

/** What a server action that stays on the page returns; the client shows `message` as a toast. */
export type ActionResult = { ok: boolean; message?: MessageKey; vars?: Record<string, string | number> };
