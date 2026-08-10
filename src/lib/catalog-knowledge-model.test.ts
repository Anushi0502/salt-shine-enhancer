import { describe, expect, it } from "vitest";

import {
  assertCatalogKnowledgeModel,
  buildKnowledgeTrainingRepresentatives,
  scoreCatalogKnowledgeModel,
  trainCatalogKnowledgeModel,
} from "./catalog-knowledge-model.js";

describe("catalog knowledge model", () => {
  it("covers a broad deterministic taxonomy representative set", () => {
    expect(buildKnowledgeTrainingRepresentatives().length).toBeGreaterThanOrEqual(100);
  });

  it("trains a bounded model and scores product evidence without changing the taxonomy label", () => {
    const representatives = buildKnowledgeTrainingRepresentatives();
    const model = trainCatalogKnowledgeModel({ records: representatives.length * 2 });
    expect(() => assertCatalogKnowledgeModel(model, { expectedRecords: representatives.length * 2 })).not.toThrow();

    const evidence = scoreCatalogKnowledgeModel(model, {
      title: representatives[0].title,
      handle: representatives[0].title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      product_type: representatives[0].classification.canonicalType,
    });
    expect(evidence?.modelVersion).toBe(model.modelVersion);
    expect(evidence?.topRuleId).toBeTruthy();
    expect(evidence?.featureCount).toBeGreaterThan(0);
  });
});
