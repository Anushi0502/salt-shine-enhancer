#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  access,
  copyFile,
  lstat,
  mkdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  assertVisualTaxonomyModel,
  buildVisualTaxonomyLabelIndex,
  sha256Text,
  VISUAL_TAXONOMY_MIN_DATASET_BYTES,
  VISUAL_TAXONOMY_MODEL_BACKEND,
  VISUAL_TAXONOMY_MODEL_SCHEMA_VERSION,
  VISUAL_TAXONOMY_MODEL_TYPE,
  VISUAL_TAXONOMY_MODEL_VERSION,
} from "../src/lib/visual-taxonomy-model.js";
import { CATALOG_TAXONOMY_VERSION, getCatalogTaxonomyDefinitions } from "../src/lib/catalog-taxonomy.js";
import { taxonomyTrainingFingerprint } from "../src/lib/catalog-knowledge-model.js";
import { isTransientFileReadError, readFileWithRetry } from "./reliable-file-read.mjs";
import {
  buildTrainingManifest,
  runEncoder,
  runEncoderFineTuning,
  runMlxTraining,
  validateEmbeddings,
} from "./train-visual-taxonomy-model.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const outputDir = resolve(rootDir, "output");
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const execFileAsync = promisify(execFile);
const corpusMarkerName = ".salt-visual-corpus.json";
const minimumShardBytes = 1_000_000_000;
const maximumShardBytes = 25_000_000_000;
const minimumDatasetBytes = VISUAL_TAXONOMY_MIN_DATASET_BYTES;
const defaultModelPath = resolve(outputDir, "visual-taxonomy-model.json");
const defaultWeightsPath = resolve(outputDir, "visual-taxonomy-model-weights.npz");
const defaultCompletionPath = resolve(outputDir, "visual-taxonomy-training-completion.json");
const defaultStatePath = resolve(outputDir, "visual-taxonomy-shard-training-state.json");

