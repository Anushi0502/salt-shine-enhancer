#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
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
import { catalogVisualFingerprint, catalogVisualProductFingerprint } from "../src/lib/catalog-fingerprint.js";
import { readFileWithRetry } from "./reliable-file-read.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const modelPath = resolve(process.env.SALT_VISUAL_TAXONOMY_MODEL_PATH || resolve(rootDir, "output", "visual-taxonomy-model.json"));
const outputPath = resolve(process.env.SALT_VISUAL_TAXONOMY_EVIDENCE_PATH || resolve(rootDir, "output", "visual-taxonomy-evidence.json"));
const catalogPath = resolve(process.env.SALT_VISUAL_TAXONOMY_INFERENCE_CATALOG || resolve(rootDir, "output", "release-catalog-snapshot.json"));
const reviewManifestPath = resolve(process.env.SALT_VISUAL_TAXONOMY_REVIEW_MANIFEST || resolve(rootDir, "output", "shopify-catalog-integrity-manifest.json"));
const backendPath = resolve(rootDir, "scripts", "visual-taxonomy-infer-mlx.py");
const execFileAsync = promisify(execFile);
const fetchConcurrency = Math.max(1, Math.min(32, Number(process.env.SALT_VISUAL_TAXONOMY_FETCH_CONCURRENCY || 12)));
const requestAttempts = Math.max(1, Math.min(4, Number(process.env.SALT_VISUAL_TAXONOMY_FETCH_ATTEMPTS || 3)));
const requestTimeoutMs = Math.max(5_000, Number(process.env.SALT_VISUAL_TAXONOMY_FETCH_TIMEOUT_MS || 20_000));
const defaultInferenceScope = String(process.env.SALT_VISUAL_TAXONOMY_SCOPE || "review-required").trim().toLowerCase();
const REVIEW_TAGS = new Set(["classification-fallback", "classification-review"]);

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

