#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { readdir, readFile, rename, stat, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootDir = resolve(import.meta.dirname, "..");
const defaultCheckpoint = resolve(homedir(), ".cache", "salt-visual-taxonomy-candidates", "siglip-large-patch16-384.checkpoint.json");
const defaultHealth = resolve(dirname(defaultCheckpoint), "siglip-large-patch16-384.health.json");
const defaultPython = resolve(homedir(), ".cache", "salt-visual-taxonomy-training", "venv", "bin", "python");

function parseArgs(argv) {
  const args = {
    checkpoint: defaultCheckpoint,
    health: defaultHealth,
    image: "",
    python: process.env.SALT_VISUAL_MLX_PYTHON || defaultPython,
  };
  const flags = new Map([["--checkpoint", "checkpoint"], ["--health", "health"], ["--image", "image"], ["--python", "python"]]);
  for (let index = 2; index < argv.length; index += 1) {
    const key = flags.get(argv[index]);
    const value = argv[index + 1];
    if (!key || value === undefined) throw new Error(`Expected a supported candidate verification flag; got ${argv[index]}.`);
    args[key] = value;
    index += 1;
  }
  return {
    ...args,
    checkpoint: resolve(args.checkpoint),
    health: resolve(args.health),
    image: args.image ? resolve(args.image) : "",
    python: resolve(args.python),
  };
}

async function pathExists(path) {
  try { await stat(path); return true; } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function findFirstImage(root) {
  if (!(await pathExists(root))) return "";
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFirstImage(path);
      if (nested) return nested;
    } else if (/\.(?:avif|gif|jpe?g|png|webp|img)$/i.test(entry.name)) {
      return path;
    }
  }
  return "";
}

function sha256(path) {
  return new Promise((resolvePromise, rejectPromise) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", rejectPromise);
    stream.on("end", () => resolvePromise(hash.digest("hex")));
  });
}

async function writeHealth(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

async function main() {
  const args = parseArgs(process.argv);
  const checkpoint = JSON.parse(await readFile(args.checkpoint, "utf8"));
  if (checkpoint.kind !== "salt-visual-base-checkpoint") throw new Error(`Invalid visual checkpoint manifest: ${args.checkpoint}`);
  const modelPath = resolve(String(checkpoint.modelPath || ""));
  if (!existsSync(modelPath)) throw new Error(`Candidate model directory is missing: ${modelPath}`);
  const image = args.image || await findFirstImage(resolve(rootDir, "output", "manual-visual-review"));
  if (!image) throw new Error("No local visual-review image is available for the Metal smoke test.");
  const checkedAt = new Date().toISOString();
  try {
    const result = await execFileAsync(args.python, [
      resolve(rootDir, "scripts", "visual-taxonomy-encoder-mlx.py"),
      "smoke",
      args.checkpoint,
      image,
    ], {
      cwd: rootDir,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      maxBuffer: 16 * 1024 * 1024,
    });
    const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
    const runtime = JSON.parse(lines.at(-1));
    if (runtime.device !== "metal" || Number(runtime.embeddingDimensions) <= 0 || Number(runtime.records) !== 1) {
      throw new Error(`Unexpected Metal smoke result: ${result.stdout.trim()}`);
    }
    const health = {
      kind: "salt-visual-candidate-health",
      version: 1,
      status: "passed",
      modelId: checkpoint.modelId,
      license: "apache-2.0",
      sourceUrl: `https://huggingface.co/${checkpoint.modelId}`,
      checkpointPath: resolve(args.checkpoint),
      modelPath,
      modelFingerprint: checkpoint.modelFingerprint,
      runtime: {
        device: runtime.device,
        embeddingDimensions: Number(runtime.embeddingDimensions),
        records: Number(runtime.records),
        imagePath: image,
        imageSha256: await sha256(image),
      },
      checkedAt,
    };
    await writeHealth(args.health, health);
    process.stdout.write(`${JSON.stringify(health, null, 2)}\n`);
  } catch (error) {
    await writeHealth(args.health, {
      kind: "salt-visual-candidate-health",
      version: 1,
      status: "failed",
      checkpointPath: resolve(args.checkpoint),
      modelFingerprint: checkpoint.modelFingerprint,
      error: String(error?.stderr || error?.message || error),
      checkedAt,
    });
    throw error;
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
