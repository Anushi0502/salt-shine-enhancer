import { describe, expect, it } from "vitest";
import { filterOnlineStoreProducts, isOnlineStorePublishedProduct } from "./shopify-publication.mjs";

describe("Shopify Online Store publication", () => {
  it("keeps active products published to Online Store", () => {
    expect(
      isOnlineStorePublishedProduct({ status: "active", published_at: "2026-08-01T00:00:00Z" }),
    ).toBe(true);
  });

  it("excludes active products that are not published to Online Store", () => {
    expect(isOnlineStorePublishedProduct({ status: "active", published_at: null })).toBe(false);
  });

  it("excludes drafts even if a stale publication date remains", () => {
    expect(
      isOnlineStorePublishedProduct({ status: "draft", published_at: "2026-08-01T00:00:00Z" }),
    ).toBe(false);
  });

  it("filters the full feed without mutating its input", () => {
    const products = [
      { id: 1, status: "active", published_at: "2026-08-01T00:00:00Z" },
      { id: 2, status: "active", published_at: null },
    ];

    expect(filterOnlineStoreProducts(products).map((product) => product.id)).toEqual([1]);
    expect(products).toHaveLength(2);
  });
});
