"use client";

import { PartyPopper } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Celebration } from "@/components/ui/celebrate";
import { Countdown } from "@/components/ui/countdown";
import { QuantityStepper } from "@/components/ui/stepper";
import { Field, Input, Select } from "@/components/ui/form";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { Wizard } from "@/components/ui/wizard";

export function StepperDemo() {
  const [rice, setRice] = useState(2);
  const [dal, setDal] = useState(0);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <QuantityStepper label="Sona Masoori Rice 5 kg" value={rice} max={4} onChange={setRice} />
      <QuantityStepper label="Toor Dal 1 kg" value={dal} max={5} onChange={setDal} />
      <QuantityStepper label="Frozen item" value={3} onChange={() => {}} decreaseDisabled />
    </div>
  );
}

// The moment the demo page loaded in the browser (null on the server), so the example deadlines
// stay fixed while the countdowns tick.
let loadedAt: number | null = null;
const noSubscribe = () => () => {};
function useLoadedAt(): number | null {
  return useSyncExternalStore(noSubscribe, () => (loadedAt ??= Date.now()), () => null);
}

/** Countdowns relative to page load (computed in the browser, never during prerender). */
export function CountdownDemo() {
  const now = useLoadedAt();
  if (now === null) return null;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <Countdown to={new Date(now + 2 * 86400_000 + 5 * 3600_000).toISOString()} />
      <Countdown to={new Date(now + 2 * 3600_000).toISOString()} />
      <Countdown to={new Date(now + 9 * 60_000).toISOString()} />
      <Countdown to={new Date(now - 60_000).toISOString()} />
    </div>
  );
}

export function FeedbackDemo() {
  const toast = useToast();
  const [celebrating, setCelebrating] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" onClick={() => toast({ tone: "success", title: "Added to your order", body: "2 × Sona Masoori Rice" })} type="button">
        Success toast
      </Button>
      <Button variant="secondary" size="sm" onClick={() => toast({ tone: "error", title: "That slot just filled up", body: "Pick another time." })} type="button">
        Error toast
      </Button>
      <Button variant="secondary" size="sm" onClick={() => toast({ tone: "info", title: "Cutoff in 6 hours" })} type="button">
        Info toast
      </Button>
      <Button variant="accent" size="sm" icon={<PartyPopper aria-hidden className="size-4" />} onClick={() => setCelebrating(true)} type="button">
        Tier unlock
      </Button>
      {celebrating && <Celebration message="🎉 Tier unlocked! Everyone now pays ₹440" onDone={() => setCelebrating(false)} />}
    </div>
  );
}

export function TabsDemo() {
  return (
    <Tabs
      label="Schedule days"
      items={[
        { id: "sat", label: "Sat 24 Oct", content: <p className="text-sm text-muted">9 visits across 4 slots.</p> },
        { id: "sun", label: "Sun 25 Oct", content: <p className="text-sm text-muted">6 visits across 3 slots.</p> },
        { id: "mon", label: "Mon 26 Oct", content: <p className="text-sm text-muted">No visits.</p> },
      ]}
    />
  );
}

export function WizardDemo() {
  const toast = useToast();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        toast({ tone: "success", title: "Community registered (demo)" });
      }}
    >
      <Wizard
        steps={[
          {
            id: "name",
            title: "Your community",
            content: (
              <Field id="wiz-name" label="Name" hint="As residents know it">
                {(aria) => <Input {...aria} name="name" required minLength={3} placeholder="Green Meadows CHS" />}
              </Field>
            ),
          },
          {
            id: "type",
            title: "What kind of place is it?",
            content: (
              <Field id="wiz-type" label="Type">
                {(aria) => (
                  <Select {...aria} name="type" required defaultValue="">
                    <option value="" disabled>
                      Choose one
                    </option>
                    <option>Apartment society</option>
                    <option>PG or co-living</option>
                  </Select>
                )}
              </Field>
            ),
          },
          {
            id: "flats",
            title: "How many flats?",
            content: (
              <Field id="wiz-flats" label="Flats">
                {(aria) => <Input {...aria} name="flats" type="number" required min={1} max={2000} inputMode="numeric" />}
              </Field>
            ),
          },
        ]}
        submit={<Button>Register</Button>}
      />
    </form>
  );
}
