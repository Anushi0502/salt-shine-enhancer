#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  mkdir,
  realpath,
  rename,
  rm,
  stat,
  statfs,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, resolve, sep } from "node:path";
import { readFileWithRetry } from "./reliable-file-read.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const allowedImageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".heic"]);
const trustedLabelSources = new Set(["human", "human-reviewed", "verified", "curated", "approved"]);
const candidateLabelSources = new Set(["deterministic-candidate", "external-human-verified-candidate"]);
const markerName = ".salt-visual-corpus.json";
const progressName = ".salt-visual-staging-progress.json";
// Staging is network-bound; keep it bounded, but do not leave throughput
// artificially capped at eight workers on machines that can sustain more.
const defaultConcurrency = Math.max(1, Math.min(24, Number(process.env.SALT_VISUAL_STAGING_CONCURRENCY || 16)));
const progressCheckpointInterval = Math.max(
  16,
  Math.min(2_048, Number(process.env.SALT_VISUAL_STAGING_PROGRESS_INTERVAL || 128)),
);
const progressCheckpointMs = Math.max(
  1_000,
  Number(process.env.SALT_VISUAL_STAGING_PROGRESS_MS || 5_000),
);
// A single CDN/DNS hiccup must not abort an entire shard. Completed entries
// remain checkpointed, while this bounded retry budget absorbs short outages.
const requestAttempts = Math.max(1, Math.min(8, Number(process.env.SALT_VISUAL_STAGING_ATTEMPTS || 6)));
const requestTimeoutMs = Math.max(5_000, Number(process.env.SALT_VISUAL_STAGING_TIMEOUT_MS || 60_000));
const maxRetryDelayMs = Math.max(1_000, Math.min(120_000, Number(process.env.SALT_VISUAL_STAGING_MAX_RETRY_DELAY_MS || 30_000)));
const defaultMaxShardBytes = Math.max(
  1_000_000_000,
  Number(process.env.SALT_VISUAL_STAGING_MAX_SHARD_BYTES || 25_000_000_000),
);
const maximumShardBytes = 25_000_000_000;
const minimumFreeOverheadBytes = Math.max(
  2 * 1024 ** 3,
  Number(process.env.SALT_VISUAL_STAGING_FREE_OVERHEAD_BYTES || 8 * 1024 ** 3),
);
function parseArgs(argv) {
  const args = {
    sourceManifest: process.env.SALT_VISUAL_TRAINING_SOURCE_MANIFEST || "",
    datasetDir: process.env.SALT_VISUAL_TRAINING_DATASET_DIR || "",
    labelsOutput: process.env.SALT_VISUAL_TRAINING_STAGED_LABELS_MANIFEST || "",
    maxShardBytes: defaultMaxShardBytes,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (!["--source-manifest", "--dataset-dir", "--labels-output", "--max-shard-bytes"].includes(token)) {
      throw new Error(`Unknown argument: ${token}`);
    }
    if (!next) throw new Error(`Missing value for ${token}.`);
    if (token === "--source-manifest") args.sourceManifest = next;
    if (token === "--dataset-dir") args.datasetDir = next;
    if (token === "--labels-output") args.labelsOutput = next;
    if (token === "--max-shard-bytes") args.maxShardBytes = Number(next);
    index += 1;
  }
  for (const [name, value] of Object.entries({
    "--source-manifest": args.sourceManifest,
    "--dataset-dir": args.datasetDir,
  })) {
    if (!String(value || "").trim()) throw new Error(`${name} is required.`);
  }
  if (!args.labelsOutput) args.labelsOutput = `${resolve(args.datasetDir)}.labels.jsonl`;
  if (!Number.isInteger(args.maxShardBytes) || args.maxShardBytes <= 0 || args.maxShardBytes > maximumShardBytes) {
    throw new Error(`--max-shard-bytes must be between 1 byte and ${maximumShardBytes} bytes (25 GB).`);
  }
  return args;
}

function isInside(child, parent) {
  const value = resolve(child);
  const boundary = resolve(parent);
  return value === boundary || value.startsWith(`${boundary}${sep}`);
}

