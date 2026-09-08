#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  copyFile,
  lstat,
  mkdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  buildVisualTaxonomyLabelIndex,
  assertVisualTaxonomyModel,
  sha256Text,
  VISUAL_TAXONOMY_MIN_DATASET_BYTES,
  VISUAL_TAXONOMY_MODEL_BACKEND,
  VISUAL_TAXONOMY_MODEL_TYPE,
  VISUAL_TAXONOMY_MODEL_VERSION,
  VISUAL_TAXONOMY_MODEL_SCHEMA_VERSION,
} from "../src/lib/visual-taxonomy-model.js";
import {
  CATALOG_TAXONOMY_VERSION,
  getCatalogTaxonomyDefinitions,
} from "../src/lib/catalog-taxonomy.js";
import { taxonomyTrainingFingerprint } from "../src/lib/catalog-knowledge-model.js";
import { readFileWithRetry } from "./reliable-file-read.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const outputDir = resolve(rootDir, "output");
const defaultModelPath = resolve(outputDir, "visual-taxonomy-model.json");
const defaultWeightsPath = resolve(outputDir, "visual-taxonomy-model-weights.npz");
const defaultCompletionPath = resolve(outputDir, "visual-taxonomy-training-completion.json");
const defaultPurgeJournalPath = resolve(outputDir, "visual-taxonomy-purge-journal.json");
const backendPath = resolve(rootDir, "scripts", "visual-taxonomy-train-mlx.py");
const execFileAsync = promisify(execFile);
const allowedImageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".heic"]);
const trustedLabelSources = new Set(["human", "human-reviewed", "verified", "curated", "approved"]);
const candidateLabelSources = new Set(["deterministic-candidate", "external-human-verified-candidate"]);
const datasetMarkerName = ".salt-visual-corpus.json";

function parseArgs(argv) {
  const args = {
    datasetDir: process.env.SALT_VISUAL_TRAINING_DATASET_DIR || "",
    labelsManifest: process.env.SALT_VISUAL_TRAINING_LABELS_MANIFEST || "",
    embeddingsJsonl: process.env.SALT_VISUAL_TRAINING_EMBEDDINGS || "",
    encoderCommandJson: process.env.SALT_VISUAL_ENCODER_COMMAND_JSON || "",
    encoderTrainCommandJson: process.env.SALT_VISUAL_ENCODER_TRAIN_COMMAND_JSON || "",
    baseCheckpoint: process.env.SALT_VISUAL_BASE_CHECKPOINT || "",
    fineTunedCheckpointOutput: process.env.SALT_VISUAL_FINE_TUNED_ENCODER_CHECKPOINT || resolve(outputDir, "visual-taxonomy-encoder-finetuned.safetensors"),
    output: defaultModelPath,
    weightsOutput: defaultWeightsPath,
    completionOutput: defaultCompletionPath,
    recoverPurge: false,
    minBytes: Number(process.env.SALT_VISUAL_TRAINING_MIN_BYTES || VISUAL_TAXONOMY_MIN_DATASET_BYTES),
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--recover-purge") {
      args.recoverPurge = true;
    } else if (["--dataset-dir", "--labels-manifest", "--embeddings-jsonl", "--encoder-command-json", "--encoder-train-command-json", "--base-checkpoint", "--fine-tuned-checkpoint-output", "--output", "--weights-output", "--completion-output", "--min-bytes"].includes(token)) {
      if (!next) throw new Error(`Missing value for ${token}.`);
      const key = {
        "--dataset-dir": "datasetDir",
        "--labels-manifest": "labelsManifest",
        "--embeddings-jsonl": "embeddingsJsonl",
        "--encoder-command-json": "encoderCommandJson",
        "--encoder-train-command-json": "encoderTrainCommandJson",
        "--base-checkpoint": "baseCheckpoint",
        "--fine-tuned-checkpoint-output": "fineTunedCheckpointOutput",
        "--output": "output",
        "--weights-output": "weightsOutput",
        "--completion-output": "completionOutput",
        "--min-bytes": "minBytes",
      }[token];
      args[key] = key === "minBytes" ? Number(next) : next;
      index += 1;
    } else if (token === "--delete-raw-after-train") {
      // Kept as an explicit, self-documenting compatibility flag. Successful
      // training always purges the marked image corpus.
    } else if (token === "--help") {
      process.stdout.write("Usage: npm run catalog:vision:model:train -- --dataset-dir DIR --labels-manifest FILE --base-checkpoint FILE --encoder-command-json JSON --encoder-train-command-json JSON [--fine-tuned-checkpoint-output FILE] [--delete-raw-after-train]\n");
      process.stdout.write("       npm run catalog:vision:model:train -- --recover-purge [--output FILE --weights-output FILE --completion-output FILE]\n");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }
  return args;
}

