import { describe, expect, it } from "vitest";

import {
  BACKFILL_FIELD_IDS,
  buildBackfillPlan,
  buildMetafieldSetBatches,
  inferDiaperTypeReference,
} from "@/lib/shopify-product-metafield-backfill.js";

function makeProduct(input: {
  id: number;
  title: string;
  handle: string;
  product_type?: string;
  tags?: string[];
  price?: string;
  customData?: Record<string, unknown> | null;
}) {
  return {
    id: input.id,
    title: input.title,
    handle: input.handle,
    body_html: "<p>Helpful product details for shoppers.</p>",
    vendor: "SALT",
    product_type: input.product_type || "",
    tags: input.tags || [],
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
    images: [],
    image: null,
    customData: input.customData || null,
  };
}

describe("shopify product metafield backfill planner", () => {
  it("fills missing product metafields without overwriting existing ones", () => {
    const products = [
      makeProduct({
        id: 1,
        title: "Smart Watch for Daily Tech Use",
        handle: "smart-watch",
        product_type: "Wearables",
        tags: ["wearable", "tech"],
        price: "49.00",
      }),
      makeProduct({
        id: 2,
        title: "Smart Watch Strap",
        handle: "smart-watch-strap",
        product_type: "Wearables",
        tags: ["wearable", "strap"],
        price: "19.00",
      }),
      makeProduct({
        id: 3,
        title: "Smart Watch Charger",
        handle: "smart-watch-charger",
        product_type: "Accessories",
        tags: ["wearable", "charger"],
        price: "24.00",
      }),
      makeProduct({
        id: 4,
        title: "Smart Watch Screen Protector",
        handle: "smart-watch-screen-protector",
        product_type: "Accessories",
        tags: ["wearable", "protector"],
        price: "12.00",
      }),
      makeProduct({
        id: 5,
        title: "Wearables Travel Case",
        handle: "wearables-travel-case",
        product_type: "Accessories",
        tags: ["wearable", "case"],
        price: "14.00",
      }),
      makeProduct({
        id: 6,
        title: "Portable Travel Bottle",
        handle: "portable-travel-bottle",
        product_type: "Outdoors",
        tags: ["travel", "bottle"],
        price: "14.00",
      }),
      makeProduct({
        id: 7,
        title: "Already Curated Product",
        handle: "already-curated-product",
        product_type: "Accessories",
        tags: ["curated"],
        price: "59.00",
        customData: {
          rating: 4.8,
          ratingCount: 18,
          relatedProductsDisplay: "ahead",
          relatedProducts: [
            {
              id: "gid://shopify/Product/2",
              legacyResourceId: 2,
              handle: "smart-watch-strap",
              title: "Smart Watch Strap",
            },
          ],
          complementaryProducts: [
            {
              id: "gid://shopify/Product/5",
              legacyResourceId: 5,
              handle: "wearables-travel-case",
              title: "Wearables Travel Case",
            },
          ],
          searchProductBoosts: ["wearable watch"],
          googleCustomProduct: false,
          shopChannelMinimumQuantity: 4,
        },
      }),
    ];

    const collections = [
      {
        id: 10,
        title: "Wearables",
        handle: "wearables",
        description: "",
        published_at: "2026-07-01T00:00:00Z",
        updated_at: "2026-07-01T00:00:00Z",
        image: null,
        products_count: 5,
      },
      {
        id: 11,
        title: "Outdoors",
        handle: "outdoors",
        description: "",
        published_at: "2026-07-01T00:00:00Z",
        updated_at: "2026-07-01T00:00:00Z",
        image: null,
        products_count: 1,
      },
      {
        id: 12,
        title: "All Products",
        handle: "all-products",
        description: "",
        published_at: "2026-07-01T00:00:00Z",
        updated_at: "2026-07-01T00:00:00Z",
        image: null,
        products_count: 7,
      },
    ];

    const collectionProducts = {
      generatedAt: "2026-07-01T00:00:00Z",
      source: "test",
      totalCollections: 3,
      collections: {
        wearables: {
          title: "Wearables",
          productIds: [1, 2, 3, 4, 5],
        },
        outdoors: {
          title: "Outdoors",
          productIds: [6],
        },
        "all-products": {
          title: "All Products",
          productIds: [1, 2, 3, 4, 5, 6, 7],
        },
      },
    };

    const plan = buildBackfillPlan({
      products,
      collections,
      collectionProducts,
      reviewSummaries: new Map([
        [
          1,
          {
            rating: 4.6,
            reviewCount: 17,
            source: "judgeme",
          },
        ],
      ]),
      diaperTypeOptions: [],
    });

    const productOne = plan.productPlans.find((entry) => entry.id === 1);
    const productTwo = plan.productPlans.find((entry) => entry.id === 2);
    const productFour = plan.productPlans.find((entry) => entry.id === 4);

    expect(plan.summary.scannedProducts).toBe(7);
    expect(plan.summary.totalWrites).toBeGreaterThan(0);
    expect(plan.summary.writesByField[BACKFILL_FIELD_IDS.relatedProducts]).toBeGreaterThan(0);
    expect(plan.summary.writesByField[BACKFILL_FIELD_IDS.shopChannelMinimumQuantity]).toBeGreaterThan(0);

    expect(productOne).toBeTruthy();
    expect(productOne?.writes.map((entry) => entry.fieldId)).toEqual(
      expect.arrayContaining([
        BACKFILL_FIELD_IDS.subtitle,
        BACKFILL_FIELD_IDS.badgeText,
        BACKFILL_FIELD_IDS.highlights,
        BACKFILL_FIELD_IDS.collectionSignal,
        BACKFILL_FIELD_IDS.rating,
        BACKFILL_FIELD_IDS.ratingCount,
        BACKFILL_FIELD_IDS.googleCustomProduct,
        BACKFILL_FIELD_IDS.shopChannelMinimumQuantity,
        BACKFILL_FIELD_IDS.searchProductBoosts,
        BACKFILL_FIELD_IDS.relatedProducts,
        BACKFILL_FIELD_IDS.relatedProductsDisplay,
        BACKFILL_FIELD_IDS.complementaryProducts,
      ]),
    );

    const relatedProducts = JSON.parse(
      productOne?.writes.find((entry) => entry.fieldId === BACKFILL_FIELD_IDS.relatedProducts)?.value || "[]",
    ) as string[];
    const complementaryProducts = JSON.parse(
      productOne?.writes.find((entry) => entry.fieldId === BACKFILL_FIELD_IDS.complementaryProducts)?.value || "[]",
    ) as string[];
    const boosts = JSON.parse(
      productOne?.writes.find((entry) => entry.fieldId === BACKFILL_FIELD_IDS.searchProductBoosts)?.value || "[]",
    ) as string[];
    const shopFloorValue = productOne?.writes.find(
      (entry) => entry.fieldId === BACKFILL_FIELD_IDS.shopChannelMinimumQuantity,
    )?.value;
    const productTwoShopFloorValue = productTwo?.writes.find(
      (entry) => entry.fieldId === BACKFILL_FIELD_IDS.shopChannelMinimumQuantity,
    )?.value;

    expect(relatedProducts).toContain("gid://shopify/Product/2");
    expect(complementaryProducts).toContain("gid://shopify/Product/6");
    expect(boosts.length).toBeGreaterThanOrEqual(3);
    expect(shopFloorValue).toBe("1");
    expect(productTwoShopFloorValue).toBe("2");
    expect(
      productOne?.writes.find((entry) => entry.fieldId === BACKFILL_FIELD_IDS.relatedProductsDisplay)?.value,
    ).toBe("ahead");

    const productSeven = plan.productPlans.find((entry) => entry.id === 7);
    expect(productFour?.writes.length).toBeGreaterThan(0);
    expect(productFour?.writes.some((entry) => entry.fieldId === BACKFILL_FIELD_IDS.searchProductBoosts)).toBe(true);
    expect(productOne?.writes.find((entry) => entry.fieldId === BACKFILL_FIELD_IDS.searchProductBoosts)?.value).not.toContain(
      "all",
    );
    expect(productSeven?.writes.some((entry) => entry.fieldId === BACKFILL_FIELD_IDS.googleCustomProduct)).toBe(false);
    expect(productSeven?.writes.some((entry) => entry.fieldId === BACKFILL_FIELD_IDS.subtitle)).toBe(true);
    expect(productSeven?.writes.some((entry) => entry.fieldId === BACKFILL_FIELD_IDS.badgeText)).toBe(true);
    expect(productSeven?.writes.some((entry) => entry.fieldId === BACKFILL_FIELD_IDS.highlights)).toBe(true);
    expect(productSeven?.writes.some((entry) => entry.fieldId === BACKFILL_FIELD_IDS.collectionSignal)).toBe(true);
    expect(productSeven?.writes.some((entry) => entry.fieldId === BACKFILL_FIELD_IDS.shopChannelMinimumQuantity)).toBe(
      false,
    );
    expect(productSeven?.skipped.some((entry) => entry.fieldId === BACKFILL_FIELD_IDS.googleCustomProduct)).toBe(true);
  });

  it("uses product handles to generate search boosts for generic catalog titles", () => {
    const plan = buildBackfillPlan({
      products: [
        makeProduct({
          id: 101,
          title: "Home Product for Practical Everyday Home Use and Daily Living",
          handle: "stain-resistant-waterproof-apron-unisex-adult-bib-for-home",
          product_type: "",
          tags: [],
        }),
      ],
      collections: [],
      collectionProducts: { collections: {} },
      reviewSummaries: new Map(),
      diaperTypeOptions: [],
    });

    const product = plan.productPlans.find((entry) => entry.id === 101);
    const searchBoostWrite = product?.writes.find((entry) => entry.fieldId === BACKFILL_FIELD_IDS.searchProductBoosts);
    const boosts = JSON.parse(searchBoostWrite?.value || "[]") as string[];

    expect(searchBoostWrite).toBeTruthy();
    expect(boosts).toEqual(expect.arrayContaining(["waterproof apron", "apron unisex"]));
  });

  it("generates product-specific merchandising fields without generic filler", () => {
    const plan = buildBackfillPlan({
      products: [
        makeProduct({
          id: 111,
          title: "Kids Running Shoes with Soft Sole",
          handle: "kids-running-shoes-soft-sole-for-school-outdoor-use",
          product_type: "Children's Shoes",
          tags: ["new", "featured"],
        }),
      ],
      collections: [],
      collectionProducts: { collections: {} },
      reviewSummaries: new Map(),
      diaperTypeOptions: [],
    });

    const product = plan.productPlans[0];
    const subtitle = product?.writes.find((entry) => entry.fieldId === BACKFILL_FIELD_IDS.subtitle)?.value || "";
    const highlights = JSON.parse(
      product?.writes.find((entry) => entry.fieldId === BACKFILL_FIELD_IDS.highlights)?.value || "[]",
    ) as string[];
    const collectionSignal =
      product?.writes.find((entry) => entry.fieldId === BACKFILL_FIELD_IDS.collectionSignal)?.value || "";

    expect(subtitle).toContain("Kids Running Shoes");
    expect(highlights).toEqual(
      expect.arrayContaining(["Baby & Children's Athletic Shoes", "Running style", "Soft-sole design"]),
    );
    expect(highlights.join(" ")).not.toMatch(/pick|favorite|search focus/i);
    expect(collectionSignal).toContain("Baby & Children's Athletic Shoes");
    expect(collectionSignal).not.toContain("featured");
  });

  it("refreshes only unmistakable legacy generated highlights", () => {
    const legacy = makeProduct({
      id: 112,
      title: "Portable Wireless Charger",
      handle: "portable-wireless-charger-15w-for-travel",
      customData: { highlights: ["Accessories pick", "Search focus: portable wireless charger"] },
    });
    const merchant = makeProduct({
      id: 113,
      title: "Portable Wireless Charger",
      handle: "portable-wireless-charger-20w-for-travel",
      customData: { highlights: ["Compact charging companion"] },
    });
    const plan = buildBackfillPlan({
      products: [legacy, merchant],
      collections: [],
      collectionProducts: { collections: {} },
      reviewSummaries: new Map(),
      diaperTypeOptions: [],
    });

    const legacyWrite = plan.productPlans[0]?.writes.find(
      (entry) => entry.fieldId === BACKFILL_FIELD_IDS.highlights,
    );
    const merchantWrite = plan.productPlans[1]?.writes.find(
      (entry) => entry.fieldId === BACKFILL_FIELD_IDS.highlights,
    );

    expect(legacyWrite?.reason).toContain("Replaced legacy generic highlights");
    expect(legacyWrite?.value).not.toMatch(/pick|favorite|search focus/i);
    expect(merchantWrite).toBeUndefined();
  });

  it("repairs malformed generated highlights without replacing merchant prose", () => {
    const malformed = [
      makeProduct({
        id: 114,
        title: "Waterproof Apron Bib",
        handle: "stain-resistant-waterproof-apron-unisex-adult-bib-for-home",
        customData: { highlights: ["home home"] },
      }),
      makeProduct({
        id: 115,
        title: "Magnetic Phone Case",
        handle: "magnetic-shockproof-phone-case-for-iphone",
        customData: { highlights: ["minimum-qty-2", "shockproof phone"] },
      }),
      makeProduct({
        id: 116,
        title: "Compact Travel Organizer",
        handle: "compact-travel-organizer-for-daily-essentials",
        customData: { highlights: ["Keeps small essentials organized"] },
      }),
    ];
    const plan = buildBackfillPlan({
      products: malformed,
      collections: [],
      collectionProducts: { collections: {} },
      reviewSummaries: new Map(),
      diaperTypeOptions: [],
    });

    const repairedWrites = plan.productPlans
      .map((productPlan) => productPlan.writes.find((entry) => entry.fieldId === BACKFILL_FIELD_IDS.highlights))
      .filter(Boolean);

    expect(repairedWrites).toHaveLength(2);
    expect(repairedWrites.map((entry) => entry.value).join(" ")).not.toMatch(
      /home home|minimum-qty|shockproof phone/i,
    );
    expect(plan.productPlans[2]?.writes.some((entry) => entry.fieldId === BACKFILL_FIELD_IDS.highlights)).toBe(false);
  });

  it("keeps room for complementary products when the candidate pool is small", () => {
    const products = [
      makeProduct({
        id: 201,
        title: "Home Product for Practical Everyday Home Use and Daily Living",
        handle: "stain-resistant-waterproof-apron-unisex-adult-bib-for-home",
      }),
      makeProduct({
        id: 202,
        title: "Home Product for Practical Everyday Home Use and Daily Living",
        handle: "waterproof-apron-heavy-duty-bib",
      }),
      makeProduct({
        id: 203,
        title: "Home Product for Practical Everyday Home Use and Daily Living",
        handle: "adult-bib-kitchen-protector",
      }),
    ];

    const collections = [
      {
        id: 30,
        title: "Home",
        handle: "home",
        description: "",
        published_at: "2026-07-01T00:00:00Z",
        updated_at: "2026-07-01T00:00:00Z",
        image: null,
        products_count: 3,
      },
    ];

    const collectionProducts = {
      generatedAt: "2026-07-01T00:00:00Z",
      source: "test",
      totalCollections: 1,
      collections: {
        home: {
          title: "Home",
          productIds: [201, 202, 203],
        },
      },
    };

    const plan = buildBackfillPlan({
      products,
      collections,
      collectionProducts,
      reviewSummaries: new Map(),
      diaperTypeOptions: [],
    });

    const product = plan.productPlans.find((entry) => entry.id === 201);

    expect(product?.writes.some((entry) => entry.fieldId === BACKFILL_FIELD_IDS.relatedProducts)).toBe(true);
    expect(product?.writes.some((entry) => entry.fieldId === BACKFILL_FIELD_IDS.complementaryProducts)).toBe(true);
  });

  it("keeps product writes together while batching", () => {
    const batches = buildMetafieldSetBatches(
      [
        {
          id: 1,
          handle: "one",
          title: "One",
          writes: Array.from({ length: 2 }, (_value, index) => ({
            ownerId: "gid://shopify/Product/1",
            namespace: "custom",
            key: `field_${index}`,
            type: "single_line_text_field",
            value: `value-${index}`,
            fieldId: `custom.field_${index}`,
            label: `Field ${index}`,
            reason: "test",
          })),
        },
        {
          id: 2,
          handle: "two",
          title: "Two",
          writes: Array.from({ length: 2 }, (_value, index) => ({
            ownerId: "gid://shopify/Product/2",
            namespace: "custom",
            key: `field_${index + 2}`,
            type: "single_line_text_field",
            value: `value-${index + 2}`,
            fieldId: `custom.field_${index + 2}`,
            label: `Field ${index + 2}`,
            reason: "test",
          })),
        },
      ],
      3,
    );

    expect(batches).toHaveLength(2);
    expect(batches[0]?.productIds).toEqual([1]);
    expect(batches[1]?.productIds).toEqual([2]);
    expect(batches.every((batch) => batch.size <= 3)).toBe(true);
  });

  it("maps high-confidence diaper taxonomy references only when the schema exists", () => {
    const diaperReference = inferDiaperTypeReference(
      makeProduct({
        id: 99,
        title: "Adult Pull-Up Pants",
        handle: "adult-pull-up-pants",
        product_type: "Incontinence",
        tags: ["medical", "adult"],
        price: "32.00",
      }),
      [
        {
          id: "gid://shopify/Metaobject/11",
          handle: "pull-ups",
          displayName: "Pull-ups",
          type: "shopify--diaper-type",
        },
      ],
    );

    expect(diaperReference).toBe("gid://shopify/Metaobject/11");
  });
});
