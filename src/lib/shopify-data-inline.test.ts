import { afterEach, describe, expect, it, vi } from "vitest";

import { loadCollectionProductIds, loadProductSearchIndex } from "@/lib/shopify-data";

type InlineWindow = Window & {
  __SALT_COLLECTION_PREFETCH__?: {
    handle: string;
    generatedAt: string;
    complete: boolean;
    currentPage: number;
    total: number;
    productIds: number[];
    products: Array<Record<string, unknown>>;
  };
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function liveProduct(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 101,
    title: "Live Shopify Product",
    handle: "live-shopify-product",
    body_html: null,
    vendor: "SALT",
    product_type: "Gifts",
    tags: ["live"],
    created_at: "2026-07-17T00:00:00Z",
    published_at: "2026-07-17T00:00:00Z",
    updated_at: "2026-07-17T00:00:00Z",
    variants: [
      {
        id: 201,
        title: "Default Title",
        price: 1999,
        compare_at_price: 2499,
        available: true,
      },
    ],
    images: [{ id: 301, src: "https://cdn.shopify.com/live.jpg", alt: "Live product" }],
    image: { id: 301, src: "https://cdn.shopify.com/live.jpg", alt: "Live product" },
    ...overrides,
  };
}

function installInlineCollection(overrides: Partial<InlineWindow["__SALT_COLLECTION_PREFETCH__"]> = {}) {
  window.history.replaceState({}, "", "/collections/under-25");
  (window as InlineWindow).__SALT_COLLECTION_PREFETCH__ = {
    handle: "under-25",
    generatedAt: "2026-07-17T00:00:00Z",
    complete: true,
    currentPage: 1,
    total: 1,
    productIds: [101],
    products: [liveProduct()],
    ...overrides,
  };
}

afterEach(() => {
  delete (window as InlineWindow).__SALT_COLLECTION_PREFETCH__;
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Shopify Liquid collection bootstrap", () => {
  it("uses current Shopify collection ordering without a network request", async () => {
    installInlineCollection({ productIds: [101, 102, 103], total: 3 });
    const fetchMock = vi.fn(async () => {
      throw new Error("network should not run");
    });
    vi.stubGlobal("fetch", fetchMock);

    const payload = await loadCollectionProductIds("under-25");

    expect(payload.source).toBe("shopify-liquid:under-25");
    expect(payload.productIds).toEqual([101, 102, 103]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts the all-products Liquid bootstrap on the /shop route", async () => {
    installInlineCollection({ handle: "all-products", productIds: [301, 302], total: 2 });
    window.history.replaceState({}, "", "/shop");
    const fetchMock = vi.fn(async () => {
      throw new Error("network should not run");
    });
    vi.stubGlobal("fetch", fetchMock);

    const payload = await loadCollectionProductIds("all-products");

    expect(payload.source).toBe("shopify-liquid:all-products");
    expect(payload.productIds).toEqual([301, 302]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to Shopify for an incomplete Liquid page", async () => {
    installInlineCollection({ complete: false });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/collections/under-25/products.json")) {
        return jsonResponse({ products: [{ id: 501 }, { id: 502 }] });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const payload = await loadCollectionProductIds("under-25");

    expect(payload.productIds).toEqual([501, 502]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("merges request-time Shopify prices into the compact search index", async () => {
    installInlineCollection({
      productIds: [101, 102],
      products: [liveProduct(), liveProduct({ id: 102, handle: "newly-added", title: "Newly Added" })],
      total: 2,
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes("/data/product-search.json")) {
        throw new Error(`Unexpected fetch URL: ${url}`);
      }

      return jsonResponse({
        generatedAt: "2026-07-01T00:00:00Z",
        source: "/data/product-search.json",
        total: 1,
        products: [
          {
            id: 101,
            title: "Cached Product",
            handle: "live-shopify-product",
            body_html: null,
            vendor: "SALT",
            product_type: "Cached Gifts",
            tags: [],
            created_at: "2026-07-01T00:00:00Z",
            published_at: "2026-07-01T00:00:00Z",
            updated_at: "2026-07-01T00:00:00Z",
            customData: { subtitle: "Curated subtitle" },
            variants: [
              {
                id: 201,
                title: "Default Title",
                price: "99.99",
                compare_at_price: null,
                available: true,
              },
            ],
            images: [],
            image: null,
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const payload = await loadProductSearchIndex();
    const refreshed = payload.products.find((product) => product.id === 101);

    expect(refreshed?.title).toBe("Live Shopify Product");
    expect(refreshed?.variants[0]?.price).toBe("19.99");
    expect(refreshed?.variants[0]?.compare_at_price).toBe("24.99");
    expect(refreshed?.customData?.subtitle).toBe("Curated subtitle");
    expect(payload.products.some((product) => product.handle === "newly-added")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
