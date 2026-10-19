import "server-only";
import { cookies } from "next/headers";
import type { MessageKey } from "@/i18n";
import { FLASH_COOKIE, type Flash } from "./flash-shared";

/** Queues a toast for the next page the browser shows. Call from a server action before redirecting. */
export async function setFlash(tone: Flash["tone"], key: MessageKey, vars?: Flash["vars"]): Promise<void> {
  (await cookies()).set(FLASH_COOKIE, JSON.stringify({ tone, key, vars }), {
    path: "/",
    maxAge: 60,
    sameSite: "lax",
    httpOnly: false, // read once by the toast provider in the browser
  });
}
