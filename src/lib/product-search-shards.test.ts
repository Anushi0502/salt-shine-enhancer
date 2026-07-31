import { describe, expect, it } from "vitest";
import {
  mergeProductSearchShardPayloads,
  splitProductSearchPayload,
} from "@/lib/product-search-shards.js";

describe("product search shards", () => {
  it("splits large search payloads into independently publishable search assets", () => {
    const payload = {
      generatedAt: "2026-07-31T00:00:00.000Z",
      source: "/data/product-search.json",
      total: 4,
      products: [
        { id: 1, handle: "one", title: "One", body_html: "a".repeat(500) },
        { id: 2, handle: "two", title: "Two", body_html: "b".repeat(500) },
        { id: 3, handle: "three", title: "Three", body_html: "c".repeat(500) },
        { id: 4, handle: "four", title: "Four", body_html: "d".repeat(500) },
      ],
    };

    const result = splitProductSearchPayload(payload, 1_100);
    const reconstructed = mergeProductSearchShardPayloads(
      result.manifest,
      result.shards.map((shard) => JSON.parse(shard.serialized)),
    );

    expect(result.manifest.format).toBe("salt-product-search-shards");
    expect(result.manifest.shardCount).toBeGreaterThan(1);
    expect(result.manifest.shards.every((shard) => /^product-search-\d{4}\.json$/.test(shard.file))).toBe(true);
    expect(result.shards.every((shard) => shard.bytes <= 1_100)).toBe(true);
    expect(reconstructed.products.map((product) => product.id)).toEqual([1, 2, 3, 4]);
  });
});
