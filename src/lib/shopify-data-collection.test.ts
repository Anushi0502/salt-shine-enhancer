import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadCollectionPageProducts,
  mergeCollectionPageProducts,
  useProductSearchIndex,
} from "@/lib/shopify-data";
import type { ProductsPayload, ShopifyProduct } from "@/types/shopify";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function liveProduct(id: number, handle: string): Record<string, unknown> {
  return {
    id,
    title: `Live ${handle}`,
    handle,
    body_html: "<p>Live collection product</p>",
    vendor: "SALT",
    product_type: "Gifts",
    tags: ["live"],
    created_at: "2026-08-10T00:00:00Z",
    published_at: "2026-08-10T00:00:00Z",
    updated_at: "2026-08-10T00:00:00Z",
    variants: [{ id: id + 1000, title: "Default Title", price: 1999, compare_at_price: null, available: true }],
    images: [{ id: id + 2000, src: `https://cdn.shopify.com/${handle}.jpg`, alt: handle }],
    image: { id: id + 2000, src: `https://cdn.shopify.com/${handle}.jpg`, alt: handle },
  };
}

function staticPayload(): ProductsPayload {
  return {
    generatedAt: "2026-08-01T00:00:00Z",
    source: "cache:/data/product-search.json",
    total: 1,
    products: [
      {
        ...liveProduct(101, "cached-product"),
        title: "Cached Product",
        variants: [
          {
            id: 201,
            title: "Default Title",
            price: "12.99",
            compare_at_price: null,
            available: true,
          },
        ],
      } as ShopifyProduct,
    ],
  };
}

afterEach(() => {
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("lazy Shopify collection hydration", () => {
  it("bounds the live collection request to the current page", async () => {
    window.history.replaceState({}, "", "/collections/under-25?page=2");
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);
        if (url.includes("/collections/") && url.includes("/products.json")) {
          return jsonResponse({ products: [liveProduct(8097457340515, "new-live-product")] });
        }

        if (url.includes("/collections/") && url.endsWith(".json")) {
          return jsonResponse({ collection: { products_count: 7208 } });
        }

        throw new Error(`Unexpected fetch URL: ${url}`);
      }),
    );

    const payload = await loadCollectionPageProducts("under-50", 2);

    expect(payload.productIds).toEqual([8097457340515]);
    expect(payload.products[0]?.handle).toBe("new-live-product");
    expect(payload.total).toBe(7208);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toContain("/collections/under-50/products.json?limit=36&page=2&sort_by=manual");
    expect(requests[0]).not.toMatch(/\/__salt_shopify\/products\.json/);
  });

  it("adds a live product missing from the compact catalog without changing cached pricing", () => {
    const merged = mergeCollectionPageProducts(staticPayload(), [
      {
        ...staticPayload().products[0],
        id: 8098800402531,
        handle: "new-live-product",
        title: "New Live Product",
      },
    ]);

    expect(merged.products.map((product) => product.id)).toEqual([101, 8098800402531]);
    expect(merged.products[0]?.variants[0]?.price).toBe("12.99");
    expect(merged.products[1]?.handle).toBe("new-live-product");
  });

  it("deduplicates static and live records by Shopify handle", () => {
    const cached = staticPayload();
    const merged = mergeCollectionPageProducts(
      {
        ...cached,
        total: 2,
        products: [cached.products[0], { ...cached.products[0], id: 102, title: "Duplicate cached record" }],
      },
      [{ ...cached.products[0], id: 8097457340515, handle: "cached-product", title: "Live cached product" }],
    );

    expect(merged.products).toHaveLength(1);
    expect(merged.products[0]?.title).toBe("Live cached product");
  });

  it("returns the static catalog before the bounded live hydration resolves", async () => {
    window.history.replaceState({}, "", "/collections/under-50");
    let resolveHydration!: (response: Response) => void;
    const hydrationPending = new Promise<Response>((resolve) => {
      resolveHydration = resolve;
    });
    const liveRecord = liveProduct(8100940939363, "new-live-product");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/data/product-search.json")) {
          return jsonResponse(staticPayload());
        }

        if (url.includes("/collections/") && url.includes("/products.json")) {
          return hydrationPending;
        }

        throw new Error(`Unexpected fetch URL: ${url}`);
      }),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const result = renderHook(() => useProductSearchIndex(), { wrapper });

    await waitFor(() => {
      expect(result.result.current.data?.products.map((product) => product.id)).toEqual([101]);
    });

    resolveHydration(jsonResponse({ products: [liveRecord] }));

    await waitFor(() => {
      expect(result.result.current.data?.products.map((product) => product.id)).toEqual([101, 8100940939363]);
    });
  });
});
