import { describe, expect, it } from "vitest";
import { getMinimumProductQuantity, isMinimumTwoBundleProduct } from "@/lib/minimum-quantity-rules";

describe("minimum quantity rules", () => {
  it("allows every product to be ordered individually", () => {
    expect(getMinimumProductQuantity("some-other-product")).toBe(1);
    expect(getMinimumProductQuantity("some-other-product", 0.01)).toBe(1);
    expect(getMinimumProductQuantity("star-magic-payment-wand-extendable-touchscreen-pointer")).toBe(1);
    expect(getMinimumProductQuantity("motorcycle-face-mask-balaclava-windproof-breathable", 14.99)).toBe(1);
    expect(getMinimumProductQuantity("some-other-product", 75, 4)).toBe(1);
    expect(isMinimumTwoBundleProduct("some-other-product")).toBe(false);
    expect(isMinimumTwoBundleProduct("motorcycle-face-mask-balaclava-windproof-breathable", 14.99, 3)).toBe(false);
  });
});
