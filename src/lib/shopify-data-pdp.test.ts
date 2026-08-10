import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadProductByHandle, useProductByHandle } from "@/lib/shopify-data";
import type { ShopifyProduct } from "@/types/shopify";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function productRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 901,
    title: "Cached PDP Product",
    handle: "cached-pdp-background-refresh-20260810",
    body_html: "<p>Cached detail</p>",
    vendor: "SALT",
    product_type: "Gifts",
    tags: [],
    created_at: "2026-08-10T00:00:00Z",
    published_at: "2026-08-10T00:00:00Z",
    updated_at: "2026-08-10T00:00:00Z",
    variants: [{ id: 902, title: "Default Title", price: "29.99", compare_at_price: null, available: true }],
    images: [],
    image: null,
    ...overrides,
  };
}

afterEach(() => {
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PDP product detail hydration", () => {
  it("paints the cached catalog product while one deduplicated Shopify refresh runs", async () => {
    const handle = "cached-pdp-background-refresh-20260810";
    window.history.replaceState({}, "", `/products/${handle}`);

    let resolveDetail!: (response: Response) => void;
    const detailPending = new Promise<Response>((resolve) => {
      resolveDetail = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes(`/products/${handle}.json`)) {
        throw new Error(`Unexpected fetch URL: ${url}`);
      }

      return detailPending;
    });
    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const cachedProduct = productRecord() as unknown as ShopifyProduct;
    const result = renderHook(
      () => useProductByHandle(handle, true, true, cachedProduct),
      { wrapper },
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(result.result.current.data?.title).toBe("Cached PDP Product");
    expect(result.result.current.isLoading).toBe(false);
    expect(result.result.current.isFetching).toBe(true);

    const deduplicatedRequest = loadProductByHandle(handle);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveDetail(
      jsonResponse({
        product: productRecord({
          title: "Fresh Shopify PDP Product",
          body_html: "<p>Fresh detail</p>",
          variants: [{ id: 902, title: "Default Title", price: 3499, compare_at_price: null, available: true }],
        }),
      }),
    );

    await expect(deduplicatedRequest).resolves.toMatchObject({ title: "Fresh Shopify PDP Product" });
    await waitFor(() => expect(result.result.current.data?.title).toBe("Fresh Shopify PDP Product"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
