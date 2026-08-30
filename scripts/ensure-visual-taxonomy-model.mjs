#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const outputDir = resolve(rootDir, "output");
const modelPath = resolve(process.env.SALT_VISUAL_TAXONOMY_MODEL_PATH || resolve(outputDir, "visual-taxonomy-model.json"));
const weightsPath = resolve(process.env.SALT_VISUAL_TAXONOMY_WEIGHTS_PATH || resolve(outputDir, "visual-taxonomy-model-weights.npz"));
const completionPath = resolve(process.env.SALT_VISUAL_TAXONOMY_TRAINING_COMPLETION_PATH || resolve(outputDir, "visual-taxonomy-training-completion.json"));
const purgeJournalPath = resolve(outputDir, "visual-taxonomy-purge-journal.json");
const defaultConfigPath = resolve(outputDir, "visual-taxonomy-training-config.json");
const trainingStatusPath = resolve(outputDir, "visual-taxonomy-training-status.json");
const trainingLockPath = resolve(outputDir, ".visual-taxonomy-model-training.lock");
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const execFileAsync = promisify(execFile);
const defaultMetalPython = resolve(
  process.env.HOME || "/tmp",
  ".cache",
  "salt-visual-taxonomy-training",
  "venv",
  "bin",
  "python",
);

function resolveMetalPython() {
  const configured = String(process.env.SALT_VISUAL_MLX_PYTHON || "").trim();
  if (configured && configured !== defaultMetalPython) return configured;
  return existsSync(defaultMetalPython) ? defaultMetalPython : "python3";
}

