import { describe, expect, it } from "vitest";
import { checkPhoto, fitWithin, MAX_PHOTO_BYTES, photoType } from "./photos";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const webp = new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8 ")]);
const html = new Uint8Array(Buffer.from("<html><script>alert(1)</script>"));

describe("photoType", () => {
  it("recognises JPEG, PNG and WebP by their first bytes", () => {
    expect(photoType(jpeg)).toBe("image/jpeg");
    expect(photoType(png)).toBe("image/png");
    expect(photoType(webp)).toBe("image/webp");
    expect(photoType(html)).toBeNull();
    expect(photoType(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
});

describe("checkPhoto", () => {
  it("accepts a small real image", () => {
    expect(checkPhoto(jpeg, 1280, 960)).toEqual({ ok: true, contentType: "image/jpeg" });
  });

  it("refuses anything that isn't one", () => {
    expect(checkPhoto(new Uint8Array(), 10, 10)).toEqual({ ok: false, error: "EMPTY" });
    expect(checkPhoto(html, 10, 10)).toEqual({ ok: false, error: "NOT_AN_IMAGE" });
    const big = new Uint8Array(MAX_PHOTO_BYTES + 1);
    big.set(jpeg);
    expect(checkPhoto(big, 10, 10)).toEqual({ ok: false, error: "TOO_BIG" });
    expect(checkPhoto(jpeg, 0, 10)).toEqual({ ok: false, error: "BAD_SIZE" });
    expect(checkPhoto(jpeg, 10, 1.5)).toEqual({ ok: false, error: "BAD_SIZE" });
  });
});

describe("fitWithin", () => {
  it("shrinks the long side to 1280 and keeps the shape", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1280, height: 960 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 960, height: 1280 });
  });

  it("never enlarges a small photo", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
