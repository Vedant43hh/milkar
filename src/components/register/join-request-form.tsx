"use client";

import { Send } from "lucide-react";
import { useState } from "react";
import type { Messages } from "@/i18n";
import { requestJoinAction } from "@/server/actions/join";
import type { JoinCommunity } from "@/server/registration";
import { ActionForm, SubmitButton } from "../ui/action-form";
import { CommunityFinder, FlatChooser } from "./community-picker";

/** For a resident account without a flat: choose a community and a home, and ask to join. */
export function JoinRequestForm({ text, submitLabel, initial }: { text: Messages["register"]; submitLabel: string; initial: JoinCommunity | null }) {
  const [community, setCommunity] = useState<JoinCommunity | null>(initial);
  return (
    <ActionForm action={requestJoinAction} className="space-y-4">
      <CommunityFinder text={text} chosen={community} onChoose={setCommunity} />
      {community && (
        <>
          <FlatChooser key={community.id} text={text} community={community} />
          <SubmitButton block icon={<Send aria-hidden className="size-4" />}>
            {submitLabel}
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
