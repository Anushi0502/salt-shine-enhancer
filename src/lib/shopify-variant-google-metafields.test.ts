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
    metafields: {
      variantSeoTitle: { value: "Everyday Organizer | SALT Online Store" },
      variantSeoDescription: { value: "Shop Everyday Organizer. See the exact variant image, availability, and pricing before checkout." },
    },
    product: { handle: "everyday-organizer", title: "Everyday Organizer", productType: "", tags: [], category: null },
    ...overrides,
  };
}

describe("Shopify Google variant metafield intelligence", () => {
  it("uses the five Google definitions plus two persisted variant SEO definitions", () => {
    expect(GOOGLE_VARIANT_METAFIELD_DEFINITIONS.map(({ namespace, key, type }) => ({ namespace, key, type }))).toEqual([
      { namespace: "mm-google-shopping", key: "age_group", type: "single_line_text_field" },
      { namespace: "mm-google-shopping", key: "condition", type: "single_line_text_field" },
      { namespace: "mm-google-shopping", key: "gender", type: "single_line_text_field" },
      { namespace: "mm-google-shopping", key: "mpn", type: "single_line_text_field" },
      { namespace: "mm-google-shopping", key: "size_system", type: "single_line_text_field" },
      { namespace: "salt-seo", key: "variant_title", type: "single_line_text_field" },
      { namespace: "salt-seo", key: "variant_description", type: "multi_line_text_field" },
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
        variantSeoTitle: { value: "Everyday Organizer | SALT Online Store" },
        variantSeoDescription: { value: "Shop Everyday Organizer. See the exact variant image, availability, and pricing before checkout." },
      },
    }));
    expect(plan.desired.mpn).toBe("MERCHANT-MPN");
    expect(plan.writes).toEqual([]);
    expect(plan.skipped).toHaveLength(7);
  });

  it("normalizes single-line values and creates a stable fallback MPN", () => {
    expect(normalizeSingleLineText("  one\n two\tthree ")).toBe("one two three");
    const plan = buildGoogleVariantMetafieldPlan(variant({ sku: "", barcode: "", metafields: {} }));
    expect(plan.desired.mpn).toBe("SALT-123");
    expect(plan.writes.filter((write) => write.type === "single_line_text_field").every((write) => !/[\r\n\t]/.test(write.value))).toBe(true);
    expect(plan.writes.find((write) => write.fieldId === "variantSeoDescription")?.type).toBe("multi_line_text_field");
  });
});
