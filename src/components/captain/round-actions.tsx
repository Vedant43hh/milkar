import { Ban, CalendarPlus, Lock } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { buttonClasses } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { t } from "@/i18n";
import { cancelRoundAction, closeRoundAction, extendCutoffAction } from "@/server/actions/captain";

/** Extend, close early and cancel. Each runs on the server under the round lock. */
export function RoundActions({ roundId, takingOrders, extendTo }: { roundId: string; takingOrders: boolean; extendTo: string }) {
  const roundField = <input type="hidden" name="roundId" value={roundId} />;
  return (
    <div className="flex flex-wrap gap-2">
      {takingOrders && (
        <>
          <Sheet
            title={t("captain.actions.extendTitle")}
            trigger={
              <>
                <CalendarPlus aria-hidden className="size-4" />
                {t("captain.actions.extend")}
              </>
            }
            triggerClassName={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            <ActionForm action={extendCutoffAction} className="space-y-4">
              {roundField}
              <Field id="extend-cutoff" label={t("captain.actions.extendLabel")}>
                {(aria) => <Input {...aria} type="datetime-local" name="cutoffAt" required defaultValue={extendTo} />}
              </Field>
              <SubmitButton block>{t("captain.actions.extendSubmit")}</SubmitButton>
            </ActionForm>
          </Sheet>
          <Sheet
            title={t("captain.actions.closeNowTitle")}
            trigger={
              <>
                <Lock aria-hidden className="size-4" />
                {t("captain.actions.closeNow")}
              </>
            }
            triggerClassName={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            <ActionForm action={closeRoundAction} className="space-y-4">
              {roundField}
              <p className="text-sm text-muted">{t("captain.actions.closeNowBody")}</p>
              <SubmitButton block>{t("captain.actions.closeNowSubmit")}</SubmitButton>
            </ActionForm>
          </Sheet>
        </>
      )}
      <Sheet
        title={t("captain.actions.cancelTitle")}
        trigger={
          <>
            <Ban aria-hidden className="size-4" />
            {t("captain.actions.cancel")}
          </>
        }
        triggerClassName={buttonClasses({ variant: "dangerGhost", size: "sm" })}
      >
        <ActionForm action={cancelRoundAction} className="space-y-4">
          {roundField}
          <p className="text-sm text-muted">{t("captain.actions.cancelBody")}</p>
          <Field id="cancel-reason" label={t("captain.actions.cancelReason")}>
            {(aria) => <Textarea {...aria} name="reason" maxLength={200} placeholder={t("captain.actions.cancelReasonPlaceholder")} />}
          </Field>
          <SubmitButton block variant="danger">
            {t("captain.actions.cancelSubmit")}
          </SubmitButton>
        </ActionForm>
      </Sheet>
    </div>
  );
}
