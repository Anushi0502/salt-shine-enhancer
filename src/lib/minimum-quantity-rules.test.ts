import { describe, expect, it } from "vitest";
import { getMinimumProductQuantity, isMinimumTwoBundleProduct } from "@/lib/minimum-quantity-rules";

describe("minimum quantity bundle rules", () => {
  it("forces the special bundle handles to minimum quantity 2", () => {
    expect(getMinimumProductQuantity("star-magic-payment-wand-extendable-touchscreen-pointer")).toBe(2);
    expect(getMinimumProductQuantity("graduation-money-box-gift-holder-pull-out-cash-surprise")).toBe(2);
    expect(getMinimumProductQuantity("motorcycle-face-mask-balaclava-windproof-breathable")).toBe(2);
    expect(isMinimumTwoBundleProduct("full-face-balaclava-mask-breathable-windproof-riding-hood")).toBe(true);
  });

  it("keeps normal products at minimum quantity 1", () => {
    expect(getMinimumProductQuantity("some-other-product")).toBe(1);
    expect(isMinimumTwoBundleProduct("some-other-product")).toBe(false);
  });
});
