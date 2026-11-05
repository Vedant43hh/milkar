"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { t } from "@/i18n";
import type { ActionResult } from "@/lib/action-result";
import { requirePortal } from "@/lib/auth/current-user";
import { setFlash } from "@/lib/flash";
import { normalizeIndianMobile } from "@/lib/phone";
import { parseRupeesToPaise } from "@/lib/pricing/money";
import type { OptionDraft, ProductDraft, ServiceDraft } from "@/lib/vendor/catalogue";
import { readTierRows, type TierProblem, type TierRowInput } from "@/lib/vendor/tier-editor";
import { saveOption, saveProduct, saveService, saveSlot, removeSlot, setOptionActive, setProductActive, setServiceActive, type CatalogueError } from "@/server/catalogue";
import { addTechnician } from "@/server/registration";
import type { VendorUser } from "@/server/session";
import { vendorActorOf } from "@/server/vendor-actor";
import { acknowledgeVendorOrder } from "@/server/vendor-orders";
import { reassignVisit, setTechnicianActive } from "@/server/vendor-schedule";

/** Result of a catalogue form: errors to show (translated), and the values to put back in the fields. */
export type CatalogueFormState = { errors?: string[]; values?: Record<string, string> };

async function vendorUser(): Promise<VendorUser> {
  return requirePortal("vendor");
}

/** A vendor adds a technician by phone and name; the technician then logs in with that phone. */
export async function addTechnicianAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await vendorUser();
  const phone = normalizeIndianMobile(String(formData.get("phone") ?? ""));
  if (!phone) return { ok: false, message: t("errors.invalidPhone") };
  const result = await addTechnician({ role: user.role, vendorId: user.vendor.id }, { phone, name: String(formData.get("name") ?? "") }, new Date());
  if (!result.ok) return { ok: false, message: t(`technicians.errors.${result.error}`) };
  refresh();
  return { ok: true, message: t("technicians.added") };
}

export async function setTechnicianActiveAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await vendorUser();
  const active = formData.get("active") === "true";
  const result = await setTechnicianActive(vendorActorOf(user), String(formData.get("technicianId") ?? ""), active, new Date());
  if (!result.ok) return { ok: false, message: t(`technicians.errors.${result.error}`, { n: result.visits ?? 0 }) };
  refresh();
  return { ok: true, message: t(active ? "technicians.turnedOn" : "technicians.turnedOff") };
}

export async function acknowledgeOrderAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await vendorUser();
  const result = await acknowledgeVendorOrder(vendorActorOf(user), String(formData.get("orderId") ?? ""), new Date());
  if (!result.ok) return { ok: false, message: t(`vendorOrders.errors.${result.error}`) };
  refresh();
  return { ok: true, message: t(result.changed ? "vendorOrders.acknowledged" : "vendorOrders.alreadyAcknowledged") };
}

export async function reassignVisitAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await vendorUser();
  const result = await reassignVisit(vendorActorOf(user), String(formData.get("visitId") ?? ""), String(formData.get("technicianId") ?? ""));
  if (!result.ok) return { ok: false, message: t(`vendorSchedule.errors.${result.error}`) };
  refresh();
  return { ok: true, message: t("vendorSchedule.moved", { name: result.name }) };
}

// ---------- catalogue ----------

function fieldValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (typeof value === "string" && !key.startsWith("$")) values[key] = value;
  return values;
}

/** A whole number from a field, or NaN (which the checks turn into a message). */
function whole(formData: FormData, key: string): number {
  const raw = String(formData.get(key) ?? "").trim();
  return /^\d{1,7}$/.test(raw) ? Number(raw) : NaN;
}

/** Rupees from a field, as paise, or NaN. */
function rupees(formData: FormData, key: string): number {
  try {
    return parseRupeesToPaise(String(formData.get(key) ?? ""));
  } catch {
    return NaN;
  }
}

function tierRows(formData: FormData): TierRowInput[] {
  return Array.from({ length: 6 }, (_, i) => ({ from: String(formData.get(`tierFrom${i}`) ?? ""), price: String(formData.get(`tierPrice${i}`) ?? "") }));
}

const tierMessage = (p: { row: number | null; problem: TierProblem }) => t(`catalogue.tiers.problems.${p.problem}`, { row: p.row ?? 1 });
const catalogueMessage = (e: CatalogueError) => t(`catalogue.errors.${e}`);
const unique = (items: string[]) => [...new Set(items)];

/** Reads the tier rows; on a problem, the form comes back with what to fix. */
function readTiers(formData: FormData): { ok: true; tiers: ProductDraft["tiers"] } | { ok: false; state: CatalogueFormState } {
  const reading = readTierRows(tierRows(formData));
  if (reading.ok) return reading;
  return { ok: false, state: { errors: unique(reading.problems.map(tierMessage)), values: fieldValues(formData) } };
}

