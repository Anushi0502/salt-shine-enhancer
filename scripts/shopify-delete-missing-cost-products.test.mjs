import { describe, expect, it } from "vitest";

import { missingCostVariants, variantCost } from "./shopify-delete-missing-cost-products.mjs";

describe("missing-cost product deletion scan", () => {
  it("treats null or invalid live costs as missing but preserves zero cost", () => {
    expect(variantCost({ inventoryItem: { unitCost: { amount: "0.00" } } })).toBe(0);
    expect(variantCost({ inventoryItem: { unitCost: { amount: "10.00" } } })).toBe(10);
    expect(variantCost({ inventoryItem: { unitCost: null } })).toBeNull();
    expect(variantCost({ inventoryItem: { unitCost: { amount: "not-a-number" } } })).toBeNull();
  });

  it("selects a product when any active variant lacks live cost", () => {
    expect(missingCostVariants({
      variants: [
        { id: "one", inventoryItem: { unitCost: { amount: "10.00" } } },
        { id: "two", inventoryItem: { unitCost: null } },
      ],
    }).map((variant) => variant.id)).toEqual(["two"]);
  });
});
