import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { assertPurgeReady, validateEmbeddings } from "./train-visual-taxonomy-model.mjs";
import {
  VISUAL_TAXONOMY_MIN_DATASET_BYTES,
  VISUAL_TAXONOMY_MODEL_BACKEND,
  VISUAL_TAXONOMY_MODEL_SCHEMA_VERSION,
  VISUAL_TAXONOMY_MODEL_TYPE,
} from "../src/lib/visual-taxonomy-model.js";
import { CATALOG_TAXONOMY_VERSION, getCatalogTaxonomyDefinitions } from "../src/lib/catalog-taxonomy.js";
import { taxonomyTrainingFingerprint } from "../src/lib/catalog-knowledge-model.js";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function buildModel(weightsDigest, datasetId = "corpus-test") {
  const manifestSha256 = "a".repeat(64);
  return {
    schemaVersion: VISUAL_TAXONOMY_MODEL_SCHEMA_VERSION,
    modelType: VISUAL_TAXONOMY_MODEL_TYPE,
    backend: VISUAL_TAXONOMY_MODEL_BACKEND,
    trained: true,
    taxonomy: {
      version: CATALOG_TAXONOMY_VERSION,
      fingerprint: taxonomyTrainingFingerprint(getCatalogTaxonomyDefinitions()),
    },
    dataset: {
      datasetId,
      bytes: VISUAL_TAXONOMY_MIN_DATASET_BYTES,
      imageCount: 10,
      productCount: 5,
      labelCount: 2,
      manifestSha256,
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
      baseCheckpointPath: "/tmp/base.safetensors",
      baseCheckpointSha256: "b".repeat(64),
      fineTunedCheckpointPath: "/tmp/fine.safetensors",
      fineTunedCheckpointSha256: "c".repeat(64),
      command: ["python3", "encode.py"],
      trainCommand: ["python3", "fine-tune.py"],
      fineTuning: {
        steps: 100,
        device: "metal",
        datasetManifestSha256: manifestSha256,
        reportPath: "/tmp/report.json",
        reportSha256: "d".repeat(64),
      },
    },
    weights: { path: "weights.npz", sha256: weightsDigest.sha256, bytes: weightsDigest.bytes },
    retention: { rawDataPurged: false, purgedBytes: 0, purgedImageCount: 0 },
  };
}

describe("visual taxonomy purge recovery", () => {
  it("verifies a pending model and dataset before allowing purge", async () => {
    const directory = await mkdtemp(join(tmpdir(), "salt-visual-purge-test-"));
    try {
      const modelPath = join(directory, "model.json");
      const weightsPath = join(directory, "weights.npz");
      const weights = Buffer.from("verified weights");
      const weightsDigest = { sha256: sha256(weights), bytes: weights.length };
      const model = buildModel(weightsDigest);
      const modelText = `${JSON.stringify(model)}\n`;
      await writeFile(modelPath, modelText);
      await writeFile(weightsPath, weights);
      const journal = {
        status: "pending",
        datasetId: "corpus-test",
        datasetBytes: model.dataset.bytes,
        imageCount: model.dataset.imageCount,
        productCount: model.dataset.productCount,
        labelCount: model.dataset.labelCount,
        manifestSha256: model.dataset.manifestSha256,
        modelPath,
        weightsPath,
        completionPath: join(directory, "completion.json"),
        modelSha256: sha256(modelText),
        weightsSha256: weightsDigest.sha256,
      };

      await expect(assertPurgeReady({ journal, modelPath, weightsPath })).resolves.toBeTruthy();
      await expect(assertPurgeReady({
        journal: { ...journal, weightsSha256: "f".repeat(64) },
        modelPath,
        weightsPath,
      })).rejects.toThrow(/weight checksum/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("creates a missing nested records directory during embedding validation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "salt-visual-embedding-test-"));
    try {
      const embeddingsPath = join(directory, "encoder.jsonl");
      const outputPath = join(directory, "records", "shard-001.jsonl");
      const entry = {
        image: "image.jpg",
        imageSha256: "e".repeat(64),
        productId: "product-1",
        ruleId: "rule-1",
        split: "train",
        bytes: 1,
      };
      const manifest = {
        entries: [entry],
        imageCount: 1,
      };
      await writeFile(embeddingsPath, `${JSON.stringify({
        imageSha256: entry.imageSha256,
        productId: entry.productId,
        ruleId: entry.ruleId,
        split: entry.split,
        embedding: Array.from({ length: 8 }, (_, index) => index + 1),
      })}\n`);

      await expect(validateEmbeddings({ embeddingsPath, manifest, outputPath })).resolves.toMatchObject({
        records: 1,
        embeddingDimensions: 8,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
