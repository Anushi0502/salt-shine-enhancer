#!/usr/bin/env node

import { appendFile, mkdir, readFile, rename, stat } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { createInterface } from "node:readline";

import { readFileWithRetry } from "./reliable-file-read.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const outputDir = resolve(rootDir, "output");
const sourceManifestPath = resolve(outputDir, "visual-taxonomy-catalog-candidate-manifest.jsonl");
const hydratedManifestPath = resolve(outputDir, "visual-taxonomy-catalog-candidate-hydrated-manifest.jsonl");
const hydrationStatePath = resolve(outputDir, "visual-taxonomy-catalog-candidate-hydration-state.json");
const supplementalRoot = resolve(process.env.SALT_VISUAL_OPEN_IMAGES_ROOT || resolve(homedir(), ".cache", "salt-visual-taxonomy-open-images"));
const supplementalManifestPath = resolve(process.env.SALT_OPEN_IMAGES_MANIFEST_OUTPUT || resolve(supplementalRoot, "visual-taxonomy-open-images-candidate-manifest.jsonl"));
const supplementalReportPath = resolve(process.env.SALT_OPEN_IMAGES_MANIFEST_REPORT || resolve(supplementalRoot, "visual-taxonomy-open-images-candidate-report.json"));
const supplementalHydratedManifestPath = resolve(process.env.SALT_OPEN_IMAGES_HYDRATED_MANIFEST_OUTPUT || resolve(supplementalRoot, "visual-taxonomy-open-images-candidate-hydrated-manifest.jsonl"));
const supplementalHydrationStatePath = resolve(process.env.SALT_OPEN_IMAGES_HYDRATION_STATE || resolve(supplementalRoot, "visual-taxonomy-open-images-candidate-hydration-state.json"));
const combinedHydratedManifestPath = resolve(supplementalRoot, "visual-taxonomy-combined-candidate-hydrated-manifest-50gb.jsonl");
const logPath = resolve(outputDir, "visual-taxonomy-candidate-training-supervisor.log");
const candidateOutputDir = resolve(outputDir, "visual-taxonomy-candidate");
const candidatePlanPath = resolve(candidateOutputDir, "visual-taxonomy-shard-plan.json");
const candidateConfigPath = resolve(candidateOutputDir, "visual-taxonomy-training-config.json");
const candidateStatePath = resolve(candidateOutputDir, "visual-taxonomy-shard-training-state.json");
const candidateCorpusRoot = resolve(supplementalRoot, "candidate-training-corpus");
const candidateLabelsRoot = resolve(supplementalRoot, "candidate-training-labels");
const candidateWorkRoot = resolve(supplementalRoot, "candidate-training-work");
const candidateCheckpointPath = resolve(supplementalRoot, "candidate-checkpoints", "visual-taxonomy-encoder-finetuned.safetensors");
const candidateModelPath = resolve(candidateOutputDir, "visual-taxonomy-model.json");
const candidateWeightsPath = resolve(candidateOutputDir, "visual-taxonomy-model-weights.npz");
const candidateCompletionPath = resolve(candidateOutputDir, "visual-taxonomy-training-completion.json");
const candidateStatusPath = resolve(candidateOutputDir, "visual-taxonomy-training-status.json");
const candidateLockPath = resolve(candidateOutputDir, ".visual-taxonomy-model-training.lock");
const candidatePurgeJournalPath = resolve(candidateOutputDir, "visual-taxonomy-purge-journal.json");
const candidateBaseCheckpointPath = resolve(
  process.env.SALT_VISUAL_CANDIDATE_BASE_CHECKPOINT ||
    resolve(homedir(), ".cache", "salt-visual-taxonomy-candidates", "siglip-large-patch16-384.checkpoint.json"),
);
const candidateHealthPath = resolve(
  process.env.SALT_VISUAL_CANDIDATE_HEALTH_PATH ||
    resolve(homedir(), ".cache", "salt-visual-taxonomy-candidates", "siglip-large-patch16-384.health.json"),
);
const targetBytes = 50_000_000_000;
// Hydrate past the training gate so cross-source duplicate images do not leave the
// exact deduplicated corpus below 50 GB.
const hydrationTargetBytes = Math.max(
  targetBytes,
  Number(process.env.SALT_VISUAL_CANDIDATE_HYDRATION_TARGET_BYTES || 60_000_000_000),
);
const pollMs = Math.max(10_000, Number(process.env.SALT_VISUAL_CANDIDATE_SUPERVISOR_POLL_MS || 30_000));

