#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const manifestPath = process.env.SALT_SPECIAL_COLLECTION_MANIFEST_PATH ||
  resolve(rootDir, "output", "catalog-special-collection-tags.json");
function loadManifest(filePath) {
  try {
    const raw = readFileSync(filePath, "utf8").trim();
    if (!raw) {
      process.stderr.write(`Special-collection manifest is empty; using live canonical tags: ${filePath}\n`);
      return { assignments: [] };
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : { assignments: [] };
  } catch (error) {
    process.stderr.write(`Special-collection manifest is unavailable; using live canonical tags: ${filePath} (${error.message})\n`);
    return { assignments: [] };
  }
}

const manifest = loadManifest(manifestPath);

export const SPECIAL_COLLECTION_MINIMUMS = Object.freeze({
  "creator-essentials": 500,
  "anime-collectables": 1000,
});

const CREATOR_BLOCKED_COLLECTION_CONTEXT = /\b(?:jeans?|trousers?|pants?|denim|skirts?|shorts?|clothing|apparel)\b/i;

function isBlockedSpecialCollectionProduct(product, collection) {
  if (collection !== "creator-essentials") return false;
  return CREATOR_BLOCKED_COLLECTION_CONTEXT.test([
    product?.title,
    product?.handle,
    product?.product_type || product?.productType,
  ].filter(Boolean).join(" "));
}

export function buildSpecialCollectionAssignments(products) {
  const activeHandles = new Set(products.map((product) => String(product?.handle || "").toLowerCase()));
  const productsByHandle = new Map(products.map((product) => [String(product?.handle || "").toLowerCase(), product]));
  const assignments = new Map();
  for (const assignment of manifest.assignments || []) {
    const handle = String(assignment?.handle || "").toLowerCase();
    const product = productsByHandle.get(handle);
    if (!activeHandles.has(handle) || !product) continue;
    const matchedCollections = (assignment.matchedCollections || [])
      .filter((collection) => !isBlockedSpecialCollectionProduct(product, collection));
    const tags = (assignment.tags || []).filter((tag) =>
      !isBlockedSpecialCollectionProduct(product, String(tag).replace(/^salt:category:/i, "")));
    if (!matchedCollections.length) continue;
    assignments.set(handle, {
      handle: assignment.handle,
      tags,
      matchedCollections,
      matchedSignals: assignment.matchedSignals || [],
      rationale: assignment.rationale || "Full-catalog deterministic special-collection manifest.",
    });
  }
  for (const product of products) {
    const tags = (product?.tags || []).map((tag) => String(tag).toLowerCase());
    const handle = String(product?.handle || "").toLowerCase();
    for (const collection of Object.keys(SPECIAL_COLLECTION_MINIMUMS)) {
      const tagMatches = tags.includes(collection) || tags.includes(`salt:category:${collection}`);
      if (tagMatches && !isBlockedSpecialCollectionProduct(product, collection) && !assignments.has(handle)) {
        assignments.set(handle, {
          handle: product.handle,
          tags: [`salt:category:${collection}`],
          matchedCollections: [collection],
          matchedSignals: ["current live canonical collection tag"],
          rationale: "Current live canonical tag preserved during full-catalog verification.",
        });
      }
    }
  }
  return [...assignments.values()];
}

export function assertSpecialCollectionMinimums(counts) {
  const failures = Object.entries(SPECIAL_COLLECTION_MINIMUMS)
    .filter(([handle, minimum]) => Number(counts?.[handle] || 0) < minimum)
    .map(([handle, minimum]) => `${handle}: ${counts?.[handle] || 0}/${minimum}`);
  if (failures.length) throw new Error(`Special collection minimum gate failed: ${failures.join(", ")}`);
}
