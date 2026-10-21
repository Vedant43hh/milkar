// In-app notifications are stored as a type plus params and rendered through i18n when read, so
// they follow the reader's language. Pure: no database access here.
import { t, type MessageKey } from "@/i18n";
import { formatINR } from "./pricing/money";
import { formatIST } from "./time";

export const NOTIFICATION_TYPES = [
  "ROUND_OPENED",
  "TIER_UNLOCKED",
  "CUTOFF_REMINDER",
  "ROUND_FINALIZED",
  "REFUND_CREDITED",
  "VISIT_SCHEDULED",
  "TECHNICIAN_ON_THE_WAY",
  "VISIT_COMPLETED",
  "VISIT_NO_ACCESS",
  "POLL_THRESHOLD",
  "POLL_SUGGESTION",
  "SLOT_HELD",
  "SLOT_AUTO_BOOKED",
  "ISSUE_UPDATE",
  "VENDOR_ORDER",
  "JOIN_REQUEST",
  "JOIN_DECIDED",
  "COMMUNITY_DECIDED",
  "VENDOR_DECIDED",
  "COMMUNITY_REGISTERED",
  "VENDOR_REGISTERED",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

type RefundReason =
  | "TIER_REFUND"
  | "DROP_REFUND"
  | "CANCEL_REFUND"
  | "ROUND_CANCEL_REFUND"
  | "LATE_PAYMENT_CREDIT"
  | "SHORT_DELIVERY_REFUND"
  | "NO_ACCESS_REFUND"
  | "VISIT_CANCEL_REFUND"
  | "SERVICE_ISSUE_REFUND"
  | "ADJUSTMENT";

type IssueStatus = "OPEN" | "REVISIT_SCHEDULED" | "REFUNDED" | "REJECTED" | "RESOLVED";
type Decision = "APPROVED" | "REJECTED";

/**
 * Params per type. Convention: `…At` fields are ISO instants shown in IST, `…Paise` fields are
 * amounts shown in rupees; in the message they are referred to without the suffix
 * (`cutoffAt` → {cutoff}, `pricePaise` → {price}).
 */
export type NotificationParams = {
  ROUND_OPENED: { round: string; cutoffAt: string };
  TIER_UNLOCKED: { item: string; pricePaise: number };
  CUTOFF_REMINDER: { round: string; cutoffAt: string };
  ROUND_FINALIZED: { round: string };
  REFUND_CREDITED: { amountPaise: number; reason: RefundReason; round?: string };
  VISIT_SCHEDULED: { service: string; startsAt: string; code: string };
  TECHNICIAN_ON_THE_WAY: { service: string; technician: string };
  VISIT_COMPLETED: { service: string };
  VISIT_NO_ACCESS: { refundPaise: number; feePaise: number };
  POLL_THRESHOLD: { poll: string; votes: number };
  POLL_SUGGESTION: { poll: string; by: string };
  SLOT_HELD: { service: string; startsAt: string; expiresAt: string };
  SLOT_AUTO_BOOKED: { service: string; startsAt: string; amountPaise: number };
  ISSUE_UPDATE: { service: string; status: IssueStatus };
  VENDOR_ORDER: { round: string; community: string };
  /** To a community's Society Managers: someone asked to join. `flat` is e.g. "Flat A-101". */
  JOIN_REQUEST: { name: string; flat: string };
  JOIN_DECIDED: { community: string; decision: Decision };
  COMMUNITY_DECIDED: { community: string; decision: Decision };
  VENDOR_DECIDED: { vendor: string; decision: Decision };
  /** To platform admins. */
  COMMUNITY_REGISTERED: { community: string; city: string };
  VENDOR_REGISTERED: { vendor: string; city: string };
};

export type NotificationMessage<T extends NotificationType = NotificationType> = {
  type: T;
  params: NotificationParams[T];
  /** Same-site path the notification opens. */
  href?: string;
};

function messageVars(params: Record<string, unknown>): Record<string, string | number> {
  const vars: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key.endsWith("At") && typeof value === "string") {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) vars[key.slice(0, -2)] = formatIST(date);
    } else if (key.endsWith("Paise") && typeof value === "number" && Number.isSafeInteger(value)) {
      vars[key.slice(0, -5)] = formatINR(value);
    } else if (typeof value === "string" || typeof value === "number") {
      vars[key] = value;
    }
  }
  return vars;
}

