import { Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/shell/logo";
import { PublicShell } from "@/components/shell/public-shell";
import { Badge, Chip } from "@/components/ui/badge";
import { Button, buttonClasses, IconButton } from "@/components/ui/button";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { ChipScroller } from "@/components/ui/chip-scroller";
import { Banner, EmptyState, List, ListRow, Price, StatCard } from "@/components/ui/display";
import { Field, Input, SegmentedControl, Select, Switch, Textarea } from "@/components/ui/form";
import { NeighbourFlats } from "@/components/ui/neighbours";
import { ProgressBar, TierMeter } from "@/components/ui/progress";
import { Sheet } from "@/components/ui/sheet";
import { ListSkeleton, Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { t } from "@/i18n";
import { getEnv } from "@/lib/env";
import { computeMeter } from "@/lib/pricing/meter";
import { CountdownDemo, FeedbackDemo, StepperDemo, TabsDemo, WizardDemo } from "./demos";

export const metadata: Metadata = { title: t("design.title") };

const rice = {
  tierBasis: "UNITS" as const,
  tiers: [
    { minQty: 1, vendorPricePaise: 46232 },
    { minQty: 20, vendorPricePaise: 42996 },
    { minQty: 50, vendorPricePaise: 40684 },
  ],
  marginBps: 300,
  gstBps: 500,
  minOrderQty: 10,
  mrpPaise: 55000,
};
const acService = {
  tierBasis: "FLATS" as const,
  tiers: [
    { minQty: 1, vendorPricePaise: 57512 },
    { minQty: 5, vendorPricePaise: 45170 },
    { minQty: 20, vendorPricePaise: 32911 },
  ],
  marginBps: 300,
  gstBps: 1800,
  minOrderQty: 5,
  mrpPaise: 89900,
};
const bags = { one: "bag", other: "bags" };
const flats = { one: "flat", other: "flats" };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-fg">{title}</h2>
      {children}
    </section>
  );
}

const SWATCHES = ["bg", "surface", "surface-hover", "border", "border-field", "fg", "muted", "accent", "accent-soft", "success-soft", "warning-soft", "danger-soft", "info-soft"];

/** Living style guide. Available in development and demo deployments only. */
export default function DesignPage() {
  if (process.env.NODE_ENV === "production" && !getEnv().DEMO_MODE) notFound();
  return (
    <PublicShell wide>
      <PageHeader title={t("design.title")} subtitle={t("design.intro")} />
      <div className="space-y-8">
        <Section title="Logo">
          <div className="flex items-center gap-3">
            <LogoMark className="h-10 w-auto" />
            <span className="text-xl font-semibold text-fg">Milkar</span>
          </div>
        </Section>

        <Section title="Colours">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-7">
            {SWATCHES.map((name) => (
              <div key={name} className="text-sm">
                <div className="h-10 rounded-control border border-border" style={{ background: `var(--${name})` }} />
                <p className="mt-1 text-muted">{name}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type">
          <div className="space-y-1">
            <p className="text-xl font-semibold">Page title · xl semibold</p>
            <p className="text-base">Body text · base. Neighbours pool orders and everyone pays less.</p>
            <p className="text-sm text-muted">Secondary text · sm muted</p>
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
            <Field id="d-disabled" label="Disabled field">
              {(aria) => <Input {...aria} disabled defaultValue="Green Meadows CHS" />}
            </Field>
            <div className="space-y-2">
              <Switch label="Keep my slot every week" defaultChecked />
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" defaultChecked /> Groceries
              </label>
            </div>
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
            <Badge>Draft</Badge>
            <Badge tone="info">Open</Badge>
            <Badge tone="success">Paid</Badge>
            <Badge tone="warning">Waiting</Badge>
            <Badge tone="danger">Cancelled</Badge>
          </div>
          <ChipScroller label="Categories">
            {["All", "Dals & pulses", "Oils & ghee", "Snacks"].map((c, i) => (
              <button key={c} type="button" aria-pressed={i === 0} className="rounded-control">
                <Chip selected={i === 0}>{c}</Chip>
              </button>
            ))}
          </ChipScroller>
        </Section>

        <Section title="Stats">
          <Card className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Saved this month" value="₹1,240" hint="Compared with MRP" />
            <StatCard label="Wallet" value="₹312" />
            <StatCard label="Next visit" value="Sat 10 am" hint="AC servicing" />
          </Card>
        </Section>

        <Section title="Lists and tables">
          <List>
            <li>
              <ListRow href="#" title="This week's group drive" subtitle="26 products · closes Fri 8 pm" />
            </li>
            <li>
              <ListRow title="Refund credited" subtitle="₹70 for Sona Masoori Rice" trailing={<Badge tone="success">+₹70</Badge>} />
            </li>
          </List>
          <Table caption="Example order">
            <THead>
              <tr>
                <Th>Item</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </THead>
            <TBody>
              <tr>
                <Td>Sona Masoori Rice 5 kg</Td>
                <Td className="text-right tabular-nums">2</Td>
                <Td className="text-right tabular-nums">₹880</Td>
              </tr>
              <tr>
                <Td>Toor Dal 1 kg</Td>
                <Td className="text-right tabular-nums">1</Td>
                <Td className="text-right tabular-nums">₹142</Td>
              </tr>
            </TBody>
          </Table>
        </Section>

        <Section title="Banners">
          <div className="space-y-2">
            <Banner title="Changes close Fri 8 am">You can still add items until 8 pm.</Banner>
            <Banner tone="success">Visit completed. Rate your technician.</Banner>
            <Banner tone="warning">Needs 2 more flats to start.</Banner>
            <Banner tone="danger">That slot just filled up.</Banner>
          </div>
        </Section>

        <Section title="Price meters">
          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardHeader title="Chakki Fresh Atta · 10 kg" subtitle="Below the vendor minimum" />
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

        <Section title="Quantity stepper">
          <StepperDemo />
        </Section>

        <Section title="Countdowns">
          <CountdownDemo />
        </Section>

        <Section title="Toasts">
          <FeedbackDemo />
        </Section>

        <Section title="Tabs and modal">
          <Card>
            <TabsDemo />
          </Card>
          <Sheet title="Choose a slot" trigger="Open a modal" triggerClassName={buttonClasses({ variant: "secondary" })}>
            <p className="text-sm text-muted">A white panel with a border over a plain overlay. On phones it opens from the bottom.</p>
          </Sheet>
        </Section>

        <Section title="Neighbours">
          <Card className="space-y-3">
            <NeighbourFlats flats={["A-101", "B-402", "C-202", "D-301", "A-502"]} total={14} />
            <NeighbourFlats flats={["A-101", "B-402"]} total={2} />
            <NeighbourFlats flats={[]} total={0} />
          </Card>
        </Section>

        <Section title="Step-by-step form">
          <Card>
            <WizardDemo />
          </Card>
        </Section>

        <Section title="Empty and loading states">
          <EmptyState title="No group buys are open right now." action={<Button type="button" size="sm">Suggest a product</Button>} />
          <Skeleton className="h-6 w-1/3" />
          <ListSkeleton rows={2} />
        </Section>
      </div>
    </PublicShell>
  );
}
