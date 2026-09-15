import { describe, expect, it } from "vitest";

import {
  VISUAL_TAXONOMY_HINT_RULE_IDS,
  resolveVisualTaxonomyHint,
} from "./catalog-visual-taxonomy.js";
import { getCatalogTaxonomyDefinitions } from "./catalog-taxonomy.js";

describe("catalog visual taxonomy hints", () => {
  it("only points at current checked-in taxonomy rules", () => {
    const ruleIds = new Set(getCatalogTaxonomyDefinitions().map((definition) => definition.id));
    expect(VISUAL_TAXONOMY_HINT_RULE_IDS.every((ruleId) => ruleIds.has(ruleId))).toBe(true);
  });

  it("resolves exact product-family labels without broad accessory nouns", () => {
    expect(resolveVisualTaxonomyHint({ productName: "Portable Projector", productCategory: "Electronics" })).toBe(
      "merchant-electronics-fallback",
    );
    expect(resolveVisualTaxonomyHint({ productName: "Women's Jumpsuit" })).toBe("jumpsuits");
    expect(resolveVisualTaxonomyHint({ productName: "Long Sleeve Shirt" })).toBe("shirts");
    expect(resolveVisualTaxonomyHint({ productName: "Shirt Storage Bag" })).toBe(null);
    expect(resolveVisualTaxonomyHint({ productName: "Water Bottle" })).toBe(null);
  });
});
