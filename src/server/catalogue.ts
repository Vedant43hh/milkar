import "server-only";
import type { ProductCategory, ServiceCategory, Unit } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { sortTiers } from "@/lib/pricing/tiers";
import {
  allowedServiceCategories,
  checkOption,
  checkProduct,
  checkService,
  sellsProducts,
  type CatalogueProblem,
  type OptionDraft,
  type ProductDraft,
  type ServiceDraft,
} from "@/lib/vendor/catalogue";
import { checkSlot, type SlotInput, type SlotProblem } from "@/lib/vendor/slot-templates";
import { loadPlatformSettings } from "./settings";
import { runsVendor, type VendorActor } from "./vendor-actor";

// A vendor's catalogue: what Society Managers can put in a round. Prices are copied into a round
// when it opens, so editing here changes future rounds only, never one already open.

export type CatalogueError = CatalogueProblem | "FORBIDDEN" | "NOT_FOUND";
type Saved = { ok: true; id: string } | { ok: false; errors: CatalogueError[] };

async function vendorOf(actor: VendorActor) {
  const vendorId = runsVendor(actor);
  if (!vendorId) return null;
  return prisma.vendor.findUnique({ where: { id: vendorId }, select: { id: true, categories: true } });
}

export async function vendorCatalogue(vendorId: string) {
  const [vendor, products, services, settings] = await Promise.all([
    prisma.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { categories: true } }),
    prisma.product.findMany({
      where: { vendorId },
      orderBy: [{ active: "desc" }, { category: "asc" }, { name: "asc" }],
      include: { tiers: { orderBy: { minQty: "asc" } } },
    }),
    prisma.service.findMany({
      where: { vendorId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: {
        options: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { tiers: { orderBy: { minFlats: "asc" } } } },
        slotTemplates: { orderBy: { startTime: "asc" } },
      },
    }),
    loadPlatformSettings(),
  ]);
  return {
    sellsProducts: sellsProducts(vendor.categories),
    serviceCategories: allowedServiceCategories(vendor.categories),
    marginBps: settings.marginBps,
    defaultFeePaise: settings.defaultNoAccessFeePaise,
    products,
    services,
  };
}

export async function getProduct(vendorId: string, productId: string) {
  return prisma.product.findFirst({ where: { id: productId, vendorId }, include: { tiers: { orderBy: { minQty: "asc" } } } });
}

export async function getService(vendorId: string, serviceId: string) {
  return prisma.service.findFirst({
    where: { id: serviceId, vendorId },
    include: {
      options: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { tiers: { orderBy: { minFlats: "asc" } } } },
      slotTemplates: { orderBy: { startTime: "asc" } },
    },
  });
}

/** Creates a product (`productId` null) or updates one of the vendor's own, tiers included. */
export async function saveProduct(actor: VendorActor, productId: string | null, draft: ProductDraft, now: Date): Promise<Saved> {
  const vendor = await vendorOf(actor);
  if (!vendor || !sellsProducts(vendor.categories)) return { ok: false, errors: ["FORBIDDEN"] };
  const { marginBps } = await loadPlatformSettings();
  const problems = checkProduct(draft, marginBps);
  if (problems.length > 0) return { ok: false, errors: problems };
  const data = {
    name: draft.name.trim().replace(/\s+/g, " "),
    category: draft.category as ProductCategory,
    unit: draft.unit as Unit,
    packSize: draft.packSize,
    mrpPaise: draft.mrpPaise,
    gstBps: draft.gstBps,
    minOrderQty: draft.minOrderQty,
    defaultMaxPerFlat: draft.maxPerFlat,
  };
  const tiers = sortTiers(draft.tiers).map((t) => ({ minQty: t.minQty, vendorPricePaise: t.vendorPricePaise }));
  if (productId === null) {
    const created = await prisma.product.create({ data: { ...data, vendorId: vendor.id, createdAt: now, tiers: { create: tiers } } });
    return { ok: true, id: created.id };
  }
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.product.updateMany({ where: { id: productId, vendorId: vendor.id }, data });
    if (count !== 1) return { ok: false, errors: ["NOT_FOUND"] } as const;
    await tx.priceTier.deleteMany({ where: { productId } });
    await tx.priceTier.createMany({ data: tiers.map((t) => ({ ...t, productId })) });
    return { ok: true, id: productId } as const;
  });
}

/** Offered in new rounds, or not. Open rounds keep what they have. */
export async function setProductActive(actor: VendorActor, productId: string, active: boolean): Promise<boolean> {
  const vendorId = runsVendor(actor);
  if (!vendorId) return false;
  const { count } = await prisma.product.updateMany({ where: { id: productId, vendorId }, data: { active } });
  return count === 1;
}

