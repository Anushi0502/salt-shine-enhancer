import { describe, expect, it } from "vitest";
import { buildVariantPriceRepairPlan, extractVariantQuantity } from "./shopify-variant-pricing.js";

describe("Shopify variant quantity pricing repair", () => {
  it("extracts explicit pack quantities without treating set composition as pack quantity", () => {
    expect(extractVariantQuantity({ title: "50gx3 pieces" })).toBe(3);
    expect(extractVariantQuantity({ title: "2pcs" })).toBe(2);
    expect(extractVariantQuantity({ title: "3 in 1 set" })).toBe(0);
  });

  it("raises repeated 1pc, 2pc, and 3pc prices from the one-unit anchor", () => {
    const plan = buildVariantPriceRepairPlan([
      {
        handle: "rosemary-bundle",
        variants: [
          { id: "v1", title: "1pcs", price: "49.99", compareAtPrice: "64.99" },
          { id: "v2", title: "2pcs", price: "49.99", compareAtPrice: "64.99" },
          { id: "v3", title: "3pcs", price: "49.99", compareAtPrice: "64.99" },
        ],
      },
    ]);

    expect(plan.summary.variantsToUpdate).toBe(2);
    expect(plan.byHandle.get("rosemary-bundle")).toEqual([
      expect.objectContaining({ variantId: "v2", quantity: 2, currentPrice: "49.99", price: "99.99", compareAtPrice: "129.99" }),
      expect.objectContaining({ variantId: "v3", quantity: 3, currentPrice: "49.99", price: "149.99", compareAtPrice: "195.00" }),
    ]);
  });

  it("does not rewrite already differentiated quantity tiers", () => {
    const plan = buildVariantPriceRepairPlan([
      {
        handle: "already-tiered",
        variants: [
          { id: "v1", title: "1pc", price: "49.99" },
          { id: "v2", title: "2pcs", price: "99.99" },
          { id: "v3", title: "3pcs", price: "149.99" },
        ],
      },
    ]);

    expect(plan.byHandle.has("already-tiered")).toBe(false);
    expect(plan.summary.heldGroups).toBe(0);
  });
});
