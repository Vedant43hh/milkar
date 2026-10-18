import { prisma } from "@/lib/db";

export async function makeSociety(code: string, flats: [tower: string, number: string][] = [["A", "101"], ["A", "102"]]) {
  return prisma.society.create({
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
