import { describe, expect, it } from "vitest";

import {
  getMinimumQuantityTagForPrice,
  getMinimumQuantityTagForPrices,
  reconcileManagedMinimumQuantityTags,
} from "./shopify-seo-managed-tags.js";

describe("Shopify SEO managed minimum-quantity tags", () => {
  it.each([
    ["14.99", "minimum-qty-3"],
    ["15.00", ""],
    ["15.01", "minimum-qty-2"],
    ["24.99", "minimum-qty-2"],
    ["25.00", ""],
  ])("maps price %s to %s", (price, expected) => {
    expect(getMinimumQuantityTagForPrice(price)).toBe(expected);
  });

  it("uses the lowest effective variant price", () => {
    expect(getMinimumQuantityTagForPrices(["29.99", "12.99", "19.99"])).toBe("minimum-qty-3");
  });

  it("preserves merchant tags while replacing stale managed tags", () => {
    expect(
      reconcileManagedMinimumQuantityTags(
        ["Summer", "minimum-qty-2", "Featured", "minimum-qty-3"],
        "minimum-qty-2",
      ),
    ).toEqual(["Summer", "Featured", "minimum-qty-2"]);
  });

  it("removes managed tags when the product no longer qualifies", () => {
    expect(reconcileManagedMinimumQuantityTags("Summer, minimum-qty-3", "")).toEqual(["Summer"]);
  });
});
