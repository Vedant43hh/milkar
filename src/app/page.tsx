import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PriceSimulator } from "@/components/landing/simulator";
import { PublicShell } from "@/components/shell/public-shell";
import { ButtonLink } from "@/components/ui/button";
import { messages, t } from "@/i18n";
import { BUY_CATEGORIES } from "@/lib/categories";

export const metadata: Metadata = { title: { absolute: `${t("app.name")}: ${t("landing.title")}` } };

const ROLES: { role: "RESIDENT" | "MANAGER" | "VENDOR"; slug: string; portal: string }[] = [
  { role: "RESIDENT", slug: "resident", portal: "app" },
  { role: "MANAGER", slug: "manager", portal: "manager" },
  { role: "VENDOR", slug: "vendor", portal: "vendor" },
];

// The public landing page: what Milkar does, in plain words. Static; the simulator is the only script.
export default function LandingPage() {
  const text = messages().landing;
  return (
    <PublicShell wide>
      <div className="space-y-12">
        <section className="max-w-2xl space-y-4 pt-2">
          <h1 className="text-xl font-semibold text-fg">{text.headline}</h1>
          <p className="text-base text-muted">{text.intro}</p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/welcome" icon={<ArrowRight aria-hidden className="size-4" />}>
              {text.getStarted}
            </ButtonLink>
            <ButtonLink href="/login" variant="secondary">
              {text.login}
            </ButtonLink>
          </div>
        </section>

        <section aria-labelledby="how" className="space-y-3">
          <h2 id="how" className="text-base font-semibold text-fg">
            {text.howTitle}
          </h2>
          <ol className="grid gap-3 md:grid-cols-3">
            {text.steps.map((step, i) => (
              <li key={step.title} className="space-y-1 rounded-card border border-border bg-surface p-4">
                <p className="text-sm font-semibold text-fg">
                  {i + 1}. {step.title}
                </p>
                <p className="text-sm text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="simulator" className="max-w-3xl space-y-3">
          <div className="space-y-1">
            <h2 id="simulator" className="text-base font-semibold text-fg">
              {text.sim.title}
            </h2>
            <p className="text-sm text-muted">{text.sim.intro}</p>
          </div>
          <PriceSimulator text={text.sim} />
        </section>

        <section aria-labelledby="why" className="space-y-3">
          <h2 id="why" className="text-base font-semibold text-fg">
            {text.whyTitle}
          </h2>
          <ul className="grid gap-3 md:grid-cols-3">
            {text.why.map((reason) => (
              <li key={reason.title} className="space-y-1 rounded-card border border-border bg-surface p-4">
                <p className="text-sm font-semibold text-fg">{reason.title}</p>
                <p className="text-sm text-muted">{reason.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="categories" className="space-y-3">
          <h2 id="categories" className="text-base font-semibold text-fg">
            {text.categoriesTitle}
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
            {BUY_CATEGORIES.map((category) => (
              <li key={category} className="px-4 py-3">
                <p className="text-sm font-medium text-fg">{t(`buys.categories.${category}.name`)}</p>
                <p className="text-sm text-muted">{t(`buys.categories.${category}.body`)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="roles" className="space-y-3 pb-6">
          <h2 id="roles" className="text-base font-semibold text-fg">
            {text.rolesTitle}
          </h2>
          <ul className="grid gap-3 md:grid-cols-3">
            {ROLES.map(({ role, slug, portal }) => (
              <li key={role} data-portal={portal}>
                <Link
                  href={`/register?role=${slug}`}
                  className="flex h-full flex-col gap-2 rounded-card border border-border bg-surface p-4 transition-colors hover:bg-surface-hover"
                >
                  <span className="text-sm font-semibold text-fg">{t(`register.roles.${role}.title`)}</span>
                  <span className="flex-1 text-sm text-muted">{t(`register.roles.${role}.body`)}</span>
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-accent">
                    {t(`register.roles.${role}.cta`)}
                    <ArrowRight aria-hidden className="size-4" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">{text.technicianNote}</p>
        </section>
      </div>
    </PublicShell>
  );
}
