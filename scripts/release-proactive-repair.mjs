#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { SPECIAL_COLLECTION_MINIMUMS } from "./build-new-product-special-collection-tags-local.mjs";
import { readProductCatalogPayload } from "./product-catalog-files.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const outputDir = resolve(rootDir, "output");
const dataDir = resolve(rootDir, "public", "data");
const planPath = resolve(outputDir, "release-proactive-repair-plan.json");
const reportPath = resolve(outputDir, "release-proactive-repair-report.json");

const VALID_CLASSIFICATION_SOURCES = new Set([
  "taxonomy",
  "approved-override",
  "vision",
  "existing-vision",
  "fallback",
  "review",
]);
const ALLOWED_FALLBACK_CURATED_COLLECTIONS = new Set(Object.keys(SPECIAL_COLLECTION_MINIMUMS));

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function fingerprintProducts(products) {
  return createHash("sha256")
    .update(products
      .map((product) => `${product?.id || ""}|${product?.handle || ""}|${product?.updated_at || product?.updatedAt || ""}`)
      .sort()
      .join("\n"))
    .digest("hex");
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (!value) continue;
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function validateCatalog(products) {
  const duplicateIds = duplicateValues(products.map((product) => normalize(product?.id)));
  const duplicateHandles = duplicateValues(products.map((product) => normalize(product?.handle)));
  const missingIdentity = products
    .filter((product) => !normalize(product?.id) || !normalize(product?.handle) || !normalize(product?.title))
    .map((product) => ({ id: product?.id || "", handle: product?.handle || "", title: product?.title || "" }));
  return {
    products: products.length,
    duplicateIds,
    duplicateHandles,
    missingIdentity,
    fingerprint: fingerprintProducts(products),
  };
}

function validateVisualDecisions(classifications) {
  const invalid = [];
  const fallback = [];
  for (const entry of classifications) {
    const source = normalize(entry?.source);
    const handle = normalize(entry?.handle) || normalize(entry?.productId);
    if (!VALID_CLASSIFICATION_SOURCES.has(source) || source === "guess") {
      invalid.push({ handle, reason: "missing-or-unsupported-classification-source", source });
      continue;
    }
    if (!(["fallback", "review"].includes(source))) continue;
    fallback.push(handle);
    const collectionHandles = unique(asArray(entry?.collectionHandles).map(normalize));
    const hasEvidence = Boolean(entry?.visualEvidence || entry?.visionError || asArray(entry?.fallbackReason).length);
    const unsupportedCollections = collectionHandles.filter(
      (value) => value !== "classification-fallback" && !ALLOWED_FALLBACK_CURATED_COLLECTIONS.has(value),
    );
    if (unsupportedCollections.length || !collectionHandles.includes("classification-fallback")) {
      invalid.push({
        handle,
        reason: "fallback-has-unsupported-collection-assignment",
        collectionHandles,
        unsupportedCollections,
      });
    }
    if (!hasEvidence) invalid.push({ handle, reason: "fallback-missing-evidence-and-reason" });
  }
  return { invalid, fallbackCount: fallback.length };
}

function validateReviewManifest(reviewManifest) {
  const summary = reviewManifest?.summary || {};
  const invalid = [];
  if (Number(summary.pending || 0) !== 0) invalid.push({ reason: "visual-review-pending", pending: summary.pending });
  if (!Number.isFinite(Number(summary.fallbackResolved || 0))) {
    invalid.push({ reason: "fallback-count-missing" });
  }
  return invalid;
}

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function runPreflight() {
  const catalog = await readProductCatalogPayload(dataDir);
  const products = asArray(catalog?.products);
  const checks = validateCatalog(products);
  const plan = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: "preflight",
    policy: "Local catalog identity and checkpoint repair is deterministic; no semantic classification is guessed.",
    checks,
    repairs: [],
    blocked: [
      ...checks.duplicateIds.map((value) => ({ reason: "duplicate-product-id", value })),
      ...checks.duplicateHandles.map((value) => ({ reason: "duplicate-product-handle", value })),
      ...checks.missingIdentity.map((value) => ({ reason: "missing-product-identity", ...value })),
    ],
  };
  await mkdir(outputDir, { recursive: true });
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  if (plan.blocked.length) throw new Error(`Release preflight blocked by ${plan.blocked.length} catalog identity issue(s). See ${planPath}`);
  process.stdout.write(`Release preflight passed: ${checks.products} products, unique IDs/handles, repair plan written.\n`);
}

