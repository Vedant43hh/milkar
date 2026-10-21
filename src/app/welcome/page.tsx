import { ArrowRight, LogIn, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PublicShell } from "@/components/shell/public-shell";
import { ButtonLink } from "@/components/ui/button";
import { t } from "@/i18n";
import { getCurrentUser } from "@/lib/auth/current-user";
import { homePathFor } from "@/lib/auth/rules";

export const metadata: Metadata = { title: t("welcome.title") };

const CHOICES = [
  { href: "/register", icon: UserPlus, title: "welcome.newTitle", body: "welcome.newBody", cta: "welcome.newCta", primary: true },
  { href: "/login", icon: LogIn, title: "welcome.existingTitle", body: "welcome.existingBody", cta: "welcome.existingCta", primary: false },
] as const;

/** One screen, two clear choices: register (new) or log in (existing account). */
export default function WelcomePage() {
  return (
    <PublicShell>
      <div className="space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{t("welcome.heading")}</h1>
          <p className="text-muted">{t("welcome.intro")}</p>
        </div>
        <Suspense fallback={null}>
          <SignedIn />
        </Suspense>
        <ul className="space-y-3">
          {CHOICES.map(({ href, icon: Icon, title, body, cta, primary }) => (
            <li key={href}>
              <Link
                href={href}
                className={
                  primary
                    ? "group flex items-center gap-4 rounded-card border-2 border-brand bg-brand-soft p-5 transition-colors hover:bg-brand-soft/70"
                    : "group flex items-center gap-4 rounded-card border border-border bg-surface p-5 shadow-card transition-colors hover:border-brand/60"
                }
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-surface text-brand shadow-card">
                  <Icon aria-hidden className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold text-fg">{t(title)}</span>
                  <span className="block text-sm text-muted">{t(body)}</span>
                  <span className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-brand">
                    {t(cta)}
                    <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </PublicShell>
  );
}

async function SignedIn() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <ButtonLink href={homePathFor(user)} block icon={<ArrowRight aria-hidden className="size-4" />}>
      {t("portals.goToMine")}
    </ButtonLink>
  );
}
