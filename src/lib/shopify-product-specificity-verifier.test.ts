import { describe, expect, it } from "vitest";

import { auditProductSpecificityCatalog } from "../../scripts/verify-shopify-product-specificity.mjs";

function makeSpecificProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 501,
    handle: "portable-wireless-charger-15w-for-iphone-travel",
    title: "Portable 15W Wireless Charger for iPhone",
    descriptionHtml:
      "<h2>About Portable 15W Wireless Charger for iPhone</h2><p>This portable wireless charger supports a 15W charging setup for compatible iPhone use while travelling.</p>",
    productType: "Phone Charger",
    vendor: "SALT",
    tags: ["wireless charger", "iphone accessory"],
    status: "ACTIVE",
    category: { name: "Wireless Chargers", fullName: "Electronics > Wireless Chargers" },
    seoTitle: "Portable 15W Wireless Charger for iPhone | SALT",
    seoDescription:
      "Shop the Portable 15W Wireless Charger for iPhone, with a travel-ready charging format and compatibility details. Review listed options at SALT.",
    subtitle: "Portable 15W Wireless Charger for iPhone • Phone Charger",
    highlights: ["Portable 15W wireless charger", "iPhone travel charging"],
    collectionSignal: "Portable 15W Wireless Charger for iPhone, Wireless Chargers",
    searchBoosts: ["portable wireless charger", "15w iphone charger", "iphone travel charging"],
    searchBoostSource: "shopify-discovery",
    ...overrides,
  };
}

describe("Shopify product specificity verifier", () => {
  it("passes complete product-specific SEO and metafields", () => {
    const manifest = auditProductSpecificityCatalog([makeSpecificProduct()]);

    expect(manifest.summary.activeProducts).toBe(1);
    expect(manifest.summary.failedProducts).toBe(0);
    expect(manifest.summary.duplicateGroups).toBe(0);
  });

  it("fails non-specific generic SEO and metafields", () => {
    const manifest = auditProductSpecificityCatalog([
      makeSpecificProduct({
        seoTitle: "Premium Product | SALT",
        seoDescription:
          "Shop this premium high quality product online for everyday use. Compare available options and choose the perfect item for your lifestyle today.",
        subtitle: "Everyday essential",
        highlights: ["Premium quality"],
        collectionSignal: "Featured products",
        searchBoosts: ["shop online"],
      }),
    ]);

    expect(manifest.summary.failedProducts).toBe(1);
    expect(manifest.products[0].issues).toEqual(expect.arrayContaining([
      expect.stringContaining("seo-title"),
      expect.stringContaining("subtitle"),
      "highlights:minimum-items:2",
      "search-boosts:minimum-items:3",
    ]));
  });

  it("fails products without an assigned Shopify category", () => {
    const manifest = auditProductSpecificityCatalog([
      makeSpecificProduct({ category: null }),
    ]);

    expect(manifest.summary.failedProducts).toBe(1);
    expect(manifest.products[0].issues).toContain("category:missing");
  });

  it("fails exact content collisions across distinct products", () => {
    const first = makeSpecificProduct();
    const second = makeSpecificProduct({
      id: 502,
      handle: "portable-wireless-charger-15w-for-iphone-travel-2",
    });
    const manifest = auditProductSpecificityCatalog([first, second]);

    expect(manifest.summary.failedProducts).toBe(2);
    expect(manifest.summary.duplicateGroups).toBeGreaterThan(0);
    expect(manifest.products[0].issues).toContain("duplicate:seo-title");
    expect(manifest.products[1].issues).toContain("duplicate:subtitle");
  });
});
