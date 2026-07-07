import { describe, expect, it } from "vitest";
import {
  buildBundleTiers,
  buildOrdersBundleManifest,
  computeUpdatedCompareAtPrice,
  computeUpdatedPrice,
  getProductLookupCandidates,
  selectLiveVariant,
} from "./shopify-orders-bundle.js";

describe("shopify orders bundle pricing", () => {
  it("applies the 35% uplift and bundle tier pricing", () => {
    expect(computeUpdatedPrice("14.99")).toBe("20.24");
    expect(computeUpdatedCompareAtPrice("14.99", "23.99")).toBe("32.39");
    expect(computeUpdatedCompareAtPrice("14.99", "14.99")).toBe("");

    expect(buildBundleTiers("20.24")).toEqual([
      {
        minimumQuantity: 2,
        discountPercent: 20,
        label: "Buy 2 - 20% Off",
        price: "16.19",
        totalPrice: "32.38",
        savingsTotal: "8.10",
      },
      {
        minimumQuantity: 3,
        discountPercent: 30,
        label: "Buy 3 - 30% Off",
        price: "14.17",
        totalPrice: "42.51",
        savingsTotal: "18.21",
      },
      {
        minimumQuantity: 4,
        discountPercent: 40,
        label: "Buy 4 - 40% Off",
        price: "12.14",
        totalPrice: "48.56",
        savingsTotal: "32.40",
      },
      {
        minimumQuantity: 11,
        discountPercent: 50,
        label: "Bulk 11+ - 50% Off",
        price: "10.12",
        totalPrice: "111.32",
        savingsTotal: "111.32",
      },
    ]);
  });

  it("groups repeated rows and warns on multiple source prices", () => {
    const manifest = buildOrdersBundleManifest(
      [
        {
          "Lineitem name": "Example Product - Large",
          "Lineitem quantity": "1",
          "Lineitem price": "9.99",
          "Lineitem compare at price": "12.99",
          "Lineitem sku": "SKU-1",
        },
        {
          "Lineitem name": "Example Product - Large",
          "Lineitem quantity": "2",
          "Lineitem price": "9.99",
          "Lineitem compare at price": "12.99",
          "Lineitem sku": "SKU-1",
        },
      ],
      {
        inputFile: "/tmp/orders.csv",
        outputFile: "/tmp/orders.bundle-manifest.json",
      },
    );

    expect(manifest.summary).toEqual({
      productCount: 1,
      variantCount: 1,
      entryCount: 2,
      quantitySold: 3,
    });
    expect(manifest.products[0].productTitle).toBe("Example Product");
    expect(manifest.products[0].variants[0].updatedPrice).toBe("13.49");
    expect(manifest.products[0].variants[0].tierBreakdown).toBe("2x 10.79, 3x 9.44, 4x 8.09, 11x 6.75");
  });

  it("prefers SKU matching before title matching", () => {
    const match = selectLiveVariant(
      [
        { id: "v1", title: "Small", sku: "ABC-1", selectedOptions: [{ name: "Size", value: "Small" }] },
        { id: "v2", title: "Large", sku: "ABC-2", selectedOptions: [{ name: "Size", value: "Large" }] },
      ],
      {
        lineItemSku: "abc-2",
        variantLabel: "Large",
        lineItemName: "Example Product - Large",
      },
    );

    expect(match?.id).toBe("v2");
  });

  it("falls back to color matching and lookup overrides for mixed catalog titles", () => {
    const variantMatch = selectLiveVariant(
      [
        { id: "v1", title: "purple", sku: "SKU-1", selectedOptions: [{ name: "Color", value: "purple" }] },
        { id: "v2", title: "green", sku: "SKU-2", selectedOptions: [{ name: "Color", value: "green" }] },
      ],
      {
        lineItemSku: "SKU-99",
        variantLabel: "07 Dark Purple",
        lineItemName: "Glitter Sequins Turban Hat | Hijab & Chemo Cap - 07 Dark Purple",
      },
    );

    expect(variantMatch?.id).toBe("v1");
    expect(getProductLookupCandidates("Glitter Sequins Turban Hat | Hijab & Chemo Cap")).toContain(
      "soft-velvet-stretchy-turban-bonnet-muslim-hijab-cap",
    );
  });
});
