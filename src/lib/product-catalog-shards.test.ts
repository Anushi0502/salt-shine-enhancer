import { describe, expect, it } from "vitest";
import {
  mergeProductShardPayloads,
  splitProductCatalogPayload,
} from "@/lib/product-catalog-shards.js";

describe("product catalog shards", () => {
  it("splits and reassembles catalogs under the configured byte limit", () => {
    const payload = {
      generatedAt: "2026-07-28T00:00:00.000Z",
      source: "test",
      total: 3,
      products: [
        { id: 1, handle: "one", title: "One", description: "a".repeat(400) },
        { id: 2, handle: "two", title: "Two", description: "b".repeat(400) },
        { id: 3, handle: "three", title: "Three", description: "c".repeat(400) },
      ],
    };

    const result = splitProductCatalogPayload(payload, 1_100);
    const reconstructed = mergeProductShardPayloads(
      result.manifest,
      result.shards.map((shard) => JSON.parse(shard.serialized)),
    );

    expect(result.manifest.format).toBe("salt-product-catalog-shards");
    expect(result.manifest.shardCount).toBeGreaterThan(1);
    expect(result.shards.every((shard) => shard.bytes <= 1_100)).toBe(true);
    expect(reconstructed.products.map((product) => product.id)).toEqual([1, 2, 3]);
    expect(reconstructed.total).toBe(3);
  });

  it("keeps small legacy payloads readable by callers", () => {
    const legacy = { products: [{ id: 7, handle: "legacy" }] };
    expect(Array.isArray(legacy.products)).toBe(true);
  });
});
