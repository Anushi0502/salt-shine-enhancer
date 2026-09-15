#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile, rename, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, resolve } from "node:path";
import { promisify } from "node:util";

import { catalogVisualFingerprint } from "../src/lib/catalog-fingerprint.js";
import { getCatalogTaxonomyDefinitions } from "../src/lib/catalog-taxonomy.js";
import { assessVisionTaxonomyAlignment } from "../src/lib/catalog-vision-alignment.js";

const rootDir = resolve(import.meta.dirname, "..");
const outputDir = resolve(rootDir, "output");
const defaultCatalogPath = resolve(outputDir, "release-catalog-snapshot.json");
const defaultReviewManifestPath = resolve(outputDir, "catalog-image-review", "review-manifest.json");
const defaultOutputPath = resolve(outputDir, "visual-taxonomy-candidate-evidence.json");
const defaultCheckpointPath = resolve(
  homedir(),
  ".cache",
  "salt-visual-taxonomy-candidates",
  "siglip-large-patch16-384.checkpoint.json",
);
const defaultHealthPath = resolve(
  homedir(),
  ".cache",
  "salt-visual-taxonomy-candidates",
  "siglip-large-patch16-384.health.json",
);
const defaultPython = resolve(
  homedir(),
  ".cache",
  "salt-visual-taxonomy-training",
  "venv",
  "bin",
  "python",
);
const execFileAsync = promisify(execFile);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeHandle(value) {
  return String(value || "").trim().toLowerCase();
}

function parseArgs(argv) {
  const args = {
    catalog: defaultCatalogPath,
    reviewManifest: defaultReviewManifestPath,
    output: defaultOutputPath,
    checkpoint: defaultCheckpointPath,
    health: defaultHealthPath,
    python: process.env.SALT_VISUAL_MLX_PYTHON || defaultPython,
    limit: Number(process.env.SALT_VISUAL_CANDIDATE_REVIEW_LIMIT || 1000),
  };
  const flags = new Map([
    ["--catalog", "catalog"],
    ["--review-manifest", "reviewManifest"],
    ["--output", "output"],
    ["--checkpoint", "checkpoint"],
    ["--health", "health"],
    ["--python", "python"],
    ["--limit", "limit"],
  ]);
  for (let index = 2; index < argv.length; index += 1) {
    const key = flags.get(argv[index]);
    const value = argv[index + 1];
    if (!key || value === undefined) throw new Error(`Expected a supported candidate inference flag; got ${argv[index]}.`);
    args[key] = key === "limit" ? Number(value) : value;
    index += 1;
  }
  if (!Number.isInteger(args.limit) || args.limit < 0) throw new Error("--limit must be a non-negative integer.");
  return Object.fromEntries(Object.entries(args).map(([key, value]) => [
    key,
    key === "limit" ? value : resolve(String(value)),
  ]));
}

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT" && fallback !== null) return fallback;
    throw error;
  }
}