export async function saveService(actor: VendorActor, serviceId: string | null, draft: ServiceDraft, now: Date): Promise<Saved> {
  const vendor = await vendorOf(actor);
  if (!vendor) return { ok: false, errors: ["FORBIDDEN"] };
  const allowed = allowedServiceCategories(vendor.categories);
  if (allowed.length === 0) return { ok: false, errors: ["FORBIDDEN"] };
  const problems = checkService(draft, allowed);
  if (problems.length > 0) return { ok: false, errors: problems };
  const data = {
    name: draft.name.trim().replace(/\s+/g, " "),
    category: draft.category as ServiceCategory,
    description: draft.description.trim(),
    minFlats: draft.minFlats,
    noAccessFeePaise: draft.noAccessFeePaise,
    durationMinutes: draft.durationMinutes,
    gstBps: draft.gstBps,
    weeklyByDefault: draft.weeklyByDefault,
  };
  if (serviceId === null) {
    const created = await prisma.service.create({ data: { ...data, vendorId: vendor.id, createdAt: now } });
    return { ok: true, id: created.id };
  }
  const { count } = await prisma.service.updateMany({ where: { id: serviceId, vendorId: vendor.id }, data });
  return count === 1 ? { ok: true, id: serviceId } : { ok: false, errors: ["NOT_FOUND"] };
}

export async function setServiceActive(actor: VendorActor, serviceId: string, active: boolean): Promise<boolean> {
  const vendorId = runsVendor(actor);
  if (!vendorId) return false;
  const { count } = await prisma.service.updateMany({ where: { id: serviceId, vendorId }, data: { active } });
  return count === 1;
}

async function ownService(actor: VendorActor, serviceId: string) {
  const vendorId = runsVendor(actor);
  if (!vendorId) return null;
  return prisma.service.findFirst({ where: { id: serviceId, vendorId }, select: { id: true, gstBps: true } });
}

/** A bookable option of one of the vendor's services, priced by how many flats book. */
export async function saveOption(actor: VendorActor, serviceId: string, optionId: string | null, draft: OptionDraft): Promise<Saved> {
  const service = await ownService(actor, serviceId);
  if (!service) return { ok: false, errors: ["NOT_FOUND"] };
  const { marginBps } = await loadPlatformSettings();
  const problems = checkOption(draft, marginBps, service.gstBps);
  if (problems.length > 0) return { ok: false, errors: problems };
  const data = { name: draft.name.trim().replace(/\s+/g, " "), unitLabel: draft.unitLabel.trim().toLowerCase(), mrpPaise: draft.mrpPaise, maxPerFlat: draft.maxPerFlat };
  const tiers = sortTiers(draft.tiers).map((t) => ({ minFlats: t.minQty, vendorPricePaise: t.vendorPricePaise }));
  return prisma.$transaction(async (tx) => {
    if (optionId === null) {
      const last = await tx.serviceOption.aggregate({ where: { serviceId }, _max: { sortOrder: true } });
      const created = await tx.serviceOption.create({ data: { ...data, serviceId, sortOrder: (last._max.sortOrder ?? -1) + 1, tiers: { create: tiers } } });
      return { ok: true, id: created.id } as const;
    }
    const { count } = await tx.serviceOption.updateMany({ where: { id: optionId, serviceId }, data });
    if (count !== 1) return { ok: false, errors: ["NOT_FOUND"] } as const;
    await tx.serviceOptionTier.deleteMany({ where: { optionId } });
    await tx.serviceOptionTier.createMany({ data: tiers.map((t) => ({ ...t, optionId })) });
    return { ok: true, id: optionId } as const;
  });
}

export async function setOptionActive(actor: VendorActor, optionId: string, active: boolean): Promise<boolean> {
  const vendorId = runsVendor(actor);
  if (!vendorId) return false;
  const { count } = await prisma.serviceOption.updateMany({ where: { id: optionId, service: { vendorId } }, data: { active } });
  return count === 1;
}

export type SlotError = SlotProblem | "NOT_FOUND";

/** Adds a daily time slot (`templateId` null) or changes one; the slots of a service never overlap. */
export async function saveSlot(actor: VendorActor, serviceId: string, templateId: string | null, slot: SlotInput): Promise<{ ok: true } | { ok: false; error: SlotError }> {
  const service = await ownService(actor, serviceId);
  if (!service) return { ok: false, error: "NOT_FOUND" };
  return prisma.$transaction(async (tx) => {
    // One change at a time per service, so two overlapping slots can't both be saved.
    await tx.$executeRaw`SELECT 1 FROM "Service" WHERE id = ${serviceId} FOR UPDATE`;
    const others = await tx.vendorSlotTemplate.findMany({ where: { serviceId, ...(templateId ? { id: { not: templateId } } : {}) } });
    if (templateId && !(await tx.vendorSlotTemplate.findFirst({ where: { id: templateId, serviceId }, select: { id: true } }))) return { ok: false, error: "NOT_FOUND" } as const;
    const problem = checkSlot(slot, others);
    if (problem) return { ok: false, error: problem } as const;
    const data = { startTime: slot.startTime, endTime: slot.endTime, technicians: slot.technicians };
    if (templateId) await tx.vendorSlotTemplate.update({ where: { id: templateId }, data });
    else await tx.vendorSlotTemplate.create({ data: { ...data, serviceId } });
    return { ok: true } as const;
  });
}

/** Slots are copied into each Service Day when it opens, so removing one leaves running rounds alone. */
export async function removeSlot(actor: VendorActor, templateId: string): Promise<boolean> {
  const vendorId = runsVendor(actor);
  if (!vendorId) return false;
  const { count } = await prisma.vendorSlotTemplate.deleteMany({ where: { id: templateId, service: { vendorId } } });
  return count === 1;
}
