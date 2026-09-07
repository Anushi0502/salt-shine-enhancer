import { describe, expect, it } from "vitest";

import {
  adapterPathForShard,
  buildFullManifest,
  validateShardPlan,
} from "./train-visual-taxonomy-sharded.mjs";
import { getCatalogTaxonomyDefinitions } from "../src/lib/catalog-taxonomy.js";

const [firstRule, secondRule] = getCatalogTaxonomyDefinitions().map((definition) => definition.id);

function plan(overrides = {}) {
  return {
    kind: "salt-visual-taxonomy-shard-plan",
    version: 1,
    sourceManifestSha256: "a".repeat(64),
    targetBytes: 50_000_000_000,
    maxShardBytes: 25_000_000_000,
    bytes: 50_000_000_000,
    shards: [
      { shardIndex: 1, shardName: "shard-001", bytes: 25_000_000_000, imageCount: 1, sourceManifest: "/external/one.jsonl", datasetDir: "/external/shard-001", labelsOutput: "/external/one.labels.jsonl" },
      { shardIndex: 2, shardName: "shard-002", bytes: 25_000_000_000, imageCount: 1, sourceManifest: "/external/two.jsonl", datasetDir: "/external/shard-002", labelsOutput: "/external/two.labels.jsonl" },
    ],
    ...overrides,
  };
}

describe("sharded visual taxonomy training", () => {
  it("requires two sequential shards and never permits a shard over 25 GB", () => {
    expect(validateShardPlan(plan())).toMatchObject({ totalBytes: 50_000_000_000, maxShardBytes: 25_000_000_000 });
    expect(() => validateShardPlan(plan({ shards: [plan().shards[0]] }))).toThrow(/at least two/);
    expect(() => validateShardPlan(plan({ shards: [{ ...plan().shards[0], bytes: 25_000_000_001 }, plan().shards[1]] }))).toThrow(/25 GB/);
    expect(() => validateShardPlan(plan({ maxShardBytes: 25_000_000_001 }))).toThrow(/25 GB/);
  });

  it("builds one globally checked manifest from shard manifests", () => {
    const shardManifests = [
      { entries: [{ image: "one.webp", imageSha256: "1".repeat(64), bytes: 25_000_000_000, productId: "p1", ruleId: firstRule, split: "train" }] },
      { entries: [{ image: "two.webp", imageSha256: "2".repeat(64), bytes: 25_000_000_000, productId: "p2", ruleId: secondRule, split: "test" }] },
    ];
    const result = buildFullManifest(shardManifests, plan());
    expect(result).toMatchObject({ bytes: 50_000_000_000, imageCount: 2, productCount: 2, labelCount: 2 });
    expect(result.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("uses a stable separate adapter artifact for each non-final shard", () => {
    expect(adapterPathForShard("/external/final.safetensors", 0, 2)).toBe("/external/final.safetensors.shard-001");
    expect(adapterPathForShard("/external/final.safetensors", 1, 2)).toBe("/external/final.safetensors");
  });
});
