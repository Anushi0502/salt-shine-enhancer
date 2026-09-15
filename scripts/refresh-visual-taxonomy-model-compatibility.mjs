#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  assertVisualTaxonomyModel,
  findAppendOnlyTaxonomyExtension,
} from "../src/lib/visual-taxonomy-model.js";
import { CATALOG_TAXONOMY_VERSION, getCatalogTaxonomyDefinitions } from "../src/lib/catalog-taxonomy.js";
import { taxonomyTrainingFingerprint } from "../src/lib/catalog-knowledge-model.js";

const rootDir = resolve(import.meta.dirname, "..");
const modelPath = resolve(process.env.SALT_VISUAL_TAXONOMY_MODEL_PATH || resolve(rootDir, "output", "visual-taxonomy-model.json"));
const completionPath = resolve(process.env.SALT_VISUAL_TAXONOMY_TRAINING_COMPLETION_PATH || resolve(rootDir, "output", "visual-taxonomy-training-completion.json"));
const weightsPath = resolve(rootDir, "output", "visual-taxonomy-model-weights.npz");

async function hashFile(path) {
  const hash = createHash("sha256");
  const bytes = await readFile(path);
  hash.update(bytes);
  return { sha256: hash.digest("hex"), bytes: bytes.length };
}

async function writeJsonAtomic(path, value) {
  const temporaryPath = `${path}.tmp-compat-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

async function main() {
  const model = JSON.parse(await readFile(modelPath, "utf8"));
  const definitions = getCatalogTaxonomyDefinitions();
  const currentFingerprint = taxonomyTrainingFingerprint(definitions);
  const sourceFingerprint = String(model?.taxonomy?.fingerprint || "");
  if (!sourceFingerprint) throw new Error("Visual taxonomy model has no source taxonomy fingerprint.");
  if (sourceFingerprint === currentFingerprint) {
    process.stdout.write("Visual taxonomy model fingerprint is already current; no compatibility refresh was needed.\n");
    return;
  }

  const addedRuleIds = findAppendOnlyTaxonomyExtension(sourceFingerprint, definitions);
  if (addedRuleIds.length !== 1) {
    throw new Error(`Taxonomy mismatch is not a unique append-only extension; exact candidate rules: ${addedRuleIds.join(", ") || "none"}. Retraining is required.`);
  }
  const modelLabelIds = new Set((Array.isArray(model?.taxonomy?.labels) ? model.taxonomy.labels : []).map((entry) => String(entry?.ruleId || "")));
  if (addedRuleIds.some((ruleId) => modelLabelIds.has(ruleId))) {
    throw new Error(`Append-only rule ${addedRuleIds.join(", ")} is already a model label; retraining is required.`);
  }

  const compatibility = {
    mode: "append-only",
    sourceFingerprint,
    currentFingerprint,
    addedRuleIds,
    removedRuleIds: [],
    changedRuleIds: [],
    evidence: "Current checked-in taxonomy with addedRuleIds removed reproduces the model source fingerprint exactly; added rules are outside the trained visual label index and remain deterministic-only.",
    verifiedAt: new Date().toISOString(),
  };
  const nextModel = {
    ...model,
    taxonomy: {
      ...model.taxonomy,
      compatibility,
    },
  };
  await writeJsonAtomic(modelPath, nextModel);
  await assertVisualTaxonomyModel(nextModel, {
    taxonomyVersion: CATALOG_TAXONOMY_VERSION,
    taxonomyFingerprint: currentFingerprint,
    requireRawDataPurged: true,
    weightsPath,
  });

  const completion = JSON.parse(await readFile(completionPath, "utf8"));
  const modelDigest = await hashFile(modelPath);
  await writeJsonAtomic(completionPath, {
    ...completion,
    modelSha256: modelDigest.sha256,
    taxonomyCompatibility: compatibility,
    compatibilityRefreshedAt: new Date().toISOString(),
  });
  process.stdout.write(`Registered exact append-only taxonomy compatibility for ${addedRuleIds.join(", ")}; source=${sourceFingerprint}, current=${currentFingerprint}.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

