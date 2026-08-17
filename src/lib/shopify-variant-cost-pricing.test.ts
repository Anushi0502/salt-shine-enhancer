import { describe, expect, it } from "vitest";

import { buildVariantCostPriceAlignmentPlan } from "@/lib/shopify-variant-cost-pricing.js";

describe("variant cost-price alignment", () => {
  it("aligns different variant prices when costs are within two dollars", () => {
    const plan = buildVariantCostPriceAlignmentPlan([
      {
        handle: "mixed-bundle",
        variants: [
          { id: 1, title: "Backpack", cost_per_item: "10.00", price: "49.99" },
          { id: 2, title: "Lunch box", cost_per_item: "11.50", price: "39.99" },
          { id: 3, title: "Pencil case", cost_per_item: "15.00", price: "29.99" },
        ],
      },
    ]);

    expect(plan.summary.variantsToUpdate).toBe(1);
    expect(plan.byHandle.get("mixed-bundle")?.map((entry) => entry.price)).toEqual(["49.99"]);
    expect(plan.held).toHaveLength(0);
  });

  it("does not collapse quantity-tier pricing into one price", () => {
    const plan = buildVariantCostPriceAlignmentPlan([
      {
        handle: "packs",
        variants: [
          { id: 1, title: "1pc", cost_per_item: "10.00", price: "39.99" },
          { id: 2, title: "2pcs", cost_per_item: "11.50", price: "59.99" },
        ],
      },
    ]);

    expect(plan.summary.variantsToUpdate).toBe(0);
    expect(plan.held).toHaveLength(0);
  });

  it("clears an invalid compare-at value when raising the variant price", () => {
    const plan = buildVariantCostPriceAlignmentPlan([
      {
        handle: "compare-at",
        variants: [
          { id: 1, title: "A", cost_per_item: "10.00", price: "39.99", compare_at_price: "45.00" },
          { id: 2, title: "B", cost_per_item: "11.00", price: "49.99" },
        ],
      },
    ]);

    expect(plan.byHandle.get("compare-at")).toEqual([
      expect.objectContaining({
        price: "49.99",
        compareAtPrice: null,
        compareAtAction: "clear-invalid-compare-at",
      }),
    ]);
    expect(plan.held[0].reason).toBe("compare-at-would-not-exceed-target-price");
    expect(plan.blockingHeld).toHaveLength(0);
  });
});
