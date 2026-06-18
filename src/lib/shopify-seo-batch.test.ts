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
        },
      ])
    ).products;

    expect(plan.handle).toBe("sample-handle");
    expect(plan.variantUpdates).toHaveLength(1);
    expect(plan.variantUpdates[0]?.price).toBe("9.99");
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
});
