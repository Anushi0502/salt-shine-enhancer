import { describe, expect, it } from "vitest";

import { duplicateValues, validateCatalog, validateVisualDecisions } from "./release-proactive-repair.mjs";

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
});