function normalizeEncoderCommand(raw) {
  try {
    const command = JSON.parse(String(raw || ""));
    if (!Array.isArray(command) || command.length === 0) return raw;
    const executable = String(command[0] || "");
    if (existsSync(defaultMetalPython) && /(?:^|\/)python3(?:\.\d+)?$/.test(executable)) {
      command[0] = resolveMetalPython();
      return JSON.stringify(command);
    }
  } catch {
    // The existing validation will report malformed command JSON later.
  }
  return raw;
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

const trainingInputs = [
  ["SALT_VISUAL_TRAINING_DATASET_DIR", "--dataset-dir"],
  ["SALT_VISUAL_TRAINING_LABELS_MANIFEST", "--labels-manifest"],
  ["SALT_VISUAL_BASE_CHECKPOINT", "--base-checkpoint"],
  ["SALT_VISUAL_ENCODER_COMMAND_JSON", "--encoder-command-json"],
  ["SALT_VISUAL_ENCODER_TRAIN_COMMAND_JSON", "--encoder-train-command-json"],
  ["SALT_VISUAL_FINE_TUNED_ENCODER_CHECKPOINT", "--fine-tuned-checkpoint-output"],
];
const stagedSourceName = "SALT_VISUAL_TRAINING_SOURCE_MANIFEST";
const stagedLabelsName = "SALT_VISUAL_TRAINING_STAGED_LABELS_MANIFEST";
const shardedTrainingInputs = [
  ["SALT_VISUAL_TRAINING_SHARD_PLAN", "--shard-plan"],
  ["SALT_VISUAL_TRAINING_CORPUS_ROOT", "--corpus-root"],
  ["SALT_VISUAL_TRAINING_LABELS_ROOT", "--labels-root"],
  ["SALT_VISUAL_BASE_CHECKPOINT", "--base-checkpoint"],
  ["SALT_VISUAL_ENCODER_COMMAND_JSON", "--encoder-command-json"],
  ["SALT_VISUAL_ENCODER_TRAIN_COMMAND_JSON", "--encoder-train-command-json"],
  ["SALT_VISUAL_FINE_TUNED_ENCODER_CHECKPOINT", "--fine-tuned-checkpoint-output"],
];

async function writeTrainingStatus(status, details = {}) {
  await mkdir(outputDir, { recursive: true });
  const temporaryPath = `${trainingStatusPath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, `${JSON.stringify({
    status,
    updatedAt: new Date().toISOString(),
    modelPath,
    weightsPath,
    ...details,
  }, null, 2)}\n`, "utf8");
  await rename(temporaryPath, trainingStatusPath);
}

const metalRuntimeProbe = "import mlx.core as mx; import mlx_embeddings; device = mx.default_device(); assert device == mx.gpu, f'MLX default device is {device}, not GPU/Metal'; mx.eval(mx.array([0], dtype=mx.float32)); print(device)";

async function verifyMetalRuntime() {
  let python = resolveMetalPython();
  const runProbe = (executable) => execFileAsync(executable, ["-c", metalRuntimeProbe], {
    cwd: rootDir,
    env: { ...process.env, SALT_VISUAL_REQUIRE_METAL: "1", PYTHONUNBUFFERED: "1" },
    maxBuffer: 2 * 1024 * 1024,
  });
  try {
    await runProbe(python);
    return python;
  } catch (error) {
    if (python !== "python3" && python !== defaultMetalPython) {
      throw new Error(`Configured Metal Python cannot load mlx_embeddings: ${error.message}`);
    }
    const venvRoot = dirname(dirname(defaultMetalPython));
    if (!existsSync(defaultMetalPython)) {
      await execFileAsync("python3", ["-m", "venv", "--system-site-packages", venvRoot], {
        cwd: rootDir,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
        maxBuffer: 8 * 1024 * 1024,
      });
    }
    await execFileAsync(defaultMetalPython, [
      "-m",
      "pip",
      "install",
      "--disable-pip-version-check",
      "--no-cache-dir",
      "mlx-embeddings==0.1.0",
    ], {
      cwd: rootDir,
      env: { ...process.env, PIP_NO_INPUT: "1", PYTHONUNBUFFERED: "1" },
      maxBuffer: 32 * 1024 * 1024,
    });
    python = defaultMetalPython;
    await runProbe(python);
    return python;
  }
}

async function loadTrainingConfig() {
  const configPath = resolve(process.env.SALT_VISUAL_TRAINING_CONFIG_PATH || defaultConfigPath);
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw new Error(`Visual taxonomy training config is unreadable at ${configPath}: ${error.message}`);
  }
  if (!fileConfig || typeof fileConfig !== "object" || Array.isArray(fileConfig)) {
    throw new Error(`Visual taxonomy training config must be a JSON object: ${configPath}`);
  }
  const aliases = {
    SALT_VISUAL_TRAINING_SOURCE_MANIFEST: "sourceManifest",
    SALT_VISUAL_TRAINING_DATASET_DIR: "datasetDir",
    SALT_VISUAL_TRAINING_LABELS_MANIFEST: "labelsManifest",
    SALT_VISUAL_TRAINING_STAGED_LABELS_MANIFEST: "stagedLabelsManifest",
    SALT_VISUAL_BASE_CHECKPOINT: "baseCheckpoint",
    SALT_VISUAL_ENCODER_COMMAND_JSON: "encoderCommandJson",
    SALT_VISUAL_ENCODER_TRAIN_COMMAND_JSON: "encoderTrainCommandJson",
    SALT_VISUAL_FINE_TUNED_ENCODER_CHECKPOINT: "fineTunedEncoderCheckpoint",
    SALT_VISUAL_TRAINING_SHARD_PLAN: "shardPlan",
    SALT_VISUAL_TRAINING_CORPUS_ROOT: "corpusRoot",
    SALT_VISUAL_TRAINING_LABELS_ROOT: "labelsRoot",
    SALT_VISUAL_TRAINING_WORK_ROOT: "workRoot",
    SALT_VISUAL_TRAINING_SHARD_STATE: "stateOutput",
    SALT_VISUAL_TRAINING_LABEL_POLICY: "labelPolicy",
    SALT_VISUAL_ALLOW_CANDIDATE_TRAINING: "allowCandidateTraining",
  };
  const values = Object.fromEntries(Object.entries(aliases).map(([name, key]) => [
    name,
    String(process.env[name] || fileConfig[key] || "").trim(),
  ]));
  values.SALT_VISUAL_ENCODER_COMMAND_JSON = normalizeEncoderCommand(values.SALT_VISUAL_ENCODER_COMMAND_JSON);
  values.SALT_VISUAL_ENCODER_TRAIN_COMMAND_JSON = normalizeEncoderCommand(values.SALT_VISUAL_ENCODER_TRAIN_COMMAND_JSON);
  values.SALT_VISUAL_ALLOW_CANDIDATE_TRAINING = values.SALT_VISUAL_ALLOW_CANDIDATE_TRAINING === "1" ||
    values.SALT_VISUAL_ALLOW_CANDIDATE_TRAINING.toLowerCase() === "true" ||
    values.SALT_VISUAL_TRAINING_LABEL_POLICY === "deterministic-candidate-only";
  return values;
}

function configuredTrainingInputs(config) {
  const configured = trainingInputs.filter(([name]) => String(config[name] || "").trim());
  if (configured.length === 0) return null;
  if (configured.length !== trainingInputs.length) {
    const missing = trainingInputs.filter(([name]) => !String(config[name] || "").trim()).map(([name]) => name);
    throw new Error(`Visual taxonomy training is partially configured; missing ${missing.join(", ")}.`);
  }
  return Object.fromEntries(trainingInputs.map(([name]) => [name, String(config[name]).trim()]));
}

function configuredTrainingPlan(config) {
  const shardPlan = String(config.SALT_VISUAL_TRAINING_SHARD_PLAN || "").trim();
  if (shardPlan) {
    const missing = shardedTrainingInputs.filter(([name]) => !String(config[name] || "").trim()).map(([name]) => name);
    if (missing.length) throw new Error(`Visual taxonomy sharded training is partially configured; missing ${missing.join(", ")}.`);
    return {
      candidateOnly: config.SALT_VISUAL_ALLOW_CANDIDATE_TRAINING === true,
      inputs: {
        SALT_VISUAL_BASE_CHECKPOINT: String(config.SALT_VISUAL_BASE_CHECKPOINT).trim(),
        SALT_VISUAL_ENCODER_COMMAND_JSON: normalizeEncoderCommand(String(config.SALT_VISUAL_ENCODER_COMMAND_JSON).trim()),
        SALT_VISUAL_ENCODER_TRAIN_COMMAND_JSON: normalizeEncoderCommand(String(config.SALT_VISUAL_ENCODER_TRAIN_COMMAND_JSON).trim()),
        SALT_VISUAL_FINE_TUNED_ENCODER_CHECKPOINT: String(config.SALT_VISUAL_FINE_TUNED_ENCODER_CHECKPOINT).trim(),
      },
      sharded: {
        shardPlan,
        corpusRoot: String(config.SALT_VISUAL_TRAINING_CORPUS_ROOT).trim(),
        labelsRoot: String(config.SALT_VISUAL_TRAINING_LABELS_ROOT).trim(),
        workRoot: String(config.SALT_VISUAL_TRAINING_WORK_ROOT || "").trim(),
        stateOutput: String(config.SALT_VISUAL_TRAINING_SHARD_STATE || "").trim(),
      },
      stage: null,
    };
  }
  const sourceManifest = String(config[stagedSourceName] || "").trim();
  if (!sourceManifest) return { inputs: configuredTrainingInputs(config), stage: null };
  const required = [stagedSourceName, "SALT_VISUAL_TRAINING_DATASET_DIR", "SALT_VISUAL_BASE_CHECKPOINT", "SALT_VISUAL_ENCODER_COMMAND_JSON", "SALT_VISUAL_ENCODER_TRAIN_COMMAND_JSON", "SALT_VISUAL_FINE_TUNED_ENCODER_CHECKPOINT"];
  const missing = required.filter((name) => !String(config[name] || "").trim());
  if (missing.length) throw new Error(`Visual taxonomy staging is partially configured; missing ${missing.join(", ")}.`);
  const datasetDir = String(config.SALT_VISUAL_TRAINING_DATASET_DIR).trim();
  const labelsManifest = String(config[stagedLabelsName] || `${resolve(datasetDir)}.labels.jsonl`).trim();
  return {
    candidateOnly: config.SALT_VISUAL_ALLOW_CANDIDATE_TRAINING === true,
    inputs: {
      SALT_VISUAL_TRAINING_DATASET_DIR: datasetDir,
      SALT_VISUAL_TRAINING_LABELS_MANIFEST: labelsManifest,
      SALT_VISUAL_BASE_CHECKPOINT: String(config.SALT_VISUAL_BASE_CHECKPOINT).trim(),
      SALT_VISUAL_ENCODER_COMMAND_JSON: normalizeEncoderCommand(String(config.SALT_VISUAL_ENCODER_COMMAND_JSON).trim()),
      SALT_VISUAL_ENCODER_TRAIN_COMMAND_JSON: normalizeEncoderCommand(String(config.SALT_VISUAL_ENCODER_TRAIN_COMMAND_JSON).trim()),
      SALT_VISUAL_FINE_TUNED_ENCODER_CHECKPOINT: String(config.SALT_VISUAL_FINE_TUNED_ENCODER_CHECKPOINT).trim(),
    },
    stage: { sourceManifest, datasetDir, labelsManifest },
  };
}

async function modelExists() {
  try {
    await readFile(modelPath, "utf8");
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function pendingPurgeExists() {
  try {
    const journal = JSON.parse(await readFile(purgeJournalPath, "utf8"));
    return Boolean(journal && ["pending", "purged"].includes(journal.status));
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw new Error(`Visual taxonomy purge journal is unreadable at ${purgeJournalPath}: ${error.message}`);
  }
}

async function recoverPendingPurge() {
  await execFileAsync(npmBin, [
    "run",
    "catalog:vision:model:train",
    "--",
    "--recover-purge",
    "--output",
    modelPath,
    "--weights-output",
    weightsPath,
    "--completion-output",
    completionPath,
  ], {
    cwd: rootDir,
    env: { ...process.env, SALT_VISUAL_TRAINING_RETAIN_RAW: "0" },
    maxBuffer: 64 * 1024 * 1024,
  });
}

async function verifyModel() {
  await execFileAsync(npmBin, ["run", "catalog:vision:model:verify"], {
    cwd: rootDir,
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
  });
}

async function trainModel(inputs, { candidateOnly = false } = {}) {
  const args = [
    "run",
    "catalog:vision:model:train",
    "--",
    "--output",
    modelPath,
    "--weights-output",
    weightsPath,
    "--completion-output",
    completionPath,
    "--delete-raw-after-train",
  ];
  for (const [name, flag] of trainingInputs) {
    args.push(flag, inputs[name]);
  }
  await execFileAsync(npmBin, args, {
    cwd: rootDir,
    env: {
      ...process.env,
      SALT_VISUAL_TRAINING_RETAIN_RAW: "0",
      ...(candidateOnly ? { SALT_VISUAL_ALLOW_CANDIDATE_LABELS: "1" } : {}),
    },
    maxBuffer: 64 * 1024 * 1024,
  });
}

async function trainShardedModel(sharded, inputs, { candidateOnly = false } = {}) {
  const args = [
    "run",
    "catalog:vision:model:train:sharded",
    "--",
    "--shard-plan",
    sharded.shardPlan,
    "--base-checkpoint",
    inputs.SALT_VISUAL_BASE_CHECKPOINT,
    "--encoder-command-json",
    inputs.SALT_VISUAL_ENCODER_COMMAND_JSON,
    "--encoder-train-command-json",
    inputs.SALT_VISUAL_ENCODER_TRAIN_COMMAND_JSON,
    "--fine-tuned-checkpoint-output",
    inputs.SALT_VISUAL_FINE_TUNED_ENCODER_CHECKPOINT,
    "--output",
    modelPath,
    "--weights-output",
    weightsPath,
    "--completion-output",
    completionPath,
  ];
  if (sharded.workRoot) args.push("--work-root", sharded.workRoot);
  if (sharded.stateOutput) args.push("--state-output", sharded.stateOutput);
  await execFileAsync(npmBin, args, {
    cwd: rootDir,
    env: {
      ...process.env,
      SALT_VISUAL_TRAINING_RETAIN_RAW: "0",
      ...(candidateOnly ? { SALT_VISUAL_ALLOW_CANDIDATE_LABELS: "1" } : {}),
    },
    maxBuffer: 64 * 1024 * 1024,
  });
}

async function stageCorpus(stage) {
  await execFileAsync(npmBin, [
    "run",
    "catalog:vision:model:stage",
    "--",
    "--source-manifest",
    stage.sourceManifest,
    "--dataset-dir",
    stage.datasetDir,
    "--labels-output",
    stage.labelsManifest,
  ], {
    cwd: rootDir,
    env: {
      ...process.env,
      ...(process.env.SALT_VISUAL_ALLOW_CANDIDATE_LABELS === "1"
        ? { SALT_VISUAL_ALLOW_CANDIDATE_LABELS: "1" }
        : {}),
    },
    maxBuffer: 64 * 1024 * 1024,
  });
}

async function acquireTrainingLock() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const lock = await open(trainingLockPath, "wx");
      await lock.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), modelPath })}\n`, "utf8");
      return lock;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let existing;
      try {
        existing = JSON.parse(await readFile(trainingLockPath, "utf8"));
      } catch (readError) {
        throw new Error(`Training lock exists but cannot be read safely: ${trainingLockPath}: ${readError.message}`);
      }
      const ownerPid = Number(existing?.pid || 0);
      if (processAlive(ownerPid)) {
        throw new Error(`Another visual taxonomy training job owns ${trainingLockPath}; refusing a duplicate run.`);
      }
      await rm(trainingLockPath, { force: true });
    }
  }
  throw new Error(`Could not acquire visual taxonomy training lock: ${trainingLockPath}`);
}

