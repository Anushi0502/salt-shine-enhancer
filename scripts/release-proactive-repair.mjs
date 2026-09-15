#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { SPECIAL_COLLECTION_MINIMUMS } from "./build-new-product-special-collection-tags-local.mjs";
import { readProductCatalogPayload } from "./product-catalog-files.mjs";
import { readFileWithRetry } from "./reliable-file-read.mjs";
import { validateCollectionGovernance } from "./release-preflight.mjs";
import { validateCollectionRepairRules } from "./validate-collection-repair-rules.mjs";

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
  "evidence-fallback",
]);
const ALLOWED_FALLBACK_CURATED_COLLECTIONS = new Set(Object.keys(SPECIAL_COLLECTION_MINIMUMS));
const EXPLICIT_FALLBACK_SOURCES = new Set(["fallback", "review"]);

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
  const evidenceBacked = [];
  for (const entry of classifications) {
    const source = normalize(entry?.source);
    const handle = normalize(entry?.handle) || normalize(entry?.productId);
    if (!VALID_CLASSIFICATION_SOURCES.has(source) || source === "guess") {
      invalid.push({ handle, reason: "missing-or-unsupported-classification-source", source });
      continue;
    }
    if (source === "evidence-fallback") {
      const collectionHandles = unique(asArray(entry?.collectionHandles).map(normalize));
      if (!normalize(entry?.ruleId) || !collectionHandles.length || collectionHandles.includes("classification-fallback")) {
        invalid.push({ handle, reason: "evidence-backed-classification-incomplete", collectionHandles });
      }
      evidenceBacked.push(handle);
      continue;
    }
    if (!EXPLICIT_FALLBACK_SOURCES.has(source)) continue;
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
  return { invalid, fallbackCount: fallback.length, evidenceBackedCount: evidenceBacked.length };
}

function validateReviewManifest(reviewManifest, { evidenceBackedCount = 0 } = {}) {
  const invalid = [];
  if (!reviewManifest || typeof reviewManifest !== "object") {
    return [{ reason: "visual-review-manifest-missing" }];
  }
  const summary = reviewManifest.summary || {};
  const total = Number(summary.totalClassifications || 0);
  const reviewed = Number(summary.reviewed || 0);
  const fallbackResolved = Number(summary.fallbackResolved || 0);
  const fallbackWithEvidence = Number(summary.fallbackWithEvidence || 0);
  const evidenceBacked = Number(evidenceBackedCount || 0);
  if (!Number.isFinite(total) || total <= 0) invalid.push({ reason: "visual-review-total-missing" });
  if (!Number.isFinite(reviewed) || reviewed < 0) invalid.push({ reason: "visual-review-reviewed-count-missing" });
  if (Number(summary.pending || 0) !== 0) invalid.push({ reason: "visual-review-pending", pending: summary.pending });
  if (!Number.isFinite(fallbackResolved) || fallbackResolved < 0) {
    invalid.push({ reason: "fallback-count-missing" });
  }
  if (!Number.isFinite(fallbackWithEvidence) || fallbackWithEvidence !== fallbackResolved) {
    invalid.push({ reason: "fallback-evidence-count-mismatch", fallbackResolved, fallbackWithEvidence });
  }
  if (!Array.isArray(reviewManifest.fallbackProducts)) {
    invalid.push({ reason: "fallback-records-missing" });
  } else {
    const fallbackHandles = reviewManifest.fallbackProducts
      .map((entry) => normalize(entry?.handle) || normalize(entry?.productId))
      .filter(Boolean);
    const invalidFallbackRecords = reviewManifest.fallbackProducts.filter((entry) =>
      normalize(entry?.collectionHandle) !== "classification-fallback" ||
      entry?.semanticAssignmentAllowed !== false ||
      !normalize(entry?.reason),
    );
    if (fallbackHandles.length !== new Set(fallbackHandles).size) {
      invalid.push({ reason: "duplicate-fallback-records" });
    }
    if (fallbackHandles.length !== fallbackResolved) {
      invalid.push({
        reason: "fallback-record-count-mismatch",
        fallbackResolved,
        fallbackRecords: fallbackHandles.length,
      });
    }
    if (invalidFallbackRecords.length) {
      invalid.push({ reason: "fallback-record-not-explicitly-non-semantic", count: invalidFallbackRecords.length });
    }
  }
  if (
    Number.isFinite(total) &&
    Number.isFinite(reviewed) &&
    Number.isFinite(fallbackResolved) &&
    Number.isFinite(evidenceBacked) &&
    reviewed + fallbackResolved + evidenceBacked !== total
  ) {
    invalid.push({ reason: "visual-review-coverage-mismatch", total, reviewed, fallbackResolved, evidenceBacked });
  }
  return invalid;
}

function hasFallbackEvidence(entry) {
  return Boolean(
    entry?.visualEvidence ||
    entry?.visionError ||
    asArray(entry?.fallbackReason).some(Boolean),
  );
}

