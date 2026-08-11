import { describe, expect, it } from "vitest";
import {
  inferApprovedDisclosureReferences,
  inferShopifyTaxonomyCategory,
} from "./shopify-product-category.js";

describe("Shopify product taxonomy classifier", () => {
  it("classifies explicit product families with Shopify taxonomy ids", () => {
    expect(inferShopifyTaxonomyCategory({ handle: "womens-sunshade-hat" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/aa-2-17",
    );
    expect(inferShopifyTaxonomyCategory({ handle: "portable-usb-flash-drive-128gb" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/el-7-9-14-8",
    );
    expect(inferShopifyTaxonomyCategory({ handle: "kids-running-shoes" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/aa-8-11-4",
    );
    expect(inferShopifyTaxonomyCategory({ handle: "car-battery-charger-12v" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/vp-1-5-7-3",
    );
    expect(inferShopifyTaxonomyCategory({ handle: "kids-montessori-learning-toy" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/tg-5-9",
    );
    expect(inferShopifyTaxonomyCategory({ handle: "baby-health-grooming-kit" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/bt-3-1",
    );
    expect(inferShopifyTaxonomyCategory({ handle: "wireless-bluetooth-earbuds-with-microphone" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/el",
    );
    expect(inferShopifyTaxonomyCategory({ handle: "large-capacity-pencil-case-for-school" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/os-3-16",
    );
    expect(inferShopifyTaxonomyCategory({ handle: "61-key-digital-electronic-piano-keyboard" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/ae",
    );
    expect(inferShopifyTaxonomyCategory({ handle: "usb-air-humidifier-aroma-diffuser" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/hb-3-21-3",
    );
    expect(inferShopifyTaxonomyCategory({ handle: "mechanical-gaming-keyboard-stabilizer-pad" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/el",
    );
  });

  it("does not guess when no high-confidence family matches", () => {
    expect(inferShopifyTaxonomyCategory({ handle: "assorted-everyday-item" })).toBeNull();
    expect(inferShopifyTaxonomyCategory({ handle: "educational-mathematics-toys-for-kids" })?.name).toBe("Toys");
    expect(inferShopifyTaxonomyCategory({ handle: "children-school-book-bag-backpack" })).toBeNull();
  });

  it("requires both explicit warning evidence and an approved disclosure object", () => {
    const product = { body_html: "<p>Choking hazard: small parts. Not for children under 3.</p>" };
    expect(inferApprovedDisclosureReferences(product, [])).toEqual([]);
    expect(
      inferApprovedDisclosureReferences(product, [
        {
          id: "gid://shopify/Metaobject/1",
          type: "shopify--disclosure-us-cpsc-choking_small_parts",
        },
      ]),
    ).toEqual(["gid://shopify/Metaobject/1"]);
  });
});