async function ensureModel() {
  if (await pendingPurgeExists()) {
    await writeTrainingStatus("recovering-purge", { reason: "verified purge journal requires recovery before release" });
    process.stdout.write("Recovering the verified visual taxonomy model purge journal before any new training.\n");
    await recoverPendingPurge();
  }
  if (await modelExists()) {
    await writeTrainingStatus("verifying", { reason: "checking installed model artifact and purge evidence" });
    await verifyModel();
    await writeTrainingStatus("verified", { reason: "installed model passed live artifact verification" });
    process.stdout.write(`Verified installed visual taxonomy model at ${modelPath}.\n`);
    return;
  }

  const plan = configuredTrainingPlan(await loadTrainingConfig());
  if (!plan.inputs) {
    const reason = "no signed 50 GB visual corpus, trusted labels manifest, and Metal encoder training inputs are configured";
    await writeTrainingStatus(process.env.SALT_REQUIRE_VISUAL_TAXONOMY_MODEL === "1" ? "blocked" : "deferred", {
      reason,
      required: process.env.SALT_REQUIRE_VISUAL_TAXONOMY_MODEL === "1",
    });
    if (process.env.SALT_REQUIRE_VISUAL_TAXONOMY_MODEL === "1") {
      throw new Error(`Visual taxonomy model is required but no model or complete training inputs are configured: ${modelPath}`);
    }
    process.stdout.write("No visual taxonomy model or training corpus is configured; continuing with existing release taxonomy gates.\n");
    return;
  }

  const lock = await acquireTrainingLock();

  try {
    await writeTrainingStatus("training", {
      ...(plan.sharded ? { shardPlan: plan.sharded.shardPlan } : {
        datasetDir: plan.inputs.SALT_VISUAL_TRAINING_DATASET_DIR,
        labelsManifest: plan.inputs.SALT_VISUAL_TRAINING_LABELS_MANIFEST,
      }),
      startedAt: new Date().toISOString(),
    });
    await verifyMetalRuntime();
    process.stdout.write("No installed visual taxonomy model found; starting the configured Metal training lifecycle.\n");
    if (plan.sharded) {
      process.stdout.write("Running the signed visual corpus through sequential <=25 GB shard checkpoints.\n");
      await trainShardedModel(plan.sharded, plan.inputs, plan);
    } else if (plan.stage) {
      process.stdout.write("Staging the signed visual image manifest into the external training corpus.\n");
      await stageCorpus(plan.stage);
    }
    if (!plan.sharded) await trainModel(plan.inputs, plan);
    await verifyModel();
    await writeTrainingStatus("verified", {
      reason: "Metal training, quality, checksum, and post-training purge gates passed",
      completedAt: new Date().toISOString(),
    });
    process.stdout.write(`Visual taxonomy model trained, verified, and installed at ${modelPath}.\n`);
  } catch (error) {
    await writeTrainingStatus("failed", {
      error: String(error?.message || error),
      failedAt: new Date().toISOString(),
    });
    throw error;
  } finally {
    await lock.close();
    await rm(trainingLockPath, { force: true });
  }
}

async function main() {
  try {
    await ensureModel();
  } catch (error) {
    try {
      await writeTrainingStatus("failed", {
        error: String(error?.message || error),
        failedAt: new Date().toISOString(),
      });
    } catch (statusError) {
      process.stderr.write(`Could not persist visual taxonomy training failure: ${statusError.message}\n`);
    }
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

export { configuredTrainingInputs, configuredTrainingPlan, normalizeEncoderCommand, resolveMetalPython, verifyMetalRuntime };