function parseArgs(argv) {
  const waitPidIndex = argv.indexOf("--wait-pid");
  const startNow = argv.includes("--start-now");
  const waitPid = waitPidIndex >= 0 ? Number(argv[waitPidIndex + 1]) : 0;
  if (!startNow && (!Number.isInteger(waitPid) || waitPid <= 0)) throw new Error("--wait-pid must be a positive process id unless --start-now is supplied.");
  if (startNow && waitPidIndex >= 0) throw new Error("Use either --wait-pid or --start-now, not both.");
  return { waitPid, startNow };
}

async function log(message) {
  await mkdir(outputDir, { recursive: true });
  await appendFile(logPath, `[${new Date().toISOString()}] ${message}\n`, "utf8");
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFileWithRetry(path, "utf8", 32));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function lineCount(path) {
  try {
    const input = createReadStream(path, { encoding: "utf8" });
    const lines = createInterface({ input, crlfDelay: Infinity });
    let count = 0;
    for await (const line of lines) if (line.trim()) count += 1;
    return count;
  } catch (error) {
    if (error?.code === "ENOENT") return 0;
    throw error;
  }
}

async function runNpm(args, extraEnv = {}) {
  await log(`starting ${args.join(" ")}`);
  const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", args, {
    cwd: rootDir,
    env: {
      ...process.env,
      ...extraEnv,
      SALT_VISUAL_ALLOW_CANDIDATE_LABELS: "1",
      SALT_VISUAL_TRAINING_RETAIN_RAW: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const writeOutput = (chunk) => appendFile(logPath, chunk).catch(() => {});
  child.stdout.on("data", writeOutput);
  child.stderr.on("data", writeOutput);
  const result = await new Promise((resolvePromise, rejectPromise) => {
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => resolvePromise({ code: code ?? 1, signal }));
  });
  if (result.code !== 0) throw new Error(`${args.join(" ")} exited with ${result.signal || `code ${result.code}`}`);
  await log(`completed ${args.join(" ")}`);
}

