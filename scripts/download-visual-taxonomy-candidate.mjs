#!/usr/bin/env node

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootDir = resolve(import.meta.dirname, "..");
const modelId = process.env.SALT_VISUAL_CANDIDATE_MODEL_ID || "mlx-community/siglip-large-patch16-384";
const modelPath = resolve(
  process.env.SALT_VISUAL_CANDIDATE_MODEL_PATH ||
    resolve(homedir(), ".cache", "salt-visual-taxonomy-candidates", "siglip-large-patch16-384"),
);
const checkpointPath = resolve(
  process.env.SALT_VISUAL_CANDIDATE_BASE_CHECKPOINT ||
    resolve(homedir(), ".cache", "salt-visual-taxonomy-candidates", "siglip-large-patch16-384.checkpoint.json"),
);
const python = process.env.SALT_VISUAL_MLX_PYTHON || resolve(homedir(), ".cache", "salt-visual-taxonomy-training", "venv", "bin", "python");

async function fileExists(path) {
  try { return (await stat(path)).isFile(); } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function modelIsComplete() {
  return (await fileExists(resolve(modelPath, "config.json"))) &&
    (await fileExists(resolve(modelPath, "model.safetensors")) || await fileExists(resolve(modelPath, "model.safetensors.index.json"))) &&
    await fileExists(resolve(modelPath, "preprocessor_config.json"));
}

async function findCommand(names) {
  for (const name of names) {
    try {
      const result = await execFileAsync("/usr/bin/which", [name], { maxBuffer: 1024 * 1024 });
      const path = String(result.stdout || "").trim();
      if (path) return path;
    } catch {
      // Try the next supported downloader.
    }
  }
  return "";
}

async function downloadModel() {
  await mkdir(modelPath, { recursive: true });
  const hf = await findCommand(["huggingface-cli", "hf"]);
  if (hf) {
    await execFileAsync(hf, ["download", "--local-dir", modelPath, modelId], {
      cwd: rootDir,
      env: { ...process.env, HF_HUB_DISABLE_TELEMETRY: "1" },
      maxBuffer: 32 * 1024 * 1024,
    });
    return "huggingface-cli";
  }
  const downloaderPython = existsSync(python) ? python : "python3";
  const code = "import sys; from huggingface_hub import snapshot_download; snapshot_download(repo_id=sys.argv[1], local_dir=sys.argv[2])";
  await execFileAsync(downloaderPython, ["-c", code, modelId, modelPath], {
    cwd: rootDir,
    env: { ...process.env, HF_HUB_DISABLE_TELEMETRY: "1" },
    maxBuffer: 32 * 1024 * 1024,
  });
  return downloaderPython;
}

async function createCheckpoint() {
  await mkdir(dirname(checkpointPath), { recursive: true });
  await execFileAsync(process.execPath, [
    resolve(rootDir, "scripts", "prepare-visual-taxonomy-base-checkpoint.mjs"),
    "--model-path", modelPath,
    "--output", checkpointPath,
    "--model-id", modelId,
  ], { cwd: rootDir, maxBuffer: 16 * 1024 * 1024 });
}

async function main() {
  let source = "cache";
  if (!(await modelIsComplete())) source = await downloadModel();
  if (!(await modelIsComplete())) throw new Error(`Candidate model download did not produce a complete MLX model at ${modelPath}`);
  if (!(await fileExists(checkpointPath))) await createCheckpoint();
  process.stdout.write(`${JSON.stringify({
    status: "ready",
    modelId,
    modelPath,
    checkpointPath,
    source,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
