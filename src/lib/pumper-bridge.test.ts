import { describe, expect, it } from "vitest";
import { collectLeafMatchingElements, findBundleCartItemIndex, replaceMoneyInElement } from "@/lib/pumper-bridge";

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

describe("pumper pricing DOM helpers", () => {
  it("selects the smallest matching price wrapper", () => {
    document.body.innerHTML = `
      <div id="card">
        <div class="outer">
          <span>Save</span>
          <span class="inner">Save $23.99</span>
        </div>
      </div>
    `;

    const card = document.getElementById("card") as HTMLElement;
    const matches = collectLeafMatchingElements(card, (text) => /^save\b/i.test(text) && /\$\s*[\d,]+(?:\.\d+)?/.test(text));

    expect(matches).toHaveLength(1);
    expect(matches[0].className).toBe("inner");
  });

  it("replaces the money value without flattening nested markup", () => {
    document.body.innerHTML = `
      <div id="field">
        <span class="label">Save</span>
        <span class="amount">$23.99</span>
      </div>
    `;

    const field = document.getElementById("field") as HTMLElement;
    const beforeMarkup = field.innerHTML;
    const changed = replaceMoneyInElement(field, 19.5);

    expect(changed).toBe(true);
    expect(field.innerHTML).not.toBe(beforeMarkup);
    expect(field.querySelectorAll("span")).toHaveLength(2);
    expect(field.textContent).toContain("Save");
    expect(field.textContent).toContain("$19.50");
  });
});
