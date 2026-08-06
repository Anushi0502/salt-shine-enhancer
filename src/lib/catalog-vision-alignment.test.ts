import { describe, expect, it } from "vitest";

import { assessVisionTaxonomyAlignment } from "./catalog-vision-alignment.js";

describe("catalog vision alignment", () => {
  it("rejects a visual category that contradicts an explicit product noun", () => {
    const result = assessVisionTaxonomyAlignment({
      title: "Naruto Anime Action Figure Model",
      handle: "naruto-anime-action-figure-model",
      product_type: "",
    }, "robes-sleepwear");

    expect(result.accepted).toBe(false);
    expect(result.categorySignalTokens).toEqual(expect.arrayContaining(["action", "figure", "model"]));
    expect(result.overlapTokens).toEqual([]);
  });

  it("accepts a visual category corroborated by the original product", () => {
    const result = assessVisionTaxonomyAlignment({
      title: "Naruto Anime Action Figure Model",
      handle: "naruto-anime-action-figure-model",
      product_type: "",
    }, "anime-figures-standees");

    expect(result.accepted).toBe(true);
    expect(result.overlapTokens.length).toBeGreaterThanOrEqual(2);
  });

  it("allows visual classification for an opaque supplier identity", () => {
    const result = assessVisionTaxonomyAlignment({
      title: "Nana Anime",
      handle: "nana-anime",
      product_type: "",
    }, "anime-figures-standees");

    expect(result.accepted).toBe(true);
    expect(result.opaque).toBe(true);
  });

  it("rejects unknown taxonomy rules", () => {
    expect(assessVisionTaxonomyAlignment({ title: "Nana Anime" }, "missing-rule").accepted).toBe(false);
  });
});
