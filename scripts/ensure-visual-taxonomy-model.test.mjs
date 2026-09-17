// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  buildCandidateTrainingEnv,
  forceVisualTaxonomyRetrainRequested,
  isTaxonomyDriftError,
} from "./ensure-visual-taxonomy-model.mjs";

describe("visual taxonomy model recovery", () => {
  it("recognizes a compatibility refusal that requires retraining", () => {
    expect(isTaxonomyDriftError({
      message: "Command failed",
      stderr: "Taxonomy mismatch is not a unique append-only extension; retraining is required.",
    })).toBe(true);
  });

  it("does not convert unrelated model failures into retraining", () => {
    expect(isTaxonomyDriftError({
      message: "Visual taxonomy weights checksum does not match the installed model metadata.",
    })).toBe(false);
  });

  it("keeps retraining opt-in instead of automatic", () => {
    expect(forceVisualTaxonomyRetrainRequested(["node", "ensure"], {})).toBe(false);
    expect(forceVisualTaxonomyRetrainRequested(["node", "ensure", "--force-retrain"], {})).toBe(true);
    expect(forceVisualTaxonomyRetrainRequested(["node", "ensure"], { SALT_VISUAL_FORCE_RETRAIN: "1" })).toBe(true);
  });

  it("preserves the candidate-label gate while rebuilding a candidate shard plan", () => {
    const environment = buildCandidateTrainingEnv({ KEEP: "yes" }, { candidateOnly: true });

    expect(environment).toMatchObject({
      KEEP: "yes",
      SALT_VISUAL_TRAINING_RETAIN_RAW: "0",
      SALT_VISUAL_ALLOW_CANDIDATE_LABELS: "1",
    });
  });

  it("does not broaden a trusted training plan into candidate labels", () => {
    const environment = buildCandidateTrainingEnv({ KEEP: "yes" }, { candidateOnly: false });

    expect(environment).toMatchObject({
      KEEP: "yes",
      SALT_VISUAL_TRAINING_RETAIN_RAW: "0",
    });
    expect(environment.SALT_VISUAL_ALLOW_CANDIDATE_LABELS).toBeUndefined();
  });
});
