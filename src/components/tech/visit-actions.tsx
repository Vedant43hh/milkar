import { CheckCircle2, DoorClosed, Hourglass, KeyRound, Navigation, PackagePlus, Play } from "lucide-react";
import type { ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { buttonClasses } from "@/components/ui/button";
import { Banner } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { messages, t } from "@/i18n";
import { moveVisitAction } from "@/server/actions/tech";
import type { TechnicianVisitDetail } from "@/server/technician";
import { PartsForm } from "./parts-form";

function Step({ visitId, to, label, icon, variant = "primary" }: { visitId: string; to: string; label: string; icon: ReactNode; variant?: "primary" | "secondary" }) {
  return (
    <ActionForm action={moveVisitAction} className="flex-1">
      <input type="hidden" name="visitId" value={visitId} />
      <input type="hidden" name="to" value={to} />
      <SubmitButton block size="lg" variant={variant} icon={icon}>
        {label}
      </SubmitButton>
    </ActionForm>
  );
}

/**
 * The next thing to do, as big buttons at the bottom of the screen: on my way, start, then parts
 * and the resident's code. Only what fits the visit's state is offered; the server checks again.
 */
export function VisitActions({ visit }: { visit: TechnicianVisitDetail }) {
  const big = buttonClasses({ size: "lg", block: true });
  const bigSecondary = buttonClasses({ size: "lg", block: true, variant: "secondary" });

  if (visit.status === "SCHEDULED") {
    return <Step visitId={visit.id} to="ON_THE_WAY" label={t("techVisit.onTheWay")} icon={<Navigation aria-hidden className="size-5" />} />;
  }

  if (visit.status === "ON_THE_WAY") {
    return (
      <div className="flex gap-2">
        <Sheet
          title={t("techVisit.noAccessTitle")}
          trigger={
            <>
              <DoorClosed aria-hidden className="size-5" />
              {t("techVisit.noAccess")}
            </>
          }
          triggerClassName={`${bigSecondary} flex-1`}
        >
          <ActionForm action={moveVisitAction} className="space-y-4">
            <p className="text-sm text-muted">{t("techVisit.noAccessBody")}</p>
            <input type="hidden" name="visitId" value={visit.id} />
            <input type="hidden" name="to" value="NO_ACCESS" />
            <SubmitButton block variant="danger">
              {t("techVisit.noAccessConfirm")}
            </SubmitButton>
          </ActionForm>
        </Sheet>
        <Step visitId={visit.id} to="IN_PROGRESS" label={t("techVisit.start")} icon={<Play aria-hidden className="size-5" />} />
      </div>
    );
  }

  if (visit.status !== "IN_PROGRESS") return <Banner tone="success" icon={<CheckCircle2 aria-hidden className="size-4" />}>{t("techVisit.finished")}</Banner>;

  if (visit.actions.waiting) {
    return (
      <Banner tone="accent" role="status" icon={<Hourglass aria-hidden className="size-4" />}>
        {t("techVisit.waiting")}
      </Banner>
    );
  }

  const parts = messages().techVisit.parts;
  const locked = visit.codeAttemptsLeft === 0;
  return (
    <div className="flex gap-2">
      <Sheet
        title={parts.title}
        trigger={
          <>
            <PackagePlus aria-hidden className="size-5" />
            {t("techVisit.addParts")}
          </>
        }
        triggerClassName={`${bigSecondary} flex-1`}
      >
        <PartsForm
          visitId={visit.id}
          text={{ intro: parts.intro, name: parts.name, namePlaceholder: parts.namePlaceholder, qty: parts.qty, price: parts.price, addRow: parts.addRow, removeRow: parts.removeRow, total: parts.total, send: parts.send }}
        />
      </Sheet>
      <Sheet
        title={t("techVisit.codeTitle")}
        trigger={
          <>
            <KeyRound aria-hidden className="size-5" />
            {t("techVisit.enterCode")}
          </>
        }
        triggerClassName={`${big} flex-1`}
      >
        {locked ? (
          <Banner tone="danger">{t("techVisit.codeLocked")}</Banner>
        ) : (
          <ActionForm action={moveVisitAction} className="space-y-4">
            <p className="text-sm text-muted">{t("techVisit.codeBody")}</p>
            <input type="hidden" name="visitId" value={visit.id} />
            <input type="hidden" name="to" value="COMPLETED" />
            <Field id={`code-${visit.id}`} label={t("techVisit.codeLabel")} hint={t("techVisit.codeAttempts", { n: visit.codeAttemptsLeft })}>
              {(aria) => (
                <Input {...aria} name="code" required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="one-time-code" className="text-center text-2xl tracking-[0.5em] tabular-nums" />
              )}
            </Field>
            <SubmitButton block size="lg" icon={<CheckCircle2 aria-hidden className="size-5" />}>
              {t("techVisit.finish")}
            </SubmitButton>
          </ActionForm>
        )}
      </Sheet>
    </div>
  );
}
