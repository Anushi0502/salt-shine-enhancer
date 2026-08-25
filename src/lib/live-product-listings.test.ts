import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LIVE_PRODUCT_PAGE_SIZE,
  loadLiveProductListing,
  loadPredictiveProducts,
  normalizeLiveListingProduct,
} from "@/lib/live-product-listings";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function liveProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 101,
    title: "Current Shopify Product",
    handle: "current-shopify-product",
    vendor: "SALT",
    product_type: "Gifts",
    tags: ["live"],
    average_rating: 4.5,
    total_reviews: 2,
    variants: [
      {
        id: 201,
        title: "Default Title",
        price: "43.99",
        compare_at_price: "64.99",
        available: true,
      },
    ],
    featured_image: {
      url: "https://cdn.shopify.com/current.webp",
      alt: "Current product",
      width: 800,
      height: 800,
    },
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("live Shopify product listings", () => {
  it("normalizes current decimal prices and predictive-search images", () => {
    const product = normalizeLiveListingProduct(liveProduct());

    expect(product?.variants[0]?.price).toBe("43.99");
    expect(product?.variants[0]?.compare_at_price).toBe("64.99");
    expect(product?.image?.src).toBe("https://cdn.shopify.com/current.webp");
    expect(product?.average_rating).toBe(4.5);
    expect(product?.total_reviews).toBe(2);
  });

  it("loads a server-filtered collection page from the Shopify section", async () => {
    const requests: Array<{ url: string; cache?: RequestCache }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, cache: init?.cache });
        const payload = {
          generatedAt: "2026-08-25T00:00:00Z",
          source: "shopify-liquid-section:collection",
          kind: "collection",
          handle: "lips-and-care",
          page: 2,
          pageSize: LIVE_PRODUCT_PAGE_SIZE,
          total: 393,
          totalPages: 11,
          hasPreviousPage: true,
          hasNextPage: true,
          productTypes: ["Lip Care"],
          products: [liveProduct()],
        };
        return new Response(
          `<div><script type="application/json" id="salt-product-listing-data">${JSON.stringify(payload)}</script></div>`,
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }),
    );

    const payload = await loadLiveProductListing({
      collectionHandle: "lips-and-care",
      page: 2,
      sort: "price-asc",
      productType: "Lip Care",
      minPrice: 20,
      maxPrice: 80,
    });

    expect(payload.total).toBe(393);
    expect(payload.page).toBe(2);
    expect(payload.products[0]?.variants[0]?.price).toBe("43.99");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toContain("section_id=salt-product-data");
    expect(requests[0]?.url).toContain("sort_by=price-ascending");
    expect(requests[0]?.url).toContain("filter.p.product_type=Lip+Care");
    expect(requests[0]?.cache).toBe("no-store");
  });

  it("falls back to bounded public collection JSON before the new theme section is live", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("section_id=salt-product-data")) {
          return new Response("Not found", { status: 404 });
        }
        if (url.includes("/products.json")) {
          return jsonResponse({ products: [liveProduct()] });
        }
        if (url.endsWith("/collections/watches.json")) {
          return jsonResponse({ collection: { products_count: 312 } });
        }
        throw new Error(`Unexpected URL: ${url}`);
      }),
    );

    const payload = await loadLiveProductListing({ collectionHandle: "watches", page: 1 });

    expect(payload.total).toBe(312);
    expect(payload.totalPages).toBe(9);
    expect(payload.products).toHaveLength(1);
    expect(payload.source).toContain("/collections/watches/products.json");
  });

  it("uses Shopify predictive search without a catalog download", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        requests.push(String(input));
        return jsonResponse({
          resources: {
            results: {
              products: [liveProduct({ variants: [], price: "40.99" })],
            },
          },
        });
      }),
    );

    const products = await loadPredictiveProducts("lip balm", 6);

    expect(products[0]?.variants[0]?.price).toBe("40.99");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain("/search/suggest.json");
    expect(requests[0]).not.toContain("/data/product-search");
  });
});