function assertRequiredArgs(args) {
  if (process.env.SALT_VISUAL_TRAINING_RETAIN_RAW === "1") {
    throw new Error("Raw visual training data cannot be retained after a successful model train; remove SALT_VISUAL_TRAINING_RETAIN_RAW.");
  }
  for (const [key, value] of [["--dataset-dir", args.datasetDir], ["--labels-manifest", args.labelsManifest], ["--base-checkpoint", args.baseCheckpoint], ["--fine-tuned-checkpoint-output", args.fineTunedCheckpointOutput]]) {
    if (!String(value || "").trim()) throw new Error(`${key} is required; the trainer will not infer or download a corpus.`);
  }
  if (args.embeddingsJsonl) {
    throw new Error("Precomputed embeddings are benchmarking-only and cannot produce a deployable visual model; provide --encoder-command-json for a real image encoder.");
  }
  if (!args.encoderCommandJson) {
    throw new Error("Provide --encoder-command-json; a real Metal image encoder is required for a deployable visual model.");
  }
  if (!args.encoderTrainCommandJson) {
    throw new Error("Provide --encoder-train-command-json; a real Metal fine-tuning command is required for a deployable visual model.");
  }
  if (!Number.isInteger(args.minBytes) || args.minBytes <= 0) throw new Error("--min-bytes must be a positive integer.");
}

function isInside(child, parent) {
  const value = resolve(child);
  const boundary = resolve(parent);
  return value === boundary || value.startsWith(`${boundary}${sep}`);
}

async function assertSafeDatasetRoot(datasetDir) {
  const datasetPath = await realpath(resolve(datasetDir));
  const rootPath = await realpath(rootDir);
  if (datasetPath === rootPath || isInside(datasetPath, rootPath)) {
    throw new Error(`Refusing to purge a dataset inside the SALT project: ${datasetPath}`);
  }
  const datasetStat = await lstat(datasetPath);
  if (!datasetStat.isDirectory()) throw new Error(`Visual training dataset is not a directory: ${datasetPath}`);
  const markerPath = resolve(datasetPath, datasetMarkerName);
  const marker = JSON.parse(await readFileWithRetry(markerPath, "utf8"));
  if (marker?.kind !== "salt-visual-training-corpus" || !marker?.datasetId) {
    throw new Error(`Dataset marker ${markerPath} is missing kind or datasetId.`);
  }
  if (marker.deleteAfterTraining !== true) {
    throw new Error(`Dataset marker ${markerPath} does not explicitly allow post-training deletion.`);
  }
  return { datasetPath, marker };
}

async function assertCheckpoint(checkpointPath, datasetPath) {
  const checkpoint = await realpath(resolve(checkpointPath));
  if (isInside(checkpoint, datasetPath)) {
    throw new Error("The base vision checkpoint cannot be stored inside the raw corpus that will be purged.");
  }
  const checkpointStat = await stat(checkpoint);
  if (!checkpointStat.isFile() || checkpointStat.size <= 0) throw new Error(`Base vision checkpoint is not a non-empty file: ${checkpoint}`);
  return checkpoint;
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filePath)) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { sha256: hash.digest("hex"), bytes };
}

function assignSplit(productId) {
  const bucket = Number.parseInt(sha256Text(productId).slice(0, 8), 16) / 0xffffffff;
  if (bucket < 0.8) return "train";
  if (bucket < 0.9) return "validation";
  return "test";
}

