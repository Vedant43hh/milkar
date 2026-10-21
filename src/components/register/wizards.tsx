"use client";

import { CircleAlert, Home } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";
import type { Messages } from "@/i18n";
import { interpolate } from "@/i18n/interpolate";
import { flatCount, generateFlats, isValidGstin, layoutProblems, parseBlocks, parsePincodes } from "@/lib/registration";
import { registerAction, type RegisterState } from "@/server/actions/register";
import type { JoinCommunity } from "@/server/registration";
import { Button } from "../ui/button";
import { Banner } from "../ui/display";
import { Field, Input, Select, Textarea } from "../ui/form";
import { Wizard, type WizardStep } from "../ui/wizard";
import { CommunityFinder, FlatChooser } from "./community-picker";
import { PhoneVerification } from "./phone-verification";

type Text = Messages["register"];
type Role = "RESIDENT" | "MANAGER" | "VENDOR";

/**
 * One <form> around the steps: the role, the steps' fields, then phone and code. Nothing is
 * created until this submits; the server re-checks everything.
 */
function RegisterForm({ role, text, mockOtp, steps }: { role: Role; text: Text; mockOtp: boolean; steps: WizardStep[] }) {
  const [state, formAction, pending] = useActionState(registerAction, {} as RegisterState);
  const [codeSent, setCodeSent] = useState(false);
  const all: WizardStep[] = [
    ...steps,
    { id: "phone", title: text.phone.title, content: <PhoneVerification text={text.phone} mockOtp={mockOtp} onSent={setCodeSent} /> },
  ];
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="role" value={role} />
      <Wizard
        steps={all}
        submit={
          <Button block loading={pending} disabled={!codeSent}>
            {text.submit[role]}
          </Button>
        }
      />
      {state.error && (
        <Banner tone="danger" role="alert" icon={<CircleAlert aria-hidden className="size-4" />}>
          {state.error}
        </Banner>
      )}
    </form>
  );
}

function NameStep({ text }: { text: Text }) {
  return (
    <Field id="register-name" label={text.about.name} hint={text.about.nameHint}>
      {(aria) => <Input {...aria} name="name" required minLength={2} maxLength={60} autoComplete="name" placeholder={text.about.namePlaceholder} />}
    </Field>
  );
}

// ---------- residents ----------

export function ResidentWizard({ text, mockOtp, initial }: { text: Text; mockOtp: boolean; initial: JoinCommunity | null }) {
  const [community, setCommunity] = useState<JoinCommunity | null>(initial);
  return (
    <RegisterForm
      role="RESIDENT"
      text={text}
      mockOtp={mockOtp}
      steps={[
        {
          id: "find",
          title: text.find.title,
          content: <CommunityFinder text={text} chosen={community} onChoose={setCommunity} />,
          validate: () => (community ? null : text.find.needCommunity),
        },
        {
          id: "home",
          title: text.home.title,
          content: community ? <FlatChooser key={community.id} text={text} community={community} /> : <p className="text-sm text-muted">{text.find.needCommunity}</p>,
        },
        { id: "about", title: text.about.title, content: <NameStep text={text} /> },
      ]}
    />
  );
}

// ---------- Society Managers ----------

const COMMUNITY_TYPES = ["APARTMENT_SOCIETY", "GATED_COMMUNITY", "PG_COLIVING", "HOSTEL", "OFFICE_CAMPUS"] as const;

function LayoutPreview({ text, blocks, floors, unitsPerFloor }: { text: Text; blocks: string; floors: string; unitsPerFloor: string }) {
  const parsed = parseBlocks(blocks);
  const layout = { blocks: parsed ?? [], floors: Number(floors), unitsPerFloor: Number(unitsPerFloor) };
  const valid = parsed !== null && layoutProblems(layout).length === 0;
  if (!valid) return <p className="text-sm text-muted">{text.community.previewInvalid}</p>;
  const flats = generateFlats(layout);
  const first = flats[0];
  const last = flats.at(-1)!;
  return (
    <p role="status" className="flex items-center gap-2 rounded-control bg-brand-soft px-3 py-2 text-sm font-medium text-brand-soft-fg">
      <Home aria-hidden className="size-4 shrink-0" />
      {interpolate(text.community.preview, { count: flatCount(layout), first: `${first.tower}-${first.number}`, last: `${last.tower}-${last.number}` })}
    </p>
  );
}

