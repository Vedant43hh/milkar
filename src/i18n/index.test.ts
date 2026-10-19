import { describe, expect, it } from "vitest";
import { interpolate, t } from "./index";

describe("i18n", () => {
  it("looks up nested keys", () => {
    expect(t("app.name")).toBe("Milkar");
    expect(t("units.DOZEN")).toBe("dozen");
  });

  it("fills placeholders", () => {
    expect(t("meter.unlock", { n: 8, unit: "bags", price: "₹440" })).toBe("8 more bags to unlock ₹440!");
  });

  it("leaves unknown placeholders visible", () => {
    expect(interpolate("Hello {name} from {flat}", { name: "Asha" })).toBe("Hello Asha from {flat}");
  });
});