function parseManifestText(raw) {
  const text = String(raw || "").trim();
  if (!text) throw new Error("Visual training labels manifest is empty.");
  if (text.startsWith("[")) {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("Visual training labels JSON must be an array or JSONL.");
    return parsed;
  }
  return text.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid labels JSONL at line ${index + 1}: ${error.message}`);
    }
  });
}

function normalizeLabelSource(entry) {
  const source = String(entry?.labelSource || entry?.source || "").trim().toLowerCase();
  const candidateAllowed = process.env.SALT_VISUAL_ALLOW_CANDIDATE_LABELS === "1" &&
    candidateLabelSources.has(source) && entry?.candidateOnly === true;
  if ((!trustedLabelSources.has(source) && !candidateAllowed) || entry?.guess === true || entry?.isGuess === true) {
    throw new Error(`Every visual label must be human-reviewed or an explicitly enabled candidate label; rejected label source ${source || "missing"}.`);
  }
  return source;
}

async function buildTrainingManifest({ datasetPath, labelsManifest, minBytes }) {
  const entries = parseManifestText(await readFileWithRetry(resolve(labelsManifest), "utf8"));
  if (!entries.length) throw new Error("Visual training labels manifest has no records.");
  const productSplits = new Map();
  const imageHashes = new Set();
  const normalized = [];
  let uniqueBytes = 0;

  for (const [index, entry] of entries.entries()) {
    const image = String(entry?.image || entry?.path || entry?.imagePath || "").trim();
    const productId = String(entry?.productId || entry?.product || "").trim();
    const ruleId = String(entry?.ruleId || entry?.label || "").trim();
    if (!image || !productId || !ruleId) throw new Error(`Visual label ${index + 1} needs image, productId, and ruleId.`);
    const labelSource = normalizeLabelSource(entry);
    const extension = extname(image).toLowerCase();
    if (!allowedImageExtensions.has(extension)) throw new Error(`Unsupported visual training image type at ${image}.`);
    const imagePath = resolve(datasetPath, image);
    if (!isInside(imagePath, datasetPath)) throw new Error(`Visual training image escapes the dataset root: ${image}.`);
    const imageRealPath = await realpath(imagePath);
    if (!isInside(imageRealPath, datasetPath)) throw new Error(`Visual training image resolves outside the dataset root: ${image}.`);
    const imageStat = await lstat(imageRealPath);
    if (!imageStat.isFile()) throw new Error(`Visual training image is not a regular file: ${image}.`);
    const split = String(entry?.split || "").trim().toLowerCase() || assignSplit(productId);
    if (!["train", "validation", "test"].includes(split)) throw new Error(`Unsupported split ${split} for ${image}.`);
    const existingSplit = productSplits.get(productId);
    if (existingSplit && existingSplit !== split) throw new Error(`Product ${productId} appears in multiple dataset splits.`);
    productSplits.set(productId, split);
    const digest = await hashFile(imageRealPath);
    if (imageHashes.has(digest.sha256)) throw new Error(`Duplicate image content detected in visual training corpus: ${image}.`);
    imageHashes.add(digest.sha256);
    uniqueBytes += digest.bytes;
    normalized.push({
      image: relative(datasetPath, imageRealPath),
      imageSha256: digest.sha256,
      bytes: digest.bytes,
      productId,
      ruleId,
      split,
      labelSource,
      ...(entry?.candidateOnly === true ? { candidateOnly: true } : {}),
    });
  }

  if (uniqueBytes < minBytes) {
    throw new Error(`Visual training corpus contains ${uniqueBytes} unique bytes; required minimum is ${minBytes}.`);
  }
  const labelIndex = buildVisualTaxonomyLabelIndex(normalized.map((entry) => entry.ruleId));
  const sorted = normalized.sort((left, right) => `${left.productId}\n${left.image}`.localeCompare(`${right.productId}\n${right.image}`));
  return {
    entries: sorted,
    labelIndex,
    imageCount: sorted.length,
    productCount: productSplits.size,
    labelCount: labelIndex.length,
    bytes: uniqueBytes,
    manifestSha256: sha256Text(sorted.map((entry) => JSON.stringify(entry)).join("\n")),
  };
}

async function writeJsonLines(path, entries) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
  await rename(temporaryPath, path);
}

async function runEncoder(args, manifestPath, datasetPath, embeddingsPath, checkpointPath) {
  if (!args.encoderCommandJson) return;
  let command;
  try {
    command = JSON.parse(args.encoderCommandJson);
  } catch (error) {
    throw new Error(`--encoder-command-json must be a JSON array: ${error.message}`);
  }
  if (!Array.isArray(command) || !command.length || command.some((part) => typeof part !== "string" || !part)) {
    throw new Error("--encoder-command-json must be a non-empty string array.");
  }
  const [executable, ...prefixArgs] = command;
  const progressPath = `${embeddingsPath}.progress.json`;
  process.stdout.write(`Encoding ${manifestPath} with declared encoder ${executable} on the supplied corpus.\n`);
  await execFileAsync(executable, [...prefixArgs, manifestPath, datasetPath, embeddingsPath], {
    cwd: rootDir,
    env: {
      ...process.env,
      SALT_VISUAL_BASE_CHECKPOINT: checkpointPath,
      SALT_VISUAL_ENCODER_CHECKPOINT: checkpointPath,
      SALT_VISUAL_TRAINING_PROGRESS_PATH: progressPath,
      SALT_VISUAL_TRAINING_SHARD_ID: embeddingsPath,
      SALT_VISUAL_REQUIRE_METAL: "1",
      PYTHONUNBUFFERED: "1",
    },
    maxBuffer: 32 * 1024 * 1024,
  });
}

async function runEncoderFineTuning(
  args,
  manifestPath,
  datasetPath,
  labelsPath,
  baseCheckpointPath,
  outputCheckpointPath,
  manifestSha256,
  {
    resumeCheckpointPath = "",
    resumeEntriesProcessed = 0,
    resumeSteps = 0,
  } = {},
) {
  let command;
  try {
    command = JSON.parse(args.encoderTrainCommandJson);
  } catch (error) {
    throw new Error(`--encoder-train-command-json must be a JSON array: ${error.message}`);
  }
  if (!Array.isArray(command) || !command.length || command.some((part) => typeof part !== "string" || !part)) {
    throw new Error("--encoder-train-command-json must be a non-empty string array.");
  }
  if (command[0] === "precomputed-embeddings") {
    throw new Error("Precomputed embeddings cannot fine-tune an image encoder.");
  }
  const outputPath = resolve(outputCheckpointPath);
  if (outputPath === resolve(baseCheckpointPath)) {
    throw new Error("The fine-tuned encoder checkpoint must not overwrite the base encoder checkpoint.");
  }
  if (isInside(outputPath, datasetPath)) {
    throw new Error("The fine-tuned encoder checkpoint cannot be stored inside the raw corpus that will be purged.");
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await rm(outputPath, { force: true });
  const reportPath = `${outputPath}.training.json`;
  await rm(reportPath, { force: true });
  const progressPath = `${outputPath}.progress.json`;
  await rm(progressPath, { force: true });
  const baseCheckpointSha256 = (await hashFile(baseCheckpointPath)).sha256;
  const [executable, ...prefixArgs] = command;
  process.stdout.write(`Fine-tuning the image encoder with ${executable} on Metal/MLX.\n`);
  try {
    await execFileAsync(executable, [...prefixArgs, manifestPath, datasetPath, labelsPath, baseCheckpointPath, outputPath], {
      cwd: rootDir,
      env: {
        ...process.env,
        SALT_VISUAL_BASE_CHECKPOINT: baseCheckpointPath,
        SALT_VISUAL_FINE_TUNED_ENCODER_CHECKPOINT: outputPath,
        SALT_VISUAL_TRAINING_MANIFEST_SHA256: manifestSha256,
        SALT_VISUAL_TRAINING_PROGRESS_PATH: progressPath,
        SALT_VISUAL_TRAINING_SHARD_ID: outputPath,
        SALT_VISUAL_ENCODER_PARTIAL_CHECKPOINT: `${outputPath}.partial.npz`,
        SALT_VISUAL_ENCODER_RESUME_ENTRIES_PROCESSED: String(Math.max(0, Number(resumeEntriesProcessed) || 0)),
        SALT_VISUAL_ENCODER_RESUME_STEPS: String(Math.max(0, Number(resumeSteps) || 0)),
        ...(resumeCheckpointPath ? { SALT_VISUAL_ENCODER_RESUME_CHECKPOINT: resolve(resumeCheckpointPath) } : {}),
        SALT_VISUAL_REQUIRE_METAL: "1",
        SALT_VISUAL_REQUIRE_FINE_TUNING: "1",
        PYTHONUNBUFFERED: "1",
      },
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    await writeFile(progressPath, `${JSON.stringify({
      status: "failed",
      device: "metal",
      shard: outputPath,
      updatedAt: new Date().toISOString(),
      error: error?.message || String(error),
    }, null, 2)}\n`, "utf8");
    throw error;
  }
  const outputStat = await stat(outputPath);
  if (!outputStat.isFile() || outputStat.size <= 0) {
    throw new Error(`The encoder fine-tuning command did not produce a non-empty checkpoint: ${outputPath}`);
  }
  const outputDigest = await hashFile(outputPath);
  let report;
  try {
    report = JSON.parse(await readFileWithRetry(reportPath, "utf8"));
  } catch (error) {
    throw new Error(`The encoder fine-tuning command did not produce its signed report at ${reportPath}: ${error.message}`);
  }
  if (report?.fineTuned !== true || report?.device !== "metal") {
    throw new Error("The encoder fine-tuning report must prove fineTuned=true and device=metal.");
  }
  if (report?.datasetManifestSha256 !== manifestSha256) {
    throw new Error("The encoder fine-tuning report does not match the signed dataset manifest.");
  }
  if (report?.baseCheckpointSha256 !== baseCheckpointSha256 || report?.outputCheckpointSha256 !== outputDigest.sha256) {
    throw new Error("The encoder fine-tuning report checksum evidence does not match the supplied checkpoints.");
  }
  if (!Number.isInteger(Number(report?.steps)) || Number(report.steps) <= 0) {
    throw new Error("The encoder fine-tuning report must contain positive training steps.");
  }
  await rm(`${outputPath}.partial.npz`, { force: true });
  await rm(`${outputPath}.partial.npz.json`, { force: true });
  return {
    path: outputPath,
    ...outputDigest,
    fineTuning: {
      steps: Number(report.steps),
      device: "metal",
      datasetManifestSha256: manifestSha256,
      reportPath,
      reportSha256: (await hashFile(reportPath)).sha256,
    },
  };
}

async function validateEmbeddings({ embeddingsPath, manifest, outputPath }) {
  const byHash = new Map(manifest.entries.map((entry) => [entry.imageSha256, entry]));
  const seen = new Set();
  let dimension = 0;
  let records = 0;
  await access(embeddingsPath);
  // Resume-safe runs may enter validation before the records directory exists.
  await mkdir(dirname(outputPath), { recursive: true });
  const output = `${outputPath}.tmp-${process.pid}`;
  const handle = await import("node:fs/promises").then(({ open }) => open(output, "w"));
  try {
    const input = createInterface({ input: createReadStream(embeddingsPath), crlfDelay: Infinity });
    for await (const line of input) {
      if (!line.trim()) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid encoder output JSONL near record ${records + 1}: ${error.message}`);
      }
      const imageSha256 = String(record?.imageSha256 || record?.sha256 || "").trim();
      const expected = byHash.get(imageSha256);
      if (!expected) throw new Error(`Encoder output references an image not in the checked manifest: ${imageSha256 || "missing hash"}.`);
      if (seen.has(imageSha256)) throw new Error(`Encoder emitted duplicate embedding for ${imageSha256}.`);
      const embedding = Array.isArray(record?.embedding) ? record.embedding : [];
      if (embedding.length < 8 || embedding.some((value) => !Number.isFinite(Number(value)))) {
        throw new Error(`Encoder emitted an invalid embedding for ${expected.image}.`);
      }
      if (!dimension) dimension = embedding.length;
      if (embedding.length !== dimension) throw new Error("Encoder emitted inconsistent embedding dimensions.");
      const productId = String(record?.productId || expected.productId);
      const ruleId = String(record?.ruleId || expected.ruleId);
      const split = String(record?.split || expected.split);
      if (productId !== expected.productId || ruleId !== expected.ruleId || split !== expected.split) {
        throw new Error(`Encoder metadata disagrees with the signed training manifest for ${expected.image}.`);
      }
      await handle.write(`${JSON.stringify({ imageSha256, productId, ruleId, split, embedding: embedding.map(Number) })}\n`);
      seen.add(imageSha256);
      records += 1;
    }
    if (records !== manifest.imageCount) throw new Error(`Encoder produced ${records}/${manifest.imageCount} embeddings.`);
  } finally {
    await handle.close();
  }
  await rename(output, outputPath);
  return { records, embeddingDimensions: dimension };
}

