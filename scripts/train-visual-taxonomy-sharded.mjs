#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { once } from "node:events";
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
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonLines(path, entries) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
  await rename(temporary, path);
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
  if (index === shardCount - 1) return finalPath;
  // Preserve the path representation supplied by the training plan. A POSIX
  // path must not be rewritten to the current drive when this runs on Windows.
  return `${finalPath}.shard-${String(index + 1).padStart(3, "0")}`;
}

function buildFullManifest(shardManifests, plan) {
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
  if (bytes !== Number(plan.bytes)) {
    throw new Error(`Staged visual corpus totals ${bytes} bytes but the shard plan signed ${plan.bytes} bytes.`);
  }
  return {
    entries: sorted,
    labelIndex: labels,
    imageCount: sorted.length,
    productCount: productSplits.size,
    labelCount: labels.length,
    bytes,
    manifestSha256,
  };
}

async function stageShard(shard, maxShardBytes) {
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
    env: { ...process.env, SALT_VISUAL_TRAINING_RETAIN_RAW: "0" },
    maxBuffer: 64 * 1024 * 1024,
  });
  const marker = await readJson(resolve(shard.datasetDir, corpusMarkerName));
  if (marker?.kind !== "salt-visual-training-corpus" || marker?.deleteAfterTraining !== true || marker?.status !== "ready") {
    throw new Error(`Visual shard ${shard.shardName || shard.shardIndex} did not finish with a deletable ready marker.`);
  }
  return marker;
}

async function ensureReadyDataset(shard, maxShardBytes) {
  const datasetDir = assertExternalPath(shard.datasetDir, "Visual shard dataset directory");
  const marker = await readJson(resolve(datasetDir, corpusMarkerName));
  if (marker?.kind === "salt-visual-training-corpus" && marker?.deleteAfterTraining === true && marker?.status === "ready") return marker;
  return stageShard(shard, maxShardBytes);
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

async function loadState(statePath, planHash, plan) {
  const existing = await readJson(statePath);
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
  if (existing.kind !== "salt-visual-taxonomy-shard-training-state" || existing.version !== 1 || existing.planSha256 !== planHash) {
    throw new Error(`Visual shard training state ${statePath} belongs to a different plan; refusing to mix generations.`);
  }
  return existing;
}

async function saveState(statePath, state, patch = {}) {
  Object.assign(state, patch, { updatedAt: new Date().toISOString() });
  await writeJsonAtomic(statePath, state);
}

async function readAdapterReport(path) {
  const reportPath = `${path}.training.json`;
  const report = await readJson(reportPath);
  if (report?.fineTuned !== true || report?.device !== "metal" || Number(report?.steps) <= 0) {
    throw new Error(`Invalid Metal fine-tuning report at ${reportPath}.`);
  }
  return { reportPath, report, reportSha256: (await hashFile(reportPath)).sha256 };
}

async function trainAdapterShards({ args, plan, state, statePath, labelsPath, workRoot }) {
  const shardManifests = [];
  const encoderArgs = {
    encoderCommandJson: args.encoderCommandJson,
    encoderTrainCommandJson: args.encoderTrainCommandJson,
  };
  const adapterReports = [];
  for (let index = 0; index < plan.shards.length; index += 1) {
    const shard = plan.shards[index];
    const key = String(index + 1);
    const adapterPath = adapterPathForShard(args.fineTunedCheckpointOutput, index, plan.shards.length);
    const saved = state.adapterShards[key];
    if (saved?.status === "purged") {
      await verifyFile(adapterPath, `fine-tuned adapter shard ${key}`);
      const reportInfo = await readAdapterReport(adapterPath);
      adapterReports.push(reportInfo);
      continue;
    }

    const marker = await ensureReadyDataset(shard, plan.maxShardBytes);
    const manifest = await buildTrainingManifest({
      datasetPath: assertExternalPath(shard.datasetDir, "Visual shard dataset directory"),
      labelsManifest: assertExternalPath(shard.labelsOutput, "Visual shard labels manifest"),
      minBytes: 1,
    });
    const manifestPath = resolve(workRoot, "manifests", `shard-${String(index + 1).padStart(3, "0")}.jsonl`);
    await writeJsonLines(manifestPath, manifest.entries);
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
    });
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
        },
      },
    });
    await purgeShard(shard, marker);
    await saveState(statePath, state, {
      phase: index + 1 === plan.shards.length ? "embeddings" : "adapter",
      adapterShards: {
        ...state.adapterShards,
        [key]: { ...state.adapterShards[key], status: "purged", purgedAt: new Date().toISOString() },
      },
    });
    adapterReports.push(reportInfo);
    shardManifests.push(manifest);
    process.stdout.write(`Visual adapter shard ${index + 1}/${plan.shards.length} complete and purged.\n`);
  }
  const finalAdapter = adapterPathForShard(args.fineTunedCheckpointOutput, plan.shards.length - 1, plan.shards.length);
  await verifyFile(finalAdapter, "final fine-tuned visual encoder");
  return { finalAdapter, adapterReports, shardManifests };
}

