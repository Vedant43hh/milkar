import { prisma } from "@/lib/db";

export async function makeCommunity(code: string, flats: [tower: string, number: string][] = [["A", "101"], ["A", "102"]]) {
  return prisma.community.create({
    data: {
      name: `${code} CHS`,
      code,
      address: "Test Road",
      city: "Pune",
      pincode: "411001",
      flats: { create: flats.map(([tower, number]) => ({ tower, number })) },
    },
    include: { flats: { orderBy: [{ tower: "asc" }, { number: "asc" }] } },
  });
}

let phoneSeq = 0;
export function nextPhone(): string {
  phoneSeq += 1;
  return `+9198${String(phoneSeq).padStart(8, "0")}`;
}

let codeSeq = 0;

/** A community with a Service Day: one service, one option and slots with the given capacities. */
export async function makeServiceDay({ capacities }: { capacities: number[] }) {
  codeSeq += 1;
  const community = await makeCommunity(`SVC${codeSeq}`, [["A", "101"], ["A", "102"], ["A", "103"]]);
  const user = await prisma.user.create({ data: { phone: nextPhone(), name: "Asha", role: "CAPTAIN", flatId: community.flats[0].id } });
  const vendor = await prisma.vendor.create({ data: { name: "CoolCare", kind: "SERVICES", phone: "+912024000013", city: "Pune" } });
  const service = await prisma.service.create({
    data: {
      vendorId: vendor.id,
      category: "AC",
      name: "AC servicing",
      description: "Jet wash",
      minFlats: 5,
      noAccessFeePaise: 14900,
      durationMinutes: 60,
      gstBps: 1800,
      options: { create: [{ name: "Split AC", unitLabel: "unit", mrpPaise: 89900, maxPerFlat: 4, tiers: { create: [{ minFlats: 1, vendorPricePaise: 57512 }] } }] },
    },
  });
  const round = await prisma.orderRound.create({
    data: {
      communityId: community.id,
      createdById: user.id,
      kind: "SERVICE",
      title: "AC Service Day",
      cutoffAt: new Date("2026-10-23T14:30:00Z"),
      deliveryAt: new Date("2026-10-25T03:30:00Z"),
      marginBps: 300,
      reductionFreezeMinutes: 720,
      serviceId: service.id,
      vendorId: vendor.id,
      noAccessFeePaise: 14900,
    },
  });
  const slots = [];
  for (const [i, capacity] of capacities.entries()) {
    const startsAt = new Date(Date.UTC(2026, 9, 25, 3 + 2 * i, 30));
    slots.push(await prisma.serviceSlot.create({ data: { roundId: round.id, startsAt, endsAt: new Date(startsAt.getTime() + 2 * 3_600_000), capacity } }));
  }
  return { communityId: community.id, flats: community.flats, userId: user.id, vendorId: vendor.id, serviceId: service.id, round, slots };
}

/** A community with `flats` flats, one resident in each, plus a captain in the first flat. */
export async function makeNeighbourhood(code: string, flats: number) {
  const numbers = Array.from({ length: flats }, (_, i) => ["A", String(101 + i)] as [string, string]);
  const community = await makeCommunity(code, numbers);
  const captain = await prisma.user.create({ data: { phone: nextPhone(), name: "Captain", role: "CAPTAIN", flatId: community.flats[0].id } });
  const residents = [];
  for (const flat of community.flats) residents.push(await prisma.user.create({ data: { phone: nextPhone(), name: `Resident ${flat.number}`, flatId: flat.id } }));
  return { community, captain, residents, actor: { id: captain.id, role: "CAPTAIN" as const, communityId: community.id } };
}

/** One grocery product (₹500 / ₹465 / ₹440 rice) and one AC service with two time slots. */
export async function makeCatalogue() {
  const goods = await prisma.vendor.create({ data: { name: "Balaji", kind: "GOODS", phone: "+912024000001", city: "Pune" } });
  const rice = await prisma.product.create({
    data: {
      vendorId: goods.id,
      name: "Rice",
      category: "GRAINS_FLOUR",
      unit: "KG",
      packSize: 5,
      mrpPaise: 55000,
      gstBps: 500,
      minOrderQty: 10,
      defaultMaxPerFlat: 4,
      tiers: { create: [{ minQty: 1, vendorPricePaise: 46232 }, { minQty: 20, vendorPricePaise: 42996 }, { minQty: 50, vendorPricePaise: 40684 }] },
    },
  });
  const services = await prisma.vendor.create({ data: { name: "CoolCare", kind: "SERVICES", phone: "+912024000013", city: "Pune" } });
  const ac = await prisma.service.create({
    data: {
      vendorId: services.id,
      category: "AC",
      name: "AC servicing",
      description: "Jet wash",
      minFlats: 5,
      noAccessFeePaise: 14900,
      durationMinutes: 60,
      gstBps: 1800,
      options: {
        create: [
          { name: "Split AC", unitLabel: "unit", mrpPaise: 89900, maxPerFlat: 4, sortOrder: 0, tiers: { create: [{ minFlats: 1, vendorPricePaise: 57512 }, { minFlats: 5, vendorPricePaise: 45170 }] } },
          { name: "Window AC", unitLabel: "unit", mrpPaise: 79900, maxPerFlat: 3, sortOrder: 1, tiers: { create: [{ minFlats: 1, vendorPricePaise: 49000 }] } },
        ],
      },
      slotTemplates: { create: [{ startTime: "09:00", endTime: "11:00", technicians: 3 }, { startTime: "14:00", endTime: "16:00", technicians: 2 }] },
    },
  });
  return { goods, rice, services, ac };
}
