// A community's impact from buying together: money saved and vendor trips avoided. Pure.
//
// Without Milkar, every flat gets its own delivery from each shop it orders from, and every
// service visit is its own trip. Buying together, a vendor makes one trip per grocery round and
// one per day of a Service Day. Distance, fuel and CO₂ follow from those trips through stated
// assumptions, so they are estimates and the page says so.

export type ImpactAssumptions = {
  /** Round trip from a vendor to the building and back. */
  kmPerTrip: number;
  /** Fuel a typical delivery bike or van uses per km. */
  litresPerKm: number;
  /** CO₂ from burning one litre of petrol. */
  kgCo2PerLitre: number;
};

/** Defaults until the platform admin can edit them (Phase 15). */
export const DEFAULT_IMPACT_ASSUMPTIONS: ImpactAssumptions = { kmPerTrip: 8, litresPerKm: 0.04, kgCo2PerLitre: 2.3 };

/** One flat's confirmed goods from one vendor in one grocery round: a delivery it would have had alone. */
export type GroceryDelivery = { roundId: string; flatId: string; vendorId: string };
/** A completed service visit. `day` is its IST date (e.g. "2026-10-21"): one vendor trip per round and day. */
export type CompletedVisit = { roundId: string; day: string };

export type Trips = {
  /** Trips if every flat had bought on its own. */
  separate: number;
  /** Trips the vendors actually made. */
  together: number;
  avoided: number;
};

export function countTrips(deliveries: readonly GroceryDelivery[], visits: readonly CompletedVisit[]): Trips {
  const separateDeliveries = new Set(deliveries.map((d) => `${d.roundId}|${d.flatId}|${d.vendorId}`)).size;
  const vendorRuns = new Set(deliveries.map((d) => `${d.roundId}|${d.vendorId}`)).size;
  const visitDays = new Set(visits.map((v) => `${v.roundId}|${v.day}`)).size;
  const separate = separateDeliveries + visits.length;
  const together = vendorRuns + visitDays;
  return { separate, together, avoided: Math.max(0, separate - together) };
}

export type Impact = {
  savedPaise: number;
  trips: Trips;
  /** Whole km. */
  km: number;
  /** Litres, one decimal place. */
  litres: number;
  /** Whole kg. */
  kgCo2: number;
  assumptions: ImpactAssumptions;
};

export function communityImpact(input: { savedPaise: number; trips: Trips }, assumptions: ImpactAssumptions = DEFAULT_IMPACT_ASSUMPTIONS): Impact {
  const km = input.trips.avoided * assumptions.kmPerTrip;
  const litres = km * assumptions.litresPerKm;
  return {
    savedPaise: Math.max(0, input.savedPaise),
    trips: input.trips,
    km: Math.round(km),
    litres: Math.round(litres * 10) / 10,
    kgCo2: Math.round(litres * assumptions.kgCo2PerLitre),
    assumptions,
  };
}
