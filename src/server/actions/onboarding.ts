"use server";

import { requireUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

/**
 * The first-login tour was finished or skipped: don't show it again. Any signed-in account.
 * No refresh: the tour has already closed on the phone, and the next page load reads the new value.
 */
export async function finishTourAction(): Promise<void> {
  const user = await requireUser();
  await prisma.user.updateMany({ where: { id: user.id, onboardedAt: null }, data: { onboardedAt: new Date() } });
}
