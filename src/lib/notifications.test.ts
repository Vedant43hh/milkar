import { describe, expect, it } from "vitest";
import { en } from "@/i18n/en";
import { NOTIFICATION_TYPES, notificationKeys, relativeTime, renderNotification, safeNotificationHref } from "./notifications";

describe("renderNotification", () => {
  it("formats rupees and IST dates from params", () => {
    expect(renderNotification("TIER_UNLOCKED", { item: "Sona Masoori Rice", pricePaise: 44000 })).toEqual({
      title: "🎉 Price unlocked: Sona Masoori Rice",
      body: "Everyone now pays ₹440. Anything you paid above that comes back to your wallet at cutoff.",
    });
    expect(renderNotification("ROUND_OPENED", { round: "Weekly staples", cutoffAt: "2026-10-23T14:30:00.000Z" }).body).toBe(
      "Order together before Fri, 23 Oct, 8:00 pm to unlock group prices.",
    );
  });

  it("explains refunds by reason", () => {
    expect(renderNotification("REFUND_CREDITED", { amountPaise: 125000, reason: "TIER_REFUND", round: "Festive stock-up" })).toEqual({
      title: "₹1,250 added to your wallet",
      body: "A better group price was reached in Festive stock-up.",
    });
  });

  it("describes no-access refunds and issue updates", () => {
    expect(renderNotification("VISIT_NO_ACCESS", { refundPaise: 94900, feePaise: 14900 }).body).toBe(
      "₹949 is back in your wallet; the ₹149 visit fee was kept. You can dispute this within 48 hours.",
    );
    expect(renderNotification("ISSUE_UPDATE", { service: "Deep cleaning", status: "REVISIT_SCHEDULED" }).body).toBe("A free revisit has been scheduled.");
  });

  it("has a title and body for every type", () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(en.notifications.types[type].title.length).toBeGreaterThan(0);
      expect(en.notifications.types[type].body.length).toBeGreaterThan(0);
    }
  });

  it("degrades gracefully on bad data", () => {
    expect(renderNotification("SOMETHING_NEW", {})).toEqual({ title: "Notifications", body: "" });
    expect(renderNotification("ROUND_FINALIZED", null).title).toBe("{round} is confirmed");
    expect(renderNotification("ROUND_OPENED", { round: "R", cutoffAt: "not a date" }).body).toContain("{cutoff}");
  });
});

describe("safeNotificationHref", () => {
  it("follows same-site paths only", () => {
    expect(safeNotificationHref("/services/abc")).toBe("/services/abc");
    expect(safeNotificationHref("https://evil.example")).toBe("/notifications");
    expect(safeNotificationHref("//evil.example")).toBe("/notifications");
    expect(safeNotificationHref(null)).toBe("/notifications");
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  it.each([
    [30_000, "Just now"],
    [12 * 60_000, "12 min ago"],
    [3 * 3_600_000, "3 h ago"],
    [30 * 3_600_000, "Yesterday"],
    [5 * 86_400_000, "14 Oct 2026"],
  ])("%i ms ago reads %s", (ms, text) => {
    expect(relativeTime(ago(ms), now)).toBe(text);
  });
});

describe("notificationKeys", () => {
  it("dedupes tier unlocks per round, group and tier", () => {
    expect(notificationKeys.tierUnlocked("r1", "product:rice", 50)).toBe("TIER_UNLOCKED:r1:product:rice:50");
    expect(notificationKeys.pollThreshold("p1")).toBe("POLL_THRESHOLD:p1");
  });
});
