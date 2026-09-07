import { describe, expect, it } from "vitest";

import { summarizeKnowledge } from "./audit-visual-taxonomy-training-inputs.mjs";

describe("visual taxonomy training readiness evidence", () => {
  it("counts only resolved checked-in rules as deterministic label evidence", () => {
    const result = summarizeKnowledge({
      products: [
        { classificationRule: "shirts", reviewRequired: false },
        { classificationRule: "shirts", reviewRequired: false },
        { classificationRule: "missing-rule", reviewRequired: false },
        { classificationRule: "shirts", reviewRequired: true },
      ],
    }, new Set(["shirts"]));

    expect(result).toMatchObject({
      records: 4,
      deterministicResolved: 2,
      reviewRequired: 2,
      distinctRules: 1,
      labelCounts: { shirts: 2 },
    });
  });

  it("does not turn deterministic evidence into a trusted-label claim", () => {
    const result = summarizeKnowledge({ products: [{ classificationRule: "shirts", reviewRequired: false }] }, new Set(["shirts"]));
    expect(result).not.toHaveProperty("trusted");
  });
});
