// Problem photos residents attach to repair bookings. Pure.
//
// The phone shrinks the photo before upload (at most 1280 px on the long side, JPEG); the server
// only accepts real JPEG, PNG or WebP files of at most 300 KB, recognised by their first bytes
// rather than by what the browser claims.

export const MAX_PHOTO_BYTES = 300 * 1024;
export const MAX_PHOTO_SIDE = 1280;

export type PhotoType = "image/jpeg" | "image/png" | "image/webp";
export type PhotoError = "EMPTY" | "TOO_BIG" | "NOT_AN_IMAGE" | "BAD_SIZE";

export function photoType(bytes: Uint8Array): PhotoType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

/** Checks an upload; width and height come from the phone and only shape the preview. */
export function checkPhoto(bytes: Uint8Array, width: number, height: number): { ok: true; contentType: PhotoType } | { ok: false; error: PhotoError } {
  if (bytes.length === 0) return { ok: false, error: "EMPTY" };
  if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, error: "TOO_BIG" };
  const contentType = photoType(bytes);
  if (!contentType) return { ok: false, error: "NOT_AN_IMAGE" };
  const side = (n: number) => Number.isInteger(n) && n >= 1 && n <= 8000;
  if (!side(width) || !side(height)) return { ok: false, error: "BAD_SIZE" };
  return { ok: true, contentType };
}

/** The size to shrink a photo to: the long side at most MAX_PHOTO_SIDE, never enlarged. */
export function fitWithin(width: number, height: number, max = MAX_PHOTO_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
