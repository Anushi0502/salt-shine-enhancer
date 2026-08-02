import { describe, expect, it } from "vitest";

import {
  mergeProductCustomData,
  normalizeCollectionCustomData,
  normalizeProductCustomData,
  normalizeShopCustomData,
} from "@/lib/product-custom-data.js";

describe("product custom data normalization", () => {
  it("normalizes dashboard metafield payloads into the storefront shape", () => {
    const payload = normalizeProductCustomData({
      metafields: {
        "descriptors.subtitle": {
          namespace: "descriptors",
          key: "subtitle",
          type: "single_line_text_field",
          jsonValue: "Smart daily living essential",
          value: "Smart daily living essential",
        },
        "salt-marketing.badge_text": {
          namespace: "salt-marketing",
          key: "badge_text",
          type: "single_line_text_field",
          jsonValue: "Top rated",
          value: "Top rated",
        },
        "salt-marketing.highlights": {
          namespace: "salt-marketing",
          key: "highlights",
          type: "list.single_line_text_field",
          jsonValue: ["fast checkout", "daily use"],
        },
        "salt-marketing.collection_signal": {
          namespace: "salt-marketing",
          key: "collection_signal",
          type: "single_line_text_field",
          jsonValue: "Home & Kitchen, Daily Living Aids",
          value: "Home & Kitchen, Daily Living Aids",
        },
        "reviews.rating": {
          namespace: "reviews",
          key: "rating",
          type: "rating",
          jsonValue: 4.6,
          value: "4.6",
        },
        "reviews.rating_count": {
          namespace: "reviews",
          key: "rating_count",
          type: "number_integer",
          jsonValue: 14,
          value: "14",
        },
        "shopify--discovery--product_search_boost.queries": {
          namespace: "shopify--discovery--product_search_boost",
          key: "queries",
          type: "list.single_line_text_field",
          jsonValue: ["daily tech", "gift"],
        },
        "shopify.diaper-type": {
          namespace: "shopify",
          key: "diaper-type",
          type: "list.metaobject_reference",
          jsonValue: [
            {
              id: "gid://shopify/Metaobject/111",
              handle: "pull-ups",
              displayName: "Pull-ups",
              type: "shopify--diaper-type",
            },
          ],
        },
        "mm-google-shopping.custom_product": {
          namespace: "mm-google-shopping",
          key: "custom_product",
          type: "boolean",
          jsonValue: true,
          value: "true",
        },
        "salt-marketing.shop_channel_minimum_quantity": {
          namespace: "salt-marketing",
          key: "shop_channel_minimum_quantity",
          type: "number_integer",
          jsonValue: 2,
          value: "2",
        },
      },
      relatedProducts: [
        {
          id: "gid://shopify/Product/10",
          legacyResourceId: 10,
          handle: "smart-watch",
          title: "Smart Watch",
        },
      ],
    });

    expect(payload?.subtitle).toBe("Smart daily living essential");
    expect(payload?.badgeText).toBe("Top rated");
    expect(payload?.highlights).toEqual(["fast checkout", "daily use"]);
    expect(payload?.rating).toBe(4.6);
    expect(payload?.ratingCount).toBe(14);
    expect(payload?.searchProductBoosts).toEqual(["daily tech", "gift"]);
    expect(payload?.diaperType).toEqual([
      {
        id: "gid://shopify/Metaobject/111",
        handle: "pull-ups",
        displayName: "Pull-ups",
        type: "shopify--diaper-type",
      },
    ]);
    expect(payload?.relatedProducts?.[0]?.handle).toBe("smart-watch");
    expect(payload?.googleCustomProduct).toBe(true);
    expect(payload?.shopChannelMinimumQuantity).toBe(2);
  });

  it("merges live and cached custom data with live values taking precedence", () => {
    const merged = mergeProductCustomData(
      {
        rating: 3.5,
        ratingCount: 12,
        searchProductBoosts: ["cached"],
        relatedProductsDisplay: "only manual",
      },
      {
        rating: 4.8,
        relatedProductsDisplay: "ahead",
        complementaryProducts: [
          {
            id: "gid://shopify/Product/99",
            legacyResourceId: 99,
            handle: "bundle-pick",
            title: "Bundle Pick",
          },
        ],
      },
    );

    expect(merged?.rating).toBe(4.8);
    expect(merged?.ratingCount).toBe(12);
    expect(merged?.relatedProductsDisplay).toBe("ahead");
    expect(merged?.searchProductBoosts).toEqual(["cached"]);
    expect(merged?.complementaryProducts?.[0]?.handle).toBe("bundle-pick");
    expect(merged?.shopChannelMinimumQuantity).toBeNull();
  });

  it("uses catalog-owned discovery fallbacks when Shopify standard fields are unavailable", () => {
    const payload = normalizeProductCustomData({
      searchProductBoostFallback: ["black jeans", "slim fit jeans"],
      complementaryProductsFallback: [
        {
          id: "gid://shopify/Product/22",
          legacyResourceId: 22,
          handle: "jeans-belt",
          title: "Jeans Belt",
        },
      ],
    });

    expect(payload?.searchProductBoosts).toEqual(["black jeans", "slim fit jeans"]);
    expect(payload?.complementaryProducts?.[0]?.handle).toBe("jeans-belt");
  });

  it("normalizes collection and shop marketing custom data", () => {
    const collectionPayload = normalizeCollectionCustomData({
      metafields: {
        "salt-marketing.hero_kicker": {
          namespace: "salt-marketing",
          key: "hero_kicker",
          type: "single_line_text_field",
          jsonValue: "Shop the collection",
          value: "Shop the collection",
        },
        "salt-marketing.hero_summary": {
          namespace: "salt-marketing",
          key: "hero_summary",
          type: "multi_line_text_field",
          jsonValue: "Curated picks for daily living.",
          value: "Curated picks for daily living.",
        },
        "salt-marketing.featured_products": {
          namespace: "salt-marketing",
          key: "featured_products",
          type: "list.product_reference",
          references: {
            nodes: [
              {
                id: "gid://shopify/Product/10",
                legacyResourceId: 10,
                handle: "smart-watch",
                title: "Smart Watch",
              },
            ],
          },
        },
        "salt-marketing.trust_strip": {
          namespace: "salt-marketing",
          key: "trust_strip",
          type: "list.single_line_text_field",
          jsonValue: ["Fast shipping", "Secure checkout"],
        },
      },
    });

    const shopPayload = normalizeShopCustomData({
      metafields: {
        "salt-marketing.banner_text": {
          namespace: "salt-marketing",
          key: "banner_text",
          type: "single_line_text_field",
          jsonValue: "Everyday essentials in one place.",
          value: "Everyday essentials in one place.",
        },
        "salt-marketing.trust_strip": {
          namespace: "salt-marketing",
          key: "trust_strip",
          type: "list.single_line_text_field",
          jsonValue: ["US shipping included", "Secure checkout"],
        },
      },
    });

    expect(collectionPayload?.heroKicker).toBe("Shop the collection");
    expect(collectionPayload?.featuredProducts?.[0]?.handle).toBe("smart-watch");
    expect(collectionPayload?.trustStrip).toEqual(["Fast shipping", "Secure checkout"]);
    expect(shopPayload?.bannerText).toBe("Everyday essentials in one place.");
    expect(shopPayload?.trustStrip).toEqual(["US shipping included", "Secure checkout"]);
  });
});