export function ManagerWizard({ text, mockOtp }: { text: Text; mockOtp: boolean }) {
  const c = text.community;
  const [layout, setLayout] = useState({ blocks: "A-D", floors: "5", unitsPerFloor: "2", unitLabel: "Flat" });
  const set = (key: keyof typeof layout) => (e: { target: { value: string } }) => setLayout((l) => ({ ...l, [key]: e.target.value }));
  const layoutOk = () => {
    const blocks = parseBlocks(layout.blocks);
    return blocks !== null && layoutProblems({ blocks, floors: Number(layout.floors), unitsPerFloor: Number(layout.unitsPerFloor) }).length === 0;
  };
  return (
    <RegisterForm
      role="MANAGER"
      text={text}
      mockOtp={mockOtp}
      steps={[
        {
          id: "community",
          title: c.title,
          content: (
            <>
              <Field id="community-name" label={c.name}>
                {(aria) => <Input {...aria} name="communityName" required minLength={3} maxLength={80} placeholder={c.namePlaceholder} />}
              </Field>
              <Field id="community-type" label={c.type}>
                {(aria) => (
                  <Select {...aria} name="communityType" required defaultValue="APARTMENT_SOCIETY">
                    {COMMUNITY_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {c.types[type]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </>
          ),
        },
        {
          id: "where",
          title: c.whereTitle,
          content: (
            <>
              <Field id="community-address" label={c.address}>
                {(aria) => <Textarea {...aria} name="address" required minLength={5} maxLength={200} rows={2} autoComplete="street-address" />}
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="community-city" label={c.city}>
                  {(aria) => <Input {...aria} name="city" required minLength={2} maxLength={60} autoComplete="address-level2" />}
                </Field>
                <Field id="community-pincode" label={c.pincode}>
                  {(aria) => <Input {...aria} name="pincode" required inputMode="numeric" pattern="[1-9][0-9]{5}" maxLength={6} autoComplete="postal-code" />}
                </Field>
              </div>
            </>
          ),
        },
        {
          id: "buildings",
          title: c.buildingsTitle,
          validate: () => (layoutOk() ? null : c.previewInvalid),
          content: (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="block-label" label={c.blockLabel} hint={c.blockLabelHint}>
                  {(aria) => <Input {...aria} name="blockLabel" required maxLength={20} defaultValue="Tower" />}
                </Field>
                <Field id="unit-label" label={c.unitLabel} hint={c.unitLabelHint}>
                  {(aria) => <Input {...aria} name="unitLabel" required maxLength={20} value={layout.unitLabel} onChange={set("unitLabel")} />}
                </Field>
              </div>
              <Field id="blocks" label={c.blocks} hint={c.blocksHint}>
                {(aria) => <Input {...aria} name="blocks" required maxLength={200} value={layout.blocks} onChange={set("blocks")} />}
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field id="floors" label={c.floors}>
                  {(aria) => <Input {...aria} name="floors" type="number" required min={1} max={60} inputMode="numeric" value={layout.floors} onChange={set("floors")} />}
                </Field>
                <Field id="units-per-floor" label={c.unitsPerFloor}>
                  {(aria) => <Input {...aria} name="unitsPerFloor" type="number" required min={1} max={20} inputMode="numeric" value={layout.unitsPerFloor} onChange={set("unitsPerFloor")} />}
                </Field>
              </div>
              <LayoutPreview text={text} blocks={layout.blocks} floors={layout.floors} unitsPerFloor={layout.unitsPerFloor} />
            </>
          ),
        },
        { id: "about", title: text.about.title, content: <NameStep text={text} /> },
      ]}
    />
  );
}

// ---------- vendors ----------

const CATEGORIES = ["GROCERIES", "HOME_SERVICES", "REPAIRS"] as const;

function CategoryChoice({ text, selected, onToggle }: { text: Text; selected: Set<string>; onToggle: (category: string) => void }): ReactNode {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-sm font-medium text-fg">{text.business.categories}</legend>
      {CATEGORIES.map((category) => (
        <label key={category} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-border px-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
          <input type="checkbox" name="categories" value={category} checked={selected.has(category)} onChange={() => onToggle(category)} className="size-5 accent-[var(--brand)]" />
          <span className="text-sm font-medium text-fg">{text.business.categoryNames[category]}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function VendorWizard({ text, mockOtp }: { text: Text; mockOtp: boolean }) {
  const b = text.business;
  const [categories, setCategories] = useState<Set<string>>(new Set());
  const [pincodes, setPincodes] = useState("");
  const [gstin, setGstin] = useState("");
  const toggle = (category: string) =>
    setCategories((now) => {
      const next = new Set(now);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  return (
    <RegisterForm
      role="VENDOR"
      text={text}
      mockOtp={mockOtp}
      steps={[
        {
          id: "business",
          title: b.title,
          validate: () => (categories.size > 0 ? null : b.pickCategory),
          content: (
            <>
              <Field id="business-name" label={b.name}>
                {(aria) => <Input {...aria} name="businessName" required minLength={2} maxLength={80} autoComplete="organization" placeholder={b.namePlaceholder} />}
              </Field>
              <CategoryChoice text={text} selected={categories} onToggle={toggle} />
              <Field id="business-city" label={b.city}>
                {(aria) => <Input {...aria} name="city" required minLength={2} maxLength={60} autoComplete="address-level2" />}
              </Field>
            </>
          ),
        },
        {
          id: "area",
          title: b.areaTitle,
          validate: () => (!parsePincodes(pincodes) ? b.pincodesHint : gstin.trim() && !isValidGstin(gstin) ? text.errors.INVALID_GSTIN : null),
          content: (
            <>
              <Field id="pincodes" label={b.pincodes} hint={b.pincodesHint}>
                {(aria) => <Input {...aria} name="pincodes" required inputMode="numeric" value={pincodes} onChange={(e) => setPincodes(e.target.value)} />}
              </Field>
              <Field id="gstin" label={b.gstin} hint={b.gstinHint}>
                {(aria) => <Input {...aria} name="gstin" maxLength={15} autoCapitalize="characters" className="uppercase" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} />}
              </Field>
            </>
          ),
        },
        { id: "about", title: text.about.title, content: <NameStep text={text} /> },
      ]}
    />
  );
}