async function mapWithConcurrency(items, concurrency, mapper, onProgress = null) {
  const results = new Array(items.length);
  let nextIndex = 0;
  let completed = 0;
  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
      completed += 1;
      onProgress?.(completed, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function writeJsonLines(path, entries) {
  await writeFile(path, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
}

function reusableEvidence(existing, model, modelSha256, products, visualFingerprint) {
  if (!existing || existing.modelVersion !== model.modelVersion) return false;
  if (existing.modelSha256 !== modelSha256 || existing.catalogFingerprint !== visualFingerprint) return false;
  if (Number(existing.catalogProductCount || 0) !== products.length) return false;
  const expected = products.filter((product) => productImageUrls(product).length > 0);
  const evidence = existing.products && typeof existing.products === "object" ? existing.products : {};
  return expected.every((product) => Object.prototype.hasOwnProperty.call(evidence, String(product?.handle || product?.id || "")));
}

function productKey(product) {
  return String(product?.handle || product?.id || "");
}

function productHasReviewTag(product) {
  return asArray(product?.tags).some((tag) => REVIEW_TAGS.has(String(tag).trim().toLowerCase()));
}

function selectInferenceProducts(products, scope = defaultInferenceScope, reviewHandles = new Set()) {
  if (!["all", "review-required"].includes(scope)) {
    throw new Error(`Unsupported visual taxonomy inference scope: ${scope}. Use all or review-required.`);
  }
  if (scope === "all") return products.filter((product) => productImageUrls(product).length > 0);
  const explicitReviewHandles = reviewHandles instanceof Set ? reviewHandles : new Set(reviewHandles);
  const hasExplicitReviewSource = explicitReviewHandles.size > 0 || products.some(productHasReviewTag);
  if (!hasExplicitReviewSource) return products.filter((product) => productImageUrls(product).length > 0);
  return products.filter((product) => {
    if (!productImageUrls(product).length) return false;
    return explicitReviewHandles.has(productKey(product)) || productHasReviewTag(product);
  });
}

async function readReviewHandles() {
  try {
    const manifest = JSON.parse(await readFileWithRetry(reviewManifestPath, "utf8"));
    return new Set(asArray(manifest?.classifications)
      .filter((entry) => ["review", "fallback"].includes(String(entry?.source || "").toLowerCase()))
      .map((entry) => productKey(entry))
      .filter(Boolean));
  } catch (error) {
    if (error?.code !== "ENOENT") process.stderr.write(`Visual taxonomy review manifest ignored: ${error.message}\n`);
    return new Set();
  }
}

function reusableProductEvidence(existing, model, modelSha256, product) {
  if (!existing || existing.modelVersion !== model.modelVersion || existing.modelSha256 !== modelSha256) return null;
  const evidence = existing.products?.[productKey(product)];
  if (!evidence || evidence.productVisualFingerprint !== catalogVisualProductFingerprint(product)) return null;
  return evidence;
}

async function writeEvidenceArtifact({ model, modelSha256, visualFingerprint, catalog, products, evidence, inferenceScope }) {
  await mkdir(resolve(outputPath, ".."), { recursive: true });
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    modelVersion: model.modelVersion,
    modelSha256,
    catalogFingerprint: visualFingerprint,
    catalogProductCount: products.length,
    inferenceProductCount: Object.keys(evidence).length,
    inferenceScope,
    catalogGeneratedAt: catalog.generatedAt || "",
    products: evidence,
  }, null, 2)}\n`, "utf8");
  await rename(temporaryPath, outputPath);
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
    const logitMargin = Number(record?.logitMargin);
    if (!product || !ruleId || !Number.isFinite(confidence) || !Number.isFinite(margin)) continue;
    if (!byProduct.has(productId)) byProduct.set(productId, []);
    byProduct.get(productId).push({
      ruleId,
      confidence,
      margin,
      logitMargin: Number.isFinite(logitMargin) ? logitMargin : null,
      selectiveAccepted: record?.selectiveAccepted !== false,
      imageSha256: String(record?.imageSha256 || ""),
      candidates: asArray(record?.candidates),
    });
  }
  return byProduct;
}

function aggregateEvidence(product, predictions, model) {
  const selectivePredictions = predictions.filter((prediction) => prediction.selectiveAccepted);
  const usesSelectivePolicy = predictions.some((prediction) => prediction.logitMargin !== null);
  const decisionPredictions = usesSelectivePolicy ? selectivePredictions : predictions;
  const totals = new Map();
  for (const prediction of decisionPredictions) totals.set(prediction.ruleId, (totals.get(prediction.ruleId) || 0) + prediction.confidence);
  const ranked = [...totals.entries()].sort((left, right) => right[1] - left[1]);
  const total = Math.max(1e-9, ranked.reduce((sum, [, value]) => sum + value, 0));
  const top = ranked[0] || ["", 0];
  const second = ranked[1] || ["", 0];
  const confidence = top[1] / total;
  const margin = (top[1] - second[1]) / total;
  const acceptedImageCount = selectivePredictions.length;
  const requiredAcceptedImages = predictions.length >= 2 ? Math.ceil(predictions.length / 2) : 1;
  const accepted = decisionPredictions.length > 0 && (!usesSelectivePolicy || acceptedImageCount >= requiredAcceptedImages) && (
    predictions.length >= 2
      ? confidence >= 0.78 && margin >= 0.18
      : confidence >= 0.9 && margin >= 0.25
  );
  return {
    productId: String(product?.id || product?.handle || ""),
    handle: String(product?.handle || ""),
    ruleId: top[0],
    confidence,
    margin,
    accepted,
    reason: accepted
      ? usesSelectivePolicy
        ? "Metal visual adapter consensus passed the calibrated high-margin decision policy and cross-image agreement gate."
        : "Metal visual adapter consensus passed confidence and cross-image margin gates."
      : "Held for explicit classification review because visual confidence, calibrated margin, or multi-image agreement was insufficient.",
    source: "trained-visual-taxonomy-model",
    modelVersion: model.modelVersion || VISUAL_TAXONOMY_MODEL_VERSION,
    imageCount: predictions.length,
    acceptedImageCount,
    selectiveDecisionPolicy: usesSelectivePolicy ? "high-margin-only" : "legacy-consensus",
    imageSha256: predictions.map((prediction) => prediction.imageSha256).filter(Boolean),
    candidates: ranked.slice(0, 3).map(([ruleId, score]) => ({ ruleId, score: score / total })),
  };
}

async function main() {
  let model;
  try {
    model = JSON.parse(await readFileWithRetry(modelPath, "utf8"));
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
  const catalog = JSON.parse(await readFileWithRetry(catalogPath, "utf8"));
  const products = asArray(catalog?.products).filter((product) => String(product?.status || "active").toLowerCase() === "active");
  const visualFingerprint = catalogVisualFingerprint(products);
  const modelSha256 = await hashFile(modelPath);
  const inferenceScope = defaultInferenceScope;
  let existing = null;
  try {
    existing = JSON.parse(await readFileWithRetry(outputPath, "utf8"));
    if (reusableEvidence(existing, model, modelSha256, products, visualFingerprint)) {
      process.stdout.write(`Reusing verified Metal visual taxonomy evidence for ${Object.keys(existing.products).length}/${products.length} active products.\n`);
      return;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") process.stderr.write(`Visual taxonomy evidence cache ignored: ${error.message}\n`);
  }
  const reviewHandles = await readReviewHandles();
  const inferenceProducts = selectInferenceProducts(products, inferenceScope, reviewHandles);
  const evidence = {};
  for (const product of inferenceProducts) {
    const reusable = reusableProductEvidence(existing, model, modelSha256, product);
    if (reusable) evidence[productKey(product)] = reusable;
  }
  const productsToInfer = inferenceProducts.filter((product) => !evidence[productKey(product)]);
  process.stdout.write(`Visual taxonomy scope: ${inferenceProducts.length}/${products.length} products require image inference; reusing ${Object.keys(evidence).length}, recomputing ${productsToInfer.length}.\n`);
  if (!productsToInfer.length) {
    await writeEvidenceArtifact({ model, modelSha256, visualFingerprint, catalog, products, evidence, inferenceScope });
    process.stdout.write(`Visual taxonomy evidence cache is complete for the selected scope (${Object.keys(evidence).length} products).\n`);
    return;
  }
  const productById = new Map(productsToInfer.map((product) => [String(product?.id || product?.handle || ""), product]));
  const tempDir = await import("node:fs/promises").then(({ mkdtemp }) => mkdtemp(resolve(tmpdir(), "salt-visual-inference-")));
  const manifestEntries = [];
  const downloadInputs = productsToInfer.flatMap((product) => productImageUrls(product).map((url, imageIndex) => ({ product, url, imageIndex })));
  try {
    const progressEvery = Math.max(1, Math.ceil(downloadInputs.length / 20));
    await mapWithConcurrency(downloadInputs, fetchConcurrency, async ({ product, url, imageIndex }) => {
      try {
        const image = await fetchImage(url);
        const safeProductKey = String(product?.id || product?.handle || "product").replace(/[^a-zA-Z0-9_-]+/g, "_");
        const imagePath = resolve(tempDir, `${safeProductKey}-${imageIndex}${imageExtension(url)}`);
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
    }, (completed, total) => {
      if (completed % progressEvery === 0 || completed === total) {
        process.stdout.write(`Visual taxonomy image staging ${completed}/${total} (${Math.round(completed / total * 100)}%).\n`);
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
    for (const [productId, predictions] of predictionsByProduct.entries()) {
      const product = productById.get(productId);
      const productEvidence = aggregateEvidence(product, predictions, model);
      productEvidence.productVisualFingerprint = catalogVisualProductFingerprint(product);
      evidence[productKey(product) || productId] = productEvidence;
    }
    await writeEvidenceArtifact({ model, modelSha256, visualFingerprint, catalog, products, evidence, inferenceScope });
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

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

export { reusableEvidence, reusableProductEvidence, selectInferenceProducts };
