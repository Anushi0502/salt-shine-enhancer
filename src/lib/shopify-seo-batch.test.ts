import { describe, expect, it } from "vitest";
import { buildSeoBatchPlan } from "@/lib/shopify-seo-batch";

describe("shopify SEO batch plan", () => {
  it("derives a retail price from supplier cost when the sheet omits Variant Price", async () => {
    const [plan] = (
      await buildSeoBatchPlan([
        {
          Handle: "sample-handle",
          Title: "Sample Title",
          "Body (HTML)": "<p>Sample</p>",
          Type: "Home Decor",
          Tags: "tag-one, tag-two",
          "SEO Title": "Sample SEO Title",
          "SEO Description": "Sample SEO Description",
          "Cost per item": "2.50",
          "Variant Price": "",
          "Variant Compare At Price": "",
          "Variant SKU": "SAMPLE-1",
        },
      ])
    ).products;

    expect(plan.handle).toBe("sample-handle");
    expect(plan.variantUpdates).toHaveLength(1);
    expect(plan.variantUpdates[0]?.price).toBe("19.99");
  });

  it("passes approved category values through the resolver without touching protected fields", async () => {
    const [plan] = (
      await buildSeoBatchPlan(
        [
          {
            Handle: "another-sample",
            Title: "Another Sample",
            "Google Shopping / Google Product Category": "Home & Garden > Decor",
            "Variant Price": "19.99",
            "Variant Compare At Price": "29.99",
            "Variant SKU": "SKU-1",
            "Variant ID": "123456789",
          },
        ],
        {
          resolveCategoryId: async (categoryQuery) => {
            expect(categoryQuery).toBe("Home & Garden > Decor");
            return "gid://shopify/TaxonomyCategory/123";
          },
        },
      )
    ).products;

    expect(plan.categoryQuery).toBe("Home & Garden > Decor");
    expect(plan.categoryId).toBe("gid://shopify/TaxonomyCategory/123");
    expect(plan.variantUpdates[0]?.sku).toBe("SKU-1");
    expect(plan.variantUpdates[0]?.variantId).toBe("gid://shopify/ProductVariant/123456789");
  });

  it("enforces a $20 minimum price on earring products", async () => {
    const [plan] = (
      await buildSeoBatchPlan([
        {
          Handle: "pearl-pointed-twisted-teardrop-dangle-earrings",
          Title: "Pearl Pointed Twisted Teardrop Dangle Earrings",
          Type: "EARRINGS",
          "Product Category": "Apparel & Accessories > Jewelry > Earrings",
        },
        {
          Handle: "pearl-pointed-twisted-teardrop-dangle-earrings",
          "Variant Price": "12.99",
          "Variant Compare At Price": "20.99",
          "Variant SKU": "EARRING-1",
        },
        {
          Handle: "pearl-pointed-twisted-teardrop-dangle-earrings",
          "Option1 Value": "rhodium-white",
          "Variant Price": "12.99",
          "Variant Compare At Price": "20.99",
          "Variant SKU": "EARRING-2",
        },
      ])
    ).products;

    expect(plan.variantUpdates).toHaveLength(2);
    expect(plan.variantUpdates[0]?.price).toBe("20.00");
    expect(plan.variantUpdates[1]?.price).toBe("20.00");
    expect(plan.variantUpdates[0]?.compareAtPrice).toBe("28.99");
    expect(plan.variantUpdates[1]?.compareAtPrice).toBe("28.99");
  });

  it("enhances product titles and descriptions while skipping title-only rows", async () => {
    const [plan] = (
      await buildSeoBatchPlan([
        {
          Handle: "simple-wall-light",
          Title: "Simple Wall Light",
          "Body (HTML)": "<p>Original body copy.</p>",
          Type: "Home Decor",
          Tags: "wall light, decor, lighting",
        },
        {
          Handle: "simple-wall-light",
          "Variant SKU": "WALL-1",
          "Variant Price": "19.99",
          "Variant Compare At Price": "24.99",
        },
      ])
    ).products;

    expect(plan.productInput.title).toBe("Simple Wall Light - Home Decor");
    expect(plan.productInput.descriptionHtml).toContain("<strong>Simple Wall Light</strong>");
    expect(plan.productInput.descriptionHtml).toContain("Original body copy.");
    expect(plan.productInput.descriptionHtml).toContain("Popular search terms:");
    expect(plan.productInput.descriptionHtml).toMatch(/(clearer, cleaner|polished|tighter product brief|refined listing|presented as a refined|cleaner copy block)/i);
    expect(plan.productInput.descriptionHtml).not.toContain(
      "This structure keeps the listing concise for shoppers and descriptive enough for search.",
    );
    expect(plan.productInput.descriptionHtml).not.toMatch(/Ã.|Â./);
    expect(plan.variantUpdates).toHaveLength(1);
    expect(plan.variantUpdates[0]?.price).toBe("19.99");
    expect(plan.variantUpdates[0]?.compareAtPrice).toBe("24.99");
  });

  it("shortens keyword-stuffed titles to a cleaner display title", async () => {
    const [plan] = (
      await buildSeoBatchPlan([
        {
          Handle: "y2k-lace-suspender-dress-fashion-sexy-lace-long-dresses-party-evening-club-beach-clothing-for-women",
          Title: "Y2K Lace Suspender Dress Fashion Sexy Lace Long Dresses Party Evening Club Beach Clothing for Women",
          Type: "Dresses",
          "Variant SKU": "DRESS-1",
          "Variant Price": "41.99",
          "Variant Compare At Price": "59.99",
        },
      ])
    ).products;

    expect(plan.productInput.title).toBe("Y2K Lace Suspender Dress");
    expect(plan.productInput.title.length).toBeLessThanOrEqual(54);
  });
});
