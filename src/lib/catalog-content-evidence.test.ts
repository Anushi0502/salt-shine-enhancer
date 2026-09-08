import { describe, expect, it } from "vitest";
import {
  buildProductSpecificDescription,
  deriveProductType,
  extractEvidenceFacts,
  isEarbudsCaseEvidence,
  isGenericProductContent,
} from "./catalog-content-evidence.js";

const tripodSignals = {
  handle: "fangtuosi-1800mm-tripod-for-smartphone-camera-tripods-stand",
  sourceTitle: "Fangtuosi 1800mm Tripod For Smartphone Camera Tripods Stand",
  sourceProductType: "Brackets Phone Holder",
  sourceBodyHtml: "Aluminum tripod stand for smartphones and cameras with a wireless remote and adjustable height.",
  variantOptionValues: ["1800mm", "Black", "Wireless Remote"],
  sourceTags: ["tripod", "camera accessories"],
};

describe("catalog content evidence", () => {
  it("keeps an AirPods TPU case out of the core earbuds noun", () => {
    const signals = {
      handle: "2025-for-airpods-4generation-airpods-4-bluetooth-earphones-anc-wireless-headphones-earbuds-noise-cancelling-transparent-tpu-case",
      sourceTitle: "Airpods 4 Wireless Bluetooth Earbuds With Anc",
      sourceProductType: "phone case",
    };

    expect(isEarbudsCaseEvidence(signals)).toBe(true);
    expect(deriveProductType(signals)).toBe("Earbuds Case");
    expect(buildProductSpecificDescription({ title: "Transparent TPU Earbuds Case for AirPods 4", signals })).toMatch(/an earbuds case/i);
  });

  it("keeps supplier SKU identifiers out of visible variant facts", () => {
    const facts = extractEvidenceFacts({
      ...{
        handle: "airpods-4-transparent-tpu-case",
        sourceTitle: "AirPods 4 Transparent TPU Case",
        sourceProductType: "phone case",
      },
      variantOptionValues: [
        "B153 / For AirPods 4",
        "14:1254#B153;5:361386#For AirPods 4",
        "14:1254#B153",
      ],
    });
    const options = facts.find((fact) => fact.label === "Variant options")?.value || "";

    expect(options).toContain("For AirPods 4");
    expect(options).not.toMatch(/14:1254|361386|B153/);
  });

  it("rejects an unrelated product type in favor of title and handle evidence", () => {
    expect(deriveProductType(tripodSignals)).toBe("tripod");
  });

  it("extracts facts from body, options, and product identity", () => {
    const facts = extractEvidenceFacts(tripodSignals);
    expect(facts.map((fact) => fact.label)).toEqual(expect.arrayContaining([
      "Size or capacity",
      "Material",
      "Features",
      "Variant options",
    ]));
  });

  it("does not emit the old generic description pattern", () => {
    const description = buildProductSpecificDescription({
      title: tripodSignals.sourceTitle,
      signals: tripodSignals,
    });
    expect(isGenericProductContent(description)).toBe(false);
    expect(description).toContain("1800mm");
    expect(description).toContain("Wireless Remote");
    expect(description).not.toContain("serves the specific function identified");
  });

  it("removes legacy filler while retaining the product noun and facts", () => {
    const description = buildProductSpecificDescription({
      title: "40-Piece Everyday Square Dinnerware Set",
      signals: {
        handle: "40-piece-everyday-square-dinnerware-set-for-dining-table",
        sourceTitle: "40-Piece Everyday Square Dinnerware Set",
        sourceBodyHtml: "This everyday product serves the specific function identified by its handle and confirmed product facts.",
        variantOptionValues: ["United States", "200007763:201336106"],
        sourceTags: ["dining-essentials"],
      },
    });
    expect(description).toContain("dinner set");
    expect(description).not.toMatch(/everyday product|specific function identified/i);
    expect(description).not.toContain("200007763:201336106");
  });

  it("rejects the newer generic supplied-information fallback", () => {
    const legacy = "A keyboard described by the supplied product information.";
    expect(isGenericProductContent(legacy)).toBe(true);

    const description = buildProductSpecificDescription({
      title: "87 Key Wired RGB Mechanical Gaming Keyboard",
      signals: {
        handle: "87-key-gaming-keyboard-wired-rgb-mechanical-keyboard",
        sourceTitle: "87 Key Wired RGB Mechanical Gaming Keyboard",
        sourceBodyHtml: legacy,
        variantOptionValues: ["Black Red switch", "White Blue switch"],
      },
    });

    expect(description).not.toContain("described by the supplied product information");
    expect(description).toContain("keyboard");
    expect(description).toContain("87 key");
  });
});
