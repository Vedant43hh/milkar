import { KeyRound, LogIn } from "lucide-react";
import { PublicShell } from "@/components/shell/public-shell";
import { ButtonLink } from "@/components/ui/button";
import { t } from "@/i18n";

// The public landing page. Static; the full explainer and price simulator arrive with registration.
export default function LandingPage() {
  return (
    <PublicShell wide>
      <section className="mx-auto max-w-2xl space-y-6 py-10 text-center md:py-16">
        <h1 className="text-3xl font-bold tracking-tight text-balance text-fg md:text-5xl">{t("landing.headline")}</h1>
        <p className="text-lg text-pretty text-muted">{t("landing.intro")}</p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink href="/login" size="lg" icon={<LogIn aria-hidden className="size-5" />}>
            {t("landing.login")}
          </ButtonLink>
          <ButtonLink href="/join" size="lg" variant="secondary" icon={<KeyRound aria-hidden className="size-5" />}>
            {t("landing.join")}
          </ButtonLink>
        </div>
      </section>
    </PublicShell>
  );
}