async function runMlxTraining({ recordsPath, weightsPath, metricsPath, labelsPath, checkpointPath, checkpointMetadataPath, manifestSha256 }) {
  const python = process.env.SALT_VISUAL_MLX_PYTHON || "python3";
  process.stdout.write(`Training the visual taxonomy head with ${python} and Metal/MLX.\n`);
  await execFileAsync(python, [backendPath, recordsPath, weightsPath, metricsPath, labelsPath, "--metal"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      SALT_VISUAL_REQUIRE_METAL: "1",
      SALT_VISUAL_TRAINING_CHECKPOINT_PATH: checkpointPath,
      SALT_VISUAL_TRAINING_CHECKPOINT_METADATA_PATH: checkpointMetadataPath,
      SALT_VISUAL_TRAINING_MANIFEST_SHA256: manifestSha256,
    },
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(await readFileWithRetry(metricsPath, "utf8"));
}

async function purgeRawCorpus(datasetPath, marker) {
  const markerPath = resolve(datasetPath, datasetMarkerName);
  const currentMarker = JSON.parse(await readFileWithRetry(markerPath, "utf8"));
  if (currentMarker?.datasetId !== marker.datasetId || currentMarker?.deleteAfterTraining !== true) {
    throw new Error("Raw corpus marker changed before purge; refusing deletion.");
  }
  await rm(datasetPath, { recursive: true, force: false });
  try {
    await lstat(datasetPath);
    throw new Error(`Raw corpus still exists after purge: ${datasetPath}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function readJsonIfPresent(path) {
  try {
    return JSON.parse(await readFileWithRetry(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeCompletionRecord({ completionPath, modelPath, weightsPath, journal, model }) {
  const modelDigest = await hashFile(modelPath);
  const weightsDigest = await hashFile(weightsPath);
  await writeJsonAtomic(completionPath, {
    status: "verified",
    modelPath: relative(rootDir, modelPath),
    modelSha256: modelDigest.sha256,
    weightsPath: relative(rootDir, weightsPath),
    weightsSha256: weightsDigest.sha256,
    datasetId: journal.datasetId,
    datasetBytes: journal.datasetBytes,
    imageCount: journal.imageCount,
    productCount: journal.productCount,
    labelCount: journal.labelCount,
    rawDataPurged: model.retention.rawDataPurged,
    purgedBytes: model.retention.purgedBytes,
    purgedImageCount: model.retention.purgedImageCount,
    purgedDatasetRoot: journal.datasetPath,
    completedAt: new Date().toISOString(),
  });
}

async function assertPurgeReady({ journal, modelPath, weightsPath }) {
  const model = JSON.parse(await readFileWithRetry(modelPath, "utf8"));
  const taxonomyFingerprint = taxonomyTrainingFingerprint(getCatalogTaxonomyDefinitions());
  await assertVisualTaxonomyModel(model, {
    taxonomyVersion: CATALOG_TAXONOMY_VERSION,
    taxonomyFingerprint,
    weightsPath,
  });
  if (model.dataset?.datasetId !== journal.datasetId
    || Number(model.dataset?.bytes) !== Number(journal.datasetBytes)
    || Number(model.dataset?.imageCount) !== Number(journal.imageCount)
    || Number(model.dataset?.productCount) !== Number(journal.productCount)
    || Number(model.dataset?.labelCount) !== Number(journal.labelCount)
    || model.dataset?.manifestSha256 !== journal.manifestSha256) {
    throw new Error("Visual taxonomy purge journal does not match the verified model dataset; refusing deletion.");
  }
  if (journal.status === "pending" && model.retention?.rawDataPurged === true) {
    throw new Error("Visual taxonomy model claims raw-data purge while the purge journal is pending; refusing deletion.");
  }
  const weightsDigest = await hashFile(weightsPath);
  if (weightsDigest.sha256 !== model.weights?.sha256 || weightsDigest.bytes !== Number(model.weights?.bytes)) {
    throw new Error("Visual taxonomy weights changed after model verification; refusing deletion.");
  }
  if (journal.status === "pending" && journal.modelSha256) {
    const modelDigest = await hashFile(modelPath);
    if (modelDigest.sha256 !== journal.modelSha256) {
      throw new Error("Visual taxonomy model changed after the purge journal was written; refusing deletion.");
    }
  }
  if (journal.weightsSha256 && journal.weightsSha256 !== weightsDigest.sha256) {
    throw new Error("Visual taxonomy purge journal has stale weight checksum evidence; refusing deletion.");
  }
  return model;
}

async function finalizePurgedModel({ completionPath, journal, modelPath, weightsPath }) {
  const expectedPaths = {
    modelPath: resolve(modelPath),
    weightsPath: resolve(weightsPath),
    completionPath: resolve(completionPath),
  };
  for (const [name, expected] of Object.entries(expectedPaths)) {
    if (resolve(journal[name]) !== expected) {
      throw new Error(`Visual taxonomy purge journal path mismatch for ${name}; refusing finalization.`);
    }
  }
  const model = JSON.parse(await readFileWithRetry(modelPath, "utf8"));
  if (model?.dataset?.datasetId !== journal.datasetId || model?.dataset?.manifestSha256 !== journal.manifestSha256) {
    throw new Error("Visual taxonomy purge journal does not match the trained model manifest; refusing finalization.");
  }
  const taxonomyFingerprint = taxonomyTrainingFingerprint(getCatalogTaxonomyDefinitions());
  model.retention = {
    ...model.retention,
    rawDataPurged: true,
    purgedBytes: journal.datasetBytes,
    purgedImageCount: journal.imageCount,
    purgedAt: journal.purgedAt || new Date().toISOString(),
    purgedDatasetRoot: journal.datasetPath,
  };
  await writeJsonAtomic(modelPath, model);
  await assertVisualTaxonomyModel(model, {
    taxonomyVersion: CATALOG_TAXONOMY_VERSION,
    taxonomyFingerprint,
    requireRawDataPurged: true,
    weightsPath,
  });
  await writeCompletionRecord({ completionPath, modelPath, weightsPath, journal, model });
  const trainingCheckpointPath = resolve(outputDir, `.visual-taxonomy-training-${journal.manifestSha256}-l2-balanced-adam-v2.checkpoint.npz`);
  await rm(trainingCheckpointPath, { force: true });
  await rm(`${trainingCheckpointPath}.json`, { force: true });
  await rm(defaultPurgeJournalPath, { force: true });
  process.stdout.write(`Verified visual taxonomy model at ${modelPath}; raw corpus purged=true.\n`);
}

async function recoverPendingPurge({ completionPath, modelPath, weightsPath }) {
  const journal = await readJsonIfPresent(defaultPurgeJournalPath);
  if (!journal) return false;
  if (!["pending", "purged"].includes(journal.status) || !journal.datasetPath || !journal.datasetId || !journal.manifestSha256) {
    throw new Error(`Visual taxonomy purge journal is incomplete at ${defaultPurgeJournalPath}; refusing recovery.`);
  }
  const rootPath = await realpath(rootDir);
  const datasetPath = resolve(journal.datasetPath);
  if (datasetPath === rootPath || isInside(datasetPath, rootPath)) {
    throw new Error(`Refusing to recover a purge inside the SALT project: ${datasetPath}`);
  }
  const expected = {
    modelPath: resolve(modelPath),
    weightsPath: resolve(weightsPath),
    completionPath: resolve(completionPath),
  };
  for (const [name, path] of Object.entries(expected)) {
    if (resolve(journal[name]) !== path) {
      throw new Error(`Visual taxonomy purge journal belongs to different ${name}; refusing recovery.`);
    }
  }
  await assertPurgeReady({ journal, modelPath, weightsPath });
  try {
    await lstat(datasetPath);
    const marker = JSON.parse(await readFileWithRetry(resolve(datasetPath, datasetMarkerName), "utf8"));
    if (marker?.datasetId !== journal.datasetId || marker?.deleteAfterTraining !== true) {
      throw new Error("Raw corpus marker does not match the pending purge journal; refusing deletion.");
    }
    await purgeRawCorpus(datasetPath, marker);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await writeJsonAtomic(defaultPurgeJournalPath, {
    ...journal,
    status: "purged",
    purgedAt: journal.purgedAt || new Date().toISOString(),
  });
  await finalizePurgedModel({ completionPath, journal: { ...journal, status: "purged" }, modelPath, weightsPath });
  return true;
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.recoverPurge) {
    await recoverPendingPurge({
      completionPath: resolve(args.completionOutput),
      modelPath: resolve(args.output),
      weightsPath: resolve(args.weightsOutput),
    });
    return;
  }
  assertRequiredArgs(args);
  const { datasetPath, marker } = await assertSafeDatasetRoot(args.datasetDir);
  const labelsManifest = await realpath(resolve(args.labelsManifest));
  const checkpointPath = await assertCheckpoint(args.baseCheckpoint, datasetPath);
    const modelPath = resolve(args.output);
    const weightsPath = resolve(args.weightsOutput);
    const completionPath = resolve(args.completionOutput);
  const trainingWorkDir = resolve(outputDir, `.visual-taxonomy-training-${process.pid}`);
  const signedManifestPath = resolve(trainingWorkDir, "training-manifest.jsonl");
    const recordsPath = resolve(trainingWorkDir, "embeddings.jsonl");
    const embeddingsPath = resolve(trainingWorkDir, "encoder-embeddings.jsonl");
    const metricsPath = resolve(trainingWorkDir, "metrics.json");
    const labelsPath = resolve(trainingWorkDir, "labels.json");
  await mkdir(trainingWorkDir, { recursive: true });

  try {
    const manifest = await buildTrainingManifest({ datasetPath, labelsManifest, minBytes: args.minBytes });
    await writeJsonLines(signedManifestPath, manifest.entries);
    await writeJsonAtomic(labelsPath, manifest.labelIndex);
    const fineTunedEncoder = await runEncoderFineTuning(
      args,
      signedManifestPath,
      datasetPath,
      labelsPath,
      checkpointPath,
      args.fineTunedCheckpointOutput,
      manifest.manifestSha256,
    );
    await runEncoder(args, signedManifestPath, datasetPath, embeddingsPath, fineTunedEncoder.path);
    const embeddingSummary = await validateEmbeddings({ embeddingsPath, manifest, outputPath: recordsPath });
    const trainingCheckpointPath = resolve(outputDir, `.visual-taxonomy-training-${manifest.manifestSha256}-l2-balanced-adam-v2.checkpoint.npz`);
    const trainingCheckpointMetadataPath = `${trainingCheckpointPath}.json`;
    const metrics = await runMlxTraining({
      recordsPath,
      weightsPath,
      metricsPath,
      labelsPath,
      checkpointPath: trainingCheckpointPath,
      checkpointMetadataPath: trainingCheckpointMetadataPath,
      manifestSha256: manifest.manifestSha256,
    });
    const weightsDigest = await hashFile(weightsPath);
    const taxonomyFingerprint = taxonomyTrainingFingerprint(getCatalogTaxonomyDefinitions());
    const model = {
      schemaVersion: VISUAL_TAXONOMY_MODEL_SCHEMA_VERSION,
      modelVersion: VISUAL_TAXONOMY_MODEL_VERSION,
      modelType: VISUAL_TAXONOMY_MODEL_TYPE,
      backend: VISUAL_TAXONOMY_MODEL_BACKEND,
      trained: true,
      taxonomy: {
        version: CATALOG_TAXONOMY_VERSION,
        fingerprint: taxonomyFingerprint,
        labels: manifest.labelIndex,
      },
      dataset: {
        datasetId: marker.datasetId,
        bytes: manifest.bytes,
        imageCount: manifest.imageCount,
        productCount: manifest.productCount,
        labelCount: manifest.labelCount,
        manifestSha256: manifest.manifestSha256,
        splitPolicy: "deterministic product-group split; no product or image crosses splits",
      },
      encoder: {
        fineTuned: true,
        baseCheckpointPath: checkpointPath,
        baseCheckpointSha256: (await hashFile(checkpointPath)).sha256,
        fineTunedCheckpointPath: fineTunedEncoder.path,
        fineTunedCheckpointSha256: fineTunedEncoder.sha256,
        fineTuning: fineTunedEncoder.fineTuning,
        command: JSON.parse(args.encoderCommandJson),
        trainCommand: JSON.parse(args.encoderTrainCommandJson),
      },
      training: {
        records: embeddingSummary.records,
        embeddingDimensions: embeddingSummary.embeddingDimensions,
        device: String(metrics.device || "metal"),
        precision: String(metrics.precision || "float16"),
        epochs: Number(metrics.epochs || 0),
        batchSize: Number(metrics.batchSize || 0),
        metrics: metrics.metrics || metrics,
        completedAt: new Date().toISOString(),
        resourcePolicy: "streamed corpus; OS-managed swap only; no system swap modification",
      },
      weights: {
        path: relative(rootDir, weightsPath),
        sha256: weightsDigest.sha256,
        bytes: weightsDigest.bytes,
      },
      retention: {
        rawDataPurged: false,
        purgedBytes: 0,
        purgedImageCount: 0,
        rawDataPolicy: "purge the explicitly marked corpus after artifact and metrics verification",
      },
    };
    await writeJsonAtomic(modelPath, model);
    await assertVisualTaxonomyModel(model, {
      taxonomyVersion: CATALOG_TAXONOMY_VERSION,
      taxonomyFingerprint,
      weightsPath,
    });

    const purgeJournal = {
      status: "pending",
      datasetPath,
      datasetId: marker.datasetId,
      datasetBytes: manifest.bytes,
      imageCount: manifest.imageCount,
      productCount: manifest.productCount,
      labelCount: manifest.labelCount,
      manifestSha256: manifest.manifestSha256,
      modelPath,
      weightsPath,
      completionPath,
      trainingCheckpointPath,
      modelSha256: (await hashFile(modelPath)).sha256,
      weightsSha256: weightsDigest.sha256,
      createdAt: new Date().toISOString(),
    };
    await writeJsonAtomic(defaultPurgeJournalPath, purgeJournal);
    await purgeRawCorpus(datasetPath, marker);
    const purgedJournal = { ...purgeJournal, status: "purged", purgedAt: new Date().toISOString() };
    await writeJsonAtomic(defaultPurgeJournalPath, purgedJournal);
    await finalizePurgedModel({ completionPath, journal: purgedJournal, modelPath, weightsPath });
  } finally {
    await rm(trainingWorkDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

export {
  assignSplit,
  assertPurgeReady,
  buildTrainingManifest,
  isInside,
  purgeRawCorpus,
  runEncoder,
  runEncoderFineTuning,
  runMlxTraining,
  validateEmbeddings,
};
