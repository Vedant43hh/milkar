import "server-only";
import { cookies } from "next/headers";
import { t, type MessageKey } from "@/i18n";
import { FLASH_COOKIE, type FlashTone } from "./flash-shared";

/** Queues a toast for the next page the browser shows. Call from a server action before redirecting. */
export async function setFlash(tone: FlashTone, key: MessageKey, vars?: Record<string, string | number>): Promise<void> {
  (await cookies()).set(FLASH_COOKIE, JSON.stringify({ tone, text: t(key, vars) }), {
    path: "/",
    maxAge: 60,
    sameSite: "lax",
    httpOnly: false, // read once by the toast provider in the browser
  });
}