async function fileExists(path) {
  try { await stat(path); return true; } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function findRunningProcess(pattern) {
  const child = spawn("/bin/ps", ["-ax", "-o", "pid=,command="], { stdio: ["ignore", "pipe", "ignore"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  const result = await new Promise((resolvePromise) => child.once("exit", (code) => resolvePromise(code ?? 1)));
  if (result !== 0) return 0;
  for (const line of output.split(/\r?\n/)) {
    const match = line.trim().match(/^(\d+)\s+(.*)$/);
    if (!match || !match[2].includes(pattern) || match[2].includes("/bin/ps")) continue;
    const pid = Number(match[1]);
    if (pid && pid !== process.pid && processAlive(pid)) return pid;
  }
  return 0;
}

async function waitForProcess(pid, label) {
  if (!pid) return;
  await log(`waiting for ${label} pid=${pid}`);
  while (processAlive(pid)) await new Promise((resolveSleep) => setTimeout(resolveSleep, pollMs));
  await log(`${label} pid=${pid} exited`);
}

async function waitForHydration(waitPid) {
  await log(`waiting for hydration pid=${waitPid}`);
  while (processAlive(waitPid)) {
    await new Promise((resolveSleep) => setTimeout(resolveSleep, pollMs));
  }
  await log(`hydration pid=${waitPid} exited; evaluating durable state`);
}

async function readHydrationSummary(statePath, outputPath, sourcePath) {
  const state = await readJson(statePath);
  const hydratedCount = Number.isInteger(state?.completed) ? state.completed : await lineCount(outputPath);
  const sourceCount = Number(state?.sourceCount || await lineCount(sourcePath));
  return {
    state,
    hydratedCount,
    sourceCount,
    totalBytes: Number(state?.totalBytes || 0),
  };
}

async function buildCombinedHydratedManifest(catalogSummary, supplementalSummary) {
  const sourcePaths = [hydratedManifestPath, supplementalHydratedManifestPath];
  const seenHashes = new Set();
  let totalBytes = 0;
  let records = 0;
  const temporaryPath = `${combinedHydratedManifestPath}.tmp-${process.pid}-${Date.now()}`;
  const output = createWriteStream(temporaryPath, { encoding: "utf8" });
  let outputError = null;
  output.once("error", (error) => { outputError = error; });

  const writeEntry = async (entry) => {
    if (!output.write(`${JSON.stringify(entry)}\n`)) await once(output, "drain");
    if (outputError) throw outputError;
  };

  outer:
  for (const sourcePath of sourcePaths) {
    let input;
    try {
      input = createReadStream(sourcePath, { encoding: "utf8" });
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    const lines = createInterface({ input, crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.trim()) continue;
      const entry = JSON.parse(line);
      const imageHash = String(entry?.sha256 || "").trim().toLowerCase();
      const bytes = Number(entry?.bytes || 0);
      if (!/^[a-f0-9]{64}$/.test(imageHash) || !Number.isInteger(bytes) || bytes <= 0 || seenHashes.has(imageHash)) continue;
      seenHashes.add(imageHash);
      await writeEntry(entry);
      totalBytes += bytes;
      records += 1;
      if (totalBytes >= targetBytes) break outer;
    }
  }

  if (totalBytes < targetBytes) {
    throw new Error(
      `Combined visual hydration contains ${totalBytes} bytes; `
      + `catalog=${catalogSummary.totalBytes}, supplemental=${supplementalSummary.totalBytes}, `
      + `and ${targetBytes} bytes are required before Metal training can start.`,
    );
  }
  if (outputError) throw outputError;
  output.end();
  await once(output, "close");
  await rename(temporaryPath, combinedHydratedManifestPath);
  return { path: combinedHydratedManifestPath, records, totalBytes };
}

async function buildSupplementalManifest() {
  if (await fileExists(supplementalManifestPath)) return;
  const existingPid = await findRunningProcess("build-open-images-visual-taxonomy-manifest.mjs");
  if (existingPid) {
    await waitForProcess(existingPid, "Open Images manifest builder");
    if (await fileExists(supplementalManifestPath)) return;
  }
  await runNpm(["run", "catalog:vision:open-images:manifest"], {
    SALT_OPEN_IMAGES_MAX_RECORDS: process.env.SALT_OPEN_IMAGES_MAX_RECORDS || "600000",
    SALT_OPEN_IMAGES_MANIFEST_OUTPUT: supplementalManifestPath,
    SALT_OPEN_IMAGES_MANIFEST_REPORT: supplementalReportPath,
  });
}

async function findSupplementalHydrationPid() {
  return findRunningProcess(basename(supplementalManifestPath));
}

async function startSupplementalHydration() {
  const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", [
    "run", "catalog:vision:catalog-candidates:hydrate", "--",
    "--source", supplementalManifestPath,
    "--output", supplementalHydratedManifestPath,
    "--state", supplementalHydrationStatePath,
    "--target-bytes", String(hydrationTargetBytes),
  ], {
    cwd: rootDir,
    env: {
      ...process.env,
      SALT_VISUAL_ALLOW_CANDIDATE_LABELS: "1",
      SALT_VISUAL_CANDIDATE_FETCH_CONCURRENCY: process.env.SALT_VISUAL_CANDIDATE_FETCH_CONCURRENCY || "32",
      SALT_VISUAL_CANDIDATE_FETCH_ATTEMPTS: process.env.SALT_VISUAL_CANDIDATE_FETCH_ATTEMPTS || "3",
      SALT_VISUAL_CANDIDATE_FETCH_TIMEOUT_MS: process.env.SALT_VISUAL_CANDIDATE_FETCH_TIMEOUT_MS || "30000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const writeOutput = (chunk) => appendFile(logPath, chunk).catch(() => {});
  child.stdout.on("data", writeOutput);
  child.stderr.on("data", writeOutput);
  child.once("error", (error) => void log(`supplemental hydrator failed to start: ${error.message}`));
  child.once("exit", (code, signal) => void log(`supplemental hydrator exited: ${signal || `code ${code}`}`));
  await log(`supplemental hydrator started; pid=${child.pid || "unknown"}`);
  return Number(child.pid || 0);
}

async function waitForCombinedCorpus(catalogSummary) {
  await buildSupplementalManifest();
  let hydrationPid = await findSupplementalHydrationPid();
  if (!hydrationPid) hydrationPid = await startSupplementalHydration();

  while (true) {
    const supplementalSummary = await readHydrationSummary(
      supplementalHydrationStatePath,
      supplementalHydratedManifestPath,
      supplementalManifestPath,
    );
    if (catalogSummary.totalBytes + supplementalSummary.totalBytes >= targetBytes) {
      try {
        const combined = await buildCombinedHydratedManifest(catalogSummary, supplementalSummary);
        await log(`combined candidate hydration ready: ${combined.records} records, ${combined.totalBytes} bytes`);
        return combined;
      } catch (error) {
        if (!String(error?.message || error).startsWith("Combined visual hydration contains")) throw error;
        await log(`deduplicated corpus still below 50 GB; continuing supplemental hydration (${supplementalSummary.totalBytes} source bytes)`);
      }
    }
    if (!hydrationPid || !processAlive(hydrationPid)) {
      if (supplementalSummary.hydratedCount >= supplementalSummary.sourceCount && supplementalSummary.sourceCount > 0) {
        throw new Error(
          `Combined visual hydration exhausted at ${catalogSummary.totalBytes + supplementalSummary.totalBytes} bytes; `
          + `${targetBytes} bytes are required.`,
        );
      }
      hydrationPid = await startSupplementalHydration();
    }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, pollMs));
  }
}

async function hydrateSupplementalManifest() {
  const existingPid = await findRunningProcess("hydrate-visual-taxonomy-catalog-candidate-manifest.mjs");
  if (existingPid && (await findRunningProcess(basename(supplementalManifestPath)))) {
    await waitForProcess(existingPid, "Open Images hydrator");
  }
  let summary = await readHydrationSummary(supplementalHydrationStatePath, supplementalHydratedManifestPath, supplementalManifestPath);
  if (summary.state?.status === "ready" && summary.totalBytes >= targetBytes) return summary;
  const sourceExhausted = summary.state?.status === "source-exhausted" || summary.state?.sourceExhausted === true;
  if (!sourceExhausted) {
    const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", [
      "run", "catalog:vision:catalog-candidates:hydrate", "--",
      "--source", supplementalManifestPath,
      "--output", supplementalHydratedManifestPath,
      "--state", supplementalHydrationStatePath,
      "--target-bytes", String(hydrationTargetBytes),
    ], {
      cwd: rootDir,
      env: {
        ...process.env,
        SALT_VISUAL_ALLOW_CANDIDATE_LABELS: "1",
        SALT_VISUAL_CANDIDATE_FETCH_CONCURRENCY: process.env.SALT_VISUAL_CANDIDATE_FETCH_CONCURRENCY || "32",
        SALT_VISUAL_CANDIDATE_FETCH_ATTEMPTS: process.env.SALT_VISUAL_CANDIDATE_FETCH_ATTEMPTS || "3",
        SALT_VISUAL_CANDIDATE_FETCH_TIMEOUT_MS: process.env.SALT_VISUAL_CANDIDATE_FETCH_TIMEOUT_MS || "30000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await log(`Open Images hydrator started; pid=${child.pid || "unknown"}`);
    const writeOutput = (chunk) => appendFile(logPath, chunk).catch(() => {});
    child.stdout.on("data", writeOutput);
    child.stderr.on("data", writeOutput);
    const result = await new Promise((resolvePromise, rejectPromise) => {
      child.once("error", rejectPromise);
      child.once("exit", (code, signal) => resolvePromise({ code: code ?? 1, signal }));
    });
    if (result.code !== 0) throw new Error(`Open Images hydration exited with ${result.signal || `code ${result.code}`}`);
    summary = await readHydrationSummary(supplementalHydrationStatePath, supplementalHydratedManifestPath, supplementalManifestPath);
  }
  return summary;
}

async function runCombinedTraining(catalogSummary) {
  const combined = await waitForCombinedCorpus(catalogSummary);
  await ensureCandidateCheckpoint();
  await verifyCandidateCheckpoint();
  await runNpm([
    "run", "catalog:vision:catalog-candidates:prepare", "--",
    "--manifest", combined.path,
    "--plan", candidatePlanPath,
    "--config", candidateConfigPath,
    "--corpus-root", candidateCorpusRoot,
    "--labels-root", candidateLabelsRoot,
    "--work-root", candidateWorkRoot,
    "--state-output", candidateStatePath,
    "--fine-tuned-checkpoint", candidateCheckpointPath,
  ], {
    SALT_VISUAL_STAGING_MAX_SHARD_BYTES: process.env.SALT_VISUAL_STAGING_MAX_SHARD_BYTES || "6000000000",
  });
  await runNpm(["run", "catalog:vision:model:ensure"], {
    SALT_VISUAL_STAGING_MAX_SHARD_BYTES: process.env.SALT_VISUAL_STAGING_MAX_SHARD_BYTES || "6000000000",
    SALT_VISUAL_TAXONOMY_MODEL_PATH: candidateModelPath,
    SALT_VISUAL_TAXONOMY_WEIGHTS_PATH: candidateWeightsPath,
    SALT_VISUAL_TRAINING_COMPLETION_PATH: candidateCompletionPath,
    SALT_VISUAL_TRAINING_CONFIG_PATH: candidateConfigPath,
    SALT_VISUAL_TRAINING_STATUS_PATH: candidateStatusPath,
    SALT_VISUAL_TRAINING_LOCK_PATH: candidateLockPath,
    SALT_VISUAL_TRAINING_PURGE_JOURNAL_PATH: candidatePurgeJournalPath,
  });
  await log("combined candidate-only visual training pipeline completed");
}

async function verifyCandidateCheckpoint() {
  await runNpm(["run", "catalog:vision:candidate:verify", "--", "--checkpoint", candidateBaseCheckpointPath, "--health", candidateHealthPath], {
    SALT_VISUAL_CANDIDATE_BASE_CHECKPOINT: candidateBaseCheckpointPath,
    SALT_VISUAL_CANDIDATE_HEALTH_PATH: candidateHealthPath,
  });
}

async function ensureCandidateCheckpoint() {
  await runNpm(["run", "catalog:vision:candidate:download"], {
    SALT_VISUAL_CANDIDATE_MODEL_ID: process.env.SALT_VISUAL_CANDIDATE_MODEL_ID || "mlx-community/siglip-large-patch16-384",
    SALT_VISUAL_CANDIDATE_MODEL_PATH: process.env.SALT_VISUAL_CANDIDATE_MODEL_PATH || resolve(dirname(candidateBaseCheckpointPath), "siglip-large-patch16-384"),
    SALT_VISUAL_CANDIDATE_BASE_CHECKPOINT: candidateBaseCheckpointPath,
  });
}

async function main() {
  const { waitPid, startNow } = parseArgs(process.argv);
  if (!startNow) await waitForHydration(waitPid);
  const { state, hydratedCount, sourceCount, totalBytes } = await readHydrationSummary(hydrationStatePath, hydratedManifestPath, sourceManifestPath);
  if (String(state?.status || "") === "ready" && totalBytes >= targetBytes) {
    await ensureCandidateCheckpoint();
    await verifyCandidateCheckpoint();
    await runNpm(["run", "catalog:vision:catalog-candidates:prepare", "--", "--plan", candidatePlanPath, "--config", candidateConfigPath, "--corpus-root", candidateCorpusRoot, "--labels-root", candidateLabelsRoot, "--work-root", candidateWorkRoot, "--state-output", candidateStatePath, "--fine-tuned-checkpoint", candidateCheckpointPath]);
    await runNpm(["run", "catalog:vision:model:ensure"], {
      SALT_VISUAL_TAXONOMY_MODEL_PATH: candidateModelPath,
      SALT_VISUAL_TAXONOMY_WEIGHTS_PATH: candidateWeightsPath,
      SALT_VISUAL_TRAINING_COMPLETION_PATH: candidateCompletionPath,
      SALT_VISUAL_TRAINING_CONFIG_PATH: candidateConfigPath,
      SALT_VISUAL_TRAINING_STATUS_PATH: candidateStatusPath,
      SALT_VISUAL_TRAINING_LOCK_PATH: candidateLockPath,
      SALT_VISUAL_TRAINING_PURGE_JOURNAL_PATH: candidatePurgeJournalPath,
    });
    await log("candidate visual training pipeline completed");
    return;
  }
  if (hydratedCount >= sourceCount && sourceCount > 0) {
    await log(`catalog source exhausted below 50 GB: ${hydratedCount}/${sourceCount} records, ${totalBytes} bytes; combining supplemental candidate source`);
    await runCombinedTraining({ state, hydratedCount, sourceCount, totalBytes });
    return;
  }
  throw new Error(`hydration ended before completion: ${hydratedCount}/${sourceCount} records, ${totalBytes} bytes`);
}

main().catch(async (error) => {
  await log(`supervisor stopped: ${error.stack || error.message}`);
  process.exitCode = 1;
});
