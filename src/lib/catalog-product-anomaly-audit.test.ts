import { describe, expect, it } from "vitest";

import {
  buildProductAnomalyAudit,
  detectCostAnomalies,
  detectOptionAnomalies,
  detectPriceAnomalies,
  isHairColorCode,
  isLengthLikeValue,
} from "./catalog-product-anomaly-audit.js";

describe("catalog product anomaly audit", () => {
  it("recognizes the screenshot's length and hair-color values", () => {
    expect(isLengthLikeValue("4inches")).toBe(true);
    expect(isHairColorCode("#1B", { hairProduct: true })).toBe(true);
  });

  it("does not treat combined dimensions or non-hair size values as hair evidence", () => {
    expect(isLengthLikeValue("43mm-black")).toBe(false);
    expect(isHairColorCode("18W")).toBe(false);
    expect(isHairColorCode("40g")).toBe(false);
  });

  it("flags swapped option labels on a wig", () => {
    const product = {
      id: "p1",
      handle: "straight-human-hair-wig",
      title: "Straight Human Hair Wig",
      productType: "wig",
      options: [
        { name: "Color", position: 1, values: ["4inches"] },
        { name: "Size", position: 2, values: ["#1B"] },
      ],
      variants: [{
        id: "v1",
        title: "4inches / #1B",
        selectedOptions: [
          { name: "Color", value: "4inches" },
          { name: "Size", value: "#1B" },
        ],
      }],
    };
    const reasons = detectOptionAnomalies(product).map((issue) => issue.reason);
    expect(reasons).toContain("option-label-value-swap");
    expect(reasons).toContain("color-label-length-value");
    expect(reasons).toContain("size-label-hair-color-code");
  });

  it("does not flag legitimate apparel color and size options", () => {
    const product = {
      id: "p2",
      handle: "classic-shirt",
      title: "Classic Shirt",
      productType: "shirt",
      options: [
        { name: "Color", position: 1, values: ["Black"] },
        { name: "Size", position: 2, values: ["L"] },
      ],
      variants: [{
        id: "v2",
        title: "Black / L",
        selectedOptions: [
          { name: "Color", value: "Black" },
          { name: "Size", value: "L" },
        ],
      }],
    };
    expect(detectOptionAnomalies(product)).toEqual([]);
  });

  it("flags a wild price against comparable products and preserves evidence", () => {
    const products = Array.from({ length: 6 }, (_, index) => ({
      id: `p${index}`,
      handle: `umbrella-${index}`,
      title: `Folding Umbrella ${index}`,
      productType: "umbrella",
      variants: [{ id: `v${index}`, title: "Default Title", price: index === 5 ? "970.99" : "69.99", compareAtPrice: index === 5 ? "1375.99" : null, cost: index === 5 ? "550.00" : "12.00" }],
    }));
    const audit = detectPriceAnomalies(products, { minimumPeerProducts: 5 });
    expect(audit.anomalies.some((issue) => issue.handle === "umbrella-5" && issue.reason === "cross-product-peer-price-outlier")).toBe(true);
    expect(audit.anomalies.some((issue) => issue.handle === "umbrella-5" && issue.reason === "cross-product-peer-compare-at-outlier")).toBe(true);
  });

  it("flags price-floor and invalid compare-at violations", () => {
    const audit = detectPriceAnomalies([{
      id: "p-floor",
      handle: "floor-check",
      title: "Floor Check",
      variants: [{ id: "v-floor", price: "29.99", compareAtPrice: "24.99" }],
    }], { priceFloor: 35 });
    expect(audit.anomalies.map((issue) => issue.reason)).toEqual(expect.arrayContaining([
      "below-price-floor",
      "compare-at-below-current-price",
    ]));
  });

  it("flags a deterministic high-cost peer outlier for quarantine", () => {
    const products = Array.from({ length: 6 }, (_, index) => ({
      id: `p-cost-${index}`,
      handle: `umbrella-cost-${index}`,
      title: `Folding Umbrella Cost ${index}`,
      productType: "umbrella",
      variants: [{ id: `v-cost-${index}`, price: "69.99", cost: index === 5 ? "550.00" : "12.00" }],
    }));
    const audit = detectCostAnomalies(products);
    expect(audit.anomalies.some((issue) => issue.handle === "umbrella-cost-5" && issue.quarantineEligible)).toBe(true);
  });

  it("summarizes both audit families without mutating input", () => {
    const product = { id: "p3", handle: "single-bottle", title: "Water Bottle", variants: [{ id: "v3", price: "45.99", cost: "5.00" }] };
    const before = JSON.stringify(product);
    const result = buildProductAnomalyAudit([product]);
    expect(result.summary.productsInspected).toBe(1);
    expect(JSON.stringify(product)).toBe(before);
  });
});
