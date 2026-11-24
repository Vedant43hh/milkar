import { CircleAlert, CircleCheck, Info, Search, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Chip } from "@/components/ui/badge";
import { Button, buttonClasses, IconButton, type ButtonVariant } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Banner, EmptyState } from "@/components/ui/display";
import { Input, Select, Switch, Textarea } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";

// Every shared control in each of its states, side by side, for reviewing the soft UI. Hover,
// pressed and focus are held with the preview-* utilities, which mirror the real states.

type State = { name: string; className?: string; disabled?: boolean };

const STATES: State[] = [
  { name: "Default" },
  { name: "Hover", className: "preview-hover" },
  { name: "Pressed", className: "preview-active" },
  { name: "Focus", className: "preview-focus" },
  { name: "Disabled", disabled: true },
];

const FIELD_STATES: (State & { invalid?: boolean })[] = [
  { name: "Default" },
  { name: "Focus", className: "preview-focus" },
  { name: "With an error", invalid: true },
  { name: "Disabled", disabled: true },
];

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      <div className="flex flex-wrap items-start gap-x-5 gap-y-5">{children}</div>
    </div>
  );
}

function Sample({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2">
      {children}
      <span className="text-xs text-muted">{name}</span>
    </div>
  );
}

const BUTTONS: { variant: ButtonVariant; title: string; text: string }[] = [
  { variant: "primary", title: "Primary button", text: "Join this buy" },
  { variant: "secondary", title: "Secondary button", text: "Back" },
  { variant: "ghost", title: "Ghost button", text: "See all" },
  { variant: "danger", title: "Danger button", text: "Cancel round" },
  { variant: "accent", title: "Savings button", text: "Confirm" },
];

export function SoftUiStates() {
  return (
    <div className="space-y-8">
      {BUTTONS.map((b) => (
        <Row key={b.variant} title={b.title}>
          {STATES.map((s) => (
            <Sample key={s.name} name={s.name}>
              <Button type="button" variant={b.variant} className={s.className} disabled={s.disabled}>
                {b.text}
              </Button>
            </Sample>
          ))}
        </Row>
      ))}

      <Row title="Icon button">
        {STATES.map((s) => (
          <Sample key={s.name} name={s.name}>
            <IconButton label={`Search (${s.name.toLowerCase()})`} className={s.className} disabled={s.disabled}>
              <Search aria-hidden className="size-5" />
            </IconButton>
          </Sample>
        ))}
      </Row>

      <Row title="Chip">
        <Sample name="Default">
          <Chip>Groceries</Chip>
        </Sample>
        <Sample name="Hover">
          <Chip className="preview-hover">Groceries</Chip>
        </Sample>
        <Sample name="Selected">
          <Chip selected>Groceries</Chip>
        </Sample>
      </Row>

      <Row title="Text field">
        {FIELD_STATES.map((s) => (
          <Sample key={s.name} name={s.name}>
            <Input
              aria-label={`Flat number (${s.name.toLowerCase()})`}
              placeholder="B-402"
              className={`w-44 ${s.className ?? ""}`}
              disabled={s.disabled}
              aria-invalid={s.invalid || undefined}
            />
          </Sample>
        ))}
      </Row>

      <Row title="Select and text area">
        <Sample name="Select">
          <Select aria-label="Tower" defaultValue="B" className="w-44">
            <option>A</option>
            <option>B</option>
          </Select>
        </Sample>
        <Sample name="Select, disabled">
          <Select aria-label="Tower (disabled)" defaultValue="B" className="w-44" disabled>
            <option>B</option>
          </Select>
        </Sample>
        <Sample name="Text area, focus">
          <Textarea aria-label="Note (focus)" placeholder="The kitchen tap drips" className="w-64 preview-focus" />
        </Sample>
      </Row>

      <Row title="Switch">
        <Sample name="Off">
          <Switch label="Keep my slot" className="w-52" />
        </Sample>
        <Sample name="On">
          <Switch label="Auto-pay" defaultChecked className="w-52" />
        </Sample>
        <Sample name="Disabled">
          <Switch label="Reminders" defaultChecked disabled className="w-52" />
        </Sample>
      </Row>

      <Row title="Checkbox and radio">
        <Sample name="Off, on, disabled">
          <div className="flex items-center gap-4">
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" /> Groceries
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" defaultChecked /> Repairs
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" disabled /> Laundry
            </label>
          </div>
        </Sample>
        <Sample name="Radio">
          <div className="flex items-center gap-4">
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="radio" name="design-slot" defaultChecked /> Morning
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="radio" name="design-slot" /> Evening
            </label>
          </div>
        </Sample>
      </Row>

      <Row title="Badges: colour plus a word, never colour alone">
        <Badge>Draft</Badge>
        <Badge tone="brand">Open</Badge>
        <Badge tone="accent">Saved ₹70</Badge>
        <Badge tone="success" icon={<CircleCheck aria-hidden className="size-3.5" />}>
          Paid
        </Badge>
        <Badge tone="warning" icon={<TriangleAlert aria-hidden className="size-3.5" />}>
          Waiting
        </Badge>
        <Badge tone="danger" icon={<CircleAlert aria-hidden className="size-3.5" />}>
          Cancelled
        </Badge>
      </Row>

      <div className="grid gap-4 md:grid-cols-2">
        <Banner tone="info" icon={<Info aria-hidden className="size-4" />} title="Changes close Fri 8 am">
          You can change your order until then.
        </Banner>
        <Banner tone="success" icon={<CircleCheck aria-hidden className="size-4" />} title="Paid">
          ₹465 from your wallet.
        </Banner>
        <Banner tone="warning" icon={<TriangleAlert aria-hidden className="size-4" />} title="Slot held until 6 pm">
          Confirm and pay to keep it.
        </Banner>
        <Banner tone="danger" icon={<CircleAlert aria-hidden className="size-4" />} title="Payment failed">
          Nothing was taken. Try again.
        </Banner>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card labelledBy="design-table">
          <h3 id="design-table" className="mb-3 font-semibold text-fg">
            Table: a raised card, flat rows, faint dividers
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th scope="col" className="py-2 font-medium">
                  Item
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Qty
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="py-2.5">Sona Masoori Rice 5 kg</td>
                <td className="py-2.5 text-right tabular-nums">2</td>
                <td className="py-2.5 text-right tabular-nums">₹880</td>
              </tr>
              <tr>
                <td className="py-2.5">Toor Dal 1 kg</td>
                <td className="py-2.5 text-right tabular-nums">1</td>
                <td className="py-2.5 text-right tabular-nums">₹142</td>
              </tr>
            </tbody>
          </table>
        </Card>
        <div className="space-y-5">
          <EmptyState icon={<Search aria-hidden className="size-6" />} title="An empty state is a pressed-in well" body="Nothing here yet." />
          <Sheet title="A modal" trigger="Open a modal" triggerClassName={buttonClasses({ variant: "secondary" })}>
            <p className="text-sm text-muted">A raised card over a soft, see-through overlay.</p>
          </Sheet>
        </div>
      </div>
    </div>
  );
}
