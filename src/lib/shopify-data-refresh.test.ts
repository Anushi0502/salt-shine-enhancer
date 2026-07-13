import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadProducts } from "@/lib/shopify-data";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("loadProducts", () => {
  beforeEach(() => {
    const requests: Array<{ url: string; cache?: RequestCache }> = [];
    vi.stubGlobal("__SALT_TEST_REQUESTS__", requests);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, cache: init?.cache });

        if (url.includes("/data/products.json")) {
          return jsonResponse({
            generatedAt: "2026-07-01T00:00:00.000Z",
            source: "/data/products.json",
            total: 1,
            products: [
              {
                id: 2,
                title: "Cached Product",
                handle: "live-product",
                body_html: null,
                vendor: "SALT",
                product_type: "Cached",
                tags: [],
                created_at: "2026-07-01T00:00:00.000Z",
                published_at: "2026-07-01T00:00:00.000Z",
                updated_at: "2026-07-01T00:00:00.000Z",
                customData: {
                  rating: 4.8,
                  ratingCount: 18,
                  relatedProductsDisplay: "ahead",
                  relatedProducts: [
                    {
                      id: "gid://shopify/Product/5",
                      legacyResourceId: 5,
                      handle: "related-product",
                      title: "Related Product",
                    },
                  ],
                  searchProductBoosts: ["daily tech", "wearable"],
                  googleCustomProduct: true,
                },
                variants: [
                  {
                    id: 11,
                    title: "Default Title",
                    price: "12.99",
                    compare_at_price: null,
                    available: true,
                  },
                ],
                images: [],
                image: null,
              },
            ],
          });
        }

        if (url.includes("/products.json")) {
          return jsonResponse({
            products: [
              {
                id: 2,
                title: "Live Product",
                handle: "live-product",
                body_html: null,
                vendor: "SALT",
                product_type: "Live",
                tags: [],
                created_at: "2026-07-01T00:00:00.000Z",
                published_at: "2026-07-01T00:00:00.000Z",
                updated_at: "2026-07-01T00:00:00.000Z",
                variants: [
                  {
                    id: 22,
                    title: "Default Title",
                    price: "29.99",
                    compare_at_price: null,
                    available: true,
                  },
                ],
                images: [],
                image: null,
              },
            ],
          });
        }

        throw new Error(`Unexpected fetch URL: ${url}`);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the versioned cached JSON payload before attempting live Shopify", async () => {
    const payload = await loadProducts();
    const requests = (globalThis as typeof globalThis & { __SALT_TEST_REQUESTS__?: Array<{ url: string; cache?: RequestCache }> }).__SALT_TEST_REQUESTS__ ?? [];

    expect(payload.products).toHaveLength(1);
    expect(payload.products[0].title).toBe("Cached Product");
    expect(payload.products[0].handle).toBe("live-product");
    expect(payload.products[0].average_rating).toBe(4.8);
    expect(payload.products[0].total_reviews).toBe(18);
    expect(payload.products[0].customData?.relatedProductsDisplay).toBe("ahead");
    expect(payload.products[0].customData?.searchProductBoosts).toEqual(["daily tech", "wearable"]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toContain("/data/products.json");
    expect(requests[0]?.url).not.toContain("?ts=");
    expect(requests[0]?.cache).toBe("force-cache");
  });
});
