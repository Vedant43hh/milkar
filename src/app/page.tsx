import { ArrowRight, Building2, Megaphone, PackageCheck, Repeat, ShoppingBasket, Sparkles, Store, Truck, UserRound, Wrench, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DeliverIllustration, JoinIllustration, OpenIllustration } from "@/components/landing/illustrations";
import { PriceSimulator } from "@/components/landing/simulator";
import { PublicShell } from "@/components/shell/public-shell";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { messages, t } from "@/i18n";
import { BUY_CATEGORIES, type BuyCategory } from "@/lib/categories";

export const metadata: Metadata = { title: { absolute: `${t("app.name")}: ${t("landing.title")}` } };

const STEP_ART = [OpenIllustration, JoinIllustration, DeliverIllustration];
const WHY_ICONS: LucideIcon[] = [PackageCheck, Truck, Megaphone];
const CATEGORY_ICONS: Record<BuyCategory, { icon: LucideIcon; tint: string }> = {
  GROCERIES: { icon: ShoppingBasket, tint: "bg-success-soft text-success" },
  HOME_SERVICES: { icon: Sparkles, tint: "bg-brand-soft text-brand-soft-fg" },
  REPAIRS: { icon: Wrench, tint: "bg-warning-soft text-warning" },
  SUBSCRIPTIONS: { icon: Repeat, tint: "bg-accent-soft text-accent-soft-fg" },
};
const ROLES: { role: "RESIDENT" | "MANAGER" | "VENDOR"; slug: string; icon: LucideIcon; portal: string }[] = [
  { role: "RESIDENT", slug: "resident", icon: UserRound, portal: "app" },
  { role: "MANAGER", slug: "manager", icon: Building2, portal: "manager" },
  { role: "VENDOR", slug: "vendor", icon: Store, portal: "vendor" },
];

// The public landing page: the idea in under 30 seconds. Static; the simulator is the only script.
export default function LandingPage() {
  const text = messages().landing;
  return (
    <PublicShell wide>
      <div className="space-y-16 md:space-y-24">
        <section className="mx-auto max-w-2xl space-y-6 pt-4 text-center md:pt-10">
          <h1 className="text-3xl font-bold tracking-tight text-balance text-fg md:text-5xl">{text.headline}</h1>
          <p className="text-lg text-pretty text-muted">{text.intro}</p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href="/welcome" size="lg" icon={<ArrowRight aria-hidden className="size-5" />}>
              {text.getStarted}
            </ButtonLink>
            <ButtonLink href="/login" size="lg" variant="secondary">
              {text.login}
            </ButtonLink>
          </div>
        </section>

        <section aria-labelledby="how" className="space-y-6">
          <h2 id="how" className="text-center text-2xl font-semibold tracking-tight text-fg">
            {text.howTitle}
          </h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {text.steps.map((step, i) => {
              const Art = STEP_ART[i];
              return (
                <li key={step.title} className="space-y-3 rounded-card border border-border bg-surface p-5 shadow-card">
                  <Art />
                  <p className="flex items-center gap-2 font-semibold text-fg">
                    <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm text-brand-fg">
                      {i + 1}
                    </span>
                    {step.title}
                  </p>
                  <p className="text-sm text-muted">{step.body}</p>
                </li>
              );
            })}
          </ol>
        </section>

        <section aria-labelledby="simulator" className="mx-auto max-w-3xl space-y-4">
          <div className="space-y-1 text-center">
            <h2 id="simulator" className="text-2xl font-semibold tracking-tight text-fg">
              {text.sim.title}
            </h2>
            <p className="text-muted">{text.sim.intro}</p>
          </div>
          <PriceSimulator text={text.sim} />
        </section>

        <section aria-labelledby="why" className="space-y-6">
          <h2 id="why" className="text-center text-2xl font-semibold tracking-tight text-fg">
            {text.whyTitle}
          </h2>
          <div className="grid gap-3 rounded-card border border-border bg-surface p-5 shadow-card sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted">{text.without}</p>
              <p aria-hidden className="flex flex-wrap gap-1 text-subtle">
                {Array.from({ length: 18 }, (_, i) => (
                  <Truck key={i} className="size-5" />
                ))}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-brand">{text.with}</p>
              <p aria-hidden className="text-brand">
                <Truck className="size-12" />
              </p>
            </div>
          </div>
          <ul className="grid gap-4 md:grid-cols-3">
            {text.why.map((reason, i) => {
              const Icon = WHY_ICONS[i];
              return (
                <li key={reason.title} className="flex gap-3 rounded-card border border-border bg-surface p-4 shadow-card">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-fg">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <span className="space-y-1">
                    <span className="block font-semibold text-fg">{reason.title}</span>
                    <span className="block text-sm text-muted">{reason.body}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="categories" className="space-y-6">
          <h2 id="categories" className="text-center text-2xl font-semibold tracking-tight text-fg">
            {text.categoriesTitle}
          </h2>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {BUY_CATEGORIES.map((category) => {
              const { icon: Icon, tint } = CATEGORY_ICONS[category];
              return (
                <li key={category} className="space-y-2 rounded-card border border-border bg-surface p-4 shadow-card">
                  <span className={cn("flex size-11 items-center justify-center rounded-2xl", tint)}>
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <span className="block font-semibold text-fg">{t(`buys.categories.${category}.name`)}</span>
                  <span className="block text-sm text-muted">{t(`buys.categories.${category}.body`)}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="roles" className="space-y-6 pb-6">
          <h2 id="roles" className="text-center text-2xl font-semibold tracking-tight text-fg">
            {text.rolesTitle}
          </h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {ROLES.map(({ role, slug, icon: Icon, portal }) => (
              <li key={role} data-portal={portal}>
                <Link
                  href={`/register?role=${slug}`}
                  className="group flex h-full flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-card transition-colors hover:border-brand"
                >
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-fg">
                    <Icon aria-hidden className="size-6" />
                  </span>
                  <span className="text-lg font-semibold text-fg">{t(`register.roles.${role}.title`)}</span>
                  <span className="flex-1 text-sm text-muted">{t(`register.roles.${role}.body`)}</span>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
                    {t(`register.roles.${role}.cta`)}
                    <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="flex items-center justify-center gap-2 text-center text-sm text-muted">
            <Wrench aria-hidden className="size-4" />
            {text.technicianNote}
          </p>
        </section>
      </div>
    </PublicShell>
  );
}
