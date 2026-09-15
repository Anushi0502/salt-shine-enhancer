import { describe, expect, it } from "vitest";
import { getCollectionGuideLinks, getCollectionGuideSummary } from "@/lib/collection-guide-links";
import { getEditorialGuidesForProductHandle } from "@/lib/editorial-pages";

describe("editorial collection guide links", () => {
  it("maps verified collection routes to relevant buying guides", () => {
    expect(getCollectionGuideLinks("cookware").map((guide) => guide.handle)).toEqual([
      "kitchen-cookware-buying-guide",
    ]);
    expect(getCollectionGuideLinks("AUDIO").map((guide) => guide.handle)).toEqual([
      "realme-buds-case-compatibility-guide",
      "salt-earbuds-buying-guide",
    ]);
    expect(getCollectionGuideLinks("lunch-boxes").map((guide) => guide.handle)).toEqual([
      "digital-circus-lunch-box-for-kids",
    ]);
    expect(getCollectionGuideSummary("cookware")).toContain("food preparation");
  });

  it("does not invent a guide for an unverified collection", () => {
    expect(getCollectionGuideLinks("not-a-collection")).toEqual([]);
  });
});

describe("editorial product guide links", () => {
  it("returns the focused guide for a featured live product", () => {
    expect(
      getEditorialGuidesForProductHandle(
        "mobwol-2026-new-mens-watches-40mm-luxury-quartz-watch-men-sport-wear-resistant-glass-3bar-waterproof-stainless-steel",
      ).map((guide) => guide.handle),
    ).toEqual(["mobwol-watch-guide"]);
  });

  it("normalizes handles and does not invent a guide for unrelated products", () => {
    expect(
      getEditorialGuidesForProductHandle(
        "  SILICONE-PROTECTIVE-CASE-FOR-REALME-BUDS-AIR8-LIQUID-SILICONE-COVER-SLIM-LIGHTWEIGHT-HEADPHONES-PROTECTIVE-CASE-1PCS ",
      ).map((guide) => guide.handle),
    ).toEqual(["realme-buds-case-compatibility-guide", "salt-earbuds-buying-guide"]);
    expect(getEditorialGuidesForProductHandle("not-a-featured-product")).toEqual([]);
  });
});
