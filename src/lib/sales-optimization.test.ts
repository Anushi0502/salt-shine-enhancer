import { describe, expect, it } from "vitest";

import {
  buildCartRecommendations,
  buildProductCollectionIndex,
  pickRelatedProducts,
  rankProductsForMerchandising,
  rankProductsForShopChannel,
} from "@/lib/sales-optimization.js";
import type { CollectionProductsPayload, ShopifyCollection, ShopifyProduct } from "@/types/shopify";

function makeProduct(input: {
  id: number;
  title: string;
  handle: string;
  productType?: string;
  price?: string;
  compareAtPrice?: string | null;
  rating?: number;
  reviewCount?: number;
  collectionSignal?: string | null;
  tags?: string[];
}): ShopifyProduct {
  return {
    id: input.id,
    title: input.title,
    handle: input.handle,
    body_html: "<p>Helpful product details for shoppers.</p>",
    vendor: "SALT",
    product_type: input.productType || "",
    tags: input.tags || [],
    created_at: "2026-07-01T00:00:00Z",
    published_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    variants: [
      {
        id: input.id * 10,
        title: "Default Title",
        price: input.price || "19.99",
        compare_at_price: input.compareAtPrice ?? null,
        available: true,
      },
    ],
    images: [],
    image: null,
    average_rating: input.rating,
    total_reviews: input.reviewCount,
    customData: {
      collectionSignal: input.collectionSignal ?? null,
      rating: input.rating ?? null,
      ratingCount: input.reviewCount ?? null,
      highlights: [],
      searchProductBoosts: [],
      relatedProducts: [],
      complementaryProducts: [],
      relatedProductsDisplay: null,
      badgeText: null,
      subtitle: null,
      googleCustomProduct: null,
      shopChannelMinimumQuantity: null,
      diaperType: null,
      metafields: {},
    },
  };
}

function makeCollection(input: { id: number; title: string; handle: string; productsCount?: number }): ShopifyCollection {
  return {
    id: input.id,
    title: input.title,
    handle: input.handle,
    description: "",
    published_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    image: null,
    products_count: input.productsCount || 0,
    customData: null,
  };
}

function makeCollectionProductsPayload(collections: CollectionProductsPayload["collections"]): CollectionProductsPayload {
  return {
    generatedAt: "2026-07-01T00:00:00Z",
    source: "test",
    totalCollections: Object.keys(collections).length,
    collections,
  };
}

describe("sales optimization", () => {
  it("ranks a reviewed discounted product above a plain product", () => {
    const reviewedDiscounted = makeProduct({
      id: 1,
      title: "Reviewed Discounted Product",
      handle: "reviewed-discounted-product",
      productType: "Essentials",
      price: "24.00",
      compareAtPrice: "40.00",
      rating: 4.8,
      reviewCount: 42,
      collectionSignal: "Essentials",
      tags: ["featured", "sale"],
    });
    const plainProduct = makeProduct({
      id: 2,
      title: "Plain Product",
      handle: "plain-product",
      productType: "Essentials",
      price: "24.00",
    });

    const ranked = rankProductsForMerchandising([plainProduct, reviewedDiscounted], {
      query: "reviewed",
      focusTerms: ["discount"],
    });

    expect(ranked[0]?.id).toBe(reviewedDiscounted.id);
  });

  it("prefers collection-overlap recommendations over same-type fallbacks", () => {
    const source = makeProduct({
      id: 10,
      title: "Source Organizer",
      handle: "source-organizer",
      productType: "Organizer",
      price: "36.00",
      tags: ["home"],
      collectionSignal: "Home, Organizers",
    });
    const overlapMatch = makeProduct({
      id: 11,
      title: "Overlap Organizer Companion",
      handle: "overlap-organizer-companion",
      productType: "Storage",
      price: "34.00",
      tags: ["home"],
      collectionSignal: "Home, Organizers",
    });
    const sameTypeFallback = makeProduct({
      id: 12,
      title: "Same Type But Weak Match",
      handle: "same-type-weak-match",
      productType: "Organizer",
      price: "34.00",
      tags: ["generic"],
      collectionSignal: "Generic",
    });
    const collectionIndex = buildProductCollectionIndex(
      makeCollectionProductsPayload({
        home: {
          title: "Home",
          productIds: [10, 11],
        },
        organizers: {
          title: "Organizers",
          productIds: [10, 11],
        },
        generic: {
          title: "Generic",
          productIds: [12],
        },
      }),
    );

    const related = pickRelatedProducts(source, [source, overlapMatch, sameTypeFallback], {
      collectionIndex,
      limit: 2,
    });

    expect(related[0]?.id).toBe(overlapMatch.id);
    expect(related.map((product) => product.id)).not.toContain(source.id);
  });

  it("builds cart recommendations from the highest-value cart item", () => {
    const base = makeProduct({
      id: 20,
      title: "Cart Anchor",
      handle: "cart-anchor",
      productType: "Daily Living",
      price: "54.00",
      tags: ["daily"],
      collectionSignal: "Daily Living, Essentials",
    });
    const related = makeProduct({
      id: 21,
      title: "Cart Anchor Companion",
      handle: "cart-anchor-companion",
      productType: "Daily Living",
      price: "30.00",
      tags: ["daily"],
      collectionSignal: "Daily Living, Essentials",
    });
    const complementary = makeProduct({
      id: 22,
      title: "Cart Anchor Add-on",
      handle: "cart-anchor-add-on",
      productType: "Accessories",
      price: "18.00",
      tags: ["daily"],
      collectionSignal: "Daily Living, Essentials",
    });
    const unrelatedCartItem = makeProduct({
      id: 23,
      title: "Unrelated Cart Item",
      handle: "unrelated-cart-item",
      productType: "Home Decor",
      price: "14.00",
      tags: ["decor"],
      collectionSignal: "Home Decor",
    });
    const collectionIndex = buildProductCollectionIndex(
      makeCollectionProductsPayload({
        "daily-living": {
          title: "Daily Living",
          productIds: [20, 21, 22],
        },
      }),
    );

    const plan = buildCartRecommendations(
      [
        { handle: "cart-anchor", title: "Cart Anchor", unitPrice: 54, quantity: 2, productType: "Daily Living" },
        { handle: "unrelated-cart-item", title: "Unrelated Cart Item", unitPrice: 14, quantity: 1, productType: "Home Decor" },
      ],
      [base, related, complementary, unrelatedCartItem],
      collectionIndex,
    );

    expect(plan.focusProducts[0]?.id).toBe(base.id);
    const recommendedIds = new Set([
      ...plan.relatedProducts.map((product) => product.id),
      ...plan.complementaryProducts.map((product) => product.id),
    ]);

    expect(recommendedIds).toContain(21);
    expect(recommendedIds).toContain(22);
  });

  it("prioritizes sub-$25 products on the Shop channel and keeps the floor visible", () => {
    const shopFloorPick = makeProduct({
      id: 30,
      title: "Shop Floor Pick",
      handle: "shop-floor-pick",
      productType: "Essentials",
      price: "19.00",
      tags: ["daily"],
    });
    const premiumShowcase = makeProduct({
      id: 31,
      title: "Premium Showcase",
      handle: "premium-showcase",
      productType: "Essentials",
      price: "68.00",
      rating: 5,
      reviewCount: 250,
      tags: ["featured"],
    });

    const ranked = rankProductsForShopChannel([premiumShowcase, shopFloorPick], {
      focusTerms: ["featured"],
    });

    expect(ranked[0]?.id).toBe(shopFloorPick.id);
  });
});
