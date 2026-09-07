import { describe, expect, it } from "vitest";

import { buildCatalogCandidateManifest, deterministicSplit } from "./build-visual-taxonomy-catalog-candidate-manifest.mjs";

describe("buildCatalogCandidateManifest", () => {
  it("includes only active deterministic products and marks labels candidate-only", () => {
    const result = buildCatalogCandidateManifest({
      catalog: {
        products: [
          { id: "1", handle: "hat", status: "ACTIVE", images: [{ src: "https://cdn.test/hat.jpg" }] },
          { id: "2", handle: "review", status: "ACTIVE", images: [{ src: "https://cdn.test/review.jpg" }] },
          { id: "3", handle: "draft", status: "DRAFT", images: [{ src: "https://cdn.test/draft.jpg" }] },
        ],
      },
      knowledge: {
        products: [
          { id: "1", classificationRule: "hats-caps", reviewRequired: false, confidence: 95, typeKey: "hat" },
          { id: "2", classificationRule: "hats-caps", reviewRequired: true },
          { id: "3", classificationRule: "hats-caps", reviewRequired: false },
        ],
      },
    });
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ productId: "1", ruleId: "hats-caps", labelSource: "deterministic-candidate", candidateOnly: true });
    expect(result.summary.excluded.reviewRequired).toBe(1);
  });

  it("assigns a stable product-group split", () => {
    expect(["train", "validation", "test"]).toContain(deterministicSplit("product:1"));
    expect(deterministicSplit("product:1")).toBe(deterministicSplit("product:1"));
  });
});
