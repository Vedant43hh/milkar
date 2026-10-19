"use client";

import { CircleAlert } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/display";
import { Input, Label, Select } from "@/components/ui/form";
import { t } from "@/i18n";
import { joinAction, type JoinState } from "@/server/actions/auth";

type Flat = { id: string; tower: string; number: string };

const natural = new Intl.Collator("en", { numeric: true });

type JoinFormProps = {
  code: string;
  round: string | null;
  communityName: string;
  /** What this community calls a tower and a flat, e.g. "Wing" and "Room". */
  blockLabel: string;
  unitLabel: string;
  flats: Flat[];
};

export function JoinForm({ code, round, communityName, blockLabel, unitLabel, flats }: JoinFormProps) {
  const [state, formAction, pending] = useActionState(joinAction, {} as JoinState);
  const [tower, setTower] = useState("");
  const towers = [...new Set(flats.map((f) => f.tower))].sort(natural.compare);
  const towerFlats = flats.filter((f) => f.tower === tower).sort((a, b) => natural.compare(a.number, b.number));

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="round" value={round ?? ""} />
      <div>
        <Label htmlFor="name">{t("join.nameLabel")}</Label>
        <Input id="name" name="name" autoComplete="name" placeholder={t("join.namePlaceholder")} defaultValue={state.name} required minLength={2} maxLength={60} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="tower">{blockLabel}</Label>
          <Select id="tower" value={tower} onChange={(e) => setTower(e.target.value)} required>
            <option value="">{t("join.choose", { thing: blockLabel.toLowerCase() })}</option>
            {towers.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="flatId">{t("join.unitNumber", { unit: unitLabel })}</Label>
          <Select id="flatId" name="flatId" key={tower} defaultValue="" required disabled={!tower}>
            <option value="">{t("join.choose", { thing: unitLabel.toLowerCase() })}</option>
            {towerFlats.map((f) => (
              <option key={f.id} value={f.id}>
                {f.number}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {state.error && (
        <Banner tone="danger" role="alert" icon={<CircleAlert aria-hidden className="size-4" />}>
          {t(state.error.key, state.error.vars)}
        </Banner>
      )}
      <Button block loading={pending}>
        {t("join.submit", { community: communityName })}
      </Button>
    </form>
  );
}
