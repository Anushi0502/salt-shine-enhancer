#!/usr/bin/env node

import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { getCatalogTaxonomyDefinitions } from "../src/lib/catalog-taxonomy.js";
import { readFileWithRetry } from "./reliable-file-read.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const outputDir = resolve(rootDir, "output");
const defaultCatalogPath = resolve(outputDir, "release-catalog-source.json");
const defaultKnowledgePath = resolve(outputDir, "product-knowledge.json");
const defaultModelPath = resolve(outputDir, "visual-taxonomy-model.json");
const defaultPlanPath = resolve(outputDir, "visual-taxonomy-shard-plan.json");
const defaultTrustedLabelPath = resolve(outputDir, "visual-taxonomy-reviewed-source-manifest.jsonl");
const outputPath = resolve(process.env.SALT_VISUAL_TRAINING_READINESS_PATH || resolve(outputDir, "visual-taxonomy-training-readiness.json"));
const targetBytes = 50_000_000_000;
const maxShardBytes = 25_000_000_000;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function productId(product) {
  return String(product?.id || product?.legacyResourceId || product?.productId || product?.handle || "").trim();
}

function imageUrls(product) {
  return [...new Set(asArray(product?.images).map((image) => {
    if (typeof image === "string") return image;
    return image?.src || image?.url || image?.image?.url || "";
  }).filter((url) => /^https?:\/\//i.test(url)))];
}

async function readJson(path, fallback = null) {
  const attempts = Math.max(2, Math.min(10, Number(process.env.SALT_FILE_READ_ATTEMPTS || 8)));
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const raw = String(await readFileWithRetry(path, "utf8")).trim();
      if (!raw) {
        const error = new Error(`empty JSON artifact: ${path}`);
        error.code = "EAGAIN";
        throw error;
      }
      return JSON.parse(raw);
    } catch (error) {
      if (error?.code === "ENOENT") return fallback;
      lastError = error;
      if (attempt === attempts - 1) throw error;
      await sleep(Math.min(4_000, 250 * 2 ** attempt));
    }
  }
  throw lastError;
}

async function fileInfo(path) {
  try {
    const value = await stat(path);
    return { exists: true, bytes: value.size };
  } catch (error) {
    if (error?.code === "ENOENT") return { exists: false, bytes: 0 };
    throw error;
  }
}

function summarizeKnowledge(knowledge, allowedRules) {
  const products = asArray(knowledge?.products);
  const counts = new Map();
  let deterministicResolved = 0;
  let reviewRequired = 0;
  for (const entry of products) {
    const ruleId = String(entry?.classificationRule || "").trim();
    if (entry?.reviewRequired === true || !ruleId || !allowedRules.has(ruleId)) {
      reviewRequired += 1;
      continue;
    }
    deterministicResolved += 1;
    counts.set(ruleId, (counts.get(ruleId) || 0) + 1);
  }
  return {
    records: products.length,
    deterministicResolved,
    reviewRequired,
    distinctRules: counts.size,
    labelCounts: Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right))),
  };
}

async function inspectPlan(planPath) {
  const info = await fileInfo(planPath);
  if (!info.exists) return { exists: false, valid: false, reason: "no 50 GB shard plan exists" };
  const plan = await readJson(planPath);
  const shards = asArray(plan?.shards);
  const totalBytes = shards.reduce((sum, shard) => sum + Number(shard?.bytes || 0), 0);
  const valid = plan?.kind === "salt-visual-taxonomy-shard-plan" &&
    plan?.version === 1 &&
    Number(plan?.targetBytes) >= targetBytes &&
    Number(plan?.maxShardBytes) <= maxShardBytes &&
    shards.length >= 2 &&
    totalBytes >= targetBytes &&
    shards.every((shard) => Number(shard?.bytes) > 0 && Number(shard?.bytes) <= maxShardBytes);
  return {
    exists: true,
    valid,
    path: planPath,
    targetBytes: Number(plan?.targetBytes || 0),
    maxShardBytes: Number(plan?.maxShardBytes || 0),
    shardCount: shards.length,
    plannedBytes: totalBytes,
    reason: valid ? "signed 25 GB-at-a-time plan is present" : "shard plan is incomplete or exceeds the 25 GB-at-a-time contract",
  };
}

async function auditTrainingInputs({
  catalogPath = resolve(process.env.SALT_VISUAL_TRAINING_CATALOG || defaultCatalogPath),
  knowledgePath = resolve(process.env.SALT_VISUAL_TRAINING_KNOWLEDGE || defaultKnowledgePath),
  modelPath = resolve(process.env.SALT_VISUAL_TAXONOMY_MODEL_PATH || defaultModelPath),
  planPath = resolve(process.env.SALT_VISUAL_TRAINING_SHARD_PLAN || defaultPlanPath),
} = {}) {
  const [catalog, knowledge, modelInfo, plan] = await Promise.all([
    readJson(catalogPath, {}),
    readJson(knowledgePath, {}),
    fileInfo(modelPath),
    inspectPlan(planPath),
  ]);
  const products = asArray(catalog?.products || catalog);
  const urls = new Set(products.flatMap(imageUrls));
  const allowedRules = new Set(getCatalogTaxonomyDefinitions().map((definition) => definition.id));
  const labels = summarizeKnowledge(knowledge, allowedRules);
  const configuredTrustedLabelManifest = String(process.env.SALT_VISUAL_TRAINING_LABELS_MANIFEST || "").trim();
  const defaultTrustedLabelInfo = await fileInfo(defaultTrustedLabelPath);
  const trustedLabelManifest = configuredTrustedLabelManifest || (defaultTrustedLabelInfo.exists ? defaultTrustedLabelPath : "");
  const trustedLabels = trustedLabelManifest ? await fileInfo(resolve(trustedLabelManifest)) : { exists: false, bytes: 0 };
  const reasons = [];
  if (!trustedLabels.exists) reasons.push("no trusted human-reviewed labels manifest is configured");
  if (!plan.valid) reasons.push(plan.reason);
  if (!modelInfo.exists) reasons.push("no fine-tuned Metal visual taxonomy checkpoint is installed");
  const result = {
    kind: "salt-visual-taxonomy-training-readiness",
    version: 1,
    generatedAt: new Date().toISOString(),
    status: reasons.length ? "blocked" : "ready",
    reasons,
    target: {
      totalBytes: targetBytes,
      maxShardBytes,
      rawDataRetention: "purge each verified shard; retain only checkpoints and audit manifests",
    },
    catalog: {
      path: catalogPath,
      productCount: products.length,
      uniqueImageUrls: urls.size,
      note: "URL count is not a byte-size claim; exact bytes and checksums require the staged corpus pass.",
    },
    deterministicLabelEvidence: labels,
    trustedLabels: {
      configured: Boolean(trustedLabelManifest),
      path: trustedLabelManifest || null,
      exists: trustedLabels.exists,
      bytes: trustedLabels.bytes,
      policy: "deterministic catalog labels are not treated as human-reviewed training labels",
    },
    shardPlan: plan,
    model: { path: modelPath, exists: modelInfo.exists, bytes: modelInfo.bytes },
    releaseSafety: {
      weakLabelsMayOnlyBeCandidateEvidence: true,
      automatedVisualClassificationMayNotBypassDeterministicOrReviewGates: true,
    },
  };
  await mkdir(outputDir, { recursive: true });
  const temporaryPath = `${outputPath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await rename(temporaryPath, outputPath);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  auditTrainingInputs().then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

export { auditTrainingInputs, inspectPlan, summarizeKnowledge };
