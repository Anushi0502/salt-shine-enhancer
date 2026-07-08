import { describe, expect, it } from "vitest";

import {
  mergeProductCustomData,
  normalizeProductCustomData,
} from "@/lib/product-custom-data.js";

describe("product custom data normalization", () => {
  it("normalizes dashboard metafield payloads into the storefront shape", () => {
    const payload = normalizeProductCustomData({
      metafields: {
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
      },
      relatedProducts: [
        {
          id: "gid://shopify/Product/10",
          legacyResourceId: 10,
          handle: "smart-watch",
          title: "Smart Watch",
        },
      ],
      googleCustomProduct: "true",
    });

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
  });
});
