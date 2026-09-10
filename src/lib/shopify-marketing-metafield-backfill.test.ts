import { describe, expect, it } from "vitest";

import {
  COLLECTION_FIELD_IDS,
  SHOP_FIELD_IDS,
  buildMarketingBackfillPlan,
  buildMarketingMetafieldSetBatches,
} from "@/lib/shopify-marketing-metafield-backfill.js";

function makeProduct(input: {
  id: number;
  title: string;
  handle: string;
  product_type?: string;
  price?: string;
  rating?: number;
  ratingCount?: number;
}) {
  return {
    id: input.id,
    title: input.title,
    handle: input.handle,
    body_html: "<p>Helpful product details for shoppers.</p>",
    vendor: "SALT",
    product_type: input.product_type || "",
    tags: [],
    created_at: "2026-07-01T00:00:00Z",
    published_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    variants: [
      {
        id: input.id * 10,
        title: "Default Title",
        price: input.price || "19.99",
        compare_at_price: null,
        available: true,
      },
    ],
    images: [
      {
        id: input.id * 100,
        src: `https://example.com/${input.handle}.jpg`,
        alt: input.title,
      },
    ],
    image: {
      id: input.id * 100,
      src: `https://example.com/${input.handle}.jpg`,
      alt: input.title,
    },
    average_rating: input.rating,
    total_reviews: input.ratingCount,
    customData: null,
  };
}

