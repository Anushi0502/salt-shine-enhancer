import { afterEach, describe, expect, it, vi } from "vitest";

import { loadCollectionProductIds, loadProductByHandle, loadProductSearchIndex } from "@/lib/shopify-data";

type InlineWindow = Window & {
  __SALT_PRODUCT_PREFETCH__?: {
    handle: string;
    raw: Record<string, unknown> | null;
    payload: Promise<Record<string, unknown>>;
  };
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
  delete (window as InlineWindow).__SALT_PRODUCT_PREFETCH__;
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

  it("keeps compact search pricing authoritative over stale Liquid snapshots", async () => {
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
                price: "84.99",
                compare_at_price: "109.99",
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
    expect(refreshed?.variants[0]?.price).toBe("84.99");
    expect(refreshed?.variants[0]?.compare_at_price).toBe("109.99");
    expect(refreshed?.customData?.subtitle).toBe("Curated subtitle");
    expect(payload.products.some((product) => product.handle === "newly-added")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses generated catalog pricing instead of a stale Liquid product snapshot", async () => {
    const inlineProduct = liveProduct({
      body_html: undefined,
      product_type: undefined,
      description: "<p>Live product details.</p>",
      type: "Gifts",
      variants: [
        {
          id: 201,
          title: "Default Title",
          price: 4499,
          compare_at_price: 5999,
          available: true,
        },
      ],
    });
    window.history.replaceState({}, "", "/products/live-shopify-product");
    (window as InlineWindow).__SALT_PRODUCT_PREFETCH__ = {
      handle: "live-shopify-product",
      raw: inlineProduct,
      payload: Promise.resolve(inlineProduct),
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes("/products/live-shopify-product.json")) {
        throw new Error(`Unexpected fetch URL: ${url}`);
      }

      return jsonResponse({
        product: liveProduct({
          body_html: "<p>Canonical product details.</p>",
          variants: [
            {
              id: 201,
              title: "Default Title",
              price: 5999,
              compare_at_price: 8699,
              available: true,
            },
          ],
        }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const product = await loadProductByHandle("live-shopify-product");

    expect(product.body_html).toContain("Canonical product details");
    expect(product.product_type).toBe("Gifts");
    expect(product.variants[0]?.price).toBe("59.99");
    expect(product.variants[0]?.compare_at_price).toBe("86.99");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/products/live-shopify-product.json"),
      expect.objectContaining({ cache: "no-cache" }),
    );
  });

  it("uses Shopify JSON only as a missing-catalog fallback", async () => {
    window.history.replaceState({}, "", "/products/fallback-product");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/products/fallback-product.json")) {
        return jsonResponse({ product: liveProduct({ handle: "fallback-product", title: "Fallback Product" }) });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const product = await loadProductByHandle("fallback-product");

    expect(product.title).toBe("Fallback Product");
    expect(product.variants[0]?.price).toBe("19.99");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/products/fallback-product.json"),
      expect.objectContaining({ cache: "no-cache" }),
    );
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith(".js"))).toBe(false);
  });
});
