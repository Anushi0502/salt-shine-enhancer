import { stat } from "node:fs/promises";
import { createHash } from "node:crypto";

import { CATALOG_TAXONOMY_VERSION, getCatalogTaxonomyDefinitions } from "./catalog-taxonomy.js";

export const VISUAL_TAXONOMY_MODEL_SCHEMA_VERSION = 1;
export const VISUAL_TAXONOMY_MODEL_TYPE = "mlx-metal-finetuned-visual-taxonomy-classifier";
export const VISUAL_TAXONOMY_MODEL_BACKEND = "mlx-metal";
export const VISUAL_TAXONOMY_MIN_DATASET_BYTES = 50_000_000_000;
export const VISUAL_TAXONOMY_MODEL_VERSION = `${CATALOG_TAXONOMY_VERSION}.visual-finetuned.1`;

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asPositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer.`);
  return number;
}

function asNonNegativeNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be a non-negative number.`);
  return number;
}

export function sha256Text(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

export async function assertVisualTaxonomyModel(model, {
  taxonomyVersion = CATALOG_TAXONOMY_VERSION,
  taxonomyFingerprint = null,
  requireRawDataPurged = false,
  weightsPath = null,
} = {}) {
  const value = asObject(model);
  if (value.schemaVersion !== VISUAL_TAXONOMY_MODEL_SCHEMA_VERSION) {
    throw new Error(`Unsupported visual taxonomy model schema: ${value.schemaVersion || "missing"}.`);
  }
  if (value.modelType !== VISUAL_TAXONOMY_MODEL_TYPE) {
    throw new Error(`Unexpected visual taxonomy model type: ${value.modelType || "missing"}.`);
  }
  if (value.backend !== VISUAL_TAXONOMY_MODEL_BACKEND) {
    throw new Error(`Visual taxonomy model must use the Metal/MLX backend; received ${value.backend || "missing"}.`);
  }
  if (value.trained !== true) throw new Error("Visual taxonomy model is not marked trained.");
  if (taxonomyVersion && value.taxonomy?.version !== taxonomyVersion) {
    throw new Error(`Visual taxonomy model taxonomy version ${value.taxonomy?.version || "missing"} does not match ${taxonomyVersion}.`);
  }
  if (taxonomyFingerprint && value.taxonomy?.fingerprint !== taxonomyFingerprint) {
    throw new Error("Visual taxonomy model taxonomy fingerprint does not match the checked-in taxonomy.");
  }

  const dataset = asObject(value.dataset);
  if (dataset.bytes < VISUAL_TAXONOMY_MIN_DATASET_BYTES) {
    throw new Error(`Visual taxonomy model was trained on ${dataset.bytes || 0} bytes; at least ${VISUAL_TAXONOMY_MIN_DATASET_BYTES} bytes are required.`);
  }
  asPositiveInteger(dataset.imageCount, "Visual taxonomy dataset imageCount");
  asPositiveInteger(dataset.productCount, "Visual taxonomy dataset productCount");
  asPositiveInteger(dataset.labelCount, "Visual taxonomy dataset labelCount");
  if (!dataset.manifestSha256 || !/^[a-f0-9]{64}$/i.test(dataset.manifestSha256)) {
    throw new Error("Visual taxonomy dataset manifest checksum is missing or invalid.");
  }

  const training = asObject(value.training);
  asPositiveInteger(training.records, "Visual taxonomy training records");
  asPositiveInteger(training.embeddingDimensions, "Visual taxonomy embedding dimensions");
  if (training.device !== "metal") throw new Error("Visual taxonomy training was not completed on Metal.");
  if (training.precision !== "float16") throw new Error("Visual taxonomy training must use float16 weights.");
  if (!training.metrics || typeof training.metrics !== "object") throw new Error("Visual taxonomy training metrics are missing.");
  if (training.metrics.qualityGate?.passed !== true) throw new Error("Visual taxonomy quality gate was not passed by the trainer.");
  asNonNegativeNumber(training.metrics.test?.coverage, "Visual taxonomy test coverage");
  asNonNegativeNumber(training.metrics.test?.macroF1, "Visual taxonomy test macroF1");
  asNonNegativeNumber(training.metrics.test?.accuracy, "Visual taxonomy test accuracy");
  const encoder = asObject(value.encoder);
  if (encoder.fineTuned !== true) throw new Error("Visual taxonomy model encoder is not marked fine-tuned.");
  for (const [key, label] of [["command", "inference"], ["trainCommand", "fine-tuning"]]) {
    if (!Array.isArray(encoder[key]) || !encoder[key].length || encoder[key].some((part) => typeof part !== "string" || !part.trim())) {
      throw new Error(`Visual taxonomy model must declare a real ${label} encoder command.`);
    }
  }
  if (encoder.command[0] === "precomputed-embeddings") {
    throw new Error("Precomputed embeddings are not a deployable visual encoder; provide a real Metal image encoder command.");
  }
  if (encoder.trainCommand[0] === "precomputed-embeddings") {
    throw new Error("Precomputed embeddings are not a fine-tuning command; provide a real Metal image fine-tuner.");
  }
  if (!encoder.baseCheckpointPath || !/^[a-f0-9]{64}$/i.test(String(encoder.baseCheckpointSha256 || ""))) {
    throw new Error("Visual taxonomy model base encoder checkpoint reference is missing or invalid.");
  }
  if (!encoder.fineTunedCheckpointPath || !/^[a-f0-9]{64}$/i.test(String(encoder.fineTunedCheckpointSha256 || ""))) {
    throw new Error("Visual taxonomy model fine-tuned encoder checkpoint reference is missing or invalid.");
  }
  const fineTuning = asObject(encoder.fineTuning);
  asPositiveInteger(fineTuning.steps, "Visual taxonomy encoder fine-tuning steps");
  if (fineTuning.device !== "metal") throw new Error("Visual taxonomy encoder fine-tuning was not completed on Metal.");
  if (fineTuning.datasetManifestSha256 !== dataset.manifestSha256) {
    throw new Error("Visual taxonomy encoder fine-tuning report does not match the signed dataset manifest.");
  }
  if (!fineTuning.reportPath || !/^[a-f0-9]{64}$/i.test(String(fineTuning.reportSha256 || ""))) {
    throw new Error("Visual taxonomy encoder fine-tuning report reference is missing or invalid.");
  }
  if (!value.weights?.path || !value.weights?.sha256) throw new Error("Visual taxonomy weights reference is missing.");
  if (!/^[a-f0-9]{64}$/i.test(value.weights.sha256)) throw new Error("Visual taxonomy weights checksum is invalid.");

  const retention = asObject(value.retention);
  if (retention.rawDataPurged !== true && requireRawDataPurged) {
    throw new Error("Visual taxonomy model raw training data has not been purged.");
  }
  if (retention.rawDataPurged === true && !retention.purgedAt) {
    throw new Error("Visual taxonomy model claims raw-data purge without a purge timestamp.");
  }
  if (retention.rawDataPurged === true) {
    asPositiveInteger(retention.purgedBytes, "Visual taxonomy purged bytes");
    asPositiveInteger(retention.purgedImageCount, "Visual taxonomy purged imageCount");
    if (!String(retention.purgedDatasetRoot || "").trim()) {
      throw new Error("Visual taxonomy purge evidence does not record the deleted dataset root.");
    }
    if (Number(retention.purgedBytes) < Number(dataset.bytes)) {
      throw new Error("Visual taxonomy purge evidence covers fewer bytes than the signed training corpus.");
    }
    if (Number(retention.purgedImageCount) < Number(dataset.imageCount)) {
      throw new Error("Visual taxonomy purge evidence covers fewer images than the signed training corpus.");
    }
  }
  if (weightsPath) {
    const weightsStat = await stat(weightsPath);
    if (!weightsStat.isFile() || weightsStat.size <= 0) throw new Error(`Visual taxonomy weights are not a non-empty file: ${weightsPath}`);
  }
  return model;
}

export async function visualTaxonomyModelCompatibility(model, options = {}) {
  try {
    await assertVisualTaxonomyModel(model, options);
    return { compatible: true, reasons: [] };
  } catch (error) {
    return { compatible: false, reasons: [error.message] };
  }
}

export function buildVisualTaxonomyLabelIndex(ruleIds, definitions = getCatalogTaxonomyDefinitions()) {
  const allowed = new Set(definitions.map((definition) => definition.id));
  const uniqueRuleIds = [...new Set((Array.isArray(ruleIds) ? ruleIds : []).map(String))].sort();
  for (const ruleId of uniqueRuleIds) {
    if (!allowed.has(ruleId)) throw new Error(`Visual training label is not a checked-in taxonomy rule: ${ruleId}`);
  }
  if (uniqueRuleIds.length < 2) throw new Error("Visual taxonomy training requires at least two taxonomy labels.");
  return uniqueRuleIds.map((ruleId, index) => ({ index, ruleId }));
}