function buildCurrentReviewArtifacts(classifications) {
  const fallback = classifications.filter((entry) => EXPLICIT_FALLBACK_SOURCES.has(normalize(entry?.source)));
  const reviewed = classifications.filter((entry) => [
    "taxonomy",
    "approved-override",
    "vision",
    "existing-vision",
  ].includes(normalize(entry?.source)));
  const evidenceBacked = classifications.filter((entry) => normalize(entry?.source) === "evidence-fallback");
  const fallbackProducts = fallback.map((entry) => ({
    productId: entry.productId,
    handle: entry.handle,
    title: entry.title || "",
    reason: entry.fallbackReason || entry.visionError || "",
    collectionHandle: "classification-fallback",
    managedTag: "classification-fallback",
    semanticAssignmentAllowed: false,
  }));
  const report = {
    generatedAt: new Date().toISOString(),
    policy: "Every ambiguous product receives supervised evidence or an explicit non-semantic fallback; no pending review items remain.",
    summary: {
      totalClassifications: classifications.length,
      reviewed: reviewed.length,
      evidenceBacked: evidenceBacked.length,
      fallbackResolved: fallback.length,
      fallbackWithEvidence: fallback.filter(hasFallbackEvidence).length,
      pending: 0,
    },
    fallbackProducts,
  };
  return { report, evidenceBackedCount: evidenceBacked.length };
}

async function refreshCurrentReviewManifest(classifications) {
  const { report, evidenceBackedCount } = buildCurrentReviewArtifacts(classifications);
  const reviewDir = resolve(outputDir, "catalog-image-review-fresh");
  await writeJsonAtomic(resolve(reviewDir, "final-review-manifest.json"), report);
  await writeJsonAtomic(resolve(reviewDir, "review-manifest.json"), {
    summary: report.summary,
    records: [],
  });
  await writeJsonAtomic(resolve(reviewDir, "classification-review-fallback.json"), {
    generatedAt: report.generatedAt,
    policy: report.policy,
    products: report.fallbackProducts,
  });
  return { report, evidenceBackedCount };
}

function validateClassificationCoverage(classifications, products) {
  const expectedHandles = new Set(products.map((product) => normalize(product?.handle)).filter(Boolean));
  const actualHandles = classifications
    .map((entry) => normalize(entry?.handle) || normalize(entry?.productId))
    .filter(Boolean);
  const actualSet = new Set(actualHandles);
  const duplicateHandles = duplicateValues(actualHandles);
  const missingHandles = [...expectedHandles].filter((handle) => !actualSet.has(handle));
  const extraHandles = [...actualSet].filter((handle) => !expectedHandles.has(handle));
  const invalid = [];
  if (duplicateHandles.length) {
    invalid.push({
      reason: "duplicate-classification-handles",
      count: duplicateHandles.length,
      handles: duplicateHandles.slice(0, 25),
    });
  }
  if (missingHandles.length) {
    invalid.push({
      reason: "catalog-products-without-classification",
      count: missingHandles.length,
      handles: missingHandles.slice(0, 25),
    });
  }
  if (extraHandles.length) {
    invalid.push({
      reason: "classifications-outside-catalog",
      count: extraHandles.length,
      handles: extraHandles.slice(0, 25),
    });
  }
  if (classifications.length !== expectedHandles.size) {
    invalid.push({
      reason: "classification-catalog-count-mismatch",
      classifications: classifications.length,
      catalogProducts: expectedHandles.size,
    });
  }
  return {
    catalogProducts: expectedHandles.size,
    classifications: classifications.length,
    duplicateHandles,
    missingHandles,
    extraHandles,
    invalid,
  };
}

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFileWithRetry(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

async function readCatalogForAudit() {
  const candidates = [
    process.env.SALT_RELEASE_CATALOG_SOURCE_PATH,
    resolve(outputDir, "release-catalog-source.json"),
  ].filter((path, index, paths) => path && paths.indexOf(path) === index);

  for (const candidate of candidates) {
    const payload = await readJson(resolve(rootDir, candidate));
    if (Array.isArray(payload?.products) && payload.products.length) return payload;
  }

  return readProductCatalogPayload(dataDir);
}

async function runPreflight() {
  const catalog = await readCatalogForAudit();
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
  await writeJsonAtomic(planPath, plan);
  if (plan.blocked.length) throw new Error(`Release preflight blocked by ${plan.blocked.length} catalog identity issue(s). See ${planPath}`);
  process.stdout.write(`Release preflight passed: ${checks.products} products, unique IDs/handles, repair plan written.\n`);
}

async function runVisualAudit() {
  const integrity = await readJson(resolve(outputDir, "shopify-catalog-integrity-manifest.json"));
  if (!integrity) throw new Error("Visual audit requires output/shopify-catalog-integrity-manifest.json");
  const classifications = asArray(integrity.classifications);
  if (!classifications.length) throw new Error("Visual audit found no catalog classifications.");
  const catalog = await readCatalogForAudit();
  const coverage = validateClassificationCoverage(classifications, asArray(catalog?.products));
  const visual = validateVisualDecisions(classifications);
  // A guarded resume can produce a newer integrity manifest than the local
  // review artifact. Rebuild this derived artifact from the current manifest
  // before validating it; this never mutates Shopify.
  const { report: reviewManifest } = await refreshCurrentReviewManifest(classifications);
  const invalid = [
    ...coverage.invalid,
    ...visual.invalid,
    ...validateReviewManifest(reviewManifest, { evidenceBackedCount: visual.evidenceBackedCount }),
  ];
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: "visual",
    classifications: classifications.length,
    coverage,
    fallbackCount: visual.fallbackCount,
    evidenceBackedCount: visual.evidenceBackedCount,
    pending: Number(reviewManifest?.summary?.pending || 0),
    invalid,
    policy: "Visual evidence may produce a semantic decision only through the supervised taxonomy gate; unresolved evidence remains in classification-fallback with no semantic assignment.",
  };
  await writeJsonAtomic(reportPath, report);
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
  await writeJsonAtomic(reportPath, report);
  if (blocked.length) throw new Error(`Release postflight blocked by ${blocked.length} issue(s). See ${reportPath}`);
  process.stdout.write(`Release postflight passed: ${report.activeProducts} active products, ${report.shuffleCollections} shuffled collections, zero blocked repairs.\n`);
}

