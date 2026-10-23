import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { photoForViewer } from "@/server/repairs";

/**
 * A booking's problem photo, for the people allowed to see it (the flat, its technician, the
 * vendor, the community's managers). Anyone else gets the same 404 as for a photo that doesn't exist.
 */
export async function GET(_request: NextRequest, { params }: RouteContext<"/api/photos/[photoId]">) {
  const { photoId } = await params;
  const user = await getCurrentUser();
  const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!user) return notFound();
  const photo = await photoForViewer(
    { id: user.id, role: user.role, flatId: user.flatId, vendorId: user.vendor?.id ?? null, managesCommunityId: user.staff?.community.id ?? null },
    photoId,
  );
  if (!photo) return notFound();
  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.contentType,
      "Content-Length": String(photo.data.length),
      // Personal: never in a shared cache. A new photo gets a new id, so a short private cache is safe.
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