async function encodeFinalShards({ args, plan, state, statePath, finalAdapter, workRoot, manifestsByShard }) {
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
    const marker = await ensureReadyDataset(shard, plan.maxShardBytes);
    const manifest = manifestsByShard[index] || await buildTrainingManifest({
      datasetPath: resolve(shard.datasetDir),
      labelsManifest: resolve(shard.labelsOutput),
      minBytes: 1,
    });
    const manifestPath = resolve(workRoot, "manifests", `shard-${String(index + 1).padStart(3, "0")}.jsonl`);
    await writeJsonLines(manifestPath, manifest.entries);
    const encoderOutput = resolve(workRoot, "encoder", `shard-${String(index + 1).padStart(3, "0")}.jsonl`);
    await runEncoder({ encoderCommandJson: args.encoderCommandJson }, manifestPath, resolve(shard.datasetDir), encoderOutput, finalAdapter);
    const embeddingSummary = await validateEmbeddings({ embeddingsPath: encoderOutput, manifest, outputPath: recordPath });
    await saveState(statePath, state, {
      phase: "embeddings",
      embeddingShards: {
        ...state.embeddingShards,
        [key]: { status: "encoded", records: embeddingSummary.records, recordPath, manifestSha256: manifest.manifestSha256 },
      },
    });
    await purgeShard(shard, marker);
    await saveState(statePath, state, {
      phase: index + 1 === plan.shards.length ? "head" : "embeddings",
      embeddingShards: {
        ...state.embeddingShards,
        [key]: { ...state.embeddingShards[key], status: "purged", purgedAt: new Date().toISOString() },
      },
    });
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
  const planBytes = await readFile(planPath);
  const planHash = createHash("sha256").update(planBytes).digest("hex");
  const plan = JSON.parse(planBytes);
  validateShardPlan(plan);
  const workRoot = assertExternalPath(args.workRoot || resolve(tmpdir(), `salt-visual-taxonomy-${planHash.slice(0, 16)}`), "Visual shard training work root");
  const statePath = resolve(args.stateOutput);
  const state = await loadState(statePath, planHash, plan);
  await mkdir(workRoot, { recursive: true });
  const labelsPath = resolve(workRoot, "labels.json");
  let globalLabelIndex = Array.isArray(plan.labelIndex) && plan.labelIndex.length
    ? plan.labelIndex
    : null;
  if (!globalLabelIndex) {
    const allRuleIds = plan.shards.flatMap((shard) => (Array.isArray(shard.entries) ? shard.entries.map((entry) => entry.ruleId) : []));
    for (const shard of plan.shards) {
      const source = JSON.parse(`[${(await readFile(resolve(shard.sourceManifest), "utf8")).trim().split(/\r?\n/).filter(Boolean).join(",")}]`);
      allRuleIds.push(...source.map((entry) => entry.ruleId));
    }
    globalLabelIndex = buildVisualTaxonomyLabelIndex(allRuleIds);
  }
  const expectedLabels = buildVisualTaxonomyLabelIndex(globalLabelIndex.map((entry) => entry.ruleId));
  if (JSON.stringify(expectedLabels) !== JSON.stringify(globalLabelIndex)) {
    throw new Error("Visual shard plan labelIndex is not the canonical sorted taxonomy index.");
  }
  await writeJsonAtomic(labelsPath, globalLabelIndex);
  const { finalAdapter, adapterReports } = await trainAdapterShards({ args, plan, state, statePath, labelsPath, workRoot });
  const shardManifests = [];
  for (const shard of plan.shards) {
    const marker = await readJson(resolve(shard.datasetDir, corpusMarkerName));
    if (marker) throw new Error(`Expected adapter phase to purge shard before final encoding: ${shard.datasetDir}`);
    const manifestPath = resolve(workRoot, "manifests", `shard-${String(shard.shardIndex).padStart(3, "0")}.jsonl`);
    const manifestEntries = await readFile(manifestPath, "utf8");
    const entries = manifestEntries.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    shardManifests.push({
      entries,
      imageCount: entries.length,
      productCount: new Set(entries.map((entry) => entry.productId)).size,
      bytes: entries.reduce((sum, entry) => sum + Number(entry.bytes), 0),
      manifestSha256: sha256Text(entries.map((entry) => JSON.stringify(entry)).join("\n")),
    });
  }
  const recordPaths = await encodeFinalShards({ args, plan, state, statePath, finalAdapter, workRoot, manifestsByShard: shardManifests });
  const fullManifest = buildFullManifest(shardManifests, plan);
  const fullManifestPath = resolve(workRoot, "full-training-manifest.jsonl");
  await writeJsonLines(fullManifestPath, fullManifest.entries);
  const recordsPath = resolve(workRoot, "all-embeddings.jsonl");
  await assembleRecords(recordPaths, recordsPath, fullManifest.imageCount);
  const metricsPath = resolve(workRoot, "head-metrics.json");
  const headCheckpointPath = resolve(workRoot, "head-checkpoint.npz");
  const headCheckpointMetadataPath = `${headCheckpointPath}.json`;
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
  const candidateOnly = fullManifest.entries.some((entry) => entry.candidateOnly === true);
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
    taxonomy: { version: CATALOG_TAXONOMY_VERSION, fingerprint: taxonomyFingerprint, labels: fullManifest.labelIndex },
    dataset: {
      datasetId: `visual-sharded-${String(plan.sourceManifestSha256 || planHash).slice(0, 24)}`,
      bytes: fullManifest.bytes,
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
    imageCount: fullManifest.imageCount,
    productCount: fullManifest.productCount,
    labelCount: fullManifest.labelCount,
    rawDataPurged: true,
    purgedBytes: fullManifest.bytes,
    purgedImageCount: fullManifest.imageCount,
    purgedDatasetRoot: model.retention.purgedDatasetRoot,
    completedAt: new Date().toISOString(),
  });
  await saveState(statePath, state, { phase: "complete", modelPath, modelSha256: modelDigest.sha256, completedAt: new Date().toISOString() });
  await rm(workRoot, { recursive: true, force: true });
  process.stdout.write(`Verified sharded Metal visual taxonomy model across ${plan.shards.length} <=25 GB shards; raw corpus purged.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

export { adapterPathForShard, buildFullManifest, parseArgs };
