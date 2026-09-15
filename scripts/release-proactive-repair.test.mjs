import { describe, expect, it } from "vitest";

import {
  duplicateValues,
  validateCatalog,
  validateClassificationCoverage,
  validateReviewManifest,
  validateVisualDecisions,
} from "./release-proactive-repair.mjs";

describe("release proactive repair checks", () => {
  it("detects duplicate catalog identity before a release can mutate", () => {
    expect(duplicateValues(["a", "b", "a", "", "b"])).toEqual(["a", "b"]);
    const result = validateCatalog([
      { id: "1", handle: "same", title: "One" },
      { id: "1", handle: "same", title: "Two" },
    ]);
    expect(result.duplicateIds).toEqual(["1"]);
    expect(result.duplicateHandles).toEqual(["same"]);
  });

  it("accepts explicit fallback evidence and approved curated collections", () => {
    const result = validateVisualDecisions([{
      productId: "1",
      handle: "uncertain-product",
      source: "fallback",
      collectionHandles: ["classification-fallback", "creator-essentials"],
      visualEvidence: { rationale: "Evidence was insufficient for semantic taxonomy." },
    }]);
    expect(result.invalid).toEqual([]);
    expect(result.fallbackCount).toBe(1);
  });

  it("treats deterministic evidence fallbacks as resolved classifications", () => {
    const result = validateVisualDecisions([{
      productId: "1",
      handle: "direct-title-product",
      source: "evidence-fallback",
      ruleId: "kitchen-gadgets",
      collectionHandles: ["kitchen-gadgets"],
    }]);
    expect(result.invalid).toEqual([]);
    expect(result.fallbackCount).toBe(0);
    expect(result.evidenceBackedCount).toBe(1);
  });

  it("rejects guesses and unsupported semantic fallback assignments", () => {
    const result = validateVisualDecisions([
      { productId: "1", source: "guess", collectionHandles: ["shirts"] },
      {
        productId: "2",
        source: "fallback",
        collectionHandles: ["classification-fallback", "shirts"],
        fallbackReason: ["low confidence"],
      },
    ]);
    expect(result.invalid).toHaveLength(2);
    expect(result.invalid.map((entry) => entry.reason)).toContain("missing-or-unsupported-classification-source");
    expect(result.invalid.map((entry) => entry.reason)).toContain("fallback-has-unsupported-collection-assignment");
  });

  it("requires complete classification coverage for the current catalog boundary", () => {
    const result = validateClassificationCoverage(
      [
        { handle: "one", source: "taxonomy" },
        { handle: "one", source: "fallback" },
        { handle: "extra", source: "taxonomy" },
      ],
      [
        { id: "1", handle: "one" },
        { id: "2", handle: "two" },
      ],
    );
    expect(result.invalid.map((entry) => entry.reason)).toEqual(expect.arrayContaining([
      "duplicate-classification-handles",
      "catalog-products-without-classification",
      "classifications-outside-catalog",
      "classification-catalog-count-mismatch",
    ]));
  });

  it("rejects missing or incomplete visual review manifests", () => {
    expect(validateReviewManifest(null)).toEqual([{ reason: "visual-review-manifest-missing" }]);
    expect(validateReviewManifest({
      summary: {
        totalClassifications: 2,
        reviewed: 1,
        fallbackResolved: 1,
        fallbackWithEvidence: 0,
        pending: 0,
      },
    }).map((entry) => entry.reason)).toContain("fallback-evidence-count-mismatch");
  });

  it("includes evidence-backed classifications in review coverage", () => {
    expect(validateReviewManifest({
      summary: {
        totalClassifications: 3,
        reviewed: 1,
        fallbackResolved: 1,
        fallbackWithEvidence: 1,
        pending: 0,
      },
      fallbackProducts: [{
        handle: "uncertain",
        reason: "insufficient visual evidence",
        collectionHandle: "classification-fallback",
        semanticAssignmentAllowed: false,
      }],
    }, { evidenceBackedCount: 1 })).toEqual([]);
  });
});
