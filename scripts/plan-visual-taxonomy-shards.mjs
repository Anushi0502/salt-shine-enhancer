#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import {
  normalizeEntries,
  parseManifestText,
  planVisualCorpusShards,
} from "./stage-visual-taxonomy-corpus.mjs";
import { buildVisualTaxonomyLabelIndex } from "../src/lib/visual-taxonomy-model.js";

const rootDir = resolve(import.meta.dirname, "..");
const defaultTargetBytes = 50_000_000_000;
const defaultMaxShardBytes = 25_000_000_000;
const maximumShardBytes = 25_000_000_000;

function parseArgs(argv) {
  const args = {
    sourceManifest: process.env.SALT_VISUAL_TRAINING_SOURCE_MANIFEST || "",
    planOutput: process.env.SALT_VISUAL_TRAINING_SHARD_PLAN || resolve(rootDir, "output", "visual-taxonomy-shard-plan.json"),
    corpusRoot: process.env.SALT_VISUAL_TRAINING_CORPUS_ROOT || "",
    labelsRoot: process.env.SALT_VISUAL_TRAINING_LABELS_ROOT || "",
    targetBytes: Number(process.env.SALT_VISUAL_TRAINING_TARGET_BYTES || defaultTargetBytes),
    maxShardBytes: Number(process.env.SALT_VISUAL_STAGING_MAX_SHARD_BYTES || defaultMaxShardBytes),
  };
  const valueFlags = new Map([
    ["--source-manifest", "sourceManifest"],
    ["--plan-output", "planOutput"],
    ["--corpus-root", "corpusRoot"],
    ["--labels-root", "labelsRoot"],
    ["--target-bytes", "targetBytes"],
    ["--max-shard-bytes", "maxShardBytes"],
  ]);
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const key = valueFlags.get(token);
    if (!key) throw new Error(`Unknown argument: ${token}`);
    const next = argv[index + 1];
    if (!next) throw new Error(`Missing value for ${token}.`);
    args[key] = ["targetBytes", "maxShardBytes"].includes(key) ? Number(next) : next;
    index += 1;
  }
  for (const [flag, value] of [["--source-manifest", args.sourceManifest], ["--corpus-root", args.corpusRoot], ["--labels-root", args.labelsRoot]]) {
    if (!String(value || "").trim()) throw new Error(`${flag} is required.`);
  }
  if (!Number.isInteger(args.targetBytes) || args.targetBytes <= 0) throw new Error("--target-bytes must be a positive integer.");
  if (!Number.isInteger(args.maxShardBytes) || args.maxShardBytes <= 0 || args.maxShardBytes > maximumShardBytes || args.maxShardBytes > args.targetBytes) {
    throw new Error(`--max-shard-bytes must be positive, no larger than --target-bytes, and no larger than ${maximumShardBytes} bytes (25 GB).`);
  }
  return args;
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertExternalPath(path, label) {
  const value = resolve(path);
  if (value === rootDir || value.startsWith(`${rootDir}${sep}`)) {
    throw new Error(`${label} must be outside the SALT project so raw visual data cannot fill the repository.`);
  }
  return value;
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

async function writeShardManifest(path, entries) {
  await mkdir(dirname(path), { recursive: true });
  const lines = entries.map((entry) => JSON.stringify({
    ...(entry.localSource ? { sourcePath: entry.localSource } : { sourceUrl: entry.source }),
    productId: entry.productId,
    ruleId: entry.ruleId,
    labelSource: entry.labelSource,
    ...(entry.candidateOnly === true ? { candidateOnly: true } : {}),
    ...(entry.sourceEvidence ? { sourceEvidence: entry.sourceEvidence } : {}),
    ...(entry.split ? { split: entry.split } : {}),
    sha256: entry.sha256,
    bytes: entry.bytes,
  }));
  await writeFile(path, `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const args = parseArgs(process.argv);
  const sourceManifestPath = resolve(args.sourceManifest);
  const sourceBytes = await readFile(sourceManifestPath);
  const sourceManifestSha256 = sha256Bytes(sourceBytes);
  const corpusRoot = assertExternalPath(args.corpusRoot, "--corpus-root");
  const labelsRoot = assertExternalPath(args.labelsRoot, "--labels-root");
  const entries = await normalizeEntries(parseManifestText(sourceBytes.toString("utf8")), sourceManifestPath, corpusRoot);
  const plan = planVisualCorpusShards(entries, {
    targetBytes: args.targetBytes,
    maxShardBytes: args.maxShardBytes,
  });

  const shards = [];
  for (const shard of plan.shards) {
    const shardName = `shard-${String(shard.shardIndex).padStart(3, "0")}`;
    const shardManifest = resolve(dirname(args.planOutput), `${shardName}.source.jsonl`);
    const datasetDir = resolve(corpusRoot, shardName);
    const labelsOutput = resolve(labelsRoot, `${shardName}.labels.jsonl`);
    await writeShardManifest(shardManifest, shard.entries);
    shards.push({
      shardIndex: shard.shardIndex,
      shardName,
      bytes: shard.bytes,
      imageCount: shard.imageCount,
      sourceManifest: shardManifest,
      datasetDir,
      labelsOutput,
    });
  }

  await writeJsonAtomic(resolve(args.planOutput), {
    kind: "salt-visual-taxonomy-shard-plan",
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceManifest: sourceManifestPath,
    sourceManifestSha256,
    targetBytes: plan.targetBytes,
    maxShardBytes: plan.maxShardBytes,
    bytes: plan.bytes,
    imageCount: shards.reduce((sum, shard) => sum + shard.imageCount, 0),
    labelIndex: buildVisualTaxonomyLabelIndex(entries.map((entry) => entry.ruleId)),
    shardCount: shards.length,
    status: "planned",
    shards,
  });
  process.stdout.write(`Planned ${shards.length} visual shards: ${plan.bytes} bytes total, max ${plan.maxShardBytes} bytes per shard.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

export { parseArgs, writeShardManifest };
