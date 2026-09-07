#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  assertVisualTaxonomyModel,
  VISUAL_TAXONOMY_MODEL_VERSION,
} from "../src/lib/visual-taxonomy-model.js";
import { CATALOG_TAXONOMY_VERSION, getCatalogTaxonomyDefinitions } from "../src/lib/catalog-taxonomy.js";
import { taxonomyTrainingFingerprint } from "../src/lib/catalog-knowledge-model.js";

const rootDir = resolve(import.meta.dirname, "..");
const modelPath = resolve(process.env.SALT_VISUAL_TAXONOMY_MODEL_PATH || resolve(rootDir, "output", "visual-taxonomy-model.json"));
const outputPath = resolve(process.env.SALT_VISUAL_TAXONOMY_EVIDENCE_PATH || resolve(rootDir, "output", "visual-taxonomy-evidence.json"));
const catalogPath = resolve(process.env.SALT_VISUAL_TAXONOMY_INFERENCE_CATALOG || resolve(rootDir, "output", "release-catalog-snapshot.json"));
const backendPath = resolve(rootDir, "scripts", "visual-taxonomy-infer-mlx.py");
const execFileAsync = promisify(execFile);
const fetchConcurrency = Math.max(1, Math.min(32, Number(process.env.SALT_VISUAL_TAXONOMY_FETCH_CONCURRENCY || 12)));
const requestAttempts = Math.max(1, Math.min(4, Number(process.env.SALT_VISUAL_TAXONOMY_FETCH_ATTEMPTS || 3)));
const requestTimeoutMs = Math.max(5_000, Number(process.env.SALT_VISUAL_TAXONOMY_FETCH_TIMEOUT_MS || 20_000));

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function productImageUrls(product) {
  const media = asArray(product?.media?.nodes || product?.media);
  const images = asArray(product?.images).concat(media);
  return [...new Set(images.map((image) => {
    if (typeof image === "string") return image;
    return image?.src || image?.url || image?.image?.url || "";
  }).filter((url) => /^https?:\/\//i.test(url)))].slice(0, 4);
}

function imageExtension(url) {
  const extension = extname(new URL(url).pathname).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".avif", ".heic"].includes(extension) ? extension : ".jpg";
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fetchImage(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= requestAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "image/avif,image/webp,image/jpeg,image/png,*/*" },
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      if (!response.ok) throw new Error(`image HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.byteLength) throw new Error("image response was empty");
      return { bytes, sha256: sha256Bytes(bytes) };
    } catch (error) {
      lastError = error;
      if (attempt < requestAttempts) await new Promise((resolveSleep) => setTimeout(resolveSleep, 250 * 2 ** (attempt - 1)));
    }
  }
  throw lastError || new Error("image fetch failed");
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

async function writeJsonLines(path, entries) {
  await writeFile(path, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
}

async function runEncoder(command, manifestPath, datasetPath, embeddingsPath, checkpointPath) {
  if (!Array.isArray(command) || !command.length || command[0] === "precomputed-embeddings") {
    throw new Error("A real image encoder command is required to run the installed visual model.");
  }
  const [executable, ...prefixArgs] = command;
  await execFileAsync(executable, [...prefixArgs, manifestPath, datasetPath, embeddingsPath], {
    cwd: rootDir,
    env: {
      ...process.env,
      SALT_VISUAL_BASE_CHECKPOINT: checkpointPath || "",
      SALT_VISUAL_REQUIRE_METAL: "1",
      PYTHONUNBUFFERED: "1",
    },
    maxBuffer: 32 * 1024 * 1024,
  });
}

async function readInferenceResults(path, labelIndex, productById) {
  const byProduct = new Map();
  const input = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of input) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    const productId = String(record?.productId || "");
    const product = productById.get(productId);
    const ruleId = labelIndex.get(Number(record?.topIndex)) || String(record?.ruleId || "");
    const confidence = Number(record?.confidence);
    const margin = Number(record?.margin);
    if (!product || !ruleId || !Number.isFinite(confidence) || !Number.isFinite(margin)) continue;
    if (!byProduct.has(productId)) byProduct.set(productId, []);
    byProduct.get(productId).push({
      ruleId,
      confidence,
      margin,
      imageSha256: String(record?.imageSha256 || ""),
      candidates: asArray(record?.candidates),
    });
  }
  return byProduct;
}

function aggregateEvidence(product, predictions, model) {
  const totals = new Map();
  for (const prediction of predictions) totals.set(prediction.ruleId, (totals.get(prediction.ruleId) || 0) + prediction.confidence);
  const ranked = [...totals.entries()].sort((left, right) => right[1] - left[1]);
  const total = Math.max(1e-9, ranked.reduce((sum, [, value]) => sum + value, 0));
  const top = ranked[0] || ["", 0];
  const second = ranked[1] || ["", 0];
  const confidence = top[1] / total;
  const margin = (top[1] - second[1]) / total;
  const accepted = predictions.length >= 2
    ? confidence >= 0.78 && margin >= 0.18
    : confidence >= 0.9 && margin >= 0.25;
  return {
    productId: String(product?.id || product?.handle || ""),
    handle: String(product?.handle || ""),
    ruleId: top[0],
    confidence,
    margin,
    accepted,
    reason: accepted
      ? "Metal visual adapter consensus passed confidence and cross-image margin gates."
      : "Held for explicit classification review because visual confidence, margin, or multi-image agreement was insufficient.",
    source: "trained-visual-taxonomy-model",
    modelVersion: model.modelVersion || VISUAL_TAXONOMY_MODEL_VERSION,
    imageCount: predictions.length,
    imageSha256: predictions.map((prediction) => prediction.imageSha256).filter(Boolean),
    candidates: ranked.slice(0, 3).map(([ruleId, score]) => ({ ruleId, score: score / total })),
  };
}

async function main() {
  let model;
  try {
    model = JSON.parse(await readFile(modelPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      await rm(outputPath, { force: true });
      process.stdout.write("No trained visual taxonomy model is installed; visual inference skipped.\n");
      return;
    }
    throw error;
  }
  if (model?.candidateOnly === true && process.env.SALT_RELEASE_ALLOW_CANDIDATE_VISUAL_EVIDENCE !== "1") {
    await rm(outputPath, { force: true });
    process.stdout.write("Candidate-only visual model found; automatic taxonomy inference remains disabled and evidence was not published.\n");
    return;
  }
  if (!model?.encoder?.fineTunedCheckpointPath) throw new Error("Visual taxonomy model has no fine-tuned encoder checkpoint path.");
  const weightsPath = resolve(rootDir, model.weights.path);
  const encoderCheckpointPath = resolve(model.encoder.fineTunedCheckpointPath);
  await assertVisualTaxonomyModel(model, {
    taxonomyVersion: CATALOG_TAXONOMY_VERSION,
    taxonomyFingerprint: taxonomyTrainingFingerprint(getCatalogTaxonomyDefinitions()),
    requireRawDataPurged: true,
    weightsPath,
  });
  const encoderCheckpointSha256 = await hashFile(encoderCheckpointPath);
  if (encoderCheckpointSha256 !== model.encoder.fineTunedCheckpointSha256) {
    throw new Error("Visual taxonomy fine-tuned encoder checkpoint checksum does not match the installed model metadata.");
  }
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const products = asArray(catalog?.products).filter((product) => String(product?.status || "active").toLowerCase() === "active");
  const productById = new Map(products.map((product) => [String(product?.id || product?.handle || ""), product]));
  const tempDir = await import("node:fs/promises").then(({ mkdtemp }) => mkdtemp(resolve(tmpdir(), "salt-visual-inference-")));
  const manifestEntries = [];
  const downloadInputs = products.flatMap((product) => productImageUrls(product).map((url, imageIndex) => ({ product, url, imageIndex })));
  try {
    await mapWithConcurrency(downloadInputs, fetchConcurrency, async ({ product, url, imageIndex }) => {
      try {
        const image = await fetchImage(url);
        const productKey = String(product?.id || product?.handle || "product").replace(/[^a-zA-Z0-9_-]+/g, "_");
        const imagePath = resolve(tempDir, `${productKey}-${imageIndex}${imageExtension(url)}`);
        await writeFile(imagePath, image.bytes);
        manifestEntries.push({
          image: relative(tempDir, imagePath),
          imageSha256: image.sha256,
          productId: String(product?.id || product?.handle || ""),
          ruleId: "inference",
          split: "inference",
        });
      } catch (error) {
        process.stderr.write(`Visual model image skipped for ${product?.handle || product?.id}: ${error.message}\n`);
      }
    });
    manifestEntries.sort((left, right) => `${left.productId}\n${left.image}`.localeCompare(`${right.productId}\n${right.image}`));
    if (!manifestEntries.length) throw new Error("No active-catalog images were available for visual model inference.");
    const manifestPath = resolve(tempDir, "inference-manifest.jsonl");
    const embeddingsPath = resolve(tempDir, "embeddings.jsonl");
    const resultPath = resolve(tempDir, "inference-results.jsonl");
    await writeJsonLines(manifestPath, manifestEntries);
    const command = process.env.SALT_VISUAL_ENCODER_COMMAND_JSON
      ? JSON.parse(process.env.SALT_VISUAL_ENCODER_COMMAND_JSON)
      : model.encoder.command;
    await runEncoder(command, manifestPath, tempDir, embeddingsPath, model.encoder.fineTunedCheckpointPath);
    const labels = new Map(asArray(model.taxonomy?.labels).map((entry) => [Number(entry.index), entry.ruleId]));
    const labelsPath = resolve(tempDir, "labels.json");
    await writeFile(labelsPath, JSON.stringify(asArray(model.taxonomy?.labels)));
    await execFileAsync(process.env.SALT_VISUAL_MLX_PYTHON || "python3", [backendPath, embeddingsPath, weightsPath, labelsPath, resultPath, "--metal"], {
      cwd: rootDir,
      env: { ...process.env, PYTHONUNBUFFERED: "1", SALT_VISUAL_REQUIRE_METAL: "1" },
      maxBuffer: 32 * 1024 * 1024,
    });
    const predictionsByProduct = await readInferenceResults(resultPath, labels, productById);
    const evidence = {};
    for (const [productId, predictions] of predictionsByProduct.entries()) {
      evidence[productById.get(productId)?.handle || productId] = aggregateEvidence(productById.get(productId), predictions, model);
    }
    await mkdir(resolve(outputPath, ".."), { recursive: true });
    const temporaryPath = `${outputPath}.tmp-${process.pid}`;
    await writeFile(temporaryPath, `${JSON.stringify({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      modelVersion: model.modelVersion,
      modelSha256: await hashFile(modelPath),
      catalogGeneratedAt: catalog.generatedAt || "",
      products: evidence,
    }, null, 2)}\n`, "utf8");
    await rename(temporaryPath, outputPath);
    process.stdout.write(`Visual taxonomy model inference completed for ${Object.keys(evidence).length}/${products.length} active products; unresolved evidence remains review-only.\n`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
