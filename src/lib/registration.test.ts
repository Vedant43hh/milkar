import { describe, expect, it } from "vitest";
import {
  communityCodeFrom,
  flatCount,
  generateFlats,
  isSelfRegistrationRole,
  isValidGstin,
  layoutProblems,
  MAX_FLATS,
  parseBlocks,
  parsePincodes,
  vendorChecklist,
} from "./registration";

describe("who can register", () => {
  it("lets people register as residents, Society Managers or vendors, never as admins or technicians", () => {
    for (const role of ["RESIDENT", "MANAGER", "VENDOR"]) expect(isSelfRegistrationRole(role)).toBe(true);
    for (const role of ["ADMIN", "TECHNICIAN", "admin", "", null, undefined, 1]) expect(isSelfRegistrationRole(role)).toBe(false);
  });
});

describe("a new community's flats", () => {
  it("reads block names as lists and ranges", () => {
    expect(parseBlocks("A, B, C")).toEqual(["A", "B", "C"]);
    expect(parseBlocks("a-d")).toEqual(["A", "B", "C", "D"]);
    expect(parseBlocks("1-3, Annexe")).toEqual(["1", "2", "3", "ANNEXE"]);
    expect(parseBlocks("D-A")).toBeNull();
    expect(parseBlocks("A, A")).toBeNull();
    expect(parseBlocks("A; <script>")).toBeNull();
    expect(parseBlocks("")).toEqual([]);
  });

  it("numbers flats by floor and unit, as Indian buildings do", () => {
    const flats = generateFlats({ blocks: ["A", "B"], floors: 12, unitsPerFloor: 4 });
    expect(flats).toHaveLength(96);
    expect(flats.slice(0, 5)).toEqual([
      { tower: "A", number: "101" },
      { tower: "A", number: "102" },
      { tower: "A", number: "103" },
      { tower: "A", number: "104" },
      { tower: "A", number: "201" },
    ]);
    expect(flats.at(-1)).toEqual({ tower: "B", number: "1204" });
    expect(new Set(flats.map((f) => `${f.tower}-${f.number}`)).size).toBe(96);
  });

  it("refuses empty or oversized layouts", () => {
    expect(layoutProblems({ blocks: [], floors: 0, unitsPerFloor: 0 })).toEqual(["NO_BLOCKS", "BAD_FLOORS", "BAD_UNITS"]);
    expect(layoutProblems({ blocks: ["A"], floors: 5, unitsPerFloor: 2 })).toEqual([]);
    const huge = { blocks: Array.from({ length: 40 }, (_, i) => String(i + 1)), floors: 20, unitsPerFloor: 4 };
    expect(flatCount(huge)).toBeGreaterThan(MAX_FLATS);
    expect(layoutProblems(huge)).toEqual(["TOO_MANY_FLATS"]);
    expect(layoutProblems({ blocks: ["A"], floors: 2.5, unitsPerFloor: 2 })).toEqual(["BAD_FLOORS"]);
  });

  it("makes a short, unique invite code from the name", () => {
    const none = () => false;
    expect(communityCodeFrom("Lakeview Residency", none)).toBe("LAKEVIEW");
    expect(communityCodeFrom("Sai Krupa CHS", none)).toBe("SAIKRUPA");
    expect(communityCodeFrom("A1 Heights", none)).toBe("AHEIGHTS");
    expect(communityCodeFrom("Om", none)).toBe("OMHOME");
    const taken = new Set(["LAKEVIEW", "LAKEVIE2"]);
    expect(communityCodeFrom("Lakeview Residency", (c) => taken.has(c))).toBe("LAKEVIE3");
  });
});

describe("vendor details", () => {
  it("reads service-area pincodes", () => {
    expect(parsePincodes("411045, 411057 411045")).toEqual(["411045", "411057"]);
    expect(parsePincodes("411045, 12345")).toBeNull();
    expect(parsePincodes("011045")).toBeNull();
    expect(parsePincodes("")).toBeNull();
  });

  it("checks a GSTIN's format and its check character", () => {
    for (const valid of ["27AAPFU0939F1ZV", "29AAICA3918J1ZE", "07aaacr5055k1z9", " 24AAACC1206D1ZM "]) expect(isValidGstin(valid)).toBe(true);
    expect(isValidGstin("27AAPFU0939F1ZW")).toBe(false); // wrong check character
    expect(isValidGstin("27AAPFU0939F1V")).toBe(false); // too short
    expect(isValidGstin("ZZAAPFU0939F1ZV")).toBe(false);
  });

  it("lists what a vendor still needs, with GSTIN optional", () => {
    const vendor = { name: "WashWell", phone: "+912024000015", city: "Pune", serviceAreaPincodes: [], gstin: null, catalogueItems: 0, verificationStatus: "PENDING" as const };
    expect(vendorChecklist(vendor).map((i) => [i.key, i.done, i.optional])).toEqual([
      ["BUSINESS", true, false],
      ["SERVICE_AREA", false, false],
      ["GSTIN", false, true],
      ["CATALOGUE", false, false],
      ["REVIEW", false, false],
    ]);
    const ready = vendorChecklist({ ...vendor, serviceAreaPincodes: ["411045"], gstin: "27AAPFU0939F1ZV", catalogueItems: 3, verificationStatus: "VERIFIED" });
    expect(ready.every((i) => i.done)).toBe(true);
  });
});
