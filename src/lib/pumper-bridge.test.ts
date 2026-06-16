import { describe, expect, it } from "vitest";
import { findBundleCartItemIndex } from "@/lib/pumper-bridge";

describe("findBundleCartItemIndex", () => {
  it("matches the cart line item by variant id before falling back to handle", () => {
    const items = [
      {
        handle: "natural-pure-white-beeswax-blocks-diy-candle-aromatherapy-crafting-supplies",
        shopifyVariantId: 43499460722787,
        unitPrice: 29.99,
      },
      {
        handle: "natural-pure-white-beeswax-blocks-diy-candle-aromatherapy-crafting-supplies",
        shopifyVariantId: 43499460722788,
        unitPrice: 34.99,
      },
    ];

    expect(
      findBundleCartItemIndex(items, {
        handle: "natural-pure-white-beeswax-blocks-diy-candle-aromatherapy-crafting-supplies",
        variantId: 43499460722788,
        unitPrice: 69.98,
      }),
    ).toBe(1);
  });

  it("falls back to the shared handle when no variant id is available", () => {
    const items = [
      {
        handle: "natural-pure-white-beeswax-blocks-diy-candle-aromatherapy-crafting-supplies",
        shopifyVariantId: 43499460722787,
        unitPrice: 29.99,
      },
    ];

    expect(
      findBundleCartItemIndex(items, {
        handle: "natural-pure-white-beeswax-blocks-diy-candle-aromatherapy-crafting-supplies",
        variantId: null,
        unitPrice: 29.99,
      }),
    ).toBe(0);
  });
});
