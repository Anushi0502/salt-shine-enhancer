import { describe, expect, it } from "vitest";

import { buildReviewedLabelManifest } from "./build-visual-taxonomy-reviewed-labels.mjs";

describe("reviewed visual label manifest", () => {
  it("keeps only approved image-reviewed decisions whose source image is live", () => {
    const result = buildReviewedLabelManifest({
      catalog: { products: [{ id: "p1", handle: "tripod", images: [{ src: "https://cdn.example/tripod.webp" }] }] },
      overrides: [{
        id: "review-1",
        productId: "p1",
        handle: "tripod",
        ruleId: "smartphone-video-rigs",
        approved: true,
        imageReviewed: true,
        imageUrl: "https://cdn.example/tripod.webp",
        reviewedAt: "2026-08-01T00:00:00Z",
        reason: "Image inspected by a reviewer.",
      }],
    });
    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ productId: "p1", ruleId: "smartphone-video-rigs", labelSource: "human-reviewed" });
  });

  it("rejects stale reviewed images instead of silently relabeling them", () => {
    const result = buildReviewedLabelManifest({
      catalog: { products: [{ id: "p1", handle: "tripod", images: [{ src: "https://cdn.example/current.webp" }] }] },
      overrides: [{
        id: "review-1",
        productId: "p1",
        ruleId: "smartphone-video-rigs",
        approved: true,
        imageReviewed: true,
        imageUrl: "https://cdn.example/old.webp",
      }],
    });
    expect(result.entries).toEqual([]);
    expect(result.errors[0]).toMatch(/no longer present/);
  });
});