function isKnownType(type: string): type is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(type);
}

/** Title and body for a stored notification. Unknown or malformed params degrade to visible placeholders. */
export function renderNotification(type: string, params: unknown): { title: string; body: string } {
  if (!isKnownType(type)) return { title: t("notifications.title"), body: "" };
  const raw = params && typeof params === "object" && !Array.isArray(params) ? (params as Record<string, unknown>) : {};
  const vars = messageVars(raw);

  if (type === "REFUND_CREDITED" && typeof raw.reason === "string") {
    vars.reason = t(`notifications.refundReasons.${raw.reason}` as MessageKey, vars);
  }
  if (type === "ISSUE_UPDATE" && typeof raw.status === "string") {
    vars.status = t(`notifications.issueStatus.${raw.status}` as MessageKey);
  }
  if ((type === "JOIN_DECIDED" || type === "COMMUNITY_DECIDED" || type === "VENDOR_DECIDED") && (raw.decision === "APPROVED" || raw.decision === "REJECTED")) {
    return {
      title: t(`notifications.types.${type}.${raw.decision}.title`, vars),
      body: t(`notifications.types.${type}.${raw.decision}.body`, vars),
    };
  }
  return {
    title: t(`notifications.types.${type}.title`, vars),
    body: t(`notifications.types.${type}.body`, vars),
  };
}

/** Only same-site paths are followed; anything else opens the notification centre. */
export function safeNotificationHref(href: string | null | undefined): string {
  if (!href || !href.startsWith("/") || href.startsWith("//") || href.includes("\\")) return "/app/notifications";
  return href;
}

const MINUTE = 60_000;

/** "Just now", "12 min ago", "3 h ago", "Yesterday", then the date. */
export function relativeTime(date: Date, now: Date): string {
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < MINUTE) return t("time.justNow");
  if (elapsed < 60 * MINUTE) return t("time.minutesAgo", { n: Math.floor(elapsed / MINUTE) });
  if (elapsed < 24 * 60 * MINUTE) return t("time.hoursAgo", { n: Math.floor(elapsed / (60 * MINUTE)) });
  if (elapsed < 48 * 60 * MINUTE) return t("time.yesterday");
  return formatIST(date, "date");
}

/** Dedupe keys: the same key for the same user is stored once, so retries never double-notify. */
export const notificationKeys = {
  roundOpened: (roundId: string) => `ROUND_OPENED:${roundId}`,
  tierUnlocked: (roundId: string, tierGroupKey: string, minQty: number) => `TIER_UNLOCKED:${roundId}:${tierGroupKey}:${minQty}`,
  cutoffReminder: (roundId: string) => `CUTOFF_REMINDER:${roundId}`,
  roundFinalized: (roundId: string) => `ROUND_FINALIZED:${roundId}`,
  /** Reuses the wallet transaction's idempotency key. */
  refund: (walletIdempotencyKey: string) => `REFUND:${walletIdempotencyKey}`,
  visit: (visitId: string, status: string) => `VISIT:${visitId}:${status}`,
  pollThreshold: (pollId: string) => `POLL_THRESHOLD:${pollId}`,
  pollSuggestion: (pollId: string) => `POLL_SUGGESTION:${pollId}`,
  slotHeld: (bookingId: string) => `SLOT_HELD:${bookingId}`,
  slotAutoBooked: (bookingId: string) => `SLOT_AUTO_BOOKED:${bookingId}`,
  issue: (issueId: string, status: string) => `ISSUE:${issueId}:${status}`,
  vendorOrder: (vendorOrderId: string) => `VENDOR_ORDER:${vendorOrderId}`,
  joinRequest: (requestId: string) => `JOIN_REQUEST:${requestId}`,
  joinDecided: (requestId: string) => `JOIN_DECIDED:${requestId}`,
  communityDecided: (communityId: string, decision: Decision) => `COMMUNITY_DECIDED:${communityId}:${decision}`,
  vendorDecided: (vendorId: string, decision: Decision) => `VENDOR_DECIDED:${vendorId}:${decision}`,
  communityRegistered: (communityId: string) => `COMMUNITY_REGISTERED:${communityId}`,
  vendorRegistered: (vendorId: string) => `VENDOR_REGISTERED:${vendorId}`,
};
