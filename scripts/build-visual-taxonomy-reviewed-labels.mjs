#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { CATALOG_TAXONOMY_IMAGE_OVERRIDES } from "../src/lib/catalog-taxonomy-image-overrides.js";
import { getCatalogTaxonomyDefinitions } from "../src/lib/catalog-taxonomy.js";

const rootDir = resolve(import.meta.dirname, "..");
const defaultCatalogPath = resolve(rootDir, "output", "release-catalog-source.json");
const defaultOutputPath = resolve(rootDir, "output", "visual-taxonomy-reviewed-labels.jsonl");

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalize(value) {
  return String(value || "").trim();
}

function normalizeHandle(value) {
  return normalize(value).toLowerCase();
}

function productImages(product) {
  return [...new Set(asArray(product?.images).map((image) => {
    if (typeof image === "string") return normalize(image);
    return normalize(image?.src || image?.url || image?.originalSrc);
  }).filter((url) => /^https?:\/\//i.test(url)))];
}

function splitForProduct(productId) {
  const bucket = Number.parseInt(createHash("sha256").update(productId).digest("hex").slice(0, 8), 16) / 0xffffffff;
  if (bucket < 0.8) return "train";
  if (bucket < 0.9) return "validation";
  return "test";
}

function catalogProducts(catalog) {
  return asArray(catalog?.products || catalog);
}

export function buildReviewedLabelManifest({ catalog, overrides = CATALOG_TAXONOMY_IMAGE_OVERRIDES } = {}) {
  const products = catalogProducts(catalog);
  const byId = new Map(products.map((product) => [normalize(product?.id || product?.legacyResourceId || product?.productId), product]));
  const byHandle = new Map(products.map((product) => [normalizeHandle(product?.handle), product]));
  const allowedRules = new Set(getCatalogTaxonomyDefinitions().map((definition) => definition.id));
  const seenImageUrls = new Set();
  const seenProducts = new Set();
  const errors = [];
  const entries = [];

  for (const [index, override] of asArray(overrides).entries()) {
    if (override?.approved !== true || override?.imageReviewed !== true) continue;
    const productId = normalize(override?.productId);
    const product = byId.get(productId) || byHandle.get(normalizeHandle(override?.handle));
    const imageUrl = normalize(override?.imageUrl);
    const ruleId = normalize(override?.ruleId);
    if (!product) {
      errors.push(`reviewed override ${index + 1} does not match the refreshed catalog: ${productId || override?.handle || "missing product"}`);
      continue;
    }
    const resolvedProductId = normalize(product?.id || product?.legacyResourceId || product?.productId || product?.handle);
    if (!resolvedProductId || !ruleId || !allowedRules.has(ruleId) || !imageUrl) {
      errors.push(`reviewed override ${index + 1} is missing a valid product, rule, or image URL`);
      continue;
    }
    if (seenProducts.has(resolvedProductId)) {
      errors.push(`multiple reviewed image labels exist for product ${resolvedProductId}; resolve the collision before training`);
      continue;
    }
    if (!productImages(product).includes(imageUrl)) {
      errors.push(`reviewed image is no longer present for product ${resolvedProductId}: ${imageUrl}`);
      continue;
    }
    if (seenImageUrls.has(imageUrl)) {
      errors.push(`reviewed image URL is assigned to more than one product: ${imageUrl}`);
      continue;
    }
    seenProducts.add(resolvedProductId);
    seenImageUrls.add(imageUrl);
    entries.push({
      sourceUrl: imageUrl,
      productId: resolvedProductId,
      ruleId,
      labelSource: "human-reviewed",
      reviewId: normalize(override?.id),
      reviewedAt: normalize(override?.reviewedAt),
      reason: normalize(override?.reason),
      split: splitForProduct(resolvedProductId),
    });
  }

  entries.sort((left, right) => `${left.productId}\n${left.sourceUrl}`.localeCompare(`${right.productId}\n${right.sourceUrl}`));
  return { entries, errors, summary: { products: products.length, reviewedOverrides: entries.length, errors: errors.length } };
}

function parseArgs(argv) {
  const args = { catalog: defaultCatalogPath, output: defaultOutputPath };
  const flags = new Map([["--catalog", "catalog"], ["--output", "output"]]);
  for (let index = 2; index < argv.length; index += 1) {
    const key = flags.get(argv[index]);
    if (!key || !argv[index + 1]) throw new Error(`Usage: ${argv[1]} [--catalog FILE] [--output FILE]`);
    args[key] = resolve(argv[index + 1]);
    index += 1;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const catalog = JSON.parse(await readFile(args.catalog, "utf8"));
  const result = buildReviewedLabelManifest({ catalog });
  if (result.errors.length) {
    throw new Error(`Reviewed visual label manifest rejected ${result.errors.length} record(s):\n${result.errors.slice(0, 10).join("\n")}`);
  }
  if (result.entries.length < 2) throw new Error("At least two reviewed visual labels are required to build a training manifest.");
  await mkdir(resolve(args.output, ".."), { recursive: true });
  const temporary = `${args.output}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${result.entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
  await rename(temporary, args.output);
  process.stdout.write(`Built ${result.entries.length} verified visual labels for ${result.summary.products} catalog products at ${args.output}.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

export { parseArgs, productImages, splitForProduct };
