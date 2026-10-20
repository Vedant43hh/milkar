// Turns rounds from the database into what captain screens show. Server-side, no JSX.
import { t } from "@/i18n";
import type { Tier } from "@/lib/pricing/tiers";
import { roundStats, unitWordsFor, type RoundStats, type UnitWords } from "@/lib/rounds";
import type { CaptainRound } from "@/server/rounds";

export type CaptainOffering = CaptainRound["offerings"][number];

const PACK_UNITS = new Set(["KG", "G", "LITRE", "ML"]);

/** "Sona Masoori Rice · 5 kg", "Farm Eggs", or a service option such as "Split AC". */
export function offeringName(o: CaptainOffering): string {
  if (o.serviceOption) return o.serviceOption.name;
  if (!o.product) return "";
  const { name, unit, packSize } = o.product;
  return PACK_UNITS.has(unit) ? `${name} · ${packSize} ${t(`units.${unit}`)}` : name;
}

/** What a meter counts: packs, packets or dozen for groceries; flats (or rooms) for services. */
export function offeringWords(o: CaptainOffering, unitLabel: string): UnitWords {
  if (o.tierBasis === "FLATS") return unitWordsFor(unitLabel);
  const unit = o.product?.unit;
  if (unit === "PACKET") return { one: t("packWords.packet.one"), other: t("packWords.packet.other") };
  if (unit === "PIECE") return { one: t("packWords.piece.one"), other: t("packWords.piece.other") };
  if (unit === "DOZEN") return { one: t("packWords.dozen.one"), other: t("packWords.dozen.other") };
  return { one: t("packWords.pack.one"), other: t("packWords.pack.other") };
}

export function sortOfferings(offerings: CaptainOffering[]): CaptainOffering[] {
  return [...offerings].sort(
    (a, b) => (a.serviceOption?.sortOrder ?? 0) - (b.serviceOption?.sortOrder ?? 0) || offeringName(a).localeCompare(offeringName(b)),
  );
}

export function statsOf(round: { marginBps: number; offerings: CaptainOffering[] }): RoundStats {
  return roundStats(
    round.offerings.map((o) => ({
      id: o.id,
      tierGroupKey: o.tierGroupKey,
      pricing: { tierBasis: o.tierBasis, tiers: o.tiers as Tier[], marginBps: round.marginBps, gstBps: o.gstBps, minOrderQty: o.minOrderQty, mrpPaise: o.mrpPaise },
      items: o.orderItems,
    })),
  );
}
