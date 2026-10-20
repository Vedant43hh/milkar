// What a price meter counts, in words: packs, packets or dozen for groceries; the community's own
// word for a flat (flats, rooms…) for services. Server-side.
import { t } from "@/i18n";
import { unitWordsFor, type UnitWords } from "@/lib/rounds";

export function meterWords(tierBasis: "UNITS" | "FLATS", productUnit: string | null | undefined, communityUnitLabel: string): UnitWords {
  if (tierBasis === "FLATS") return unitWordsFor(communityUnitLabel);
  const key = productUnit === "PACKET" ? "packet" : productUnit === "PIECE" ? "piece" : productUnit === "DOZEN" ? "dozen" : "pack";
  return { one: t(`packWords.${key}.one`), other: t(`packWords.${key}.other`) };
}