describe("shopify marketing metafield backfill planner", () => {
  it("fills collection and shop merchandising metafields", () => {
    const products = [
      makeProduct({
        id: 1,
        title: "Daily Living Essential",
        handle: "daily-living-essential",
        product_type: "Daily Living",
        price: "19.00",
        rating: 4.8,
        ratingCount: 31,
      }),
      makeProduct({
        id: 2,
        title: "Living Support Kit",
        handle: "living-support-kit",
        product_type: "Daily Living",
        price: "15.00",
        rating: 4.6,
        ratingCount: 18,
      }),
      makeProduct({
        id: 3,
        title: "Neutral Utility Pick",
        handle: "neutral-utility-pick",
        product_type: "Accessories",
        price: "12.00",
      }),
    ];

    const collections = [
      {
        id: 10,
        title: "Daily Living",
        handle: "daily-living",
        description: "",
        published_at: "2026-07-01T00:00:00Z",
        updated_at: "2026-07-01T00:00:00Z",
        image: null,
        products_count: 3,
        customData: null,
      },
    ];

    const collectionProducts = {
      generatedAt: "2026-07-01T00:00:00Z",
      source: "test",
      totalCollections: 1,
      collections: {
        "daily-living": {
          title: "Daily Living",
          productIds: [1, 2, 3],
        },
      },
    };

    const plan = buildMarketingBackfillPlan({
      products,
      collections,
      collectionProducts,
      shop: {
        id: "gid://shopify/Shop/123456789",
        name: "SALT",
        customData: null,
      },
    });

    const collectionPlan = plan.collectionPlans[0];
    const shopPlan = plan.shopPlan;

    expect(collectionPlan?.writes.map((entry) => entry.fieldId)).toEqual(
      expect.arrayContaining([
        COLLECTION_FIELD_IDS.heroKicker,
        COLLECTION_FIELD_IDS.heroSummary,
        COLLECTION_FIELD_IDS.featuredProducts,
        COLLECTION_FIELD_IDS.trustStrip,
      ]),
    );
    expect(shopPlan?.writes.map((entry) => entry.fieldId)).toEqual(
      expect.arrayContaining([
        SHOP_FIELD_IDS.bannerText,
        SHOP_FIELD_IDS.trustStrip,
      ]),
    );

    const featuredProducts = JSON.parse(
      collectionPlan?.writes.find((entry) => entry.fieldId === COLLECTION_FIELD_IDS.featuredProducts)?.value || "[]",
    ) as string[];
    expect(featuredProducts).toContain("gid://shopify/Product/1");
    expect(plan.summary.totalWrites).toBeGreaterThan(0);
    expect(buildMarketingMetafieldSetBatches(plan.ownerPlans, 25)).toHaveLength(1);
  });

  it("refreshes stale generated collection counts without overwriting editorial summaries", () => {
    const collection = {
      id: 10,
      title: "Daily Living",
      handle: "daily-living",
      description: "",
      published_at: "2026-07-01T00:00:00Z",
      updated_at: "2026-07-01T00:00:00Z",
      image: null,
      products_count: 3,
      customData: {
        heroSummary: "Discover 2 products in daily living selected for easier browsing and stronger conversion.",
      },
    };
    const plan = buildMarketingBackfillPlan({
      products: [makeProduct({ id: 1, title: "Daily Living Essential", handle: "daily-living-essential" })],
      collections: [collection],
      collectionProducts: {
        collections: { "daily-living": { title: "Daily Living", productIds: [1] } },
      },
      shop: { id: "shop", name: "SALT", customData: null },
    });

    expect(plan.collectionPlans[0]?.writes.find((entry) => entry.fieldId === COLLECTION_FIELD_IDS.heroSummary)?.reason).toContain(
      "Refreshed generated",
    );

    const editorialPlan = buildMarketingBackfillPlan({
      products: [makeProduct({ id: 1, title: "Daily Living Essential", handle: "daily-living-essential" })],
      collections: [{
        ...collection,
        customData: { heroSummary: "A hand-picked guide to everyday living." },
      }],
      collectionProducts: {
        collections: { "daily-living": { title: "Daily Living", productIds: [1] } },
      },
      shop: { id: "shop", name: "SALT", customData: null },
    });

    expect(editorialPlan.collectionPlans[0]?.writes.some((entry) => entry.fieldId === COLLECTION_FIELD_IDS.heroSummary)).toBe(
      false,
    );
  });

  it("uses the fresh catalog size for the all-products summary", () => {
    const plan = buildMarketingBackfillPlan({
      products: [makeProduct({ id: 1, title: "Current product", handle: "current-product" })],
      collections: [{
        id: 10,
        title: "All Products",
        handle: "all-products",
        description: "",
        published_at: "2026-07-01T00:00:00Z",
        updated_at: "2026-07-01T00:00:00Z",
        image: null,
        products_count: 2,
        customData: {
          heroSummary: "Discover 2 products across the full SALT catalog.",
        },
      }],
      collectionProducts: { collections: { "all-products": { title: "All Products", productIds: [1] } } },
      shop: { id: "shop", name: "SALT", customData: null },
    });

    expect(plan.collectionPlans[0]?.writes.find((entry) => entry.fieldId === COLLECTION_FIELD_IDS.heroSummary)?.value).toBe(
      "Discover 1 products across the full SALT catalog.",
    );
  });

  it("replaces stale featured references with current collection members", () => {
    const plan = buildMarketingBackfillPlan({
      products: [
        makeProduct({ id: 1, title: "Makeup Brush Set", handle: "makeup-brush-set" }),
        makeProduct({ id: 2, title: "Dog Nail File", handle: "dog-nail-file" }),
      ],
      collections: [{
        id: 10,
        title: "Beauty Makeup Essentials",
        handle: "beauty-makeup-essentials",
        description: "",
        products_count: 1,
        customData: {
          featuredProducts: ["gid://shopify/Product/2"],
        },
      }],
      collectionProducts: {
        collections: {
          "beauty-makeup-essentials": { title: "Beauty Makeup Essentials", productIds: [1] },
        },
      },
      shop: { id: "shop", name: "SALT", customData: null },
    });

    const featuredWrite = plan.collectionPlans[0]?.writes.find(
      (entry) => entry.fieldId === COLLECTION_FIELD_IDS.featuredProducts,
    );
    expect(featuredWrite?.value).toContain("gid://shopify/Product/1");
    expect(featuredWrite?.value).not.toContain("gid://shopify/Product/2");
    expect(featuredWrite?.reason).toContain("stale featured");
  });

  it("clears stale featured references when a complete collection is empty", () => {
    const plan = buildMarketingBackfillPlan({
      products: [makeProduct({ id: 1, title: "Current product", handle: "current-product" })],
      collections: [{
        id: 10,
        title: "Beauty Makeup Essentials",
        handle: "beauty-makeup-essentials",
        description: "",
        products_count: 0,
        customData: {
          featuredProducts: ["gid://shopify/Product/999"],
        },
      }],
      collectionProducts: {
        collections: {
          "beauty-makeup-essentials": { title: "Beauty Makeup Essentials", productIds: [] },
        },
      },
      shop: { id: "shop", name: "SALT", customData: null },
    });

    const featuredWrite = plan.collectionPlans[0]?.writes.find(
      (entry) => entry.fieldId === COLLECTION_FIELD_IDS.featuredProducts,
    );
    expect(featuredWrite?.value).toBe("[]");
    expect(featuredWrite?.reason).toContain("Cleared");
  });

  it("never broadens a missing membership entry to the full catalog", () => {
    const plan = buildMarketingBackfillPlan({
      products: [makeProduct({ id: 1, title: "Unrelated product", handle: "unrelated-product" })],
      collections: [{
        id: 10,
        title: "Beauty Makeup Essentials",
        handle: "beauty-makeup-essentials",
        description: "",
        products_count: 1,
        customData: null,
      }],
      collectionProducts: { collections: {} },
      shop: { id: "shop", name: "SALT", customData: null },
    });

    expect(plan.collectionPlans[0]?.writes.some(
      (entry) => entry.fieldId === COLLECTION_FIELD_IDS.featuredProducts,
    )).toBe(false);
  });

  it("preserves valid editorial featured references", () => {
    const plan = buildMarketingBackfillPlan({
      products: [makeProduct({ id: 1, title: "Makeup Brush Set", handle: "makeup-brush-set" })],
      collections: [{
        id: 10,
        title: "Beauty Makeup Essentials",
        handle: "beauty-makeup-essentials",
        description: "",
        products_count: 1,
        customData: {
          featuredProducts: ["gid://shopify/Product/1"],
        },
      }],
      collectionProducts: {
        collections: {
          "beauty-makeup-essentials": { title: "Beauty Makeup Essentials", productIds: [1] },
        },
      },
      shop: { id: "shop", name: "SALT", customData: null },
    });

    expect(plan.collectionPlans[0]?.writes.some(
      (entry) => entry.fieldId === COLLECTION_FIELD_IDS.featuredProducts,
    )).toBe(false);
  });
});
