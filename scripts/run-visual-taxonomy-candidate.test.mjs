import { describe, expect, it } from "vitest";

import {
  aggregateProductEvidence,
  buildCandidateLabels,
} from "./run-visual-taxonomy-candidate.mjs";

describe("local visual candidate review assist", () => {
  it("builds prompts from checked-in non-generic taxonomy definitions", () => {
    const labels = buildCandidateLabels();
    expect(labels.length).toBeGreaterThan(500);
    expect(labels.every((label) => label.ruleId && label.prompt.includes("retail product photo"))).toBe(true);
    expect(labels.every((label) => Array.isArray(label.prompts) && label.prompts.length >= 3)).toBe(true);
    expect(labels.some((label) => label.ruleId === "phone-case")).toBe(true);
  });

  it("accepts only aligned multi-image consensus", () => {
    const product = {
      id: "1",
      handle: "clear-phone-case",
      title: "Clear Phone Case for iPhone",
      product_type: "Phone Case",
    };
    const evidence = aggregateProductEvidence(product, [
      { ruleId: "phone-case", confidence: 0.31, imageSha256: "a", candidates: [{ ruleId: "phone-case", probability: 0.31 }] },
      { ruleId: "phone-case", confidence: 0.29, imageSha256: "b", candidates: [{ ruleId: "phone-case", probability: 0.29 }] },
    ], "test-model", "fingerprint");
    expect(evidence).toMatchObject({ ruleId: "phone-case", accepted: true, imageCount: 2, imageAgreement: 1, margin: 1 });
    expect(evidence.visionAlignment.accepted).toBe(true);
  });

  it("rejects a visually confident rule that conflicts with product evidence", () => {
    const product = {
      id: "2",
      handle: "thumb-splint",
      title: "Flexible Wrist Thumb Splint Support",
      product_type: "Wrist Support",
    };
    const evidence = aggregateProductEvidence(product, [
      { ruleId: "pet-cooling-mats", confidence: 0.20, imageSha256: "a", candidates: [{ ruleId: "pet-cooling-mats", probability: 0.20 }] },
      { ruleId: "pet-cooling-mats", confidence: 0.19, imageSha256: "b", candidates: [{ ruleId: "pet-cooling-mats", probability: 0.19 }] },
    ], "test-model", "fingerprint");
    expect(evidence.accepted).toBe(false);
    expect(evidence.visionAlignment.accepted).toBe(false);
    expect(evidence.reason).toContain("taxonomy text alignment rejected");
  });
});
