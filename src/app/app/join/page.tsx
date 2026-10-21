import { Ban, Hourglass, Undo2 } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { JoinRequestForm } from "@/components/register/join-request-form";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { messages, t } from "@/i18n";
import { requirePortalUser } from "@/lib/auth/current-user";
import { cancelJoinAction } from "@/server/actions/join";
import { communityForJoining, latestJoinRequest } from "@/server/registration";

export const metadata: Metadata = { title: t("joinRequest.title") };

export default function JoinRequestPage({ searchParams }: PageProps<"/app/join">) {
  return (
    <Suspense fallback={<PageSkeleton cards={1} />}>
      <JoinStatus searchParams={searchParams} />
    </Suspense>
  );
}

/** A resident account without a flat: waiting for approval, declined, or not asked yet. */
async function JoinStatus({ searchParams }: { searchParams: PageProps<"/app/join">["searchParams"] }) {
  const user = await requirePortalUser("app");
  if (user.flat) redirect("/app");
  const [params, request] = await Promise.all([searchParams, latestJoinRequest(user.id)]);
  const code = typeof params.code === "string" ? params.code : "";

  if (request?.status === "PENDING") {
    return (
      <>
        <PageHeader title={t("joinRequest.title")} />
        <EmptyState
          icon={<Hourglass aria-hidden className="size-6" />}
          title={t("joinRequest.pendingTitle")}
          body={t("joinRequest.pendingBody", { community: request.community.name, unit: request.community.unitLabel, flat: `${request.flat.tower}-${request.flat.number}` })}
          action={
            <ActionForm action={cancelJoinAction}>
              <SubmitButton variant="secondary" size="sm" icon={<Undo2 aria-hidden className="size-4" />}>
                {t("joinRequest.cancel")}
              </SubmitButton>
            </ActionForm>
          }
        />
      </>
    );
  }

  const declined = request?.status === "REJECTED";
  // Asking again starts from the community that declined, unless an invite link says otherwise.
  const initial = code ? await communityForJoining({ code }) : declined && request ? await communityForJoining({ id: request.community.id }) : null;
  return (
    <div className="space-y-4">
      <PageHeader title={t("joinRequest.title")} subtitle={declined ? undefined : t("joinRequest.noneBody")} />
      {declined && request && (
        <EmptyState
          icon={<Ban aria-hidden className="size-6" />}
          title={t("joinRequest.rejectedTitle")}
          body={[
            t("joinRequest.rejectedBody", { community: request.community.name, unit: request.community.unitLabel, flat: `${request.flat.tower}-${request.flat.number}` }),
            request.note ? t("joinRequest.rejectedNote", { note: request.note }) : "",
          ]
            .filter(Boolean)
            .join(" ")}
        />
      )}
      <Card>
        <JoinRequestForm text={messages().register} submitLabel={declined ? t("joinRequest.askAgain") : t("joinRequest.submit")} initial={initial} />
      </Card>
    </div>
  );
}
