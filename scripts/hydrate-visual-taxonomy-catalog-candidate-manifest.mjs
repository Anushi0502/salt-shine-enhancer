#!/usr/bin/env node

import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const outputDir = resolve(rootDir, "output");
const defaultSourcePath = resolve(outputDir, "visual-taxonomy-catalog-candidate-manifest.jsonl");
const defaultOutputPath = resolve(outputDir, "visual-taxonomy-catalog-candidate-hydrated-manifest.jsonl");
const defaultStatePath = resolve(outputDir, "visual-taxonomy-catalog-candidate-hydration-state.json");
const maxImageBytes = 50 * 1024 * 1024;
const requestAttempts = Math.max(1, Math.min(6, Number(process.env.SALT_VISUAL_CANDIDATE_FETCH_ATTEMPTS || 4)));
const requestTimeoutMs = Math.max(5_000, Number(process.env.SALT_VISUAL_CANDIDATE_FETCH_TIMEOUT_MS || 60_000));
const concurrency = Math.max(1, Math.min(64, Number(process.env.SALT_VISUAL_CANDIDATE_FETCH_CONCURRENCY || 16)));
const checkpointEvery = Math.max(10, Number(process.env.SALT_VISUAL_CANDIDATE_FETCH_CHECKPOINT_EVERY || 100));
const targetBytes = Math.max(1, Number(process.env.SALT_VISUAL_CANDIDATE_TARGET_BYTES || 50_000_000_000));

function parseArgs(argv) {
  const args = { source: defaultSourcePath, output: defaultOutputPath, state: defaultStatePath, target: targetBytes };
  const flags = new Map([["--source", "source"], ["--output", "output"], ["--state", "state"], ["--target-bytes", "target"]]);
  for (let index = 2; index < argv.length; index += 1) {
    const key = flags.get(argv[index]);
    const value = argv[index + 1];
    if (!key || value === undefined) throw new Error(`Expected --source, --output, --state, or --target-bytes value; got ${argv[index]}.`);
    args[key] = key === "target" ? Number(value) : value;
    index += 1;
  }
  if (!Number.isInteger(args.target) || args.target <= 0) throw new Error("--target-bytes must be a positive integer.");
  return Object.fromEntries(Object.entries(args).map(([key, value]) => [key, key === "target" ? value : resolve(value)]));
}

async function readJson(path, fallback = null) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function parseJsonl(text) {
  return String(text || "").trim().split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch (error) { throw new Error(`Invalid candidate manifest JSON at line ${index + 1}: ${error.message}`); }
  });
}

async function fetchBytes(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= requestAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "image/avif,image/webp,image/jpeg,image/png,*/*", "User-Agent": "SALT-visual-candidate-corpus/1.0" },
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      if (!response.ok) throw new Error(`image HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.byteLength) throw new Error("image response was empty");
      if (bytes.byteLength > maxImageBytes) throw new Error(`image exceeds ${maxImageBytes} byte safety cap`);
      return bytes;
    } catch (error) {
      lastError = error;
      if (attempt < requestAttempts) await new Promise((resolveSleep) => setTimeout(resolveSleep, Math.min(30_000, 500 * 2 ** (attempt - 1))));
    }
  }
  throw lastError || new Error("image download failed");
}

function candidateMirrorUrl(entry) {
  const evidence = entry?.sourceEvidence || {};
  if (evidence.dataset !== "Open Images V7") return "";
  const split = String(entry.split || "").trim().toLowerCase();
  const imageId = String(evidence.imageId || "").trim();
  if (!["train", "test", "validation"].includes(split) || !/^[a-f0-9]{16}$/i.test(imageId)) return "";
  return `https://open-images-dataset.s3.amazonaws.com/${split}/${imageId}.jpg`;
}