function parseArgs(argv) {
  const args = {
    shardPlan: process.env.SALT_VISUAL_TRAINING_SHARD_PLAN || "",
    workRoot: process.env.SALT_VISUAL_TRAINING_WORK_ROOT || "",
    baseCheckpoint: process.env.SALT_VISUAL_BASE_CHECKPOINT || "",
    encoderCommandJson: process.env.SALT_VISUAL_ENCODER_COMMAND_JSON || "",
    encoderTrainCommandJson: process.env.SALT_VISUAL_ENCODER_TRAIN_COMMAND_JSON || "",
    fineTunedCheckpointOutput: process.env.SALT_VISUAL_FINE_TUNED_ENCODER_CHECKPOINT || resolve(outputDir, "visual-taxonomy-encoder-finetuned.safetensors"),
    output: defaultModelPath,
    weightsOutput: defaultWeightsPath,
    completionOutput: defaultCompletionPath,
    stateOutput: process.env.SALT_VISUAL_TRAINING_SHARD_STATE || defaultStatePath,
  };
  const flags = new Map([
    ["--shard-plan", "shardPlan"],
    ["--work-root", "workRoot"],
    ["--base-checkpoint", "baseCheckpoint"],
    ["--encoder-command-json", "encoderCommandJson"],
    ["--encoder-train-command-json", "encoderTrainCommandJson"],
    ["--fine-tuned-checkpoint-output", "fineTunedCheckpointOutput"],
    ["--output", "output"],
    ["--weights-output", "weightsOutput"],
    ["--completion-output", "completionOutput"],
    ["--state-output", "stateOutput"],
  ]);
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const key = flags.get(token);
    if (!key) throw new Error(`Unknown argument: ${token}`);
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${token}.`);
    args[key] = value;
    index += 1;
  }
  for (const [flag, value] of [
    ["--shard-plan", args.shardPlan],
    ["--base-checkpoint", args.baseCheckpoint],
    ["--encoder-command-json", args.encoderCommandJson],
    ["--encoder-train-command-json", args.encoderTrainCommandJson],
  ]) {
    if (!String(value || "").trim()) throw new Error(`${flag} is required.`);
  }
  if (process.env.SALT_VISUAL_TRAINING_RETAIN_RAW === "1") {
    throw new Error("Raw visual training data cannot be retained after sharded training.");
  }
  return args;
}

function isInside(child, parent) {
  const value = resolve(child);
  const boundary = resolve(parent);
  return value === boundary || value.startsWith(`${boundary}${sep}`);
}

function assertExternalPath(value, label) {
  const path = resolve(value);
  if (path === rootDir || isInside(path, rootDir)) {
    throw new Error(`${label} must be outside the SALT project so a 25 GB shard cannot fill the repository.`);
  }
  return path;
}

async function hashFile(path) {
  const digest = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    digest.update(chunk);
    bytes += chunk.length;
  }
  return { sha256: digest.digest("hex"), bytes };
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  let lastError;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const temporary = `${path}.tmp-${process.pid}-${Date.now()}-${attempt}`;
    try {
      await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
      await rename(temporary, path);
      return;
    } catch (error) {
      lastError = error;
      if (!isTransientFileReadError(error) || attempt === 15) throw error;
      await rm(temporary, { force: true }).catch(() => {});
      await sleep(Math.min(2_000, 100 * 2 ** attempt));
    }
  }
  throw lastError;
}

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFileWithRetry(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonLines(path, entries) {
  await mkdir(dirname(path), { recursive: true });
  let lastError;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const temporary = `${path}.tmp-${process.pid}-${Date.now()}-${attempt}`;
    try {
      await writeFile(temporary, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
      await rename(temporary, path);
      return;
    } catch (error) {
      lastError = error;
      if (!isTransientFileReadError(error) || attempt === 15) throw error;
      await rm(temporary, { force: true }).catch(() => {});
      await sleep(Math.min(2_000, 100 * 2 ** attempt));
    }
  }
  throw lastError;
}

async function countLines(path) {
  let count = 0;
  for await (const chunk of createReadStream(path)) {
    for (const byte of chunk) if (byte === 10) count += 1;
  }
  return count;
}

async function appendFileStream(source, destinationHandle) {
  for await (const chunk of createReadStream(source)) {
    if (!destinationHandle.write(chunk)) await once(destinationHandle, "drain");
  }
}

export function validateShardPlan(plan) {
  if (!plan || plan.kind !== "salt-visual-taxonomy-shard-plan" || plan.version !== 1) {
    throw new Error("Visual shard plan has an unsupported kind or version.");
  }
  const targetBytes = Number(plan.targetBytes);
  const maxShardBytes = Number(plan.maxShardBytes);
  if (!Number.isInteger(targetBytes) || targetBytes < minimumDatasetBytes) {
    throw new Error(`Visual shard plan must target at least ${minimumDatasetBytes} bytes.`);
  }
  if (!Number.isInteger(maxShardBytes) || maxShardBytes < minimumShardBytes || maxShardBytes > maximumShardBytes) {
    throw new Error(`Visual shard plan maxShardBytes must be between ${minimumShardBytes} and ${maximumShardBytes} bytes (25 GB maximum).`);
  }
  if (!Array.isArray(plan.shards) || plan.shards.length < 2) {
    throw new Error("A 50 GB visual corpus must be represented by at least two sequential shards.");
  }
  let totalBytes = 0;
  let totalImages = 0;
  for (const [index, shard] of plan.shards.entries()) {
    const bytes = Number(shard?.bytes);
    const imageCount = Number(shard?.imageCount);
    if (!Number.isInteger(bytes) || bytes <= 0 || bytes > maxShardBytes) {
      throw new Error(`Visual shard ${index + 1} exceeds the configured 25 GB-at-a-time limit.`);
    }
    if (!Number.isInteger(imageCount) || imageCount <= 0) throw new Error(`Visual shard ${index + 1} has no image count.`);
    for (const name of ["sourceManifest", "datasetDir", "labelsOutput"]) {
      if (!String(shard?.[name] || "").trim()) throw new Error(`Visual shard ${index + 1} is missing ${name}.`);
    }
    totalBytes += bytes;
    totalImages += imageCount;
  }
  if (totalBytes < targetBytes || totalBytes < minimumDatasetBytes) {
    throw new Error(`Visual shard plan totals ${totalBytes} bytes; at least ${targetBytes} bytes are required.`);
  }
  return { totalBytes, totalImages, targetBytes, maxShardBytes };
}

function adapterPathForShard(finalPath, index, shardCount) {
  if (index === shardCount - 1) return resolve(finalPath);
  return resolve(`${finalPath}.shard-${String(index + 1).padStart(3, "0")}`);
}

export function isCandidateTrainingEnabled(env = process.env) {
  return env.SALT_VISUAL_ALLOW_CANDIDATE_LABELS === "1";
}

// The plan is regenerated during recovery and carries a volatile generatedAt
// field. Hash only the signed inputs that determine shard contents so a
// checkpoint survives an otherwise identical plan refresh.
export function canonicalShardPlanFingerprint(plan) {
  const canonical = {
    kind: String(plan?.kind || ""),
    version: Number(plan?.version || 0),
    sourceManifest: String(plan?.sourceManifest || ""),
    sourceManifestSha256: String(plan?.sourceManifestSha256 || ""),
    targetBytes: Number(plan?.targetBytes || 0),
    maxShardBytes: Number(plan?.maxShardBytes || 0),
    bytes: Number(plan?.bytes || 0),
    imageCount: Number(plan?.imageCount || 0),
    shardCount: Number(plan?.shardCount || 0),
    labelIndex: Array.isArray(plan?.labelIndex)
      ? plan.labelIndex.map((entry) => ({ index: Number(entry?.index || 0), ruleId: String(entry?.ruleId || "") }))
      : [],
    shards: Array.isArray(plan?.shards)
      ? plan.shards.map((shard) => ({
        shardIndex: Number(shard?.shardIndex || 0),
        shardName: String(shard?.shardName || ""),
        bytes: Number(shard?.bytes || 0),
        imageCount: Number(shard?.imageCount || 0),
        sourceManifest: String(shard?.sourceManifest || ""),
        datasetDir: String(shard?.datasetDir || ""),
        labelsOutput: String(shard?.labelsOutput || ""),
      }))
      : [],
  };
  return sha256Text(JSON.stringify(canonical));
}

function buildFullManifest(shardManifests, plan, stagingExclusions = [], stagingSourceDrifts = []) {
  const entries = shardManifests.flatMap((manifest) => manifest.entries);
  const imageHashes = new Set();
  const productSplits = new Map();
  for (const entry of entries) {
    if (imageHashes.has(entry.imageSha256)) throw new Error(`Duplicate image checksum across visual shards: ${entry.imageSha256}.`);
    imageHashes.add(entry.imageSha256);
    const previousSplit = productSplits.get(entry.productId);
    if (previousSplit && previousSplit !== entry.split) {
      throw new Error(`Product ${entry.productId} crosses visual training splits across shards.`);
    }
    productSplits.set(entry.productId, entry.split);
  }
  const sorted = entries.sort((left, right) => `${left.productId}\n${left.image}`.localeCompare(`${right.productId}\n${right.image}`));
  const labels = buildVisualTaxonomyLabelIndex(sorted.map((entry) => entry.ruleId));
  const bytes = sorted.reduce((total, entry) => total + Number(entry.bytes), 0);
  const manifestSha256 = sha256Text(sorted.map((entry) => JSON.stringify(entry)).join("\n"));
  const sourceDriftDeltaBytes = stagingSourceDrifts.reduce(
    (total, entry) => total + Number(entry?.actualBytes || 0) - Number(entry?.originalBytes || 0),
    0,
  );
  const plannedBytes = Number(plan.bytes) + sourceDriftDeltaBytes;
  const targetBytes = Number(plan.targetBytes);
  const excludedBytes = stagingExclusions.reduce((total, entry) => total + Number(entry?.bytes || 0), 0);
  if (stagingSourceDrifts.length && process.env.SALT_VISUAL_ALLOW_CANDIDATE_LABELS !== "1") {
    throw new Error("Source-drift refreshes are allowed only for explicitly enabled candidate visual training.");
  }
  const candidateCoverageIncludesQuarantine = process.env.SALT_VISUAL_ALLOW_CANDIDATE_LABELS === "1" &&
    excludedBytes > 0 &&
    bytes + excludedBytes >= targetBytes;
  if (bytes < targetBytes && !candidateCoverageIncludesQuarantine) {
    throw new Error(
      `Staged visual corpus totals ${bytes} bytes, below the signed ${targetBytes}-byte training minimum.`
      + ` ${stagingExclusions.length} explicitly quarantined image(s) account for ${excludedBytes} bytes.`,
    );
  }
  if (bytes > plannedBytes || plannedBytes - bytes !== excludedBytes) {
    throw new Error(
      `Staged visual corpus totals ${bytes} bytes but the shard plan signed ${plannedBytes} bytes; `
      + `the ${stagingExclusions.length} recorded staging exclusion(s) account for ${excludedBytes} bytes.`,
    );
  }
  if (stagingExclusions.length && process.env.SALT_VISUAL_ALLOW_CANDIDATE_LABELS !== "1") {
    throw new Error("Staging exclusions are allowed only for explicitly enabled candidate visual training.");
  }
  return {
    entries: sorted,
    labelIndex: labels,
    imageCount: sorted.length,
    productCount: productSplits.size,
    labelCount: labels.length,
    bytes,
    plannedBytes,
    excludedImageCount: stagingExclusions.length,
    excludedBytes,
    sourceDriftCount: stagingSourceDrifts.length,
    sourceDriftDeltaBytes,
    manifestSha256,
  };
}

async function readStagingExclusions(plan) {
  const exclusions = [];
  for (const shard of plan.shards) {
    const path = `${resolve(shard.labelsOutput)}.exclusions.json`;
    const payload = await readJson(path, null);
    if (!payload) continue;
    if (payload.kind !== "salt-visual-staging-exclusions" || payload.version !== 1 || !Array.isArray(payload.entries)) {
      throw new Error(`Visual staging exclusions manifest is malformed: ${path}`);
    }
    exclusions.push(...payload.entries);
  }
  const hashes = new Set();
  for (const entry of exclusions) {
    if (!/^[a-f0-9]{64}$/i.test(String(entry?.sha256 || ""))) {
      throw new Error("Visual staging exclusions require a valid source image checksum.");
    }
    if (hashes.has(entry.sha256)) throw new Error(`Duplicate visual staging exclusion: ${entry.sha256}.`);
    hashes.add(entry.sha256);
  }
  return exclusions;
}

async function readStagingSourceDrifts(plan) {
  const drifts = [];
  for (const shard of plan.shards) {
    const path = `${resolve(shard.labelsOutput)}.source-drift.json`;
    const payload = await readJson(path, null);
    if (!payload) continue;
    if (payload.kind !== "salt-visual-staging-source-drift" || payload.version !== 1 || !Array.isArray(payload.entries)) {
      throw new Error(`Visual staging source-drift manifest is malformed: ${path}`);
    }
    drifts.push(...payload.entries);
  }
  const originals = new Set();
  const actuals = new Set();
  for (const entry of drifts) {
    const original = String(entry?.originalSha256 || "").trim().toLowerCase();
    const actual = String(entry?.actualSha256 || "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(original) || !/^[a-f0-9]{64}$/.test(actual) ||
      !Number.isInteger(Number(entry?.originalBytes)) || Number(entry.originalBytes) <= 0 ||
      !Number.isInteger(Number(entry?.actualBytes)) || Number(entry.actualBytes) <= 0 ||
      !String(entry?.target || "").trim()) {
      throw new Error("Visual staging source-drift entries require valid original and actual checksum evidence.");
    }
    if (originals.has(original)) throw new Error(`Duplicate visual staging source drift: ${original}.`);
    if (actuals.has(actual)) throw new Error(`Source drift produced duplicate visual image content: ${actual}.`);
    originals.add(original);
    actuals.add(actual);
  }
  return drifts;
}

async function stageShard(shard, maxShardBytes, { quarantineMissing = false, refreshMutatedSources = false } = {}) {
  await execFileAsync(npmBin, [
    "run",
    "catalog:vision:model:stage",
    "--",
    "--source-manifest",
    resolve(shard.sourceManifest),
    "--dataset-dir",
    assertExternalPath(shard.datasetDir, "Visual shard dataset directory"),
    "--labels-output",
    assertExternalPath(shard.labelsOutput, "Visual shard labels manifest"),
    "--max-shard-bytes",
    String(maxShardBytes),
  ], {
    cwd: rootDir,
    env: {
      ...process.env,
      SALT_VISUAL_TRAINING_RETAIN_RAW: "0",
      SALT_VISUAL_STAGING_QUARANTINE_MISSING: quarantineMissing ? "1" : "0",
      SALT_VISUAL_STAGING_REFRESH_MUTATED: refreshMutatedSources ? "1" : "0",
    },
    maxBuffer: 64 * 1024 * 1024,
  });
  const marker = await readJson(resolve(shard.datasetDir, corpusMarkerName));
  if (marker?.kind !== "salt-visual-training-corpus" || marker?.deleteAfterTraining !== true || marker?.status !== "ready") {
    throw new Error(`Visual shard ${shard.shardName || shard.shardIndex} did not finish with a deletable ready marker.`);
  }
  return marker;
}

async function ensureReadyDataset(shard, maxShardBytes, options = {}) {
  const datasetDir = assertExternalPath(shard.datasetDir, "Visual shard dataset directory");
  const marker = await readJson(resolve(datasetDir, corpusMarkerName));
  if (marker?.kind === "salt-visual-training-corpus" && marker?.deleteAfterTraining === true &&
    marker?.status === "ready" && Number(marker?.duplicateAuditVersion || 0) >= 1) return marker;
  return stageShard(shard, maxShardBytes, options);
}

async function purgeShard(shard, marker) {
  const datasetDir = resolve(shard.datasetDir);
  const current = await readJson(resolve(datasetDir, corpusMarkerName));
  if (!current || current.datasetId !== marker.datasetId || current.deleteAfterTraining !== true) {
    throw new Error(`Visual shard marker changed before purge: ${datasetDir}`);
  }
  await rm(datasetDir, { recursive: true, force: false });
  try {
    await lstat(datasetDir);
    throw new Error(`Visual shard still exists after purge: ${datasetDir}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function verifyFile(path, label) {
  const result = await stat(path).catch((error) => {
    throw new Error(`${label} is missing at ${path}: ${error.message}`);
  });
  if (!result.isFile() || result.size <= 0) throw new Error(`${label} is empty at ${path}.`);
  return hashFile(path);
}

async function loadState(statePath, planHash, plan, localStatePath = "", legacyPlanHash = "") {
  const acceptedPlanHashes = new Set([planHash, legacyPlanHash].filter(Boolean));
  const hasCompatiblePlanInputs = (candidate) => candidate?.sourceManifestSha256 === plan.sourceManifestSha256
    && Number(candidate?.targetBytes) === Number(plan.targetBytes)
    && Number(candidate?.maxShardBytes) === Number(plan.maxShardBytes);
  const candidatePaths = [...new Set([
    localStatePath,
    statePath,
    localStatePath ? `${localStatePath}.bak` : "",
    `${statePath}.bak`,
  ].filter(Boolean).map((path) => resolve(path)))];
  const validCandidates = [];
  const transientErrors = [];
  const mismatchedCandidates = [];

  for (const candidatePath of candidatePaths) {
    try {
      const candidate = await readJson(candidatePath);
      if (!candidate) continue;
      if (
        candidate.kind === "salt-visual-taxonomy-shard-training-state" &&
        candidate.version === 1 &&
        (acceptedPlanHashes.has(candidate.planSha256) || hasCompatiblePlanInputs(candidate))
      ) {
        validCandidates.push({ path: candidatePath, state: candidate });
      } else {
        mismatchedCandidates.push(candidatePath);
      }
    } catch (error) {
      if (isTransientFileReadError(error)) {
        transientErrors.push({ path: candidatePath, error });
        continue;
      }
      throw error;
    }
  }

  const newest = validCandidates.sort((left, right) => {
    const leftTime = Date.parse(String(left.state.updatedAt || "")) || 0;
    const rightTime = Date.parse(String(right.state.updatedAt || "")) || 0;
    return rightTime - leftTime;
  })[0];
  let existing = newest?.state;
  if (newest && newest.path !== resolve(statePath)) {
    process.stderr.write(`Visual shard state loaded from local checkpoint ${newest.path}; mirrored state may be stale.\n`);
  }
  if (!existing && transientErrors.length && mismatchedCandidates.length === 0) {
    throw transientErrors[0].error;
  }
  if (!existing) {
    return {
      kind: "salt-visual-taxonomy-shard-training-state",
      version: 1,
      planSha256: planHash,
      sourceManifestSha256: plan.sourceManifestSha256,
      targetBytes: plan.targetBytes,
      maxShardBytes: plan.maxShardBytes,
      phase: "adapter",
      adapterShards: {},
      embeddingShards: {},
      updatedAt: new Date().toISOString(),
    };
  }
  if (existing.kind !== "salt-visual-taxonomy-shard-training-state" || existing.version !== 1 || (
    !acceptedPlanHashes.has(existing.planSha256) && !hasCompatiblePlanInputs(existing)
  )) {
    throw new Error(`Visual shard training state ${statePath} belongs to a different plan; refusing to mix generations.`);
  }
  // Normalize legacy full-plan hashes on the first successful resume. Future
  // generatedAt-only plan refreshes will then select this same checkpoint.
  return existing.planSha256 === planHash ? existing : { ...existing, planSha256: planHash };
}

async function saveState(statePath, state, patch = {}, localStatePath = "") {
  Object.assign(state, patch, { updatedAt: new Date().toISOString() });
  const localPath = localStatePath ? resolve(localStatePath) : "";
  if (localPath && localPath !== resolve(statePath)) {
    // Keep the resumable journal off OneDrive. The project copy is still
    // refreshed for watcher visibility, but cannot invalidate local progress.
    await writeJsonAtomic(localPath, state);
    await writeJsonAtomic(statePath, state).catch((error) => {
      process.stderr.write(`Visual shard state mirror unavailable at ${statePath}: ${error.message}\n`);
    });
    await writeJsonAtomic(`${statePath}.bak`, state).catch(() => {});
    return;
  }
  await writeJsonAtomic(statePath, state);
  await copyFile(statePath, `${statePath}.bak`).catch(() => {});
}

async function readAdapterReport(path, { manifestSha256 = "", baseCheckpointSha256 = "" } = {}) {
  const reportPath = `${path}.training.json`;
  const report = await readJson(reportPath);
  if (report?.fineTuned !== true || report?.device !== "metal" || Number(report?.steps) <= 0) {
    throw new Error(`Invalid Metal fine-tuning report at ${reportPath}.`);
  }
  if (manifestSha256 && report?.datasetManifestSha256 !== manifestSha256) {
    throw new Error(`Metal fine-tuning report at ${reportPath} does not match the signed shard manifest.`);
  }
  if (baseCheckpointSha256 && report?.baseCheckpointSha256 !== baseCheckpointSha256) {
    throw new Error(`Metal fine-tuning report at ${reportPath} does not match the base checkpoint.`);
  }
  return { reportPath, report, reportSha256: (await hashFile(reportPath)).sha256 };
}

async function reconstructPurgedShardManifest(shard, expectedManifestSha256 = "") {
  const parseRecords = async (path) => {
    const text = String(await readFileWithRetry(resolve(path), "utf8")).trim();
    if (!text) return [];
    if (text.startsWith("[")) return JSON.parse(text);
    return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  };
  const [labels, sources, sourceDriftPayload] = await Promise.all([
    parseRecords(shard.labelsOutput),
    parseRecords(shard.sourceManifest),
    readJson(`${resolve(shard.labelsOutput)}.source-drift.json`, null),
  ]);
  const sourceDriftByOriginalSha = new Map(
    (Array.isArray(sourceDriftPayload?.entries) ? sourceDriftPayload.entries : [])
      .map((entry) => [String(entry?.originalSha256 || "").trim().toLowerCase(), entry]),
  );
  const sourceByKey = new Map();
  for (const source of sources) {
    const originalSha256 = String(source?.sha256 || source?.imageSha256 || "").trim().toLowerCase();
    const drift = sourceDriftByOriginalSha.get(originalSha256);
    const effectiveSource = drift
      ? { ...source, sha256: drift.actualSha256, bytes: drift.actualBytes }
      : source;
    const sha256 = String(effectiveSource?.sha256 || effectiveSource?.imageSha256 || "").trim().toLowerCase();
    const key = `${String(source?.productId || "")}\n${String(source?.ruleId || "")}\n${sha256.slice(0, 16)}`;
    if (!sha256 || sourceByKey.has(key)) throw new Error(`Purged visual shard source manifest has a duplicate or missing image checksum for ${key}.`);
    sourceByKey.set(key, effectiveSource);
  }
  const entries = labels.map((label, index) => {
    const image = String(label?.image || label?.path || "").trim();
    const productId = String(label?.productId || "").trim();
    const ruleId = String(label?.ruleId || "").trim();
    const prefix = image.match(/-([a-f0-9]{16,64})(?:\.[^./]+)$/i)?.[1]?.toLowerCase() || "";
    const source = sourceByKey.get(`${productId}\n${ruleId}\n${prefix.slice(0, 16)}`);
    if (!source) throw new Error(`Cannot reconstruct purged visual shard entry ${index + 1}: ${image}.`);
    return {
      image,
      imageSha256: String(source.sha256 || source.imageSha256).trim().toLowerCase(),
      bytes: Number(source.bytes),
      productId,
      ruleId,
      split: String(label?.split || source?.split || "").trim(),
      labelSource: String(label?.labelSource || source?.labelSource || "").trim(),
      ...(label?.candidateOnly === true || source?.candidateOnly === true ? { candidateOnly: true } : {}),
    };
  }).sort((left, right) => `${left.productId}\n${left.image}`.localeCompare(`${right.productId}\n${right.image}`));
  const manifestSha256 = sha256Text(entries.map((entry) => JSON.stringify(entry)).join("\n"));
  if (expectedManifestSha256 && manifestSha256 !== expectedManifestSha256) {
    throw new Error(`Purged visual shard manifest ${shard.shardName || shard.shardIndex} does not match its adapter checkpoint.`);
  }
  return {
    entries,
    labelIndex: buildVisualTaxonomyLabelIndex(entries.map((entry) => entry.ruleId)),
    imageCount: entries.length,
    productCount: new Set(entries.map((entry) => entry.productId)).size,
    labelCount: new Set(entries.map((entry) => entry.ruleId)).size,
    bytes: entries.reduce((total, entry) => total + Number(entry.bytes), 0),
    manifestSha256,
  };
}

async function recoverCompletedAdapter(path, manifestSha256, baseCheckpointSha256) {
  const output = await stat(path).catch(() => null);
  if (!output?.isFile() || output.size <= 0) return null;
  const report = await readJson(`${path}.training.json`, null);
  if (!report || typeof report.outputCheckpointSha256 !== "string" || !report.outputCheckpointSha256) return null;
  try {
    const reportInfo = await readAdapterReport(path, { manifestSha256, baseCheckpointSha256 });
    const digest = await hashFile(path);
    if (reportInfo.report.outputCheckpointSha256 && reportInfo.report.outputCheckpointSha256 !== digest.sha256) return null;
    return { ...reportInfo, digest };
  } catch {
    // An older adapter or a mismatched generation must be retrained, never
    // silently adopted as a checkpoint for the current signed plan.
    return null;
  }
}

async function trainAdapterShards({ args, plan, state, statePath, localStatePath, labelsPath, workRoot, candidateOnly = isCandidateTrainingEnabled() }) {
  const shardManifests = [];
  const encoderArgs = {
    encoderCommandJson: args.encoderCommandJson,
    encoderTrainCommandJson: args.encoderTrainCommandJson,
  };
  const adapterReports = [];
  const baseCheckpointSha256 = (await hashFile(args.baseCheckpoint)).sha256;
  for (let index = 0; index < plan.shards.length; index += 1) {
    const shard = plan.shards[index];
    const key = String(index + 1);
    const adapterPath = adapterPathForShard(args.fineTunedCheckpointOutput, index, plan.shards.length);
    const saved = state.adapterShards[key];
    if (saved?.status === "purged") {
      await verifyFile(adapterPath, `fine-tuned adapter shard ${key}`);
      const reportInfo = await readAdapterReport(adapterPath, {
        manifestSha256: String(saved.manifestSha256 || ""),
        baseCheckpointSha256,
      });
      adapterReports.push(reportInfo);
      const manifest = await reconstructPurgedShardManifest(shard, String(saved.manifestSha256 || ""));
      await writeJsonLines(
        resolve(workRoot, "manifests", `shard-${String(index + 1).padStart(3, "0")}.jsonl`),
        manifest.entries,
      );
      shardManifests.push(manifest);
      continue;
    }

    const stagingProgressPath = resolve(shard.datasetDir, ".salt-visual-staging-progress.json");
    await saveState(statePath, state, {
      phase: "staging",
      currentShard: key,
      currentProgressPath: stagingProgressPath,
      currentShardDatasetDir: resolve(shard.datasetDir),
      currentShardImageCount: Number(shard.imageCount || 0),
      currentShardBytes: Number(shard.bytes || 0),
    }, localStatePath);
    const marker = await ensureReadyDataset(shard, plan.maxShardBytes, {
      quarantineMissing: candidateOnly,
      refreshMutatedSources: candidateOnly,
    });
    const manifest = await buildTrainingManifest({
      datasetPath: assertExternalPath(shard.datasetDir, "Visual shard dataset directory"),
      labelsManifest: assertExternalPath(shard.labelsOutput, "Visual shard labels manifest"),
      minBytes: 1,
    });
    const manifestPath = resolve(workRoot, "manifests", `shard-${String(index + 1).padStart(3, "0")}.jsonl`);
    await writeJsonLines(manifestPath, manifest.entries);

    // A process can exit after producing the adapter but before the journal
    // records the trained/purged transition. Recover only artifacts carrying
    // exact manifest and base-checkpoint evidence; stale adapters are ignored.
    const recovered = await recoverCompletedAdapter(adapterPath, manifest.manifestSha256, baseCheckpointSha256);
    if (recovered) {
      const recoveredRecord = {
        status: "trained",
        adapterPath,
        adapterSha256: recovered.digest.sha256,
        reportPath: recovered.reportPath,
        reportSha256: recovered.reportSha256,
        steps: Number(recovered.report.steps),
        manifestSha256: manifest.manifestSha256,
        baseCheckpointSha256,
      };
      await saveState(statePath, state, {
        phase: "adapter",
        adapterShards: { ...state.adapterShards, [key]: recoveredRecord },
      }, localStatePath);
      await purgeShard(shard, marker);
      await saveState(statePath, state, {
        phase: index + 1 === plan.shards.length ? "embeddings" : "adapter",
        adapterShards: {
          ...state.adapterShards,
          [key]: { ...state.adapterShards[key], status: "purged", purgedAt: new Date().toISOString() },
        },
      }, localStatePath);
      adapterReports.push({ reportPath: recovered.reportPath, report: recovered.report, reportSha256: recovered.reportSha256 });
      shardManifests.push(manifest);
      process.stdout.write(`Recovered verified visual adapter shard ${index + 1}/${plan.shards.length} and purged.\n`);
      continue;
    }
    const previousAdapter = index > 0 ? adapterPathForShard(args.fineTunedCheckpointOutput, index - 1, plan.shards.length) : "";
    const partialPath = `${adapterPath}.partial.npz`;
    const partialMetadataPath = `${partialPath}.json`;
    const partialMetadata = await readJson(partialMetadataPath);
    let resumeCheckpointPath = previousAdapter;
    let resumeEntriesProcessed = 0;
    let resumeSteps = 0;
    const partialIsUsable = partialMetadata?.kind === "salt-visual-fine-tuned-encoder-partial" &&
      partialMetadata.manifestSha256 === manifest.manifestSha256 &&
      resolve(String(partialMetadata.baseCheckpointPath || "")) === resolve(args.baseCheckpoint) &&
      await access(partialPath).then(() => true).catch(() => false);
    if (partialIsUsable) {
      resumeCheckpointPath = partialPath;
      resumeEntriesProcessed = Number(partialMetadata.entriesProcessed || 0);
      resumeSteps = Number(partialMetadata.steps || 0);
    } else if (partialMetadata || await access(partialPath).then(() => true).catch(() => false)) {
      await rm(partialPath, { force: true });
      await rm(partialMetadataPath, { force: true });
    }
    await saveState(statePath, state, {
      phase: "adapter-training",
      currentShard: key,
      currentAdapterPath: adapterPath,
      currentManifestSha256: manifest.manifestSha256,
      currentProgressPath: `${adapterPath}.progress.json`,
      resumeCheckpointPath,
      resumeEntriesProcessed,
      resumeSteps,
    }, localStatePath);
    const fineTuned = await runEncoderFineTuning(
      encoderArgs,
      manifestPath,
      resolve(shard.datasetDir),
      labelsPath,
      args.baseCheckpoint,
      adapterPath,
      manifest.manifestSha256,
      { resumeCheckpointPath, resumeEntriesProcessed, resumeSteps },
    );
    const reportInfo = await readAdapterReport(adapterPath);
    await saveState(statePath, state, {
      phase: "adapter",
      adapterShards: {
        ...state.adapterShards,
        [key]: {
          status: "trained",
          adapterPath,
          adapterSha256: fineTuned.sha256,
          reportPath: reportInfo.reportPath,
          reportSha256: reportInfo.reportSha256,
          steps: Number(reportInfo.report.steps),
          manifestSha256: manifest.manifestSha256,
          baseCheckpointSha256,
        },
      },
    }, localStatePath);
    await purgeShard(shard, marker);
    await saveState(statePath, state, {
      phase: index + 1 === plan.shards.length ? "embeddings" : "adapter",
      adapterShards: {
        ...state.adapterShards,
        [key]: { ...state.adapterShards[key], status: "purged", purgedAt: new Date().toISOString() },
      },
    }, localStatePath);
    adapterReports.push(reportInfo);
    shardManifests.push(manifest);
    process.stdout.write(`Visual adapter shard ${index + 1}/${plan.shards.length} complete and purged.\n`);
  }
  const finalAdapter = adapterPathForShard(args.fineTunedCheckpointOutput, plan.shards.length - 1, plan.shards.length);
  await verifyFile(finalAdapter, "final fine-tuned visual encoder");
  return { finalAdapter, adapterReports, shardManifests };
}

async function encodeFinalShards({ args, plan, state, statePath, localStatePath, finalAdapter, workRoot, manifestsByShard, candidateOnly = isCandidateTrainingEnabled() }) {
  const recordPaths = [];
  for (let index = 0; index < plan.shards.length; index += 1) {
    const shard = plan.shards[index];
    const key = String(index + 1);
    const recordPath = resolve(workRoot, "records", `shard-${String(index + 1).padStart(3, "0")}.jsonl`);
    const saved = state.embeddingShards[key];
    if (saved?.status === "purged") {
      await verifyFile(recordPath, `validated embedding records for shard ${key}`);
      recordPaths.push(recordPath);
      continue;
    }
    const stagingProgressPath = resolve(shard.datasetDir, ".salt-visual-staging-progress.json");
    await saveState(statePath, state, {
      phase: "embedding-staging",
      currentShard: key,
      currentProgressPath: stagingProgressPath,
      currentShardDatasetDir: resolve(shard.datasetDir),
      currentShardImageCount: Number(shard.imageCount || 0),
      currentShardBytes: Number(shard.bytes || 0),
    }, localStatePath);
    const marker = await ensureReadyDataset(shard, plan.maxShardBytes, {
      quarantineMissing: candidateOnly,
      refreshMutatedSources: candidateOnly,
    });
    const manifest = manifestsByShard[index] || await buildTrainingManifest({
      datasetPath: resolve(shard.datasetDir),
      labelsManifest: resolve(shard.labelsOutput),
      minBytes: 1,
    });
    const manifestPath = resolve(workRoot, "manifests", `shard-${String(index + 1).padStart(3, "0")}.jsonl`);
    await writeJsonLines(manifestPath, manifest.entries);
    const encoderOutput = resolve(workRoot, "encoder", `shard-${String(index + 1).padStart(3, "0")}.jsonl`);
    await saveState(statePath, state, {
      phase: "embedding-encoding",
      currentShard: key,
      currentProgressPath: `${encoderOutput}.progress.json`,
      currentManifestSha256: manifest.manifestSha256,
      currentEncoderOutput: encoderOutput,
    }, localStatePath);
    await runEncoder({ encoderCommandJson: args.encoderCommandJson }, manifestPath, resolve(shard.datasetDir), encoderOutput, finalAdapter);
    const embeddingSummary = await validateEmbeddings({ embeddingsPath: encoderOutput, manifest, outputPath: recordPath });
    await rm(`${encoderOutput}.progress.json`, { force: true });
    await saveState(statePath, state, {
      phase: "embeddings",
      currentProgressPath: "",
      currentEncoderOutput: "",
      embeddingShards: {
        ...state.embeddingShards,
        [key]: { status: "encoded", records: embeddingSummary.records, recordPath, manifestSha256: manifest.manifestSha256 },
      },
    }, localStatePath);
    await purgeShard(shard, marker);
    await saveState(statePath, state, {
      phase: index + 1 === plan.shards.length ? "head" : "embeddings",
      embeddingShards: {
        ...state.embeddingShards,
        [key]: { ...state.embeddingShards[key], status: "purged", purgedAt: new Date().toISOString() },
      },
    }, localStatePath);
    recordPaths.push(recordPath);
    process.stdout.write(`Final encoder embeddings shard ${index + 1}/${plan.shards.length} complete and purged.\n`);
  }
  return recordPaths;
}

async function assembleRecords(recordPaths, outputPath, expectedRecords) {
  await mkdir(dirname(outputPath), { recursive: true });
  const temporary = `${outputPath}.tmp-${process.pid}`;
  const output = createWriteStream(temporary);
  try {
    for (const path of recordPaths) await appendFileStream(path, output);
  } finally {
    output.end();
    await once(output, "close");
  }
  await rename(temporary, outputPath);
  const records = await countLines(outputPath);
  if (records !== expectedRecords) throw new Error(`Combined visual embeddings contain ${records}/${expectedRecords} records.`);
  return { records, ...(await hashFile(outputPath)) };
}

async function assertAllShardRootsPurged(plan) {
  for (const shard of plan.shards) {
    try {
      await lstat(resolve(shard.datasetDir));
      throw new Error(`Visual shard remains on disk after training: ${shard.datasetDir}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const planPath = resolve(args.shardPlan);
  const planBytes = await readFileWithRetry(planPath);
  const legacyPlanHash = createHash("sha256").update(planBytes).digest("hex");
  const plan = JSON.parse(planBytes);
  validateShardPlan(plan);
  const planHash = canonicalShardPlanFingerprint(plan);
  const workRoot = assertExternalPath(args.workRoot || resolve(tmpdir(), `salt-visual-taxonomy-${planHash.slice(0, 16)}`), "Visual shard training work root");
  const statePath = resolve(args.stateOutput);
  const localStatePath = resolve(process.env.SALT_VISUAL_TRAINING_LOCAL_STATE || resolve(workRoot, "shard-training-state.json"));
  const state = await loadState(statePath, planHash, plan, localStatePath, legacyPlanHash);
  await mkdir(workRoot, { recursive: true });
  const labelsPath = resolve(workRoot, "labels.json");
  let globalLabelIndex = Array.isArray(plan.labelIndex) && plan.labelIndex.length
    ? plan.labelIndex
    : null;
  if (!globalLabelIndex) {
    const allRuleIds = plan.shards.flatMap((shard) => (Array.isArray(shard.entries) ? shard.entries.map((entry) => entry.ruleId) : []));
    for (const shard of plan.shards) {
      const source = JSON.parse(`[${(await readFileWithRetry(resolve(shard.sourceManifest), "utf8")).trim().split(/\r?\n/).filter(Boolean).join(",")}]`);
      allRuleIds.push(...source.map((entry) => entry.ruleId));
    }
    globalLabelIndex = buildVisualTaxonomyLabelIndex(allRuleIds);
  }
  const expectedLabels = buildVisualTaxonomyLabelIndex(globalLabelIndex.map((entry) => entry.ruleId));
  if (JSON.stringify(expectedLabels) !== JSON.stringify(globalLabelIndex)) {
    throw new Error("Visual shard plan labelIndex is not the canonical sorted taxonomy index.");
  }
  await writeJsonAtomic(labelsPath, globalLabelIndex);
  const candidateOnly = isCandidateTrainingEnabled();
  const { finalAdapter, adapterReports } = await trainAdapterShards({ args, plan, state, statePath, localStatePath, labelsPath, workRoot, candidateOnly });
  const shardManifests = [];
  for (const shard of plan.shards) {
    const manifestPath = resolve(workRoot, "manifests", `shard-${String(shard.shardIndex).padStart(3, "0")}.jsonl`);
    const manifestEntries = await readFileWithRetry(manifestPath, "utf8");
    const entries = manifestEntries.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    shardManifests.push({
      entries,
      imageCount: entries.length,
      productCount: new Set(entries.map((entry) => entry.productId)).size,
      bytes: entries.reduce((sum, entry) => sum + Number(entry.bytes), 0),
      manifestSha256: sha256Text(entries.map((entry) => JSON.stringify(entry)).join("\n")),
    });
  }
  const recordPaths = await encodeFinalShards({ args, plan, state, statePath, localStatePath, finalAdapter, workRoot, manifestsByShard: shardManifests, candidateOnly });
  await saveState(statePath, state, {
    phase: "embedding-assembly",
    currentShard: null,
    currentProgressPath: "",
    embeddingRecordCount: recordPaths.length,
  }, localStatePath);
  const stagingExclusions = await readStagingExclusions(plan);
  const stagingSourceDrifts = await readStagingSourceDrifts(plan);
  const fullManifest = buildFullManifest(shardManifests, plan, stagingExclusions, stagingSourceDrifts);
  const fullManifestPath = resolve(workRoot, "full-training-manifest.jsonl");
  await writeJsonLines(fullManifestPath, fullManifest.entries);
  const recordsPath = resolve(workRoot, "all-embeddings.jsonl");
  await assembleRecords(recordPaths, recordsPath, fullManifest.imageCount);
  // The head uses a versioned transform and optimizer namespace so older
  // checkpoints cannot silently resume with incompatible training semantics.
  // This release uses a calibrated linear head with selective high-margin
  // acceptance; low-margin predictions remain in classification review.
  const metricsPath = resolve(workRoot, "head-metrics-l2-calibrated-linear-adam-v5.json");
  const headCheckpointPath = resolve(workRoot, "head-checkpoint-l2-calibrated-linear-adam-v5.npz");
  const headCheckpointMetadataPath = `${headCheckpointPath}.json`;
  await saveState(statePath, state, {
    phase: "head-training",
    currentShard: null,
    currentProgressPath: "",
    currentRecordsPath: recordsPath,
    currentManifestSha256: fullManifest.manifestSha256,
  }, localStatePath);
  const metrics = state.phase === "complete" && await access(metricsPath).then(() => true).catch(() => false)
    ? await readJson(metricsPath)
    : await runMlxTraining({
      recordsPath,
      weightsPath: resolve(args.weightsOutput),
      metricsPath,
      labelsPath,
      checkpointPath: headCheckpointPath,
      checkpointMetadataPath: headCheckpointMetadataPath,
      manifestSha256: fullManifest.manifestSha256,
    });
  const finalAdapterDigest = await verifyFile(finalAdapter, "final fine-tuned visual encoder");
  const baseDigest = await verifyFile(args.baseCheckpoint, "base visual encoder checkpoint");
  const weightsDigest = await verifyFile(resolve(args.weightsOutput), "visual taxonomy weights");
  const aggregateReportPath = `${resolve(args.fineTunedCheckpointOutput)}.training.aggregate.json`;
  const aggregateReport = {
    kind: "salt-visual-fine-tuning-report",
    fineTuned: true,
    device: "metal",
    labelPolicy: fullManifest.entries.some((entry) => entry.candidateOnly === true)
      ? "deterministic-candidate-only"
      : "human-reviewed-or-verified",
    steps: adapterReports.reduce((sum, info) => sum + Number(info.report.steps), 0),
    datasetManifestSha256: fullManifest.manifestSha256,
    baseCheckpointSha256: baseDigest.sha256,
    outputCheckpointSha256: finalAdapterDigest.sha256,
    shardCount: plan.shards.length,
    shards: adapterReports.map((info) => ({ reportPath: info.reportPath, reportSha256: info.reportSha256, steps: Number(info.report.steps) })),
  };
  await writeJsonAtomic(aggregateReportPath, aggregateReport);
  const taxonomyFingerprint = taxonomyTrainingFingerprint(getCatalogTaxonomyDefinitions());
  const trainLabelCounts = metrics.trainLabelCounts && typeof metrics.trainLabelCounts === "object"
    ? metrics.trainLabelCounts
    : {};
  const taxonomyLabels = fullManifest.labelIndex.map((entry) => ({
    ...entry,
    trained: Number(trainLabelCounts[entry.ruleId] || 0) > 0,
  }));
  await assertAllShardRootsPurged(plan);
  const modelPath = resolve(args.output);
  const model = {
    schemaVersion: VISUAL_TAXONOMY_MODEL_SCHEMA_VERSION,
    modelVersion: VISUAL_TAXONOMY_MODEL_VERSION,
    modelType: VISUAL_TAXONOMY_MODEL_TYPE,
    backend: VISUAL_TAXONOMY_MODEL_BACKEND,
    trained: true,
    candidateOnly,
    labelPolicy: candidateOnly ? "deterministic-candidate-only" : "human-reviewed-or-verified",
    releaseUse: candidateOnly ? "candidate-evidence-only" : "verified-visual-evidence",
    taxonomy: {
      version: CATALOG_TAXONOMY_VERSION,
      fingerprint: taxonomyFingerprint,
      labels: taxonomyLabels,
      untrainedLabels: taxonomyLabels.filter((entry) => entry.trained === false).map((entry) => entry.ruleId),
    },
    dataset: {
      datasetId: `visual-sharded-${String(plan.sourceManifestSha256 || planHash).slice(0, 24)}`,
      bytes: fullManifest.bytes,
      plannedBytes: fullManifest.plannedBytes,
      excludedImageCount: fullManifest.excludedImageCount,
      excludedBytes: fullManifest.excludedBytes,
      sourceDriftCount: fullManifest.sourceDriftCount,
      sourceDriftDeltaBytes: fullManifest.sourceDriftDeltaBytes,
      imageCount: fullManifest.imageCount,
      productCount: fullManifest.productCount,
      labelCount: fullManifest.labelCount,
      manifestSha256: fullManifest.manifestSha256,
      splitPolicy: "deterministic product-group split; no product or image crosses splits; staged in sequential 25 GB shards",
      labelPolicy: candidateOnly ? "deterministic-candidate-only" : "human-reviewed-or-verified",
    },
    encoder: {
      fineTuned: true,
      baseCheckpointPath: resolve(args.baseCheckpoint),
      baseCheckpointSha256: baseDigest.sha256,
      fineTunedCheckpointPath: finalAdapter,
      fineTunedCheckpointSha256: finalAdapterDigest.sha256,
      fineTuning: {
        steps: aggregateReport.steps,
        device: "metal",
        datasetManifestSha256: fullManifest.manifestSha256,
        reportPath: aggregateReportPath,
        reportSha256: (await hashFile(aggregateReportPath)).sha256,
        shardCount: plan.shards.length,
      },
      command: JSON.parse(args.encoderCommandJson),
      trainCommand: JSON.parse(args.encoderTrainCommandJson),
    },
    training: {
      records: Number(metrics.records || fullManifest.imageCount),
      embeddingDimensions: Number(metrics.embeddingDimensions || 0),
      device: String(metrics.device || "metal"),
      precision: String(metrics.precision || "float16"),
      epochs: Number(metrics.epochs || 0),
      batchSize: Number(metrics.batchSize || 0),
      metrics: metrics.metrics || metrics,
      completedAt: new Date().toISOString(),
      resourcePolicy: "two sequential <=25 GB raw shards; raw shard purged after each verified pass; OS-managed swap only",
    },
    weights: { path: relative(rootDir, resolve(args.weightsOutput)), sha256: weightsDigest.sha256, bytes: weightsDigest.bytes },
    retention: {
      rawDataPurged: true,
      purgedBytes: fullManifest.bytes,
      purgedImageCount: fullManifest.imageCount,
      purgedAt: new Date().toISOString(),
      purgedDatasetRoot: `sharded:${plan.shards.map((shard) => resolve(shard.datasetDir)).join(",")}`,
      rawDataPolicy: "each marked shard is deleted immediately after adapter or final-encoder verification",
    },
  };
  await writeJsonAtomic(modelPath, model);
  await assertVisualTaxonomyModel(model, {
    taxonomyVersion: CATALOG_TAXONOMY_VERSION,
    taxonomyFingerprint,
    requireRawDataPurged: true,
    weightsPath: resolve(args.weightsOutput),
  });
  const modelDigest = await hashFile(modelPath);
  await writeJsonAtomic(resolve(args.completionOutput), {
    status: "verified",
    modelPath: relative(rootDir, modelPath),
    modelSha256: modelDigest.sha256,
    weightsPath: relative(rootDir, resolve(args.weightsOutput)),
    weightsSha256: weightsDigest.sha256,
    datasetId: model.dataset.datasetId,
    datasetBytes: fullManifest.bytes,
    plannedDatasetBytes: fullManifest.plannedBytes,
    excludedImageCount: fullManifest.excludedImageCount,
    excludedBytes: fullManifest.excludedBytes,
    sourceDriftCount: fullManifest.sourceDriftCount,
    sourceDriftDeltaBytes: fullManifest.sourceDriftDeltaBytes,
    imageCount: fullManifest.imageCount,
    productCount: fullManifest.productCount,
    labelCount: fullManifest.labelCount,
    rawDataPurged: true,
    purgedBytes: fullManifest.bytes,
    purgedImageCount: fullManifest.imageCount,
    purgedDatasetRoot: model.retention.purgedDatasetRoot,
    completedAt: new Date().toISOString(),
  });
  await saveState(statePath, state, { phase: "complete", modelPath, modelSha256: modelDigest.sha256, completedAt: new Date().toISOString() }, localStatePath);
  await rm(workRoot, { recursive: true, force: true });
  process.stdout.write(`Verified sharded Metal visual taxonomy model across ${plan.shards.length} <=25 GB shards; raw corpus purged.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

export { adapterPathForShard, buildFullManifest, loadState, parseArgs, readStagingSourceDrifts, saveState };
