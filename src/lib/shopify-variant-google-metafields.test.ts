import { describe, expect, it } from "vitest";

import {
  GOOGLE_VARIANT_METAFIELD_DEFINITIONS,
  buildGoogleVariantMetafieldPlan,
  inferGoogleAgeGroup,
  inferGoogleGender,
  inferGoogleSizeSystem,
  normalizeSingleLineText,
} from "@/lib/shopify-variant-google-metafields.js";

function variant(overrides: Record<string, unknown> = {}) {
  return {
    id: "gid://shopify/ProductVariant/123",
    legacyResourceId: "123",
    title: "Default Title",
    sku: "SKU-123",
    barcode: "",
    selectedOptions: [],
    metafields: {},
    product: { handle: "everyday-organizer", title: "Everyday Organizer", productType: "", tags: [], category: null },
    ...overrides,
  };
}

describe("Shopify Google variant metafield intelligence", () => {
  it("uses the five live single-line Google Shopping definitions", () => {
    expect(GOOGLE_VARIANT_METAFIELD_DEFINITIONS.map(({ namespace, key, type }) => ({ namespace, key, type }))).toEqual([
      { namespace: "mm-google-shopping", key: "age_group", type: "single_line_text_field" },
      { namespace: "mm-google-shopping", key: "condition", type: "single_line_text_field" },
      { namespace: "mm-google-shopping", key: "gender", type: "single_line_text_field" },
      { namespace: "mm-google-shopping", key: "mpn", type: "single_line_text_field" },
      { namespace: "mm-google-shopping", key: "size_system", type: "single_line_text_field" },
    ]);
  });

  it("infers supported Google age-group and gender values from product evidence", () => {
    const girlsDress = variant({ product: { handle: "toddler-girls-party-dress", title: "Girls Party Dress", productType: "Dress", tags: [] } });
    expect(inferGoogleAgeGroup(girlsDress)).toBe("toddler");
    expect(inferGoogleGender(girlsDress)).toBe("female");
  });

  it("sets US size system only for a size-bearing apparel or footwear variant", () => {
    expect(inferGoogleSizeSystem(variant({
      selectedOptions: [{ name: "Size", value: "8" }],
      product: { handle: "womens-running-shoe", title: "Women's Running Shoe", productType: "Shoes", tags: [] },
    }))).toBe("US");
    expect(inferGoogleSizeSystem(variant({
      selectedOptions: [{ name: "Size", value: "Large" }],
      product: { handle: "storage-box", title: "Storage Box", productType: "Storage", tags: [] },
    }))).toBe("");
  });

  it("preserves an existing MPN and produces only field-level differences", () => {
    const plan = buildGoogleVariantMetafieldPlan(variant({
      metafields: {
        ageGroup: { value: "adult" },
        condition: { value: "new" },
        gender: { value: "unisex" },
        mpn: { value: "MERCHANT-MPN" },
      },
    }));
    expect(plan.desired.mpn).toBe("MERCHANT-MPN");
    expect(plan.writes).toEqual([]);
    expect(plan.skipped).toHaveLength(5);
  });

  it("normalizes every value to one line and creates a stable fallback MPN", () => {
    expect(normalizeSingleLineText("  one\n two\tthree ")).toBe("one two three");
    const plan = buildGoogleVariantMetafieldPlan(variant({ sku: "", barcode: "" }));
    expect(plan.desired.mpn).toBe("SALT-123");
    expect(plan.writes.every((write) => write.type === "single_line_text_field" && !/[\r\n\t]/.test(write.value))).toBe(true);
  });
});
