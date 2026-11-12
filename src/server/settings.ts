import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { DEFAULT_SETTINGS, type PlatformSettings } from "@/lib/admin/settings";
import { prisma } from "@/lib/db";

type Db = { platformSetting: Prisma.TransactionClient["platformSetting"] };

/** Every platform setting, with defaults for anything not saved yet. */
export async function loadPlatformSettings(db: Db = prisma): Promise<PlatformSettings> {
  const row = await db.platformSetting.findUnique({ where: { id: 1 } });
  if (!row) return DEFAULT_SETTINGS;
  const { marginBps, reductionFreezeMinutes, defaultNoAccessFeePaise, impactMetresPerTrip, impactMlPerKm, impactGramsCo2PerLitre } = row;
  return { marginBps, reductionFreezeMinutes, defaultNoAccessFeePaise, impactMetresPerTrip, impactMlPerKm, impactGramsCo2PerLitre };
}
