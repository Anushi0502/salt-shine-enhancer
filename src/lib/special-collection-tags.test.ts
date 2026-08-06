import { describe, expect, it } from "vitest";

import {
  assertSpecialCollectionMinimums,
  buildSpecialCollectionAssignments,
} from "../../scripts/build-new-product-special-collection-tags.mjs";

describe("special collection release gates", () => {
  it("classifies creator and anime signals from product identity", () => {
    const assignments = buildSpecialCollectionAssignments([
      { handle: "usb-video-capture-card", title: "USB Video Capture Card" },
      { handle: "naruto-action-figure", title: "Naruto Anime Action Figure" },
    ]);

    expect(assignments.find((entry) => entry.handle === "usb-video-capture-card")?.matchedCollections)
      .toContain("creator-essentials");
    expect(assignments.find((entry) => entry.handle === "naruto-action-figure")?.matchedCollections)
      .toContain("anime-collectables");
  });

  it("blocks a release below either full-catalog minimum", () => {
    expect(() => assertSpecialCollectionMinimums({
      "creator-essentials": 499,
      "anime-collectables": 1027,
    })).toThrow(/creator-essentials=499/);
    expect(() => assertSpecialCollectionMinimums({
      "creator-essentials": 513,
      "anime-collectables": 999,
    })).toThrow(/anime-collectables=999/);
  });

  it("accepts the approved full-catalog counts", () => {
    expect(assertSpecialCollectionMinimums({
      "creator-essentials": 513,
      "anime-collectables": 1027,
    })).toBe(true);
  });
});
