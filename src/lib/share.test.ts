import { describe, expect, it } from "vitest";
import { roundInviteUrl, roundShareText, whatsappUrl } from "./share";

describe("sharing a round", () => {
  it("links through the community's invite page, so new neighbours can join first", () => {
    expect(roundInviteUrl("https://milkar.app/", "GREENMDW", "r1")).toBe("https://milkar.app/join/GREENMDW?round=r1");
  });

  it("builds a WhatsApp message with the cutoff in IST and the nearest unlock", () => {
    const text = roundShareText({
      kind: "SERVICE",
      round: "AC servicing Service Day",
      community: "Green Meadows CHS",
      cutoffAt: new Date("2026-10-23T14:30:00Z"),
      url: "https://milkar.app/join/GREENMDW?round=r1",
      nextUnlock: { needed: 6, unit: "flats", pricePaise: 40000, item: "AC servicing (Split AC)" },
    });
    expect(text.split("\n")).toEqual([
      "🧰 AC servicing Service Day is open for Green Meadows CHS on Milkar. The more flats book, the less everyone pays.",
      "Closes Fri, 23 Oct, 8:00 pm.",
      "Just 6 more flats to unlock ₹400 for AC servicing (Split AC)!",
      "https://milkar.app/join/GREENMDW?round=r1",
    ]);
  });

  it("encodes the whole message for wa.me", () => {
    const url = whatsappUrl("Rice ₹440 & dal\nhttps://x.y/?a=1");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(url.slice("https://wa.me/?text=".length))).toBe("Rice ₹440 & dal\nhttps://x.y/?a=1");
  });
});
