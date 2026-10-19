import { Bell, CalendarClock, CircleAlert, CircleCheck, Info, PiggyBank, Plus, Search, ShoppingBasket, TriangleAlert, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PublicShell } from "@/components/shell/shells";
import { ThemeToggle } from "@/components/theme";
import { Badge, Chip } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Banner, EmptyState, ListRow, Price, Stat } from "@/components/ui/display";
import { Field, Input, SegmentedControl, Select, Switch, Textarea } from "@/components/ui/form";
import { ProgressBar, TierMeter } from "@/components/ui/progress";
import { Sheet } from "@/components/ui/sheet";
import { ListSkeleton, Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { getEnv } from "@/lib/env";
import { computeMeter } from "@/lib/pricing/meter";
import { CountdownDemo, FeedbackDemo, StepperDemo, TabsDemo } from "./demos";

export const metadata: Metadata = { title: t("design.title") };

const rice = {
  tiers: [
    { minQty: 1, supplierPricePaise: 46232 },
    { minQty: 20, supplierPricePaise: 42996 },
    { minQty: 50, supplierPricePaise: 40684 },
  ],
  marginBps: 300,
  gstBps: 500,
  minOrderQty: 10,
  mrpPaise: 55000,
};
const acService = {
  tiers: [
    { minQty: 1, supplierPricePaise: 56000 },
    { minQty: 5, supplierPricePaise: 44000 },
    { minQty: 20, supplierPricePaise: 32000 },
  ],
  marginBps: 300,
  gstBps: 1800,
  minOrderQty: 5,
  mrpPaise: 79900,
};
const bags = { one: "bag", other: "bags" };
const flats = { one: "flat", other: "flats" };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

const SWATCHES = ["bg", "surface", "surface-2", "border", "fg", "muted", "brand", "brand-soft", "accent", "accent-soft", "success", "warning", "danger"];

/** Living style guide. Available in development and demo deployments only. */
export default function DesignPage() {
  if (process.env.NODE_ENV === "production" && !getEnv().DEMO_MODE) notFound();
  return (
    <PublicShell wide>
      <PageHeader title={t("design.title")} subtitle={t("design.intro")} />
      <div className="space-y-10">
        <Section title="Theme">
          <div className="max-w-sm">
            <ThemeToggle />
          </div>
        </Section>

        <Section title="Colour tokens">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-7">
            {SWATCHES.map((name) => (
              <div key={name} className="text-xs">
                <div className="h-12 rounded-control border border-border" style={{ background: `var(--${name})` }} />
                <p className="mt-1 text-muted">{name}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type scale">
          <div className="space-y-1">
            <p className="text-2xl font-semibold tracking-tight">Page title · 2xl</p>
            <p className="text-xl font-semibold">Section heading · xl</p>
            <p className="text-base">Body text · base. Neighbours pool orders and everyone pays less.</p>
            <p className="text-sm text-muted">Secondary text · sm muted</p>
            <p className="text-xs text-subtle">Caption · xs subtle</p>
          </div>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap gap-2">
            <Button type="button">Primary</Button>
            <Button type="button" variant="secondary">
              Secondary
            </Button>
            <Button type="button" variant="ghost">
              Ghost
            </Button>
            <Button type="button" variant="accent">
              Accent
            </Button>
            <Button type="button" variant="danger">
              Danger
            </Button>
            <Button type="button" loading>
              Saving
            </Button>
            <Button type="button" disabled>
              Disabled
            </Button>
            <Button type="button" icon={<Plus aria-hidden className="size-4" />}>
              With icon
            </Button>
            <IconButton label="Search">
              <Search aria-hidden className="size-5" />
            </IconButton>
          </div>
        </Section>

        <Section title="Form controls">
          <Card className="grid gap-4 md:grid-cols-2">
            <Field id="d-name" label="Your name" hint="As your neighbours know you.">
              {(aria) => <Input {...aria} placeholder="Asha Patil" />}
            </Field>
            <Field id="d-phone" label="Mobile number" error="Enter a valid 10-digit Indian mobile number.">
              {(aria) => <Input {...aria} defaultValue="12345" />}
            </Field>
            <Field id="d-tower" label="Tower / wing">
              {(aria) => (
                <Select {...aria} defaultValue="B">
                  <option>A</option>
                  <option>B</option>
                </Select>
              )}
            </Field>
            <Field id="d-note" label="Note for the technician">
              {(aria) => <Textarea {...aria} placeholder="Two split ACs in the bedrooms" />}
            </Field>
            <Switch label="Keep my slot every week" defaultChecked />
            <SegmentedControl
              name="d-bhk"
              label="Home size"
              defaultValue="2"
              options={[
                { value: "1", label: "1 BHK" },
                { value: "2", label: "2 BHK" },
                { value: "3", label: "3 BHK" },
              ]}
            />
          </Card>
        </Section>

        <Section title="Badges and chips">
          <div className="flex flex-wrap gap-2">
            <Badge>Neutral</Badge>
            <Badge tone="brand">Open</Badge>
            <Badge tone="accent">Tier unlocked</Badge>
            <Badge tone="success" icon={<CircleCheck aria-hidden className="size-3.5" />}>
              Verified
            </Badge>
            <Badge tone="warning">Cutoff soon</Badge>
            <Badge tone="danger">Slot full</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip selected>All</Chip>
            <Chip>Dals & pulses</Chip>
            <Chip>Oils & ghee</Chip>
          </div>
        </Section>

        <Section title="Tier meters">
          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardHeader title="Chakki Fresh Atta · 10 kg" subtitle="Below the supplier minimum" />
              <TierMeter meter={computeMeter(rice, 6)} basisWords={bags} />
            </Card>
            <Card>
              <CardHeader title="Sona Masoori Rice · 5 kg" action={<Price paise={46500} mrpPaise={55000} />} />
              <TierMeter meter={computeMeter(rice, 41)} basisWords={bags} />
            </Card>
            <Card>
              <CardHeader title="Toor Dal · 1 kg" subtitle="Best price reached" />
              <TierMeter meter={computeMeter(rice, 57)} basisWords={bags} />
            </Card>
            <Card>
              <CardHeader title="AC servicing · per unit" subtitle="Tiers by flats booked" />
              <TierMeter meter={computeMeter(acService, 14)} basisWords={flats} />
            </Card>
          </div>
          <ProgressBar value={35} label="Example progress" />
        </Section>

        <Section title="Stats, rows and banners">
          <Card className="grid gap-4 sm:grid-cols-3">
            <Stat label="Saved this month" value="₹1,240" icon={<PiggyBank aria-hidden className="size-5" />} tone="accent" />
            <Stat label="Wallet" value="₹312" icon={<Wallet aria-hidden className="size-5" />} tone="brand" />
            <Stat label="Next visit" value="Sat 10 am" hint="AC servicing" icon={<CalendarClock aria-hidden className="size-5" />} />
          </Card>
          <div className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
            <ListRow href="#" icon={<ShoppingBasket aria-hidden className="size-5" />} title="This week's group drive" subtitle="26 products · closes Fri 8 pm" />
            <ListRow icon={<Bell aria-hidden className="size-5" />} title="Refund credited" subtitle="₹70 for Sona Masoori Rice" trailing={<Badge tone="success">+₹70</Badge>} />
          </div>
          <div className="space-y-2">
            <Banner icon={<Info aria-hidden className="size-4" />} title="Changes close Fri 8 am">
              You can still add items until 8 pm.
            </Banner>
            <Banner tone="accent" icon={<PiggyBank aria-hidden className="size-4" />}>
              ₹25 per bag comes back to your wallet if the society stays at 50+.
            </Banner>
            <Banner tone="success" icon={<CircleCheck aria-hidden className="size-4" />}>
              Visit completed. Rate your technician.
            </Banner>
            <Banner tone="warning" icon={<TriangleAlert aria-hidden className="size-4" />}>
              Needs 2 more flats to start.
            </Banner>
            <Banner tone="danger" icon={<CircleAlert aria-hidden className="size-4" />}>
              That slot just filled up.
            </Banner>
          </div>
        </Section>

        <Section title="Quantity stepper">
          <StepperDemo />
        </Section>

        <Section title="Countdowns">
          <CountdownDemo />
        </Section>

        <Section title="Toasts and celebration">
          <FeedbackDemo />
        </Section>

        <Section title="Tabs and sheet">
          <Card>
            <TabsDemo />
          </Card>
          <Sheet title="Choose a slot" trigger={<span className="px-4 text-sm font-medium text-brand">Open sheet</span>} triggerClassName="border border-border">
            <p className="text-sm text-muted">Sheets slide up from the bottom on phones and appear centred on larger screens.</p>
          </Sheet>
        </Section>

        <Section title="Empty and loading states">
          <EmptyState icon={<ShoppingBasket aria-hidden className="size-6" />} title="No group orders are open right now" body="When your captain opens a round, live prices show up here." action={<Button type="button" size="sm">Suggest a product</Button>} />
          <Skeleton className="h-6 w-1/3" />
          <ListSkeleton rows={2} />
        </Section>
      </div>
    </PublicShell>
  );
}
