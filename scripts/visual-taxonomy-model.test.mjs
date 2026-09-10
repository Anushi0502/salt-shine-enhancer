import { describe, expect, it } from "vitest";

import {
  assertVisualTaxonomyModel,
  buildVisualTaxonomyLabelIndex,
  findAppendOnlyTaxonomyExtension,
  visualTaxonomyModelCompatibility,
  VISUAL_TAXONOMY_MIN_DATASET_BYTES,
  VISUAL_TAXONOMY_MODEL_BACKEND,
  VISUAL_TAXONOMY_MODEL_SCHEMA_VERSION,
  VISUAL_TAXONOMY_MODEL_TYPE,
} from "../src/lib/visual-taxonomy-model.js";
import { CATALOG_TAXONOMY_VERSION, getCatalogTaxonomyDefinitions } from "../src/lib/catalog-taxonomy.js";
import { taxonomyTrainingFingerprint } from "../src/lib/catalog-knowledge-model.js";

function validModel(overrides = {}) {
  return {
    schemaVersion: VISUAL_TAXONOMY_MODEL_SCHEMA_VERSION,
    modelType: VISUAL_TAXONOMY_MODEL_TYPE,
    backend: VISUAL_TAXONOMY_MODEL_BACKEND,
    trained: true,
    taxonomy: { version: CATALOG_TAXONOMY_VERSION, fingerprint: "fingerprint" },
    dataset: {
      bytes: VISUAL_TAXONOMY_MIN_DATASET_BYTES,
      imageCount: 10,
      productCount: 5,
      labelCount: 2,
      manifestSha256: "a".repeat(64),
    },
    training: {
      records: 10,
      embeddingDimensions: 16,
      device: "metal",
      precision: "float16",
      metrics: {
        test: { coverage: 1, macroF1: 1, accuracy: 1 },
        qualityGate: { passed: true },
      },
    },
    encoder: {
      fineTuned: true,
      baseCheckpointPath: "/tmp/visual-encoder-base-checkpoint.safetensors",
      baseCheckpointSha256: "c".repeat(64),
      fineTunedCheckpointPath: "/tmp/visual-encoder-finetuned-checkpoint.safetensors",
      fineTunedCheckpointSha256: "d".repeat(64),
      command: ["python3", "encode-images.py"],
      trainCommand: ["python3", "finetune-images.py"],
      fineTuning: {
        steps: 100,
        device: "metal",
        datasetManifestSha256: "a".repeat(64),
        reportPath: "output/visual-taxonomy-encoder-finetuned.safetensors.training.json",
        reportSha256: "e".repeat(64),
      },
    },
    weights: { path: "output/visual-taxonomy-model-weights.npz", sha256: "b".repeat(64) },
    retention: {
      rawDataPurged: true,
      purgedBytes: VISUAL_TAXONOMY_MIN_DATASET_BYTES,
      purgedImageCount: 10,
      purgedAt: "2026-08-29T00:00:00.000Z",
      purgedDatasetRoot: "/tmp/salt-visual-training-corpus",
    },
    ...overrides,
  };
}

