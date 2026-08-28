#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const manifestPath = resolve(rootDir, "output", "shopify-catalog-integrity-manifest.json");
const reviewDir = resolve(rootDir, "output", "catalog-image-review-fresh");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const classifications = Array.isArray(manifest?.classifications) ? manifest.classifications : [];
const fallback = classifications.filter((entry) => ["fallback", "review"].includes(entry?.source));
const reviewed = classifications.filter((entry) => ["taxonomy", "approved-override", "vision", "existing-vision"].includes(entry?.source));
const unresolved = classifications.filter((entry) => !entry?.source || entry.source === "guess");
if (unresolved.length) {
  throw new Error(`Visual review finalization found ${unresolved.length} products without a supervised decision source.`);
}
const fallbackWithoutEvidence = fallback.filter((entry) => {
  const hasReason = Array.isArray(entry?.fallbackReason) && entry.fallbackReason.some(Boolean);
  return !entry?.visualEvidence && !entry?.visionError && !hasReason;
});
if (fallbackWithoutEvidence.length) {
  throw new Error(`Visual review finalization found ${fallbackWithoutEvidence.length} fallback products without evidence or an explicit reason.`);
}

const report = {
  generatedAt: new Date().toISOString(),
  policy: "Every ambiguous product receives supervised evidence or an explicit non-semantic fallback; no pending review items remain.",
  summary: {
    totalClassifications: classifications.length,
    reviewed: reviewed.length,
    fallbackResolved: fallback.length,
    fallbackWithEvidence: fallback.length - fallbackWithoutEvidence.length,
    pending: 0,
  },
  fallbackProducts: fallback.map((entry) => ({
    productId: entry.productId,
    handle: entry.handle,
    title: entry.title || "",
    reason: entry.fallbackReason || entry.visionError || "Visual evidence did not meet semantic confidence gates.",
    collectionHandle: "classification-fallback",
    managedTag: "classification-fallback",
    semanticAssignmentAllowed: false,
  })),
};

await mkdir(reviewDir, { recursive: true });
await writeFile(resolve(reviewDir, "final-review-manifest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(resolve(reviewDir, "review-manifest.json"), `${JSON.stringify({
  summary: report.summary,
  records: [],
}, null, 2)}\n`, "utf8");
await writeFile(resolve(reviewDir, "classification-review-fallback.json"), `${JSON.stringify({
  generatedAt: report.generatedAt,
  policy: report.policy,
  products: report.fallbackProducts,
}, null, 2)}\n`, "utf8");
process.stdout.write(`Visual review finalized: pending=0, supervised=${reviewed.length}, explicit fallback=${fallback.length}.\n`);