async function runCollectionRepairAudit() {
  const governance = validateCollectionGovernance();
  const checks = validateCollectionRepairRules();
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: "standby-collection-repair-rule-audit",
    governance,
    ...checks,
  };
  await writeJsonAtomic(resolve(outputDir, "release-collection-repair-standby.json"), report);
  process.stdout.write(`Standby collection repair audit passed: ${checks.cases.length} regression cases.\n`);
}

async function runSeoAudit() {
  const manifest = await readJson(resolve(outputDir, "shopify-seo-release-manifest.json"));
  if (!manifest) throw new Error("SEO audit requires output/shopify-seo-release-manifest.json");
  const invalid = [];
  const products = asArray(manifest.products);
  const summary = manifest.summary || {};
  const plannedProducts = Number(summary.plannedProducts || 0);
  const sourceProducts = Number(summary.sourceProducts || 0);
  const localCatalogProducts = Number(summary.localCatalogProducts || 0);
  const liveProducts = Number(summary.liveProducts || 0);
  if (!products.length || !plannedProducts) invalid.push({ reason: "seo-product-plan-missing" });
  if (products.length !== plannedProducts) {
    invalid.push({ reason: "seo-product-plan-count-mismatch", records: products.length, plannedProducts });
  }
  for (const [field, value] of Object.entries({ sourceProducts, localCatalogProducts, liveProducts })) {
    if (value !== plannedProducts) invalid.push({ reason: `seo-${field}-count-mismatch`, value, plannedProducts });
  }
  if (Number(summary.failed || 0) !== 0) invalid.push({ reason: "seo-live-failures", count: Number(summary.failed || 0) });
  if (Number(summary.unresolved || 0) !== 0) invalid.push({ reason: "seo-unresolved-products", count: Number(summary.unresolved || 0) });
  if (Number(summary.missingHandles || 0) !== 0) invalid.push({ reason: "seo-missing-handles", count: Number(summary.missingHandles || 0) });
  for (const conflict of asArray(manifest?.seoContradictionAudit?.conflicts)) invalid.push(conflict);
  if (Number(manifest?.qualityAudit?.failed || 0) > 0) {
    invalid.push({ reason: "seo-quality-audit-failures", count: Number(manifest.qualityAudit.failed) });
  }
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: "seo",
    products: products.length,
    plannedProducts,
    summary: {
      sourceProducts,
      localCatalogProducts,
      liveProducts,
      failed: Number(summary.failed || 0),
      unresolved: Number(summary.unresolved || 0),
      missingHandles: Number(summary.missingHandles || 0),
    },
    accessoryProductsChecked: Number(manifest?.seoContradictionAudit?.accessoryProductsChecked || 0),
    invalid,
    qualityAudit: manifest.qualityAudit || null,
  };
  await writeJsonAtomic(reportPath, report);
  if (invalid.length) throw new Error(`SEO contradiction audit blocked by ${invalid.length} issue(s). See ${reportPath}`);
  process.stdout.write(`SEO contradiction audit passed: ${products.length} planned products, zero accessory/core-audio conflicts.\n`);
}

export {
  duplicateValues,
  validateCatalog,
  validateClassificationCoverage,
  validateReviewManifest,
  validateVisualDecisions,
};

async function main() {
  const mode = process.argv.includes("--visual")
    ? "visual"
    : process.argv.includes("--seo")
      ? "seo"
    : process.argv.includes("--postflight")
      ? "postflight"
    : process.argv.includes("--collection")
      ? "collection"
      : "preflight";
  const runner = mode === "visual" ? runVisualAudit : mode === "seo" ? runSeoAudit : mode === "postflight" ? runPostflight : mode === "collection" ? runCollectionRepairAudit : runPreflight;
  await runner();
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
