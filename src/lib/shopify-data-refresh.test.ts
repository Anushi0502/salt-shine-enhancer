import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadProducts } from "@/lib/shopify-data";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function liveProduct() {
  return {
    id: 2,
    title: "Live Product",
    handle: "live-product",
    body_html: null,
    vendor: "SALT",
    product_type: "Live",
    tags: [],
    created_at: "2026-08-25T00:00:00.000Z",
    published_at: "2026-08-25T00:00:00.000Z",
    updated_at: "2026-08-25T00:00:00.000Z",
    variants: [
      {
        id: 22,
        title: "Default Title",
        price: "29.99",
        compare_at_price: "44.99",
        available: true,
      },
    ],
    images: [],
    image: null,
  };
}

describe("loadProducts live compatibility feed", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads only the bounded first Shopify collection page with current pricing", async () => {
    const requests: Array<{ url: string; cache?: RequestCache }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, cache: init?.cache });
        if (url.includes("/collections/all-products/products.json")) {
          return jsonResponse({ products: [liveProduct()] });
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      }),
    );

    const payload = await loadProducts();

    expect(payload.products).toHaveLength(1);
    expect(payload.products[0]?.title).toBe("Live Product");
    expect(payload.products[0]?.variants[0]?.price).toBe("29.99");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toContain("limit=250&page=1&sort_by=manual");
    expect(requests[0]?.url).not.toContain("/data/products");
    expect(requests[0]?.cache).toBe("no-store");
  });

  it("falls through live base candidates without requesting generated listing files", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);
        if (requests.length === 1) {
          return jsonResponse({ error: "temporary" }, 503);
        }
        return jsonResponse({ products: [liveProduct()] });
      }),
    );

    const payload = await loadProducts();

    expect(payload.products[0]?.handle).toBe("live-product");
    expect(requests).toHaveLength(2);
    expect(requests.every((url) => !url.includes("/data/products"))).toBe(true);
  });
});