async function runVisualAudit() {
  const integrity = await readJson(resolve(outputDir, "shopify-catalog-integrity-manifest.json"));
  if (!integrity) throw new Error("Visual audit requires output/shopify-catalog-integrity-manifest.json");
  const classifications = asArray(integrity.classifications);
  if (!classifications.length) throw new Error("Visual audit found no catalog classifications.");
  const visual = validateVisualDecisions(classifications);
  const reviewManifest = await readJson(resolve(outputDir, "catalog-image-review-fresh", "final-review-manifest.json"));
  const invalid = [
    ...visual.invalid,
    ...validateReviewManifest(reviewManifest),
  ];
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: "visual",
    classifications: classifications.length,
    fallbackCount: visual.fallbackCount,
    pending: Number(reviewManifest?.summary?.pending || 0),
    invalid,
    policy: "Visual evidence may produce a semantic decision only through the supervised taxonomy gate; unresolved evidence remains in classification-fallback with no semantic assignment.",
  };
  await mkdir(outputDir, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (invalid.length) throw new Error(`Visual decision audit blocked by ${invalid.length} issue(s). See ${reportPath}`);
  process.stdout.write(`Visual decision audit passed: ${classifications.length} classifications, ${visual.fallbackCount} explicit fallbacks, pending=0.\n`);
}

async function runPostflight() {
  const integrity = await readJson(resolve(outputDir, "shopify-catalog-integrity-final-report.json")) ||
    await readJson(resolve(outputDir, "shopify-catalog-integrity-manifest.json"));
  const shuffle = await readJson(resolve(outputDir, "shopify-collection-shuffle-manifest.json"));
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: "postflight",
    activeProducts: Number(integrity?.summary?.activeProducts || integrity?.products || 0),
    collectionlessProducts: Number(integrity?.summary?.collectionlessProducts || 0),
    shuffleCollections: Number(shuffle?.appliedCollections?.length || 0),
    shuffleFailures: asArray(shuffle?.failures),
    completedAt: shuffle?.completedAt || null,
    repairs: [],
  };
  const blocked = [];
  if (!report.activeProducts) blocked.push({ reason: "missing-final-integrity-product-count" });
  if (report.collectionlessProducts) blocked.push({ reason: "collectionless-products", count: report.collectionlessProducts });
  if (report.shuffleFailures.length) blocked.push({ reason: "shuffle-failures", count: report.shuffleFailures.length });
  if (!report.completedAt) blocked.push({ reason: "shuffle-not-complete" });
  report.blocked = blocked;
  await mkdir(outputDir, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (blocked.length) throw new Error(`Release postflight blocked by ${blocked.length} issue(s). See ${reportPath}`);
  process.stdout.write(`Release postflight passed: ${report.activeProducts} active products, ${report.shuffleCollections} shuffled collections, zero blocked repairs.\n`);
}

async function runSeoAudit() {
  const manifest = await readJson(resolve(outputDir, "shopify-seo-release-manifest.json"));
  if (!manifest) throw new Error("SEO audit requires output/shopify-seo-release-manifest.json");
  const invalid = [];
  const products = asArray(manifest.products);
  for (const conflict of asArray(manifest?.seoContradictionAudit?.conflicts)) invalid.push(conflict);
  if (Number(manifest?.qualityAudit?.failed || 0) > 0) {
    invalid.push({ reason: "seo-quality-audit-failures", count: Number(manifest.qualityAudit.failed) });
  }
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: "seo",
    products: products.length,
    accessoryProductsChecked: Number(manifest?.seoContradictionAudit?.accessoryProductsChecked || 0),
    invalid,
    qualityAudit: manifest.qualityAudit || null,
  };
  await mkdir(outputDir, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (invalid.length) throw new Error(`SEO contradiction audit blocked by ${invalid.length} issue(s). See ${reportPath}`);
  process.stdout.write(`SEO contradiction audit passed: ${products.length} planned products, zero accessory/core-audio conflicts.\n`);
}

export { duplicateValues, validateCatalog, validateVisualDecisions };

async function main() {
  const mode = process.argv.includes("--visual")
    ? "visual"
    : process.argv.includes("--seo")
      ? "seo"
    : process.argv.includes("--postflight")
      ? "postflight"
      : "preflight";
  const runner = mode === "visual" ? runVisualAudit : mode === "seo" ? runSeoAudit : mode === "postflight" ? runPostflight : runPreflight;
  await runner();
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
