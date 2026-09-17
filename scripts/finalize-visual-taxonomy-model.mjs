#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  assertVisualTaxonomyModel,
  isFrozenFinalVisualTaxonomyModel,
  visualTaxonomyModelFinalizationSeal,
  VISUAL_TAXONOMY_MODEL_LIFECYCLE,
  VISUAL_TAXONOMY_MODEL_RETRAIN_POLICY,
} from "../src/lib/visual-taxonomy-model.js";
import { CATALOG_TAXONOMY_VERSION, getCatalogTaxonomyDefinitions } from "../src/lib/catalog-taxonomy.js";
import { taxonomyTrainingFingerprint } from "../src/lib/catalog-knowledge-model.js";

const rootDir = resolve(import.meta.dirname, "..");
const outputDir = resolve(rootDir, "output");
const modelPath = resolve(process.env.SALT_VISUAL_TAXONOMY_MODEL_PATH || resolve(outputDir, "visual-taxonomy-model.json"));
const completionPath = resolve(process.env.SALT_VISUAL_TAXONOMY_TRAINING_COMPLETION_PATH || resolve(outputDir, "visual-taxonomy-training-completion.json"));

function sha256File(path) {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolvePromise(hash.digest("hex")));
  });
}

async function writeJsonAtomic(path, value) {
  const temporaryPath = `${path}.tmp-finalize-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

function normalizedRuleIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((entry) => String(entry || "").trim()).filter(Boolean))].sort();
}

async function main() {
  const model = JSON.parse(await readFile(modelPath, "utf8"));
  const definitions = getCatalogTaxonomyDefinitions();
  const currentFingerprint = taxonomyTrainingFingerprint(definitions);
  const sourceFingerprint = String(model?.taxonomy?.fingerprint || "").trim();
  if (!sourceFingerprint) throw new Error("Visual taxonomy model has no source taxonomy fingerprint.");

  const weightsPath = resolve(rootDir, String(model?.weights?.path || ""));
  await assertVisualTaxonomyModel(model, {
    taxonomyVersion: CATALOG_TAXONOMY_VERSION,
    taxonomyFingerprint: sourceFingerprint,
    requireRawDataPurged: true,
    weightsPath,
  });

  const labelIds = normalizedRuleIds((model?.taxonomy?.labels || []).map((entry) => entry?.ruleId));
  if (labelIds.length < 2) throw new Error("Visual taxonomy model cannot be finalized without an immutable label index.");
  const definitionIds = new Set(definitions.map((definition) => definition.id));
  const missingLabelIds = labelIds.filter((ruleId) => !definitionIds.has(ruleId));
  if (missingLabelIds.length) {
    throw new Error(`Visual taxonomy model labels are no longer checked-in taxonomy rules: ${missingLabelIds.join(", ")}.`);
  }

  if (isFrozenFinalVisualTaxonomyModel(model)) {
    process.stdout.write(`Visual taxonomy model is already sealed as ${VISUAL_TAXONOMY_MODEL_LIFECYCLE}; no rewrite was needed.\n`);
    return;
  }

  const finalizedAt = new Date().toISOString();
  const compatibility = {
    mode: VISUAL_TAXONOMY_MODEL_LIFECYCLE,
    sourceFingerprint,
    finalizedAgainstFingerprint: currentFingerprint,
    visualLabelRuleIds: labelIds,
    outsideVisualLabelIndexRuleIds: definitions
      .map((definition) => definition.id)
      .filter((ruleId) => !labelIds.includes(ruleId))
      .sort(),
    evidence: "Explicit operator finalization after artifact, encoder, checksum, quality, and raw-data purge verification. The visual label index and encoder weights are immutable; future collection-routing rules use deterministic fallback and do not trigger automatic visual retraining.",
    verifiedAt: finalizedAt,
  };
  const nextModel = {
    ...model,
    taxonomy: {
      ...model.taxonomy,
      compatibility,
    },
    lifecycle: {
      mode: VISUAL_TAXONOMY_MODEL_LIFECYCLE,
      retrainPolicy: VISUAL_TAXONOMY_MODEL_RETRAIN_POLICY,
      finalizedAt,
      evidence: "Finalized once by the release operator. Normal releases reuse this artifact; retraining is manual-only and requires explicit --force-retrain / SALT_VISUAL_FORCE_RETRAIN=1.",
    },
  };
  nextModel.lifecycle.modelSealSha256 = visualTaxonomyModelFinalizationSeal(nextModel);
  await writeJsonAtomic(modelPath, nextModel);

  const completion = JSON.parse(await readFile(completionPath, "utf8"));
  const modelSha256 = await sha256File(modelPath);
  await writeJsonAtomic(completionPath, {
    ...completion,
    modelSha256,
    taxonomyCompatibility: compatibility,
    modelLifecycle: nextModel.lifecycle,
    finalizedAt,
  });
  const modelStat = await stat(modelPath);
  process.stdout.write(`${JSON.stringify({
    status: "finalized",
    lifecycle: VISUAL_TAXONOMY_MODEL_LIFECYCLE,
    retrainPolicy: VISUAL_TAXONOMY_MODEL_RETRAIN_POLICY,
    modelPath,
    modelBytes: modelStat.size,
    modelSha256,
    sourceFingerprint,
    finalizedAgainstFingerprint: currentFingerprint,
    visualLabels: labelIds.length,
    deterministicFallbackRules: compatibility.outsideVisualLabelIndexRuleIds.length,
    candidateOnly: nextModel.candidateOnly === true,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
