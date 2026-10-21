import { Ban, CalendarPlus, Lock } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { buttonClasses } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { t } from "@/i18n";
import { cancelRoundAction, closeRoundAction, extendCutoffAction } from "@/server/actions/manager";

/** Extend, close early and cancel. Each runs on the server under the round lock. */
export function RoundActions({ roundId, takingOrders, extendTo }: { roundId: string; takingOrders: boolean; extendTo: string }) {
  const roundField = <input type="hidden" name="roundId" value={roundId} />;
  return (
    <div className="flex flex-wrap gap-2">
      {takingOrders && (
        <>
          <Sheet
            title={t("manager.actions.extendTitle")}
            trigger={
              <>
                <CalendarPlus aria-hidden className="size-4" />
                {t("manager.actions.extend")}
              </>
            }
            triggerClassName={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            <ActionForm action={extendCutoffAction} className="space-y-4">
              {roundField}
              <Field id="extend-cutoff" label={t("manager.actions.extendLabel")}>
                {(aria) => <Input {...aria} type="datetime-local" name="cutoffAt" required defaultValue={extendTo} />}
              </Field>
              <SubmitButton block>{t("manager.actions.extendSubmit")}</SubmitButton>
            </ActionForm>
          </Sheet>
          <Sheet
            title={t("manager.actions.closeNowTitle")}
            trigger={
              <>
                <Lock aria-hidden className="size-4" />
                {t("manager.actions.closeNow")}
              </>
            }
            triggerClassName={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            <ActionForm action={closeRoundAction} className="space-y-4">
              {roundField}
              <p className="text-sm text-muted">{t("manager.actions.closeNowBody")}</p>
              <SubmitButton block>{t("manager.actions.closeNowSubmit")}</SubmitButton>
            </ActionForm>
          </Sheet>
        </>
      )}
      <Sheet
        title={t("manager.actions.cancelTitle")}
        trigger={
          <>
            <Ban aria-hidden className="size-4" />
            {t("manager.actions.cancel")}
          </>
        }
        triggerClassName={buttonClasses({ variant: "dangerGhost", size: "sm" })}
      >
        <ActionForm action={cancelRoundAction} className="space-y-4">
          {roundField}
          <p className="text-sm text-muted">{t("manager.actions.cancelBody")}</p>
          <Field id="cancel-reason" label={t("manager.actions.cancelReason")}>
            {(aria) => <Textarea {...aria} name="reason" maxLength={200} placeholder={t("manager.actions.cancelReasonPlaceholder")} />}
          </Field>
          <SubmitButton block variant="danger">
            {t("manager.actions.cancelSubmit")}
          </SubmitButton>
        </ActionForm>
      </Sheet>
    </div>
  );
}
