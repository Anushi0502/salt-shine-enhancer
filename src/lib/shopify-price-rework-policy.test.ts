import { describe, expect, it } from "vitest";

import {
  PRICE_REWORK_RULES,
  priceMultiplierFor,
  scalePrice,
} from "@/lib/shopify-price-rework-policy.js";

describe("tiered price rework policy", () => {
  it("keeps the under-$20 multiplier within the approved range", () => {
    expect(priceMultiplierFor(0.01)).toBeGreaterThanOrEqual(PRICE_REWORK_RULES.underTwenty.minMultiplier);
    expect(priceMultiplierFor(0.01)).toBeLessThanOrEqual(PRICE_REWORK_RULES.underTwenty.maxMultiplier);
    expect(priceMultiplierFor(19.99)).toBeGreaterThanOrEqual(PRICE_REWORK_RULES.underTwenty.minMultiplier);
    expect(priceMultiplierFor(19.99)).toBeLessThanOrEqual(PRICE_REWORK_RULES.underTwenty.maxMultiplier);
  });

  it("keeps the $20-$35 multiplier within the approved range", () => {
    expect(priceMultiplierFor(20)).toBe(1.7);
    expect(priceMultiplierFor(34.99)).toBeGreaterThanOrEqual(PRICE_REWORK_RULES.twentyToThirtyFive.minMultiplier);
    expect(priceMultiplierFor(34.99)).toBeLessThanOrEqual(PRICE_REWORK_RULES.twentyToThirtyFive.maxMultiplier);
  });

  it("does not change prices at or above the threshold", () => {
    expect(priceMultiplierFor(35)).toBe(1);
    expect(priceMultiplierFor(49.99)).toBe(1);
  });

  it("rounds scaled prices to cents", () => {
    expect(scalePrice("12.34", 1.9)).toBe("23.45");
  });
});
