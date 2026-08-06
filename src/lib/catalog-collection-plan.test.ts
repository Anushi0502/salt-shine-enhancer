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
    expect(CATALOG_COLLECTION_PLAN).toHaveLength(29);
    expect(new Set(CATALOG_COLLECTION_PLAN.map((entry) => entry.handle)).size).toBe(CATALOG_COLLECTION_PLAN.length);
    expect(new Set(CATALOG_COLLECTION_RULE_TAGS).size).toBe(CATALOG_COLLECTION_RULE_TAGS.length);
    expect(CATALOG_COLLECTION_PLAN.every((entry) => entry.ruleTag.startsWith("salt:"))).toBe(true);
    expect(CATALOG_COLLECTION_PLAN_VERSION).toBe("2026-08-05.47-collections.2");
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
    expect(buildCollectionSource(entry).inclusion.conditions[0].productTag.values).toEqual(["salt:category:watches"]);
  });
});
