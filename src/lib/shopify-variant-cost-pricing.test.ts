import { describe, expect, it } from "vitest";

import {
  buildCostBasedVariantPricePlan,
  buildVariantCostPriceAlignmentPlan,
  costBasedTargetPrice,
  costProtectedMinimumPrice,
  marketPriceMarginTarget,
} from "@/lib/shopify-variant-cost-pricing.js";

describe("variant cost-price alignment", () => {
  it("uses the approved cost band, overhead, and .99 rounding", () => {
    expect(costBasedTargetPrice("10.00")).toBe("49.99");
    expect(costBasedTargetPrice("15.00", { clothing: true })).toBe("54.99");
  });

  it("adds a non-compounding 20 percent market-anchor markup", () => {
    expect(marketPriceMarginTarget("39.99", { marginPercent: 0.2 })).toBe("47.99");
    expect(marketPriceMarginTarget("39.99", { marginPercent: 0.2, priceFloor: 50 })).toBe("50.99");
  });

  it("combines market margin with cost protection without flattening variants", () => {
    const marketAnchors = new Map([
      ["one", { price: "39.99", capturedAt: "2026-09-08T00:00:00Z" }],
      ["two", { price: "79.99", capturedAt: "2026-09-08T00:00:00Z" }],
    ]);
    const plan = buildCostBasedVariantPricePlan([
      {
        handle: "market-margin-variants",
        variants: [
          { id: "one", title: "1pc", cost_per_item: "10.00", price: "39.99" },
          { id: "two", title: "2pc", cost_per_item: "10.00", price: "79.99" },
        ],
      },
    ], { marketMarginPercent: 0.2, marketAnchors });

    expect(plan.blockingHeld).toHaveLength(0);
    expect(plan.byHandle.get("market-margin-variants")).toEqual([
      expect.objectContaining({ variantId: "one", price: "49.99", marketAnchorPrice: "39.99" }),
      expect.objectContaining({ variantId: "two", price: "95.99", marketAnchorPrice: "79.99" }),
    ]);
  });

  it("does not compound the market-anchor uplift on a later run", () => {
    const plan = buildCostBasedVariantPricePlan([
      {
        handle: "market-margin-idempotent",
        variants: [{ id: "one", title: "Default", cost_per_item: "10.00", price: "49.99" }],
      },
    ], {
      marketMarginPercent: 0.2,
      marketAnchors: new Map([["one", { price: "39.99" }]]),
    });

    expect(plan.summary.variantsToUpdate).toBe(0);
    expect(plan.byHandle.size).toBe(0);
  });

  it("prices every variant independently and validates compare-at separately", () => {
    const plan = buildCostBasedVariantPricePlan([
      {
        handle: "mixed-quantity-product",
        variants: [
          { id: "one", title: "1pc", cost_per_item: "10.00", price: "39.99", compare_at_price: "44.99" },
          { id: "two", title: "2pcs", cost_per_item: "15.00", price: "99.99", compare_at_price: "119.99" },
        ],
      },
    ]);

    expect(plan.blockingHeld).toHaveLength(0);
    expect(plan.byHandle.get("mixed-quantity-product")).toEqual([
      expect.objectContaining({
        variantId: "one",
        quantity: 1,
        price: "49.99",
        compareAtPrice: null,
        compareAtAction: "clear-invalid-compare-at",
      }),
      expect.objectContaining({
        variantId: "two",
        quantity: 2,
        price: "54.99",
        compareAtPrice: "119.99",
      }),
    ]);
  });

  it("blocks the plan when live cost is missing instead of guessing", () => {
    const plan = buildCostBasedVariantPricePlan([
      {
        handle: "missing-cost",
        variants: [{ id: "one", title: "Standard", price: "49.99" }],
      },
    ]);

    expect(plan.summary.variantsWithMissingCost).toBe(1);
    expect(plan.blockingHeld).toEqual([
      expect.objectContaining({ reason: "missing-live-cost-for-cost-based-pricing" }),
    ]);
  });

  it("uses a higher .99 retail target for clothing", () => {
    expect(costProtectedMinimumPrice("10.00", {
      campaignCostPerOrder: 18,
      minContributionMargin: 0.3,
      clothingMinContributionMargin: 0.43,
      retailPriceEnding: true,
      priceFloor: 35,
    })).toBe("49.99");
  });

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

    expect(plan.summary.variantsToUpdate).toBe(2);
    expect(plan.byHandle.get("mixed-bundle")?.map((entry) => entry.price)).toEqual(["49.99", "47.15"]);
    expect(plan.held).toHaveLength(0);
  });

  it("protects contribution margin with campaign cost and the catalog floor", () => {
    expect(costProtectedMinimumPrice("15.00", {
      campaignCostPerOrder: 18,
      minContributionMargin: 0.3,
      priceFloor: 35,
    })).toBe("47.15");

    const plan = buildVariantCostPriceAlignmentPlan([
      {
        handle: "t-shirt",
        variants: [{ id: 1, title: "Standard", cost_per_item: "15.00", price: "39.99" }],
      },
    ]);

    expect(plan.summary.variantsBelowProtectionTarget).toBe(1);
    expect(plan.byHandle.get("t-shirt")).toEqual([
      expect.objectContaining({
        currentPrice: "39.99",
        price: "57.99",
        reason: "cost-and-campaign-contribution-protection",
      }),
    ]);
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

    expect(plan.summary.variantsToUpdate).toBe(1);
    expect(plan.held).toHaveLength(0);
  });

  it("repairs a wild same-cost sibling price without touching quantity tiers", () => {
    const plan = buildVariantCostPriceAlignmentPlan([
      {
        handle: "wild-price-product",
        variants: [
          { id: 1, title: "Backpack", cost_per_item: "10.00", price: "49.99" },
          { id: 2, title: "Lunch box", cost_per_item: "11.00", price: "299.99" },
          { id: 3, title: "2pcs", cost_per_item: "10.50", price: "79.99" },
        ],
      },
    ]);

    expect(plan.summary.priceOutlierGroups).toBe(1);
    expect(plan.summary.priceOutlierVariants).toBe(1);
    expect(plan.byHandle.get("wild-price-product")).toEqual([
      expect.objectContaining({
        variantId: "2",
        currentPrice: "299.99",
        price: "49.99",
        reason: expect.stringContaining("same-product-wild-price-outlier"),
      }),
    ]);
  });

  it("repairs a random same-quantity color price when live costs match", () => {
    const plan = buildVariantCostPriceAlignmentPlan([
      {
        handle: "colored-four-pack",
        variants: [
          { id: "black", title: "Black 4Pairs", cost_per_item: "10.00", price: "183.99" },
          { id: "blue", title: "Blue 4Pairs", cost_per_item: "10.50", price: "45.99" },
          { id: "red", title: "Red 4Pairs", cost_per_item: "10.25", price: "45.99" },
        ],
      },
    ]);

    expect(plan.summary.variantPeerOutlierGroups).toBe(1);
    expect(plan.byHandle.get("colored-four-pack")).toEqual([
      expect.objectContaining({
        variantId: "black",
        currentPrice: "183.99",
        price: "45.99",
        reason: expect.stringContaining("same-product-wild-price-outlier"),
      }),
    ]);
  });

  it("holds same-quantity peers when their costs prove they are different products", () => {
    const plan = buildVariantCostPriceAlignmentPlan([
      {
        handle: "different-cost-packs",
        variants: [
          { id: "a", title: "Black 4Pairs", cost_per_item: "10.00", price: "250.00" },
          { id: "b", title: "Blue 4Pairs", cost_per_item: "30.00", price: "79.99" },
        ],
      },
    ]);

    expect(plan.summary.variantPeerOutlierGroups).toBe(0);
    expect(plan.priceReview).toEqual([
      expect.objectContaining({ reason: "variant-peer-price-outlier-costs-not-aligned" }),
    ]);
    expect(plan.byHandle.has("different-cost-packs")).toBe(false);
  });

  it("repairs a singleton quantity tier from an unambiguous lower-tier price ladder", () => {
    const plan = buildVariantCostPriceAlignmentPlan([
      {
        handle: "quantity-ladder",
        variants: [
          { id: "five-black", title: "Black 5pcs", cost_per_item: "3.00", price: "64.99" },
          { id: "five-white", title: "White 5pcs", cost_per_item: "3.10", price: "64.99" },
          { id: "fifty-black", title: "Black 50pcs", cost_per_item: "3.20", price: "649.99" },
          { id: "fifty-white", title: "White 50pcs", cost_per_item: "3.10", price: "64.99" },
          { id: "hundred-black", title: "Black 100pcs", cost_per_item: "3.20", price: "64.99" },
        ],
      },
    ]);

    expect(plan.byHandle.get("quantity-ladder")).toEqual([
      expect.objectContaining({ variantId: "fifty-white", price: "649.99" }),
      expect.objectContaining({ variantId: "hundred-black", price: "649.99" }),
    ]);
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
