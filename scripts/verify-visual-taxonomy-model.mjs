#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import {
  assertVisualTaxonomyModel,
  VISUAL_TAXONOMY_MODEL_VERSION,
} from "../src/lib/visual-taxonomy-model.js";
import { CATALOG_TAXONOMY_VERSION, getCatalogTaxonomyDefinitions } from "../src/lib/catalog-taxonomy.js";
import { taxonomyTrainingFingerprint } from "../src/lib/catalog-knowledge-model.js";

const rootDir = resolve(import.meta.dirname, "..");
const modelPath = resolve(process.env.SALT_VISUAL_TAXONOMY_MODEL_PATH || resolve(rootDir, "output", "visual-taxonomy-model.json"));
const completionPath = resolve(process.env.SALT_VISUAL_TAXONOMY_TRAINING_COMPLETION_PATH || resolve(rootDir, "output", "visual-taxonomy-training-completion.json"));
const requireModel = process.env.SALT_REQUIRE_VISUAL_TAXONOMY_MODEL === "1";
const requirePurged = process.env.SALT_REQUIRE_VISUAL_TAXONOMY_MODEL_PURGED !== "0";

async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function assertPurgedDatasetAbsent(model) {
  const datasetRoot = String(model?.retention?.purgedDatasetRoot || "").trim();
  if (!datasetRoot) {
    throw new Error("Visual taxonomy model does not record the purged raw-dataset path.");
  }
  const datasetRoots = datasetRoot.startsWith("sharded:")
    ? datasetRoot.slice("sharded:".length).split(",").map((value) => value.trim()).filter(Boolean)
    : [datasetRoot];
  for (const root of datasetRoots) {
    try {
      await access(resolve(root));
      throw new Error(`Visual taxonomy raw training corpus still exists after purge: ${resolve(root)}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

async function main() {
  let model;
  try {
    model = JSON.parse(await readFile(modelPath, "utf8"));
  } catch (error) {
    if (!requireModel && error?.code === "ENOENT") {
      process.stdout.write("No trained visual taxonomy model is installed; the release will use its existing deterministic and supervised fallback gates.\n");
      return;
    }
    throw new Error(`Visual taxonomy model is required but unreadable at ${modelPath}: ${error.message}`);
  }

  if (!model?.weights?.path) throw new Error("Visual taxonomy model has no weights path.");
  if (!model?.encoder?.baseCheckpointPath || !model?.encoder?.fineTunedCheckpointPath) {
    throw new Error("Visual taxonomy model has incomplete encoder checkpoint references.");
  }
  const weightsPath = resolve(rootDir, model.weights.path);
  const baseEncoderCheckpointPath = resolve(model.encoder.baseCheckpointPath);
  const fineTunedEncoderCheckpointPath = resolve(model.encoder.fineTunedCheckpointPath);
  await assertVisualTaxonomyModel(model, {
    taxonomyVersion: CATALOG_TAXONOMY_VERSION,
    taxonomyFingerprint: taxonomyTrainingFingerprint(getCatalogTaxonomyDefinitions()),
    requireRawDataPurged: requirePurged,
    weightsPath,
  });
  const baseEncoderCheckpointStat = await stat(baseEncoderCheckpointPath);
  if (!baseEncoderCheckpointStat.isFile() || baseEncoderCheckpointStat.size <= 0) {
    throw new Error(`Visual taxonomy base encoder checkpoint is not a non-empty file: ${baseEncoderCheckpointPath}`);
  }
  const fineTunedEncoderCheckpointStat = await stat(fineTunedEncoderCheckpointPath);
  if (!fineTunedEncoderCheckpointStat.isFile() || fineTunedEncoderCheckpointStat.size <= 0) {
    throw new Error(`Visual taxonomy fine-tuned encoder checkpoint is not a non-empty file: ${fineTunedEncoderCheckpointPath}`);
  }
  const [baseEncoderCheckpointSha256, fineTunedEncoderCheckpointSha256] = await Promise.all([
    hashFile(baseEncoderCheckpointPath),
    hashFile(fineTunedEncoderCheckpointPath),
  ]);
  if (baseEncoderCheckpointSha256 !== model.encoder.baseCheckpointSha256) {
    throw new Error("Visual taxonomy base encoder checkpoint checksum does not match the installed model metadata.");
  }
  if (fineTunedEncoderCheckpointSha256 !== model.encoder.fineTunedCheckpointSha256) {
    throw new Error("Visual taxonomy fine-tuned encoder checkpoint checksum does not match the installed model metadata.");
  }
  const fineTuningReportPath = resolve(rootDir, model.encoder.fineTuning.reportPath);
  const fineTuningReportStat = await stat(fineTuningReportPath);
  if (!fineTuningReportStat.isFile() || fineTuningReportStat.size <= 0) {
    throw new Error(`Visual taxonomy fine-tuning report is not a non-empty file: ${fineTuningReportPath}`);
  }
  const fineTuningReportSha256 = await hashFile(fineTuningReportPath);
  if (fineTuningReportSha256 !== model.encoder.fineTuning.reportSha256) {
    throw new Error("Visual taxonomy fine-tuning report checksum does not match the installed model metadata.");
  }
  const fineTuningReport = JSON.parse(await readFile(fineTuningReportPath, "utf8"));
  if (fineTuningReport?.fineTuned !== true || fineTuningReport?.device !== "metal") {
    throw new Error("Visual taxonomy fine-tuning report does not prove a Metal fine-tuning run.");
  }
  if (fineTuningReport?.datasetManifestSha256 !== model.dataset.manifestSha256) {
    throw new Error("Visual taxonomy fine-tuning report does not match the installed dataset manifest.");
  }
  if (fineTuningReport?.baseCheckpointSha256 !== model.encoder.baseCheckpointSha256 || fineTuningReport?.outputCheckpointSha256 !== model.encoder.fineTunedCheckpointSha256) {
    throw new Error("Visual taxonomy fine-tuning report checkpoint evidence is stale.");
  }
  await access(completionPath);
  const completion = JSON.parse(await readFile(completionPath, "utf8"));
  if (completion.status !== "verified") throw new Error(`Visual taxonomy completion record is not verified: ${completion.status || "missing"}.`);
  if (completion.rawDataPurged !== model.retention.rawDataPurged) throw new Error("Visual taxonomy completion record disagrees with model raw-data retention state.");
  if (completion.rawDataPurged !== true && requirePurged) throw new Error("Visual taxonomy completion record does not prove raw-data purge.");
  if (requirePurged) {
    if (completion.purgedDatasetRoot !== model.retention.purgedDatasetRoot) {
      throw new Error("Visual taxonomy completion record has stale purged-dataset path evidence.");
    }
    await assertPurgedDatasetAbsent(model);
  }
  if (Number(completion.purgedBytes) !== Number(model.retention.purgedBytes)) throw new Error("Visual taxonomy completion record has stale purged-byte evidence.");
  if (Number(completion.purgedImageCount) !== Number(model.retention.purgedImageCount)) throw new Error("Visual taxonomy completion record has stale purged-image evidence.");
  const modelSha256 = await hashFile(modelPath);
  const weightsStat = await stat(weightsPath);
  if (completion.modelSha256 !== modelSha256) throw new Error("Visual taxonomy completion record has a stale model checksum.");
  if (completion.weightsSha256 !== model.weights.sha256) throw new Error("Visual taxonomy completion record has a stale weights checksum.");
  if (weightsStat.size !== Number(model.weights.bytes)) throw new Error("Visual taxonomy weights size changed after training.");
  process.stdout.write(`${JSON.stringify({
    status: "verified",
    modelVersion: model.modelVersion || VISUAL_TAXONOMY_MODEL_VERSION,
    backend: model.backend,
    baseEncoderCheckpointPath,
    baseEncoderCheckpointBytes: baseEncoderCheckpointStat.size,
    fineTunedEncoderCheckpointPath,
    fineTunedEncoderCheckpointBytes: fineTunedEncoderCheckpointStat.size,
    fineTuningReportPath,
    fineTuningSteps: Number(fineTuningReport.steps),
    taxonomyVersion: model.taxonomy.version,
    labels: model.dataset.labelCount,
    records: model.training.records,
    datasetBytes: model.dataset.bytes,
    rawDataPurged: model.retention.rawDataPurged,
    purgedDatasetRoot: model.retention.purgedDatasetRoot || null,
    metrics: model.training.metrics,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
