import type { Role } from "@/lib/auth/rules";

// Who is acting in the vendor portal. Only the vendor's own account runs the business; its
// technicians share the vendor id but work from the technician portal.

export type VendorActor = { id: string; role: Role; vendorId: string | null };

export function vendorActorOf(user: { id: string; role: Role; vendor: { id: string } | null }): VendorActor {
  return { id: user.id, role: user.role, vendorId: user.vendor?.id ?? null };
}

/** The vendor this account runs, or null (a technician, or anyone else). */
export function runsVendor(actor: VendorActor): string | null {
  return actor.role === "VENDOR" ? actor.vendorId : null;
}