async function pathIsFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function imageExtension(url) {
  try {
    const extension = extname(new URL(url).pathname).toLowerCase();
    return [".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(extension) ? extension : ".jpg";
  } catch {
    return ".jpg";
  }
}

function resizedImageUrl(url) {
  try {
    const parsed = new URL(url);
    if (/cdn\.shopify\.com$/i.test(parsed.hostname) || /shopifycdn\.net$/i.test(parsed.hostname)) {
      parsed.searchParams.set("width", "384");
      return parsed.toString();
    }
  } catch {
    // The fetch path below records malformed and unreachable images as review-only failures.
  }
  return url;
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function chunkItems(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

async function fetchImage(url) {
  let lastError = null;
  const attempts = Math.max(1, Math.min(4, Number(process.env.SALT_VISUAL_CANDIDATE_FETCH_ATTEMPTS || 3)));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(resizedImageUrl(url), {
        headers: {
          Accept: "image/avif,image/webp,image/jpeg,image/png,*/*",
          "User-Agent": "SALT-local-visual-review/1.0",
        },
        signal: AbortSignal.timeout(Math.max(5_000, Number(process.env.SALT_VISUAL_CANDIDATE_FETCH_TIMEOUT_MS || 20_000))),
      });
      if (!response.ok) throw new Error(`image HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.byteLength) throw new Error("image response was empty");
      return { bytes, sha256: sha256Bytes(bytes) };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolveSleep) => setTimeout(resolveSleep, 250 * 2 ** (attempt - 1)));
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
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, () => worker()));
  return results;
}

function promptsForDefinition(definition) {
  const type = String(definition?.canonicalType || definition?.id || "retail product").trim();
  const category = String(definition?.shopifyCategory || definition?.subcategoryId || "").replace(/>/g, ",").trim();
  const aliases = asArray(definition?.aliases)
    .map((alias) => String(alias || "").trim())
    .filter(Boolean)
    .slice(0, 3);
  const categorySuffix = category ? `; retail category ${category}` : "";
  const prompts = [
    `a clear retail product photo of a ${type}${categorySuffix}`,
    `a product listing image showing a ${type}${categorySuffix}`,
    `a catalog photo of a ${type}${categorySuffix}`,
    ...aliases.map((alias) => `a retail product listing photo of a ${alias}${categorySuffix}`),
  ];
  return [...new Set(prompts)];
}

export function buildCandidateLabels(definitions = getCatalogTaxonomyDefinitions()) {
  return definitions
    .filter((definition) => definition?.id && !definition.generic)
    .map((definition) => {
      const prompts = promptsForDefinition(definition);
      return { ruleId: definition.id, prompt: prompts[0], prompts };
    })
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId));
}

function pendingReviewRecords(reviewManifest, productsByHandle, limit) {
  return asArray(reviewManifest?.records)
    .filter((record) => record?.status === "pending" || record?.rawClassification?.reviewRequired === true)
    .map((record) => {
      const handle = normalizeHandle(record.handle);
      const product = productsByHandle.get(handle);
      return product ? { record, product, handle } : null;
    })
    .filter(Boolean)
    .slice(0, limit);
}

function aggregateProductEvidence(product, imageRecords, modelId, modelFingerprint) {
  if (!imageRecords.length) {
    return {
      productId: String(product?.id || ""),
      handle: String(product?.handle || ""),
      source: "candidate-visual-taxonomy-model",
      candidateOnly: true,
      modelId,
      modelFingerprint,
      ruleId: "",
      confidence: 0,
      margin: 0,
      modelConfidence: 0,
      imageAgreement: 0,
      accepted: false,
      imageCount: 0,
      imageSha256: [],
      candidates: [],
      reason: "No product image could be fetched; retained in explicit classification fallback.",
    };
  }
  const votes = new Map();
  const scoreByRule = new Map();
  for (const image of imageRecords) {
    const ruleId = String(image.ruleId || "");
    if (ruleId) votes.set(ruleId, (votes.get(ruleId) || 0) + 1);
    for (const candidate of asArray(image.candidates)) {
      const candidateRuleId = String(candidate?.ruleId || "");
      const probability = Number(candidate?.probability || 0);
      if (candidateRuleId && Number.isFinite(probability)) {
        scoreByRule.set(candidateRuleId, (scoreByRule.get(candidateRuleId) || 0) + probability);
      }
    }
  }
  const rankedVotes = [...votes.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const top = rankedVotes[0] || ["", 0];
  const second = rankedVotes[1] || ["", 0];
  const imageCount = imageRecords.length;
  const imageAgreement = top[1] / imageCount;
  const margin = imageAgreement - second[1] / imageCount;
  const rankedCandidates = [...scoreByRule.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([ruleId, score]) => ({ ruleId, score: score / imageCount }));
  const modelConfidence = Number(
    imageRecords
      .filter((image) => image.ruleId === top[0])
      .reduce((sum, image) => sum + Number(image.confidence || 0), 0) / Math.max(1, top[1]),
  );
  const visionAlignment = top[0] ? assessVisionTaxonomyAlignment(product, top[0]) : { accepted: false, reason: "No candidate rule was returned." };
  const consensusAccepted = imageCount >= 2 && imageAgreement >= 0.75 && margin >= 0.25 && modelConfidence >= 0.03;
  const accepted = consensusAccepted && visionAlignment.accepted;
  return {
    productId: String(product?.id || ""),
    handle: String(product?.handle || ""),
    source: "candidate-visual-taxonomy-model",
    candidateOnly: true,
    modelId,
    modelFingerprint,
    ruleId: top[0],
    confidence: imageAgreement,
    margin,
    modelConfidence,
    imageAgreement,
    accepted,
    visionAlignment,
    imageCount,
    imageSha256: imageRecords.map((image) => image.imageSha256).filter(Boolean),
    candidates: rankedCandidates,
    reason: accepted
      ? "Local SigLIP Metal consensus passed multi-image agreement, candidate confidence, and taxonomy text-alignment gates."
      : `Local SigLIP result retained as review evidence only because ${consensusAccepted ? "taxonomy text alignment rejected the candidate rule" : "multi-image agreement or candidate confidence gates were insufficient"}.`,
  };
}

export { aggregateProductEvidence };

async function writeJsonAtomic(path, value) {
  await mkdir(resolve(path, ".."), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

async function main() {
  const args = parseArgs(process.argv);
  const [catalog, reviewManifest, checkpoint, health] = await Promise.all([
    readJson(args.catalog),
    readJson(args.reviewManifest, { records: [] }),
    readJson(args.checkpoint),
    readJson(args.health),
  ]);
  if (health?.status !== "passed" || health?.runtime?.device !== "metal") {
    throw new Error("Candidate visual inference requires a passed Metal health record.");
  }
  if (health.modelFingerprint !== checkpoint.modelFingerprint) {
    throw new Error("Candidate health and checkpoint fingerprints do not match.");
  }
  const products = asArray(catalog?.products).filter((product) => String(product?.status || "ACTIVE").toUpperCase() === "ACTIVE");
  const productsByHandle = new Map(products.map((product) => [normalizeHandle(product.handle), product]));
  const reviewProducts = pendingReviewRecords(reviewManifest, productsByHandle, args.limit);
  const fingerprint = catalogVisualFingerprint(products);
  const reviewHandles = new Set(reviewProducts.map(({ handle }) => handle));
  const existingEvidence = await readJson(args.output, {});
  const canResume = existingEvidence?.kind === "salt-visual-taxonomy-candidate-evidence" &&
    existingEvidence.candidateOnly === true &&
    existingEvidence.catalogFingerprint === fingerprint &&
    String(existingEvidence.modelFingerprint || "") === String(checkpoint.modelFingerprint || "");
  const resumedProducts = canResume
    ? Object.fromEntries(Object.entries(existingEvidence.products || {}).filter(([handle]) => reviewHandles.has(handle)))
    : {};
  const basePayload = {
    kind: "salt-visual-taxonomy-candidate-evidence",
    version: 1,
    source: "local-zero-shot-review-assist",
    candidateOnly: true,
    modelId: String(checkpoint.modelId || health.modelId || ""),
    modelFingerprint: String(checkpoint.modelFingerprint || ""),
    license: String(health.license || "apache-2.0"),
    runtime: health.runtime,
    catalogFingerprint: fingerprint,
    catalogProductCount: products.length,
    products: resumedProducts,
    partial: true,
    progress: {
      completed: Object.keys(resumedProducts).length,
      total: reviewProducts.length,
      resumed: canResume,
    },
    generatedAt: new Date().toISOString(),
  };
  if (!reviewProducts.length) {
    await writeJsonAtomic(args.output, { ...basePayload, partial: false, completedAt: new Date().toISOString() });
    process.stdout.write(`Local SigLIP candidate review skipped: no pending visual products.\n`);
    return;
  }

  const pendingProducts = reviewProducts.filter(({ handle }) => !Object.prototype.hasOwnProperty.call(resumedProducts, handle));
  const batchSize = Math.max(1, Math.min(64, Number(process.env.SALT_VISUAL_CANDIDATE_BATCH_PRODUCTS || 24)));
  let completed = Object.keys(resumedProducts).length;
  if (!pendingProducts.length) {
    await writeJsonAtomic(args.output, { ...basePayload, partial: false, completedAt: new Date().toISOString() });
    process.stdout.write(`Local SigLIP candidate review already has exact evidence for all ${reviewProducts.length} pending products; no inference was repeated.\n`);
    return;
  }
  const tempDir = await mkdtemp(join(resolve("/tmp"), "salt-visual-candidate-"));
  try {
    const candidateLabels = buildCandidateLabels();
    for (const batch of chunkItems(pendingProducts, batchSize)) {
      const manifestEntries = [];
      const productFailures = new Map();
      const inputs = batch.flatMap(({ record, product, handle }) =>
        asArray(record.imageUrls).slice(0, 4).map((url, imageIndex) => ({ product, handle, url, imageIndex })));
      await mapWithConcurrency(
        inputs,
        Math.max(1, Math.min(12, Number(process.env.SALT_VISUAL_CANDIDATE_FETCH_CONCURRENCY || 6))),
        async ({ product, handle, url, imageIndex }) => {
          try {
            const fetched = await fetchImage(url);
            const key = handle.replace(/[^a-z0-9_-]+/gi, "_") || String(product.id || "product");
            const imagePath = resolve(tempDir, `${key}-${imageIndex}${imageExtension(url)}`);
            await writeFile(imagePath, fetched.bytes);
            manifestEntries.push({ image: imagePath, imageSha256: fetched.sha256, productId: String(product.id || product.handle || ""), handle });
          } catch (error) {
            if (!productFailures.has(handle)) productFailures.set(handle, []);
            productFailures.get(handle).push(String(error?.message || error));
          }
        },
      );

      const labelsPath = resolve(tempDir, "labels.json");
      const manifestPath = resolve(tempDir, "manifest.jsonl");
      const scoresPath = resolve(tempDir, "scores.jsonl");
      await writeFile(labelsPath, `${JSON.stringify(candidateLabels)}\n`, "utf8");
      await writeFile(manifestPath, `${manifestEntries.map((entry) => JSON.stringify(entry)).join("\n")}${manifestEntries.length ? "\n" : ""}`, "utf8");
      if (manifestEntries.length) {
        await execFileAsync(args.python, [resolve(rootDir, "scripts", "visual-taxonomy-zero-shot-mlx.py"), manifestPath, labelsPath, scoresPath, args.checkpoint, "--metal"], {
          cwd: rootDir,
          env: { ...process.env, PYTHONUNBUFFERED: "1" },
          maxBuffer: 64 * 1024 * 1024,
        });
      } else {
        await writeFile(scoresPath, "", "utf8");
      }

      const scores = (await readFile(scoresPath, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
      const scoresByHandle = new Map();
      for (const score of scores) {
        const handle = normalizeHandle(score.handle || batch.find(({ product }) => String(product.id) === String(score.productId))?.handle);
        if (!handle) continue;
        if (!scoresByHandle.has(handle)) scoresByHandle.set(handle, []);
        scoresByHandle.get(handle).push(score);
      }
      for (const { product, handle } of batch) {
        const evidence = aggregateProductEvidence(product, scoresByHandle.get(handle) || [], basePayload.modelId, basePayload.modelFingerprint);
        const failures = productFailures.get(handle) || [];
        if (failures.length && !evidence.imageCount) evidence.reason = `Candidate image fetch failed: ${failures.join("; ")}. Retained in explicit classification fallback.`;
        basePayload.products[handle] = evidence;
      }
      completed += batch.length;
      await writeJsonAtomic(args.output, {
        ...basePayload,
        partial: completed < reviewProducts.length,
        progress: { completed, total: reviewProducts.length, resumed: canResume, lastBatchSize: batch.length, scoredImages: manifestEntries.length },
        ...(completed >= reviewProducts.length ? { completedAt: new Date().toISOString() } : {}),
      });
      process.stdout.write(`Local SigLIP candidate review checkpoint: ${completed}/${reviewProducts.length} products; ${manifestEntries.length} images scored in batch.\n`);
    }
    process.stdout.write(`Local SigLIP candidate review scored all ${reviewProducts.length} pending products; evidence remains gated review-only.\n`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message || error}\n`);
    process.exitCode = 1;
  });
}
