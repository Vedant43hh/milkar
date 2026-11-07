// Platform settings the admin edits, and the checks on them. Pure.

import type { ImpactAssumptions } from "../impact";

export type PlatformSettings = {
  /** Milkar's margin on the vendor's price, in basis points (300 = 3%). */
  marginBps: number;
  /** How long before cutoff residents can no longer reduce or cancel. */
  reductionFreezeMinutes: number;
  /** Suggested visit fee (GST included) when a vendor adds a service. */
  defaultNoAccessFeePaise: number;
  impactMetresPerTrip: number;
  impactMlPerKm: number;
  impactGramsCo2PerLitre: number;
};

export const DEFAULT_SETTINGS: PlatformSettings = {
  marginBps: 300,
  reductionFreezeMinutes: 720,
  defaultNoAccessFeePaise: 19_900,
  impactMetresPerTrip: 8_000,
  impactMlPerKm: 40,
  impactGramsCo2PerLitre: 2_300,
};

export type SettingsProblem = "MARGIN" | "FREEZE" | "FEE" | "KM_PER_TRIP" | "FUEL" | "CO2";

const between = (n: number, min: number, max: number) => Number.isSafeInteger(n) && n >= min && n <= max;

export function checkSettings(s: PlatformSettings): SettingsProblem[] {
  const problems: SettingsProblem[] = [];
  if (!between(s.marginBps, 0, 2_000)) problems.push("MARGIN"); // up to 20%
  if (!between(s.reductionFreezeMinutes, 0, 72 * 60)) problems.push("FREEZE"); // up to 3 days
  if (!between(s.defaultNoAccessFeePaise, 0, 200_000)) problems.push("FEE");
  if (!between(s.impactMetresPerTrip, 100, 200_000)) problems.push("KM_PER_TRIP");
  if (!between(s.impactMlPerKm, 1, 1_000)) problems.push("FUEL");
  if (!between(s.impactGramsCo2PerLitre, 100, 10_000)) problems.push("CO2");
  return problems;
}

export function impactAssumptionsOf(s: Pick<PlatformSettings, "impactMetresPerTrip" | "impactMlPerKm" | "impactGramsCo2PerLitre">): ImpactAssumptions {
  return { kmPerTrip: s.impactMetresPerTrip / 1000, litresPerKm: s.impactMlPerKm / 1000, kgCo2PerLitre: s.impactGramsCo2PerLitre / 1000 };
}
