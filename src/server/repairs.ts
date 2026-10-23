import "server-only";
import type { Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { checkPhoto, type PhotoError } from "@/lib/photos";

// What's wrong, for a repair visit: the resident's note and an optional photo on their booking.
// Editable until the technician sets out. The photo is shown only to the flat, the technician
// assigned to it, the vendor and the community's Society Managers.

export const MAX_PROBLEM_NOTE = 500;

type Resident = { id: string; role: Role; flatId: string | null };
export type ProblemError = "NOT_FOUND" | "TOO_LATE" | "NOTE_TOO_LONG" | PhotoError;

/** The flat's booking in a round, while the problem can still be changed. */
async function editableBooking(resident: Resident, roundId: string): Promise<{ ok: true; bookingId: string } | { ok: false; error: "NOT_FOUND" | "TOO_LATE" }> {
  if (resident.role !== "RESIDENT" || !resident.flatId) return { ok: false, error: "NOT_FOUND" };
  const booking = await prisma.serviceBooking.findFirst({
    where: { roundId, flatId: resident.flatId, status: { in: ["ACTIVE", "HELD"] } },
    select: { id: true, visits: { select: { status: true } } },
  });
  if (!booking) return { ok: false, error: "NOT_FOUND" };
  if (booking.visits.some((v) => v.status !== "SCHEDULED")) return { ok: false, error: "TOO_LATE" };
  return { ok: true, bookingId: booking.id };
}

export async function saveProblemNote(resident: Resident, roundId: string, note: string): Promise<{ ok: true } | { ok: false; error: ProblemError }> {
  const text = note.trim();
  if (text.length > MAX_PROBLEM_NOTE) return { ok: false, error: "NOTE_TOO_LONG" };
  const booking = await editableBooking(resident, roundId);
  if (!booking.ok) return booking;
  await prisma.serviceBooking.update({ where: { id: booking.bookingId }, data: { problemNote: text || null } });
  return { ok: true };
}

/** Replaces the booking's photo (a new id, so nobody sees a cached old one). */
export async function saveProblemPhoto(resident: Resident, roundId: string, photo: { bytes: Uint8Array; width: number; height: number }, now: Date): Promise<{ ok: true; photoId: string } | { ok: false; error: ProblemError }> {
  const check = checkPhoto(photo.bytes, photo.width, photo.height);
  if (!check.ok) return check;
  const booking = await editableBooking(resident, roundId);
  if (!booking.ok) return booking;
  const saved = await prisma.$transaction(async (tx) => {
    await tx.bookingPhoto.deleteMany({ where: { bookingId: booking.bookingId } });
    return tx.bookingPhoto.create({
      data: {
        bookingId: booking.bookingId,
        contentType: check.contentType,
        data: Buffer.from(photo.bytes),
        sizeBytes: photo.bytes.length,
        width: photo.width,
        height: photo.height,
        uploadedById: resident.id,
        createdAt: now,
      },
      select: { id: true },
    });
  });
  return { ok: true, photoId: saved.id };
}

export async function removeProblemPhoto(resident: Resident, roundId: string): Promise<{ ok: true } | { ok: false; error: ProblemError }> {
  const booking = await editableBooking(resident, roundId);
  if (!booking.ok) return booking;
  await prisma.bookingPhoto.deleteMany({ where: { bookingId: booking.bookingId } });
  return { ok: true };
}

export type PhotoViewer = { id: string; role: Role; flatId: string | null; vendorId: string | null; managesCommunityId: string | null };

/** The photo's bytes, or null if it doesn't exist or this person may not see it (indistinguishable). */
export async function photoForViewer(viewer: PhotoViewer, photoId: string): Promise<{ contentType: string; data: Uint8Array } | null> {
  const photo = await prisma.bookingPhoto.findUnique({
    where: { id: photoId },
    select: {
      contentType: true,
      data: true,
      booking: { select: { flatId: true, round: { select: { vendorId: true, communityId: true } }, visits: { select: { technicianId: true } } } },
    },
  });
  if (!photo) return null;
  const { booking } = photo;
  const allowed =
    (viewer.role === "RESIDENT" && viewer.flatId === booking.flatId) ||
    (viewer.role === "TECHNICIAN" && booking.visits.some((v) => v.technicianId === viewer.id)) ||
    (viewer.role === "VENDOR" && viewer.vendorId !== null && viewer.vendorId === booking.round.vendorId) ||
    (viewer.role === "MANAGER" && viewer.managesCommunityId === booking.round.communityId);
  return allowed ? { contentType: photo.contentType, data: photo.data } : null;
}
