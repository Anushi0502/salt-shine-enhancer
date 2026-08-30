#!/usr/bin/env node

import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const rootDir = resolve(import.meta.dirname, "..");
const outputDir = resolve(rootDir, "output");
const defaultManifestPath = resolve(outputDir, "visual-taxonomy-catalog-candidate-hydrated-manifest.jsonl");
const defaultPlanPath = resolve(outputDir, "visual-taxonomy-shard-plan.json");
const defaultConfigPath = resolve(outputDir, "visual-taxonomy-training-config.json");
const defaultCorpusRoot = resolve(process.env.SALT_VISUAL_TRAINING_EXTERNAL_ROOT || resolve(process.env.HOME || "/tmp", ".cache", "salt-visual-taxonomy-training"), "corpus");
const defaultLabelsRoot = resolve(process.env.SALT_VISUAL_TRAINING_EXTERNAL_ROOT || resolve(process.env.HOME || "/tmp", ".cache", "salt-visual-taxonomy-training"), "labels");
const defaultWorkRoot = resolve(process.env.SALT_VISUAL_TRAINING_EXTERNAL_ROOT || resolve(process.env.HOME || "/tmp", ".cache", "salt-visual-taxonomy-training"), "work");
const defaultBaseCheckpoint = resolve(process.env.HOME || "/tmp", ".cache", "salt-visual-taxonomy", "siglip-base.checkpoint.json");
const defaultFineTunedCheckpoint = resolve(process.env.SALT_VISUAL_TRAINING_EXTERNAL_ROOT || resolve(process.env.HOME || "/tmp", ".cache", "salt-visual-taxonomy-training"), "checkpoints", "visual-taxonomy-encoder-finetuned.safetensors");
const defaultMetalPython = resolve(
  process.env.HOME || "/tmp",
  ".cache",
  "salt-visual-taxonomy-training",
  "venv",
  "bin",
  "python",
);
const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const args = {
    manifest: defaultManifestPath,
    plan: defaultPlanPath,
    config: defaultConfigPath,
    corpusRoot: defaultCorpusRoot,
    labelsRoot: defaultLabelsRoot,
    workRoot: defaultWorkRoot,
    baseCheckpoint: defaultBaseCheckpoint,
    fineTunedCheckpoint: defaultFineTunedCheckpoint,
    // Keep the corpus within the 25 GB contract while adapting to this Mac's
    // current free-space budget; the full target is still 50 GB cumulative.
    maxShardBytes: Number(process.env.SALT_VISUAL_STAGING_MAX_SHARD_BYTES || 6_000_000_000),
    targetBytes: Number(process.env.SALT_VISUAL_TRAINING_TARGET_BYTES || 50_000_000_000),
  };
  const flags = new Map([
    ["--manifest", "manifest"], ["--plan", "plan"], ["--config", "config"],
    ["--corpus-root", "corpusRoot"], ["--labels-root", "labelsRoot"], ["--work-root", "workRoot"],
    ["--base-checkpoint", "baseCheckpoint"], ["--fine-tuned-checkpoint", "fineTunedCheckpoint"],
    ["--max-shard-bytes", "maxShardBytes"], ["--target-bytes", "targetBytes"],
  ]);
  for (let index = 2; index < argv.length; index += 1) {
    const key = flags.get(argv[index]);
    const value = argv[index + 1];
    if (!key || value === undefined) throw new Error(`Expected a supported training preparation flag; got ${argv[index]}.`);
    args[key] = ["maxShardBytes", "targetBytes"].includes(key) ? Number(value) : value;
    index += 1;
  }
  if (!Number.isInteger(args.maxShardBytes) || args.maxShardBytes <= 0 || args.maxShardBytes > 25_000_000_000) {
    throw new Error("--max-shard-bytes must be between 1 byte and 25 GB.");
  }
  if (!Number.isInteger(args.targetBytes) || args.targetBytes < 50_000_000_000) {
    throw new Error("--target-bytes must be at least 50 GB.");
  }
  return Object.fromEntries(Object.entries(args).map(([key, value]) => [key, ["maxShardBytes", "targetBytes"].includes(key) ? value : resolve(value)]));
}

async function fileExists(path) {
  try { await stat(path); return true; } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function commandPath(name) {
  return resolve(rootDir, "scripts", name);
}

function resolveMetalPython() {
  const configured = String(process.env.SALT_VISUAL_MLX_PYTHON || "").trim();
  return configured || (existsSync(defaultMetalPython) ? defaultMetalPython : "python3");
}

export async function prepareCandidateTraining(args) {
  if (!(await fileExists(args.manifest))) throw new Error(`Hydrated candidate manifest is missing: ${args.manifest}`);
  if (!(await fileExists(args.baseCheckpoint))) throw new Error(`Base Metal checkpoint manifest is missing: ${args.baseCheckpoint}`);
  const childEnv = {
    ...process.env,
    SALT_VISUAL_ALLOW_CANDIDATE_LABELS: "1",
    SALT_VISUAL_TRAINING_SOURCE_MANIFEST: args.manifest,
    SALT_VISUAL_TRAINING_CORPUS_ROOT: args.corpusRoot,
    SALT_VISUAL_TRAINING_LABELS_ROOT: args.labelsRoot,
    SALT_VISUAL_TRAINING_TARGET_BYTES: String(args.targetBytes),
    SALT_VISUAL_STAGING_MAX_SHARD_BYTES: String(args.maxShardBytes),
  };
  await execFileAsync(process.platform === "win32" ? "npm.cmd" : "npm", [
    "run", "catalog:vision:model:plan-shards", "--",
    "--source-manifest", args.manifest,
    "--plan-output", args.plan,
    "--corpus-root", args.corpusRoot,
    "--labels-root", args.labelsRoot,
    "--target-bytes", String(args.targetBytes),
    "--max-shard-bytes", String(args.maxShardBytes),
  ], { cwd: rootDir, env: childEnv, maxBuffer: 64 * 1024 * 1024 });
  const config = {
    kind: "salt-visual-taxonomy-training-config",
    version: 1,
    shardPlan: args.plan,
    corpusRoot: args.corpusRoot,
    labelsRoot: args.labelsRoot,
    workRoot: args.workRoot,
    stateOutput: resolve(outputDir, "visual-taxonomy-shard-training-state.json"),
    baseCheckpoint: args.baseCheckpoint,
    encoderCommandJson: JSON.stringify([resolveMetalPython(), commandPath("visual-taxonomy-encoder-mlx.py"), "encode"]),
    encoderTrainCommandJson: JSON.stringify([resolveMetalPython(), commandPath("visual-taxonomy-encoder-mlx.py"), "fine-tune"]),
    fineTunedEncoderCheckpoint: args.fineTunedCheckpoint,
    maxShardBytes: args.maxShardBytes,
    targetBytes: args.targetBytes,
    minFreeBytes: args.maxShardBytes + 8 * 1024 ** 3,
    allowCandidateTraining: true,
    labelPolicy: "deterministic-candidate-only",
    releaseUse: "candidate-evidence-only",
    rawDataPolicy: "purge each verified shard; retain only checkpoints and audit manifests",
    generatedAt: new Date().toISOString(),
  };
  await mkdir(dirname(args.config), { recursive: true });
  await writeFile(args.config, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return config;
}

async function main() {
  const args = parseArgs(process.argv);
  const config = await prepareCandidateTraining(args);
  process.stdout.write(`${JSON.stringify({ config: args.config, plan: args.plan, labelPolicy: config.labelPolicy, releaseUse: config.releaseUse }, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
}

export { parseArgs };