async function fetchCandidateImage(entry) {
  const mirror = candidateMirrorUrl(entry);
  const original = String(entry.sourceUrl || "").trim();
  const urls = [...new Set([mirror, original].filter(Boolean))];
  let lastError = null;
  for (const url of urls) {
    try {
      return { bytes: await fetchBytes(url), hydrationUrl: url, hydrationSource: url === entry.sourceUrl ? "original-source-url" : "cvdf-open-images-mirror" };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("candidate image has no usable source URL");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function determineHydrationStatus({ completed, sourceCount, totalBytes, targetBytes }) {
  if (Number(totalBytes) >= Number(targetBytes)) return "ready";
  if (Number(completed) >= Number(sourceCount)) return "source-exhausted";
  return "incomplete";
}

async function writeState(path, state) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

export async function hydrateCandidateManifest({ source, output, state, target = targetBytes } = {}) {
  const sourcePath = resolve(source || defaultSourcePath);
  const outputPath = resolve(output || defaultOutputPath);
  const statePath = resolve(state || defaultStatePath);
  const sourceText = await readFile(sourcePath, "utf8");
  const sourceSha256 = sha256(Buffer.from(sourceText));
  const sourceEntries = parseJsonl(sourceText);
  const prior = await readJson(statePath, null);
  if (prior && prior.sourceSha256 !== sourceSha256) throw new Error("Hydration state belongs to a different candidate manifest.");
  const hydrated = parseJsonl(await readFile(outputPath, "utf8").catch((error) => error?.code === "ENOENT" ? "" : Promise.reject(error)));
  const completed = new Map(hydrated.map((entry) => [`${entry.productId}\n${entry.sourceUrl}`, entry]));
  let totalBytes = hydrated.reduce((sum, entry) => sum + Number(entry.bytes || 0), 0);
  let failures = prior?.failures || [];
  const pending = sourceEntries.filter((entry) => !completed.has(`${entry.productId}\n${entry.sourceUrl}`));
  await mkdir(dirname(outputPath), { recursive: true });
  let sinceCheckpoint = 0;
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= pending.length || totalBytes >= target) return;
      const entry = pending[index];
      try {
        const fetched = await fetchCandidateImage(entry);
        const record = {
          ...entry,
          sha256: sha256(fetched.bytes),
          bytes: fetched.bytes.byteLength,
          hydrationUrl: fetched.hydrationUrl,
          hydrationSource: fetched.hydrationSource,
          hydratedAt: new Date().toISOString(),
        };
        await appendFile(outputPath, `${JSON.stringify(record)}\n`, "utf8");
        completed.set(`${entry.productId}\n${entry.sourceUrl}`, record);
        totalBytes += record.bytes;
        sinceCheckpoint += 1;
        if (sinceCheckpoint >= checkpointEvery) {
          sinceCheckpoint = 0;
          await writeState(statePath, { kind: "salt-visual-candidate-hydration", version: 1, sourceSha256, targetBytes: target, completed: completed.size, totalBytes, failures, updatedAt: new Date().toISOString() });
          process.stdout.write(`Hydration progress: ${completed.size}/${sourceEntries.length}, ${totalBytes} bytes\n`);
        }
      } catch (error) {
        failures = [...failures, { productId: entry.productId, sourceUrl: entry.sourceUrl, error: String(error?.message || error) }].slice(-1000);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, () => worker()));
  const status = determineHydrationStatus({
    completed: completed.size,
    sourceCount: sourceEntries.length,
    totalBytes,
    targetBytes: target,
  });
  await writeState(statePath, {
    kind: "salt-visual-candidate-hydration",
    version: 1,
    sourceSha256,
    targetBytes: target,
    sourceCount: sourceEntries.length,
    completed: completed.size,
    totalBytes,
    failures,
    sourceExhausted: status === "source-exhausted",
    status,
    updatedAt: new Date().toISOString(),
  });
  return { sourceSha256, completed: completed.size, sourceCount: sourceEntries.length, totalBytes, failures, sourceExhausted: status === "source-exhausted", status };
}

async function main() {
  const args = parseArgs(process.argv);
  const result = await hydrateCandidateManifest(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "ready") process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
}

export { fetchBytes, parseArgs };
