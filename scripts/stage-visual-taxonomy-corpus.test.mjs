// @vitest-environment node

import { createServer } from "node:http";

import { describe, expect, it } from "vitest";

import {
  fetchBytes,
  deduplicateStagedResults,
  isQuarantinableImageError,
  isReusableQuarantinedStagingFailure,
  isVerifiedStagingCheckpoint,
  normalizeEntries,
  planVisualCorpusShards,
} from "./stage-visual-taxonomy-corpus.mjs";

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
  it("quarantines duplicate candidate image content while retaining an audit record", () => {
    const result = deduplicateStagedResults([
      { source: "one", target: "images/one.webp", productId: "one", ruleId: "hats-caps", sha256: "a", bytes: 100 },
      { source: "two", target: "images/two.webp", productId: "two", ruleId: "bags-general", sha256: "a", bytes: 80 },
    ], { quarantineDuplicates: true });
    expect(result.results.filter((entry) => !entry.skipped)).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].failure).toMatchObject({ status: 409, bytes: 80, duplicateOf: { productId: "one" } });
  });

  it("keeps trusted visual staging strict when duplicate image content is found", () => {
    expect(() => deduplicateStagedResults([
      { target: "images/one.webp", productId: "one", sha256: "a", bytes: 100 },
      { target: "images/two.webp", productId: "two", sha256: "a", bytes: 80 },
    ])).toThrow(/Duplicate image content detected/);
  });

  it("identifies only permanent missing-image responses as quarantine candidates", () => {
    expect(isQuarantinableImageError({ status: 404, message: "image HTTP 404" })).toBe(true);
    expect(isQuarantinableImageError({ status: 410, message: "image HTTP 410" })).toBe(true);
    expect(isQuarantinableImageError({ status: 503, message: "image HTTP 503" })).toBe(false);
    expect(isQuarantinableImageError(new Error("socket hang up"))).toBe(false);
  });

  it("reuses only exact permanent quarantine records on resume", () => {
    const entry = {
      source: "https://cdn.example.test/item.webp",
      target: "images/item.webp",
      sha256: "a".repeat(64),
    };
    expect(isReusableQuarantinedStagingFailure({ ...entry, status: 404 }, entry)).toBe(true);
    expect(isReusableQuarantinedStagingFailure({ ...entry, status: 503 }, entry)).toBe(false);
    expect(isReusableQuarantinedStagingFailure({ ...entry, source: "https://cdn.example.test/changed.webp", status: 404 }, entry)).toBe(false);
  });

  it("resumes a short HTTP body with a bounded range request", async () => {
    const body = Buffer.from("verified visual bytes");
    const requests = [];
    const server = createServer((request, response) => {
      const range = String(request.headers.range || "");
      requests.push(range);
      if (!range) {
        response.writeHead(200, { "content-length": 7 });
        response.end(body.subarray(0, 7));
        return;
      }
      const start = Number(range.match(/^bytes=(\d+)-$/)?.[1]);
      response.writeHead(206, {
        "content-length": body.length - start,
        "content-range": `bytes ${start}-${body.length - 1}/${body.length}`,
      });
      response.end(body.subarray(start));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    try {
      const received = await fetchBytes(`http://127.0.0.1:${address.port}/image.jpg`, body.length);
      expect(Buffer.from(received)).toEqual(body);
      expect(requests).toEqual(["", "bytes=7-"]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("falls back to a clean full request when a CDN rejects the resumed range", async () => {
    const body = Buffer.from("verified visual bytes");
    const requests = [];
    const server = createServer((request, response) => {
      const range = String(request.headers.range || "");
      requests.push(range);
      if (range) {
        response.writeHead(416, { "content-range": `bytes */${body.length}` });
        response.end();
        return;
      }
      if (requests.length === 1) {
        response.writeHead(200, { "content-length": 7 });
        response.end(body.subarray(0, 7));
        return;
      }
      response.writeHead(200, { "content-length": body.length });
      response.end(body);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    try {
      const received = await fetchBytes(`http://127.0.0.1:${address.port}/image.jpg`, body.length);
      expect(Buffer.from(received)).toEqual(body);
      expect(requests).toEqual(["", "bytes=7-", ""]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("does not retry permanent missing-image responses", async () => {
    let requests = 0;
    const server = createServer((_request, response) => {
      requests += 1;
      response.writeHead(404);
      response.end();
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    try {
      await expect(fetchBytes(`http://127.0.0.1:${address.port}/missing.webp`, 0)).rejects.toMatchObject({ status: 404 });
      expect(requests).toBe(1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("trusts a staged file without rehashing only with matching checkpoint evidence", () => {
    const entry = { target: "images/item.webp", bytes: 12, sha256: "a".repeat(64) };
    expect(isVerifiedStagingCheckpoint({ ...entry }, entry)).toBe(true);
    expect(isVerifiedStagingCheckpoint({ ...entry, sha256: "b".repeat(64) }, entry)).toBe(false);
    expect(isVerifiedStagingCheckpoint({ target: entry.target, bytes: entry.bytes }, entry)).toBe(false);
  });

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
