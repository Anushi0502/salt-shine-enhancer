import { describe, expect, it } from "vitest";
import { buildRecentlyOrderedProductsPayload } from "./recently-ordered-products-core.js";

function lineItem(id: string, title: string) {
  return {
    title,
    product: {
      id: `gid://shopify/Product/${id}`,
      title,
      handle: title.toLowerCase().replace(/\s+/g, "-"),
      featuredMedia: { preview: { image: { url: `https://cdn.test/${id}.jpg`, altText: title } } },
    },
    variant: { price: "19.99", image: null },
  };
}

describe("buildRecentlyOrderedProductsPayload", () => {
  it("returns four unique products in newest-order sequence", () => {
    const payload = buildRecentlyOrderedProductsPayload([
      { cancelledAt: null, lineItems: { nodes: [lineItem("1", "One"), lineItem("2", "Two")] } },
      { cancelledAt: null, lineItems: { nodes: [lineItem("1", "One"), lineItem("3", "Three"), lineItem("4", "Four")] } },
    ]);

    expect(payload.products.map((product) => product.title)).toEqual(["One", "Two", "Three", "Four"]);
    expect(payload.products[0].price).toBe(19.99);
  });

  it("omits cancelled orders and incomplete product records", () => {
    const payload = buildRecentlyOrderedProductsPayload([
      { cancelledAt: "2026-01-01", lineItems: { nodes: [lineItem("1", "Cancelled")] } },
      { cancelledAt: null, lineItems: { nodes: [{ title: "Missing product", product: null }] } },
    ]);

    expect(payload.products).toEqual([]);
  });
});