const idOrNew = (value: FormDataEntryValue | null) => {
  const id = String(value ?? "");
  return id === "" || id === "new" ? null : id;
};

export async function saveProductAction(_prev: CatalogueFormState, formData: FormData): Promise<CatalogueFormState> {
  const user = await vendorUser();
  const tiers = readTiers(formData);
  if (!tiers.ok) return tiers.state;
  const draft: ProductDraft = {
    name: String(formData.get("name") ?? ""),
    category: String(formData.get("category") ?? ""),
    unit: String(formData.get("unit") ?? ""),
    packSize: whole(formData, "packSize"),
    mrpPaise: rupees(formData, "mrp"),
    gstBps: whole(formData, "gstBps"),
    minOrderQty: whole(formData, "minOrderQty"),
    maxPerFlat: whole(formData, "maxPerFlat"),
    tiers: tiers.tiers,
  };
  const result = await saveProduct(vendorActorOf(user), idOrNew(formData.get("productId")), draft, new Date());
  if (!result.ok) return { errors: unique(result.errors.map(catalogueMessage)), values: fieldValues(formData) };
  await setFlash("success", "catalogue.saved");
  redirect("/vendor/catalogue");
}

export async function saveServiceAction(_prev: CatalogueFormState, formData: FormData): Promise<CatalogueFormState> {
  const user = await vendorUser();
  const serviceId = idOrNew(formData.get("serviceId"));
  const draft: ServiceDraft = {
    name: String(formData.get("name") ?? ""),
    category: String(formData.get("category") ?? ""),
    description: String(formData.get("description") ?? ""),
    minFlats: whole(formData, "minFlats"),
    noAccessFeePaise: rupees(formData, "fee"),
    durationMinutes: whole(formData, "durationMinutes"),
    gstBps: whole(formData, "gstBps"),
    weeklyByDefault: formData.get("weeklyByDefault") === "on",
  };
  const result = await saveService(vendorActorOf(user), serviceId, draft, new Date());
  if (!result.ok) return { errors: unique(result.errors.map(catalogueMessage)), values: fieldValues(formData) };
  await setFlash("success", "catalogue.saved");
  // A new service goes on to its options and time slots.
  redirect(serviceId ? "/vendor/catalogue" : `/vendor/catalogue/services/${result.id}`);
}

export async function saveOptionAction(_prev: CatalogueFormState, formData: FormData): Promise<CatalogueFormState> {
  const user = await vendorUser();
  const serviceId = String(formData.get("serviceId") ?? "");
  const tiers = readTiers(formData);
  if (!tiers.ok) return tiers.state;
  const draft: OptionDraft = {
    name: String(formData.get("name") ?? ""),
    unitLabel: String(formData.get("unitLabel") ?? ""),
    mrpPaise: rupees(formData, "mrp"),
    maxPerFlat: whole(formData, "maxPerFlat"),
    tiers: tiers.tiers,
  };
  const result = await saveOption(vendorActorOf(user), serviceId, idOrNew(formData.get("optionId")), draft);
  if (!result.ok) return { errors: unique(result.errors.map(catalogueMessage)), values: fieldValues(formData) };
  await setFlash("success", "catalogue.saved");
  redirect(`/vendor/catalogue/services/${serviceId}`);
}

/** Stop offering, or offer again: a product, a service or one option. */
export async function setOfferedAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await vendorUser();
  const actor = vendorActorOf(user);
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  const kind = String(formData.get("kind") ?? "");
  const done =
    kind === "product" ? await setProductActive(actor, id, active) : kind === "service" ? await setServiceActive(actor, id, active) : kind === "option" ? await setOptionActive(actor, id, active) : false;
  if (!done) return { ok: false, message: t("catalogue.errors.NOT_FOUND") };
  refresh();
  return { ok: true, message: t(active ? "catalogue.restarted" : "catalogue.stopped") };
}

export async function saveSlotAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await vendorUser();
  const result = await saveSlot(vendorActorOf(user), String(formData.get("serviceId") ?? ""), idOrNew(formData.get("templateId")), {
    startTime: String(formData.get("startTime") ?? ""),
    endTime: String(formData.get("endTime") ?? ""),
    technicians: whole(formData, "technicians"),
  });
  if (!result.ok) return { ok: false, message: t(`catalogue.slotErrors.${result.error}`) };
  refresh();
  return { ok: true, message: t("catalogue.slotSaved") };
}

export async function removeSlotAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await vendorUser();
  if (!(await removeSlot(vendorActorOf(user), String(formData.get("templateId") ?? "")))) return { ok: false, message: t("catalogue.slotErrors.NOT_FOUND") };
  refresh();
  return { ok: true, message: t("catalogue.slotRemoved") };
}
