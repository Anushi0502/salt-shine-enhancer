import { describe, expect, it } from "vitest";
import { LIVE_SHOPIFY_PRIME_QUERIES } from "@/lib/shopify-data";

describe("LIVE_SHOPIFY_PRIME_QUERIES", () => {
  it("covers the core Shopify datasets that should be fetched on app open", () => {
    expect(LIVE_SHOPIFY_PRIME_QUERIES).toHaveLength(6);
    expect(LIVE_SHOPIFY_PRIME_QUERIES.map(({ queryKey }) => queryKey[0])).toEqual([
      "products",
      "collections",
      "collection-products",
      "about-page",
      "blog-posts",
      "shop",
    ]);
  });
});
