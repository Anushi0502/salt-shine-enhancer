#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { normalizeComparableHtml } from "../src/lib/shopify-seo-release.js";

const rootDir = resolve(import.meta.dirname, "..");
const defaultPlanPath = resolve(rootDir, "output", "salt-gsc-semantic-repair-seo-plan-2026-09-14.json");
const defaultOutputPath = resolve(rootDir, "output", "salt-gsc-semantic-repair-storefront-after-apply-2026-09-15.json");

function parseArgs(argv) {
  const outputIndex = argv.indexOf("--output");
  const planIndex = argv.indexOf("--plan");
  return {
    outputPath: outputIndex >= 0 ? resolve(rootDir, argv[outputIndex + 1]) : defaultOutputPath,
    planPath: planIndex >= 0 ? resolve(rootDir, argv[planIndex + 1]) : defaultPlanPath,
  };
}

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizedText(value) {
  return text(value).toLowerCase();
}

function bodyMatches(actual, desired) {
  return normalizeComparableHtml(actual) === normalizeComparableHtml(desired);
}

async function readPublicProduct(handle) {
  const url = `https://www.saltonlinestore.com/products/${encodeURIComponent(handle)}.js`;
  const response = await fetch(url, {
    headers: { "user-agent": "SALT-GSC-semantic-repair-public-readback/1.0" },
  });
  const body = await response.text();
  if (!response.ok) {
    return { url, status: response.status, error: `HTTP ${response.status}`, product: null };
  }
  try {
    return { url, status: response.status, error: null, product: JSON.parse(body) };
  } catch {
    return { url, status: response.status, error: "invalid JSON", product: null };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(args.planPath, "utf8"));
  const products = Array.isArray(manifest.products) ? manifest.products : [];
  if (products.length !== 12) throw new Error(`Expected exact 12-product plan, received ${products.length}`);

  const results = [];
  for (const planned of products) {
    const read = await readPublicProduct(planned.handle);
    const actual = read.product;
    const desired = planned.desired || {};
    const media = Array.isArray(actual?.media) ? actual.media : [];
    const wrongNouns = `${actual?.title || ""} ${actual?.type || ""} ${actual?.description || ""} ${media.map((entry) => entry?.alt || "").join(" ")}`
      .toLowerCase();
    results.push({
      handle: planned.handle,
      url: read.url,
      status: read.status,
      error: read.error,
      title: actual?.title || null,
      productType: actual?.type || null,
      descriptionLength: actual?.description ? String(actual.description).length : 0,
      mediaCount: media.length,
      mediaAltCount: media.filter((entry) => text(entry?.alt)).length,
      matches: {
        title: Boolean(actual) && normalizedText(actual.title) === normalizedText(desired.title),
        productType: Boolean(actual) && normalizedText(actual.type) === normalizedText(desired.productType),
        body: Boolean(actual) && bodyMatches(actual.description, desired.descriptionHtml),
        mediaAlt: Boolean(actual) && media.every((entry) => normalizedText(entry?.alt) === normalizedText(desired.mediaAlt)),
      },
      wrongSemanticNounPresent: /\bshirt\b|\bmakeup product\b/.test(wrongNouns),
    });
  }

  const summary = {
    products: results.length,
    http200: results.filter((entry) => entry.status === 200).length,
    titleMatches: results.filter((entry) => entry.matches.title).length,
    productTypeMatches: results.filter((entry) => entry.matches.productType).length,
    bodyMatches: results.filter((entry) => entry.matches.body).length,
    mediaAltMatches: results.filter((entry) => entry.matches.mediaAlt).length,
    wrongSemanticProducts: results.filter((entry) => entry.wrongSemanticNounPresent).length,
    fullyVerified: results.filter((entry) => Object.values(entry.matches).every(Boolean)).length,
  };
  const output = {
    capturedAt: new Date().toISOString(),
    source: "Public Shopify product JSON read-only fetch",
    scope: "Exact 12-product GSC semantic-repair cohort",
    planPath: args.planPath,
    summary,
    writesSent: 0,
    products: results,
  };
  await writeFile(args.outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outputPath: args.outputPath, summary }, null, 2));
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
