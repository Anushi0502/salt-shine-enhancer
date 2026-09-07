#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");

function parseArgs(argv) {
  const args = {
    modelPath: process.env.SALT_VISUAL_ENCODER_MODEL_PATH || "",
    output: process.env.SALT_VISUAL_BASE_CHECKPOINT || "",
    modelId: process.env.SALT_VISUAL_ENCODER_MODEL_ID || "google/siglip-base-patch16-224",
  };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (!["--model-path", "--output", "--model-id"].includes(token) || !next) throw new Error(`Expected --model-path, --output, or --model-id value; got ${token}.`);
    if (token === "--model-path") args.modelPath = next;
    if (token === "--output") args.output = next;
    if (token === "--model-id") args.modelId = next;
    index += 1;
  }
  if (!args.modelPath || !args.output) throw new Error("--model-path and --output are required.");
  return args;
}

async function walkFiles(directory, prefix = "") {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walkFiles(path, name));
    else if (entry.isFile()) result.push({ name, path });
  }
  return result.sort((left, right) => left.name.localeCompare(right.name));
}

async function hashFile(path) {
  const hash = createHash("sha256");
  const bytes = await readFile(path);
  hash.update(bytes);
  return { sha256: hash.digest("hex"), bytes: bytes.byteLength };
}

async function main() {
  const args = parseArgs(process.argv);
  const modelPath = resolve(args.modelPath);
  const modelStat = await stat(modelPath);
  if (!modelStat.isDirectory()) throw new Error(`--model-path must be a directory: ${modelPath}`);
  const files = await walkFiles(modelPath);
  if (!files.length) throw new Error(`No model files found in ${modelPath}`);
  const fileRecords = [];
  for (const file of files) fileRecords.push({ path: file.name, ...(await hashFile(file.path)) });
  const fingerprint = createHash("sha256")
    .update(fileRecords.map((file) => `${file.path}\0${file.bytes}\0${file.sha256}`).join("\n"))
    .digest("hex");
  const output = resolve(args.output);
  await writeFile(output, `${JSON.stringify({
    kind: "salt-visual-base-checkpoint",
    version: 1,
    modelId: args.modelId,
    modelPath,
    modelFingerprint: fingerprint,
    files: fileRecords,
    generatedAt: new Date().toISOString(),
  }, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote immutable SigLIP base checkpoint manifest for ${fileRecords.length} files: ${output}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
