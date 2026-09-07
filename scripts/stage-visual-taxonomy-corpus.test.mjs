import { describe, expect, it } from "vitest";

import { normalizeEntries, planVisualCorpusShards } from "./stage-visual-taxonomy-corpus.mjs";

function entries(bytes) {
  return bytes.map((value, index) => ({
    image: `images/${index}.webp`,
    productId: `product-${index}`,
    ruleId: "test-rule",
    labelSource: "approved",
    sha256: String(index).padStart(64, "0"),
    bytes: value,
  }));
}

describe("visual taxonomy shard planning", () => {
  it("accepts external human-verified data only as explicitly marked candidate evidence", async () => {
    const previous = process.env.SALT_VISUAL_ALLOW_CANDIDATE_LABELS;
    process.env.SALT_VISUAL_ALLOW_CANDIDATE_LABELS = "1";
    try {
      const normalized = await normalizeEntries([{
        sourceUrl: "https://example.test/item.jpg",
        productId: "open-images-v7:test",
        ruleId: "hats-caps",
        labelSource: "external-human-verified-candidate",
        candidateOnly: true,
        sha256: "a".repeat(64),
        bytes: 10,
      }], "/tmp/open-images-manifest.jsonl", "/tmp/open-images-corpus");
      expect(normalized[0]).toMatchObject({ labelSource: "external-human-verified-candidate", candidateOnly: true });
    } finally {
      if (previous === undefined) delete process.env.SALT_VISUAL_ALLOW_CANDIDATE_LABELS;
      else process.env.SALT_VISUAL_ALLOW_CANDIDATE_LABELS = previous;
    }
  });

  it("keeps every shard within the cap while reaching the cumulative target", () => {
    const plan = planVisualCorpusShards(entries([10, 10, 10, 10, 10, 10]), {
      maxShardBytes: 25,
      targetBytes: 50,
    });

    expect(plan.bytes).toBe(50);
    expect(plan.shards.map((shard) => shard.bytes)).toEqual([20, 20, 10]);
    expect(plan.shards.every((shard) => shard.bytes <= 25)).toBe(true);
    expect(plan.shards.flatMap((shard) => shard.entries)).toHaveLength(5);
  });

  it("rejects an image that cannot fit into a single bounded shard", () => {
    expect(() => planVisualCorpusShards(entries([26]), {
      maxShardBytes: 25,
      targetBytes: 50,
    })).toThrow(/larger than the 25-byte shard cap/);
  });

  it("fails instead of silently accepting a corpus smaller than the requested target", () => {
    expect(() => planVisualCorpusShards(entries([10, 10]), {
      maxShardBytes: 25,
      targetBytes: 50,
    })).toThrow(/required target is 50 bytes/);
  });

  it("rejects a caller-supplied cap above the hard 25 GB limit", () => {
    expect(() => planVisualCorpusShards(entries([10, 10]), {
      maxShardBytes: 25_000_000_001,
      targetBytes: 20,
    })).toThrow(/25 GB/);
  });
});
