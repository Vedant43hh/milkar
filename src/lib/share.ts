// Sharing a round on WhatsApp. Pure.
import { t } from "@/i18n";
import { formatINR } from "./pricing/money";
import { formatIST } from "./time";

/** The invite link works for everyone: members go straight to the round, others join first. */
export function roundInviteUrl(appUrl: string, communityCode: string, roundId: string): string {
  return `${appUrl.replace(/\/+$/, "")}/join/${encodeURIComponent(communityCode)}?round=${encodeURIComponent(roundId)}`;
}

/** Opens WhatsApp (app or web) with the message ready to send to a group. */
export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export type ShareInput = {
  kind: "GROCERY" | "SERVICE";
  round: string;
  community: string;
  cutoffAt: Date;
  url: string;
  /** The nearest price unlock: how many more (flats, packs…) and the price it unlocks. */
  nextUnlock?: { needed: number; unit: string; pricePaise: number; item: string } | null;
};

export function roundShareText(input: ShareInput): string {
  const lines = [
    t(input.kind === "GROCERY" ? "share.groceryIntro" : "share.serviceIntro", { round: input.round, community: input.community }),
    t("share.cutoff", { cutoff: formatIST(input.cutoffAt) }),
  ];
  if (input.nextUnlock) {
    const { needed, unit, item, pricePaise } = input.nextUnlock;
    lines.push(t("share.unlock", { n: needed, unit, item, price: formatINR(pricePaise) }));
  }
  lines.push(input.url);
  return lines.join("\n");
}
