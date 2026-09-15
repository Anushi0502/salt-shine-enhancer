import { describe, expect, it } from "vitest";

import {
  CATALOG_COLLECTION_PLAN,
  CATALOG_COLLECTION_PLAN_VERSION,
  CATALOG_COLLECTION_RULE_TAGS,
  buildCollectionSource,
  collectionSourceMatches,
} from "./catalog-collection-plan.js";

describe("catalog collection plan", () => {
  it("keeps every canonical collection on a unique controlled tag", () => {
    expect(CATALOG_COLLECTION_PLAN).toHaveLength(44);
    expect(new Set(CATALOG_COLLECTION_PLAN.map((entry) => entry.handle)).size).toBe(CATALOG_COLLECTION_PLAN.length);
    expect(new Set(CATALOG_COLLECTION_RULE_TAGS).size).toBe(CATALOG_COLLECTION_RULE_TAGS.length);
    expect(CATALOG_COLLECTION_PLAN.every((entry) => !entry.ruleTag.includes(":"))).toBe(true);
    expect(CATALOG_COLLECTION_PLAN_VERSION).toBe("2026-08-06.1-collections.8");
  });

  it("matches only the intended controlled tag source", () => {
    const entry = CATALOG_COLLECTION_PLAN.find((candidate) => candidate.handle === "watches");
    const source = {
      __typename: "CollectionConditionsSource",
      targetType: "PRODUCTS",
      inclusion: {
        matchType: "ALL",
        conditions: [{
          __typename: "CollectionSourceInclusionConditionProductTag",
          relation: "TAGGED_WITH",
          values: [entry?.ruleTag],
          matchType: "ANY",
        }],
      },
    };

    expect(collectionSourceMatches(entry, source)).toBe(true);
    expect(collectionSourceMatches(entry, {
      ...source,
      inclusion: { ...source.inclusion, matchType: "ANY" },
    })).toBe(false);
    expect(buildCollectionSource(entry).inclusion.conditions[0].productTag.values).toEqual(["watches"]);
  });

  it("registers hats as a canonical collection", () => {
    expect(CATALOG_COLLECTION_PLAN.find((entry) => entry.handle === "hats")).toMatchObject({
      title: "Hats",
      ruleTag: "hats",
    });
  });

  it("registers wigs as a canonical collection", () => {
    expect(CATALOG_COLLECTION_PLAN.find((entry) => entry.handle === "wigs")).toMatchObject({
      title: "Wigs",
      ruleTag: "wigs",
    });
  });

  it("registers the four governed footwear collections", () => {
    expect(CATALOG_COLLECTION_PLAN).toEqual(expect.arrayContaining([
      expect.objectContaining({ handle: "mens-footwear", title: "Men's Footwear", ruleTag: "mens-footwear" }),
      expect.objectContaining({ handle: "formal-footwear", title: "Formal Footwear", ruleTag: "formal-footwear" }),
      expect.objectContaining({ handle: "womens-footwear", title: "Women's Footwear", ruleTag: "womens-footwear" }),
      expect.objectContaining({ handle: "kids-footwear", title: "Kids Footwear", ruleTag: "kids-footwear" }),
    ]));
  });

  it("registers the common footwear and jewelry collections", () => {
    expect(CATALOG_COLLECTION_PLAN).toEqual(expect.arrayContaining([
      expect.objectContaining({ handle: "footwear", title: "Footwear", ruleTag: "footwear" }),
      expect.objectContaining({ handle: "rings", title: "Rings", ruleTag: "rings" }),
      expect.objectContaining({ handle: "necklaces", title: "Necklaces", ruleTag: "necklaces" }),
      expect.objectContaining({ handle: "bracelets", title: "Bracelets", ruleTag: "bracelets" }),
      expect.objectContaining({ handle: "earrings", title: "Earrings", ruleTag: "earrings" }),
      expect.objectContaining({ handle: "everyday-jewelry", title: "Everyday Jewelry", ruleTag: "everyday-jewelry" }),
    ]));
  });

  it("registers the school shopping collections", () => {
    expect(CATALOG_COLLECTION_PLAN).toEqual(expect.arrayContaining([
      expect.objectContaining({ handle: "school-bags", title: "School Bags", ruleTag: "school-bags" }),
      expect.objectContaining({ handle: "lunch-boxes", title: "Lunch Boxes", ruleTag: "lunch-boxes" }),
      expect.objectContaining({ handle: "water-bottles", title: "Water Bottles", ruleTag: "water-bottles" }),
    ]));
  });
});
