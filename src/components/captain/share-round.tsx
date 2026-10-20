"use client";

import { Link2, MessageCircle } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { t } from "@/i18n";

/** WhatsApp share (a plain link, works without JavaScript) and copy-the-invite-link. */
export function ShareRound({ whatsappHref, inviteUrl }: { whatsappHref: string; inviteUrl: string }) {
  const toast = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast({ tone: "success", title: t("share.copied") });
    } catch {
      window.prompt(t("share.copy"), inviteUrl);
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "accent", size: "sm" })}>
        <MessageCircle aria-hidden className="size-4" />
        {t("share.whatsapp")}
      </a>
      <Button type="button" variant="secondary" size="sm" icon={<Link2 aria-hidden className="size-4" />} onClick={copy}>
        {t("share.copy")}
      </Button>
    </div>
  );
}