function parseManifestText(raw) {
  const text = String(raw || "").trim();
  if (!text) throw new Error("Visual staging manifest is empty.");
  if (text.startsWith("[")) {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("Visual staging manifest must be an array or JSONL.");
    return parsed;
  }
  return text.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid visual staging manifest JSONL at line ${index + 1}: ${error.message}`);
    }
  });
}

function imageExtension(entry, source) {
  const candidate = extname(String(entry?.image || entry?.target || source || "").split("?")[0]).toLowerCase();
  if (!allowedImageExtensions.has(candidate)) throw new Error(`Unsupported visual staging image type: ${candidate || "missing"}.`);
  return candidate;
}

function sanitize(value) {
  return String(value || "product").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 100) || "product";
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function hashFile(path) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { sha256: hash.digest("hex"), bytes };
}

async function filesystemStats(path) {
  let probe = resolve(path);
  while (true) {
    try {
      return await statfs(probe);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = dirname(probe);
      if (parent === probe) throw error;
      probe = parent;
    }
  }
}

function formatBytes(bytes) {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = Number(bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

async function countVerifiedExistingBytes(entries, datasetPath) {
  const verified = await mapWithConcurrency(entries, defaultConcurrency, async (entry) => {
    const outputPath = resolve(datasetPath, entry.target);
    try {
      const existing = await stat(outputPath);
      if (!existing.isFile() || existing.size !== entry.bytes) return 0;
      const digest = await hashFile(outputPath);
      return digest.sha256 === entry.sha256 && digest.bytes === entry.bytes ? entry.bytes : 0;
    } catch (error) {
      if (error?.code === "ENOENT") return 0;
      throw error;
    }
  });
  return verified.reduce((total, bytes) => total + bytes, 0);
}

async function assertStagingDiskCapacity(datasetPath, expectedBytes, entries) {
  const filesystem = await filesystemStats(datasetPath);
  const availableBytes = Number(filesystem.bavail) * Number(filesystem.bsize);
  let reusableBytes = 0;
  if (availableBytes < Number(expectedBytes) + minimumFreeOverheadBytes) {
    reusableBytes = await countVerifiedExistingBytes(entries, datasetPath);
  }
  const missingBytes = Math.max(0, Number(expectedBytes) - reusableBytes);
  const requiredBytes = missingBytes + (missingBytes > 0 ? minimumFreeOverheadBytes : 0);
  if (availableBytes < requiredBytes) {
    throw new Error(
      `Insufficient free space for the visual corpus: ${formatBytes(availableBytes)} available, `
      + `${formatBytes(missingBytes)} of images still need staging plus ${formatBytes(minimumFreeOverheadBytes)} required staging headroom. `
      + "Use an external volume with enough free space; the workflow will not fill the system disk.",
    );
  }
  return { availableBytes, expectedBytes: Number(expectedBytes), reusableBytes, missingBytes };
}

function planVisualCorpusShards(entries, { maxShardBytes = defaultMaxShardBytes, targetBytes = 50_000_000_000 } = {}) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error("Visual shard planning needs at least one entry.");
  if (!Number.isInteger(maxShardBytes) || maxShardBytes <= 0 || maxShardBytes > maximumShardBytes) {
    throw new Error(`Visual shard max bytes must be between 1 byte and ${maximumShardBytes} bytes (25 GB).`);
  }
  if (!Number.isInteger(targetBytes) || targetBytes <= 0) throw new Error("Visual shard target bytes must be a positive integer.");

  const shards = [];
  let current = [];
  let currentBytes = 0;
  let totalBytes = 0;
  const sourceBytesAvailable = entries.reduce((sum, entry) => sum + Number(entry?.bytes || 0), 0);
  for (const entry of entries) {
    const bytes = Number(entry?.bytes || 0);
    if (!Number.isInteger(bytes) || bytes <= 0) throw new Error("Every visual shard entry needs a positive byte count.");
    if (bytes > maxShardBytes) {
      throw new Error(`Visual image ${entry.image || entry.source || entry.sha256 || "unknown"} is larger than the ${maxShardBytes}-byte shard cap.`);
    }
    if (current.length && currentBytes + bytes > maxShardBytes) {
      shards.push({ entries: current, bytes: currentBytes });
      current = [];
      currentBytes = 0;
    }
    current.push(entry);
    currentBytes += bytes;
    totalBytes += bytes;
    if (totalBytes >= targetBytes) break;
  }
  if (current.length) shards.push({ entries: current, bytes: currentBytes });
  const plannedBytes = shards.reduce((sum, shard) => sum + shard.bytes, 0);
  if (plannedBytes < targetBytes) {
    throw new Error(`Visual shard plan contains ${plannedBytes} bytes; required target is ${targetBytes} bytes.`);
  }
  return {
    targetBytes,
    maxShardBytes,
    bytes: plannedBytes,
    sourceBytesAvailable,
    shards: shards.map((shard, index) => ({
      shardIndex: index + 1,
      bytes: shard.bytes,
      imageCount: shard.entries.length,
      entries: shard.entries,
    })),
  };
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFileWithRetry(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

async function assertSafePaths(args) {
  const requestedDatasetPath = resolve(args.datasetDir);
  if (isInside(requestedDatasetPath, rootDir)) throw new Error(`Refusing to stage raw visual data inside the SALT project: ${requestedDatasetPath}`);
  await mkdir(requestedDatasetPath, { recursive: true });
  const datasetPath = await realpath(requestedDatasetPath);
  if (isInside(datasetPath, rootDir)) throw new Error(`Refusing to stage raw visual data inside the SALT project: ${datasetPath}`);
  const labelsPath = resolve(args.labelsOutput);
  if (isInside(labelsPath, datasetPath)) throw new Error("The staged labels manifest must be outside the raw corpus so it can be retained for audit.");
  const sourcePath = await realpath(resolve(args.sourceManifest));
  if (isInside(sourcePath, datasetPath)) throw new Error("The raw visual corpus cannot contain its source manifest.");
  return { datasetPath, sourcePath };
}

function parseRetryAfterMs(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  if (/^\d+(?:\.\d+)?$/.test(text)) return Math.max(0, Number(text) * 1_000);
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : 0;
}

async function normalizeEntries(rawEntries, sourceManifestPath, datasetPath) {
  if (!rawEntries.length) throw new Error("Visual staging manifest has no records.");
  const sourceBase = dirname(sourceManifestPath);
  const seenTargets = new Set();
  const seenHashes = new Set();
  return rawEntries.map((entry, index) => {
    // Hydrated manifests carry a checksum-verified mirror; use it for staging
    // so training does not fall back to a rate-limited original host.
    const source = String(entry?.hydrationUrl || entry?.sourceUrl || entry?.sourcePath || entry?.url || entry?.source || "").trim();
    const productId = String(entry?.productId || entry?.product || "").trim();
    const ruleId = String(entry?.ruleId || entry?.label || "").trim();
    const labelSource = String(entry?.labelSource || "").trim().toLowerCase();
    const expectedSha256 = String(entry?.sha256 || entry?.imageSha256 || "").trim().toLowerCase();
    const expectedBytes = Number(entry?.bytes || entry?.size || 0);
    if (!source || !productId || !ruleId || !expectedSha256 || !/^[a-f0-9]{64}$/.test(expectedSha256)) {
      throw new Error(`Visual staging record ${index + 1} needs source, productId, ruleId, and a valid sha256.`);
    }
    const candidateAllowed = process.env.SALT_VISUAL_ALLOW_CANDIDATE_LABELS === "1" &&
      candidateLabelSources.has(labelSource) && entry?.candidateOnly === true;
    if ((!trustedLabelSources.has(labelSource) && !candidateAllowed) || entry?.guess === true || entry?.isGuess === true) {
      throw new Error(`Visual staging record ${index + 1} is not human-reviewed or an explicitly enabled candidate label.`);
    }
    if (!Number.isInteger(expectedBytes) || expectedBytes <= 0) throw new Error(`Visual staging record ${index + 1} needs a positive byte count.`);
    if (seenHashes.has(expectedSha256)) throw new Error(`Duplicate image checksum in visual staging manifest: ${expectedSha256}.`);
    seenHashes.add(expectedSha256);
    const extension = imageExtension(entry, source);
    const target = `images/${sanitize(productId)}-${expectedSha256.slice(0, 16)}${extension}`;
    if (seenTargets.has(target)) throw new Error(`Duplicate visual staging target: ${target}.`);
    seenTargets.add(target);
    const localSource = /^https?:\/\//i.test(source) ? null : resolve(sourceBase, source);
    if (localSource && isInside(localSource, datasetPath)) throw new Error(`Visual source cannot be inside the target corpus: ${source}.`);
    return {
      source,
      localSource,
      target,
      productId,
      ruleId,
      labelSource,
      ...(candidateAllowed ? { candidateOnly: true } : {}),
      split: String(entry?.split || "").trim().toLowerCase() || undefined,
      sha256: expectedSha256,
      bytes: expectedBytes,
    };
  });
}

function concatenateBytes(chunks, totalBytes) {
  const output = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function fetchBytes(url, expectedBytes = 0) {
  let lastError = null;
  const chunks = [];
  let receivedBytes = 0;
  const expected = Number(expectedBytes || 0);

  for (let attempt = 1; attempt <= requestAttempts; attempt += 1) {
    const rangeStart = receivedBytes;
    const attemptChunks = [];
    let attemptBytes = 0;
    let preservePartial = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const headers = { Accept: "image/avif,image/webp,image/jpeg,image/png,*/*" };
      if (rangeStart > 0) headers.Range = `bytes=${rangeStart}-`;
      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });
      if (!response.ok) {
        const retryAfter = response.headers.get("retry-after");
        const error = new Error(`image HTTP ${response.status}`);
        error.retryAfterMs = retryAfter ? parseRetryAfterMs(retryAfter) : 0;
        error.discardPartial = true;
        throw error;
      }

      // Some hosts ignore Range. Restart from the returned full body instead
      // of appending duplicate bytes to the verified partial response.
      if (rangeStart > 0 && response.status === 200) {
        chunks.length = 0;
        receivedBytes = 0;
      } else if (rangeStart > 0 && response.status !== 206) {
        const error = new Error(`image range request returned HTTP ${response.status}`);
        error.discardPartial = true;
        throw error;
      }
      if (response.status === 206) {
        const contentRange = String(response.headers.get("content-range") || "");
        const match = contentRange.match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i);
        const responseStart = Number(match?.[1]);
        const responseTotal = match?.[3] === "*" ? 0 : Number(match?.[3]);
        if (!match || responseStart !== rangeStart || (expected && responseTotal && responseTotal !== expected)) {
          const error = new Error(`image range response did not match requested offset ${rangeStart}`);
          error.discardPartial = true;
          throw error;
        }
      }

      const reader = response.body?.getReader();
      if (!reader) {
        const error = new Error("image response had no readable body");
        error.discardPartial = true;
        throw error;
      }
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
          if (!chunk.byteLength) continue;
          attemptChunks.push(chunk);
          attemptBytes += chunk.byteLength;
          if (expected && receivedBytes + attemptBytes > expected) {
            const error = new Error(`image response exceeded the expected ${expected} bytes`);
            error.discardPartial = true;
            throw error;
          }
        }
      } finally {
        reader.releaseLock?.();
      }

      if (!attemptBytes) throw new Error("image response was empty");
      chunks.push(...attemptChunks);
      receivedBytes += attemptBytes;
      if (!expected || receivedBytes === expected) return concatenateBytes(chunks, receivedBytes);
      lastError = new Error(`image response ended at ${receivedBytes}/${expected} bytes`);
    } catch (error) {
      lastError = error;
      preservePartial = error?.discardPartial !== true;
      if (preservePartial && attemptBytes) {
        chunks.push(...attemptChunks);
        receivedBytes += attemptBytes;
      }
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < requestAttempts) {
      const exponentialDelay = Math.min(maxRetryDelayMs, 250 * 2 ** (attempt - 1));
      const serverDelay = Number(lastError?.retryAfterMs || 0);
      const jitter = Math.floor(Math.random() * Math.max(1, Math.min(1_000, exponentialDelay / 2)));
      const delay = Math.min(maxRetryDelayMs, Math.max(exponentialDelay, serverDelay) + jitter);
      await new Promise((resolveSleep) => setTimeout(resolveSleep, delay));
    }
  }
  throw lastError || new Error("image download failed");
}

async function stageEntry(entry, datasetPath) {
  const outputPath = resolve(datasetPath, entry.target);
  await mkdir(dirname(outputPath), { recursive: true });
  try {
    const existing = await stat(outputPath);
    if (existing.isFile() && existing.size === entry.bytes) {
      const digest = await hashFile(outputPath);
      if (digest.sha256 === entry.sha256 && digest.bytes === entry.bytes) return { ...entry, reused: true };
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const bytes = entry.localSource ? await readFileWithRetry(entry.localSource) : await fetchBytes(entry.source, entry.bytes);
  const digest = { sha256: sha256Bytes(bytes), bytes: bytes.byteLength };
  if (digest.sha256 !== entry.sha256 || digest.bytes !== entry.bytes) {
    throw new Error(`Checksum or byte count mismatch for ${entry.source}; expected ${entry.sha256}/${entry.bytes}, received ${digest.sha256}/${digest.bytes}.`);
  }
  const temporaryPath = `${outputPath}.part-${process.pid}`;
  await writeFile(temporaryPath, bytes);
  await rename(temporaryPath, outputPath);
  return { ...entry, reused: false };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function main() {
  const args = parseArgs(process.argv);
  const { datasetPath, sourcePath } = await assertSafePaths(args);
  const sourceBytes = await readFileWithRetry(sourcePath);
  const sourceManifestSha256 = sha256Bytes(sourceBytes);
  const entries = await normalizeEntries(parseManifestText(sourceBytes.toString("utf8")), sourcePath, datasetPath);
  const expectedBytes = entries.reduce((total, entry) => total + entry.bytes, 0);
  if (expectedBytes > args.maxShardBytes) {
    throw new Error(
      `This staging invocation contains ${formatBytes(expectedBytes)}, above the ${formatBytes(args.maxShardBytes)} shard cap. `
      + "Create a shard plan and stage one shard at a time.",
    );
  }
  const capacity = await assertStagingDiskCapacity(datasetPath, expectedBytes, entries);
  process.stdout.write(
    `Visual corpus capacity check: ${formatBytes(capacity.availableBytes)} free; `
    + `${formatBytes(capacity.missingBytes)} to stage; ${formatBytes(capacity.reusableBytes)} already verified.\n`,
  );
  const datasetId = `visual-corpus-${sourceManifestSha256.slice(0, 24)}`;
  const markerPath = resolve(datasetPath, markerName);
  const progressPath = resolve(datasetPath, progressName);
  await mkdir(datasetPath, { recursive: true });
  const existingMarker = await readJson(markerPath, null);
  if (existingMarker && (existingMarker.datasetId !== datasetId || existingMarker.sourceManifestSha256 !== sourceManifestSha256)) {
    throw new Error(`Target corpus already belongs to a different staging manifest: ${datasetPath}`);
  }
  await writeJsonAtomic(markerPath, {
    kind: "salt-visual-training-corpus",
    datasetId,
    sourceManifestSha256,
    deleteAfterTraining: true,
    status: "staging",
    stagedAt: existingMarker?.stagedAt || new Date().toISOString(),
  });
  const progress = await readJson(progressPath, { sourceManifestSha256, completed: {} });
  if (progress.sourceManifestSha256 && progress.sourceManifestSha256 !== sourceManifestSha256) {
    throw new Error("Visual staging progress belongs to a different source manifest.");
  }
  progress.completed ||= {};
  let completedSinceCheckpoint = 0;
  let lastProgressCheckpointAt = Date.now();
  let progressCheckpointPromise = Promise.resolve();
  const checkpointProgress = async (force = false) => {
    const due = force ||
      completedSinceCheckpoint >= progressCheckpointInterval ||
      Date.now() - lastProgressCheckpointAt >= progressCheckpointMs;
    if (!due) return;
    completedSinceCheckpoint = 0;
    lastProgressCheckpointAt = Date.now();
    progressCheckpointPromise = progressCheckpointPromise.then(() => writeJsonAtomic(progressPath, {
      sourceManifestSha256,
      completed: progress.completed,
      updatedAt: new Date().toISOString(),
    }));
    await progressCheckpointPromise;
  };
  const staged = await mapWithConcurrency(entries, defaultConcurrency, async (entry, index) => {
    const result = await stageEntry(entry, datasetPath);
    progress.completed[entry.sha256] = { target: entry.target, bytes: entry.bytes };
    completedSinceCheckpoint += 1;
    await checkpointProgress();
    if ((index + 1) % Math.max(1, Math.floor(entries.length / 20)) === 0 || index + 1 === entries.length) {
      process.stdout.write(`Visual corpus staging: ${index + 1}/${entries.length}\n`);
    }
    return result;
  });
  await checkpointProgress(true);
  const labels = staged.map((entry) => ({
    image: entry.target,
    productId: entry.productId,
    ruleId: entry.ruleId,
    labelSource: entry.labelSource,
    ...(entry.candidateOnly === true ? { candidateOnly: true } : {}),
    ...(entry.split ? { split: entry.split } : {}),
  }));
  await writeJsonAtomic(args.labelsOutput, labels);
  await writeJsonAtomic(markerPath, {
    kind: "salt-visual-training-corpus",
    datasetId,
    sourceManifestSha256,
    deleteAfterTraining: true,
    status: "ready",
    imageCount: staged.length,
    labelsPath: resolve(args.labelsOutput),
    stagedAt: existingMarker?.stagedAt || new Date().toISOString(),
    readyAt: new Date().toISOString(),
  });
  await rm(progressPath, { force: true });
  process.stdout.write(`Visual corpus ready at ${datasetPath}; ${staged.length} images staged and labels written to ${resolve(args.labelsOutput)}.\n`);
}

export { fetchBytes, normalizeEntries, parseManifestText, planVisualCorpusShards };

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