describe("visual taxonomy model contract", () => {
  it("accepts only checked-in taxonomy labels", () => {
    expect(buildVisualTaxonomyLabelIndex(["phone-case", "airpods-earbuds-cases"])).toHaveLength(2);
    expect(() => buildVisualTaxonomyLabelIndex(["phone-case", "not-a-rule"])).toThrow(/checked-in taxonomy rule/);
  });

  it("detects a unique exact append-only taxonomy extension", () => {
    const definitions = getCatalogTaxonomyDefinitions();
    const sourceFingerprint = taxonomyTrainingFingerprint(definitions.filter((definition) => definition.id !== "cat-toilet-supplies"));
    expect(findAppendOnlyTaxonomyExtension(sourceFingerprint, definitions)).toEqual(["cat-toilet-supplies"]);
  });

  it("accepts an explicitly verified append-only extension without using its label for vision", async () => {
    const definitions = getCatalogTaxonomyDefinitions();
    const sourceFingerprint = taxonomyTrainingFingerprint(definitions.filter((definition) => definition.id !== "cat-toilet-supplies"));
    await expect(assertVisualTaxonomyModel(validModel({
      taxonomy: {
        version: CATALOG_TAXONOMY_VERSION,
        fingerprint: sourceFingerprint,
        labels: [{ index: 0, ruleId: "phone-case" }],
        compatibility: {
          mode: "append-only",
          sourceFingerprint,
          currentFingerprint: taxonomyTrainingFingerprint(definitions),
          addedRuleIds: ["cat-toilet-supplies"],
          removedRuleIds: [],
          changedRuleIds: [],
        },
      },
    }), {
      taxonomyFingerprint: taxonomyTrainingFingerprint(definitions),
    })).resolves.toBeDefined();
  });

  it("rejects a model that did not purge its raw training corpus", async () => {
    await expect(assertVisualTaxonomyModel(validModel({ retention: { rawDataPurged: false } }), {
      taxonomyFingerprint: "fingerprint",
      requireRawDataPurged: true,
    })).rejects.toThrow(/has not been purged/);
  });

  it("reports incompatible model metadata without throwing", async () => {
    await expect(visualTaxonomyModelCompatibility(validModel({ backend: "cpu" }))).resolves.toMatchObject({
      compatible: false,
    });
  });

  it("rejects purge evidence smaller than the signed corpus", async () => {
    await expect(assertVisualTaxonomyModel(validModel({
      retention: {
        rawDataPurged: true,
        purgedBytes: VISUAL_TAXONOMY_MIN_DATASET_BYTES - 1,
        purgedImageCount: 10,
        purgedAt: "2026-08-29T00:00:00.000Z",
        purgedDatasetRoot: "/tmp/salt-visual-training-corpus",
      },
    }))).rejects.toThrow(/fewer bytes/);
  });

  it("rejects purge claims without a deleted dataset root", async () => {
    await expect(assertVisualTaxonomyModel(validModel({
      retention: {
        rawDataPurged: true,
        purgedBytes: VISUAL_TAXONOMY_MIN_DATASET_BYTES,
        purgedImageCount: 10,
        purgedAt: "2026-08-29T00:00:00.000Z",
      },
    }))).rejects.toThrow(/deleted dataset root/);
  });

  it("rejects precomputed embeddings as a deployable encoder", async () => {
    await expect(assertVisualTaxonomyModel(validModel({
      encoder: {
        fineTuned: true,
        baseCheckpointPath: "/tmp/visual-encoder-base-checkpoint.safetensors",
        baseCheckpointSha256: "c".repeat(64),
        fineTunedCheckpointPath: "/tmp/visual-encoder-finetuned-checkpoint.safetensors",
        fineTunedCheckpointSha256: "d".repeat(64),
        command: ["precomputed-embeddings"],
        trainCommand: ["python3", "finetune-images.py"],
        fineTuning: {
          steps: 100,
          device: "metal",
          datasetManifestSha256: "a".repeat(64),
          reportPath: "output/visual-taxonomy-encoder-finetuned.safetensors.training.json",
          reportSha256: "e".repeat(64),
        },
      },
    }))).rejects.toThrow(/not a deployable visual encoder/);
  });

  it("rejects an adapter without a real fine-tuning command", async () => {
    await expect(assertVisualTaxonomyModel(validModel({
      encoder: { ...validModel().encoder, trainCommand: ["precomputed-embeddings"] },
    }))).rejects.toThrow(/not a fine-tuning command/);
  });

  it("rejects a fine-tuned encoder without a signed training report", async () => {
    await expect(assertVisualTaxonomyModel(validModel({
      encoder: { ...validModel().encoder, fineTuning: undefined },
    }))).rejects.toThrow(/fine-tuning steps/);
  });
});
