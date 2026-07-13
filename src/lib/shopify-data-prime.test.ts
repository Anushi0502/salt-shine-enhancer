import { describe, expect, it } from "vitest";
import { LIVE_SHOPIFY_PRIME_QUERIES } from "@/lib/shopify-data";

describe("LIVE_SHOPIFY_PRIME_QUERIES", () => {
  it("only warms the small shell datasets on app open", () => {
    expect(LIVE_SHOPIFY_PRIME_QUERIES).toHaveLength(2);
    expect(LIVE_SHOPIFY_PRIME_QUERIES.map(({ queryKey }) => queryKey[0])).toEqual([
      "collections",
      "shop",
    ]);
  });
});
