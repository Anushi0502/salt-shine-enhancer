import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadCollections } from "@/lib/collections-data";
import { loadShop } from "@/lib/shop-data";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("lightweight shell data", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads the shop snapshot with the browser cache enabled", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        generatedAt: "2026-07-13T00:00:00.000Z",
        source: "/data/shop.json",
        shop: { id: "salt", name: "SALT Online Store", customData: null },
      }),
    );

    const payload = await loadShop();

    expect(payload.shop.name).toBe("SALT Online Store");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/data/shop.json");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: "force-cache" });
  });

  it("loads the collections snapshot without a live Shopify fallback", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        generatedAt: "2026-07-13T00:00:00.000Z",
        source: "/data/collections.json",
        total: 1,
        collections: [
          {
            id: 1,
            title: " Home & Kitchen ",
            handle: "home-kitchen",
            description: "Helpful pieces",
            published_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-02T00:00:00.000Z",
            products_count: 3,
            image: null,
            customData: null,
          },
        ],
      }),
    );

    const payload = await loadCollections();

    expect(payload.collections).toHaveLength(1);
    expect(payload.collections[0]?.title).toBe("Home & Kitchen");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/data/collections.json");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: "force-cache" });
  });
});
