import type { VisitStatus } from "@/generated/prisma/client";
import { Badge, type Tone } from "@/components/ui/badge";
import { t } from "@/i18n";

/** One colour per visit status, the same on every staff screen (manager board, vendor schedule, technician). */
const TONE: Record<VisitStatus, Tone> = { SCHEDULED: "neutral", ON_THE_WAY: "brand", IN_PROGRESS: "accent", COMPLETED: "success", NO_ACCESS: "danger", CANCELLED: "neutral" };

export function VisitStatusBadge({ status }: { status: VisitStatus }) {
  return <Badge tone={TONE[status]}>{t(`visitStatus.${status}`)}</Badge>;
}
