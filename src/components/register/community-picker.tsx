"use client";

import { Building2, Check, KeyRound, Search } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";
import type { Messages } from "@/i18n";
import { interpolate } from "@/i18n/interpolate";
import { findCommunityAction, searchCommunitiesAction } from "@/server/actions/register";
import type { JoinCommunity } from "@/server/registration";
import { Button } from "../ui/button";
import { Input, Label, Select } from "../ui/form";

type Text = Messages["register"];
type Found = Awaited<ReturnType<typeof searchCommunitiesAction>>[number];

/** Pressing Enter runs the search instead of submitting the whole form. */
const onEnter = (run: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter") {
    e.preventDefault();
    run();
  }
};

/**
 * Finding the community to join: by invite code, or by searching live communities by name, city
 * or pincode. The chosen community (with its flats) is handed to `onChoose`; its id is submitted.
 */
export function CommunityFinder({ text, chosen, onChoose }: { text: Text; chosen: JoinCommunity | null; onChoose: (c: JoinCommunity | null) => void }) {
  const [code, setCode] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Found[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const codeInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  // On a slow phone the boxes can be typed in before the page has finished loading: they show the
  // text, but nothing was listening. Once it is, start from what's there.
  useEffect(() => {
    const typedCode = codeInput.current?.value ?? "";
    if (typedCode) setCode(typedCode.toUpperCase());
    const typedQuery = searchInput.current?.value ?? "";
    if (typedQuery) setQuery(typedQuery);
  }, []);

  const findByCode = () =>
    start(async () => {
      const found = await findCommunityAction({ code });
      setMessage(found ? null : text.find.codeNotFound);
      onChoose(found);
    });
  const search = () =>
    start(async () => {
      const found = await searchCommunitiesAction(query);
      setResults(found);
      setMessage(found.length === 0 ? text.find.noResults : null);
    });
  const choose = (id: string) =>
    start(async () => {
      onChoose(await findCommunityAction({ id }));
    });

  if (chosen) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-card border-2 border-brand bg-brand-soft p-4">
        <input type="hidden" name="communityId" value={chosen.id} />
        <span className="flex min-w-0 items-center gap-2 font-semibold text-brand-soft-fg">
          <Building2 aria-hidden className="size-5 shrink-0" />
          <span>{interpolate(text.find.chosen, { community: chosen.name, city: chosen.city })}</span>
        </span>
        <Button type="button" variant="secondary" size="sm" onClick={() => onChoose(null)}>
          {text.find.change}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="invite-code">{text.find.codeLabel}</Label>
        <div className="flex gap-2">
          <Input
            ref={codeInput}
            id="invite-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={onEnter(findByCode)}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="GREENMDW"
            aria-describedby="invite-code-hint"
            className="uppercase"
          />
          <Button type="button" variant="secondary" onClick={findByCode} loading={pending} disabled={code.trim().length < 2} icon={<KeyRound aria-hidden className="size-4" />}>
            {text.find.codeFind}
          </Button>
        </div>
        <p id="invite-code-hint" className="mt-1.5 text-sm text-muted">
          {text.find.codeHint}
        </p>
      </div>
      <p className="text-center text-xs font-medium tracking-wide text-subtle uppercase">{text.find.or}</p>
      <div>
        <Label htmlFor="community-search">{text.find.searchLabel}</Label>
        <div className="flex gap-2">
          <Input
            ref={searchInput}
            id="community-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onEnter(search)}
            placeholder={text.find.searchPlaceholder}
          />
          <Button type="button" variant="secondary" onClick={search} loading={pending} disabled={query.trim().length < 2} icon={<Search aria-hidden className="size-4" />}>
            {text.find.search}
          </Button>
        </div>
      </div>
      {message && (
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      )}
      {results && results.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-card border border-border">
          {results.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block truncate font-medium text-fg">{c.name}</span>
                <span className="block text-sm text-muted">
                  {c.city} · {c.pincode}
                </span>
              </span>
              <Button type="button" size="sm" onClick={() => choose(c.id)} icon={<Check aria-hidden className="size-4" />}>
                {text.find.choose}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The resident's home in the chosen community: building first, then the flat. */
export function FlatChooser({ text, community }: { text: Text; community: JoinCommunity }) {
  const towers = [...new Set(community.flats.map((f) => f.tower))];
  const [tower, setTower] = useState(towers.length === 1 ? towers[0] : "");
  const flats = community.flats.filter((f) => f.tower === tower);
  const block = community.blockLabel;
  const unit = community.unitLabel;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <Label htmlFor="join-tower">{interpolate(text.home.block, { block })}</Label>
        <Select id="join-tower" value={tower} onChange={(e) => setTower(e.target.value)} required>
          <option value="" disabled>
            {interpolate(text.home.chooseBlock, { block: block.toLowerCase() })}
          </option>
          {towers.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="join-flat">{interpolate(text.home.unit, { unit })}</Label>
        <Select key={tower} id="join-flat" name="flatId" defaultValue="" required disabled={!tower}>
          <option value="" disabled>
            {interpolate(text.home.chooseUnit, { unit: unit.toLowerCase() })}
          </option>
          {flats.map((f) => (
            <option key={f.id} value={f.id}>
              {f.number}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
