#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  CATALOG_COLLECTION_PLAN_VERSION,
} from "../src/lib/catalog-collection-plan.js";
import {
  CATALOG_TAXONOMY_VERSION,
} from "../src/lib/catalog-taxonomy.js";
import { assertCatalogKnowledgeModel } from "../src/lib/catalog-knowledge-model.js";
import { readCatalogKnowledgeModel } from "./catalog-knowledge-model-files.mjs";
import {
  ALL_PRODUCTS_COLLECTION_POLICY,
  COLLECTION_GOVERNANCE_POLICIES,
  COLLECTION_GOVERNANCE_VERSION,
  DEFAULT_READ_ONLY_LIVE_COLLECTION_HANDLES,
  RETIRED_COLLECTION_HANDLE_MAP,
  SEMANTIC_COLLECTION_POLICIES,
  PRICE_COLLECTION_POLICIES,
  buildPriceCollectionSource,
  buildSemanticCollectionSource,
  canonicalCollectionHandle,
  semanticCollectionRuleTags,
} from "../src/lib/catalog-collection-governance.js";
import { validateProductListingIntelligence } from "./validate-product-listing-intelligence.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const defaultShopUrl = "https://0309d3-72.myshopify.com";
const listingIntelligenceCacheName = "listing-intelligence-preflight.json";

export const RELEASE_PREFLIGHT_APPROVAL_FILES = Object.freeze([
  "docs/catalog-taxonomy-approval.json",
  "docs/catalog-collection-approval.json",
  "docs/catalog-price-rework-approval.json",
  "docs/catalog-cost-based-pricing-approval.json",
  "docs/catalog-market-price-margin-approval.json",
  "docs/catalog-collection-merge-approval.json",
]);

const REQUIRED_COLLECTION_POLICIES = Object.freeze([
  "home-safety",
  "hats",
  "gifts-for-dad",
  "gifts-for-mom",
  "daily-living-aids",
  "senior-living-solutions",
  "candles",
  "pet-travel",
  "pet-feeding",
  "pet-grooming",
  "cat-supplies",
  "seasonal-decor",
  "artificial-plants",
  "kids-wear",
  "beauty-makeup-essentials",
  "footwear",
  "mens-footwear",
  "formal-footwear",
  "womens-footwear",
  "kids-footwear",
  "wigs",
  "womens-accessories",
  "mens-accessories",
  "rings",
  "necklaces",
  "bracelets",
  "earrings",
  "everyday-jewelry",
  "school-bags",
  "lunch-boxes",
  "water-bottles",
  "back-to-school",
  "office-school-supplies",
  "classification-fallback",
  "classification-review",
  "home-decor",
]);

const PREFLIGHT_INPUTS = Object.freeze([
  "public/data/products.json",
  "output/release-catalog-source.json",
  "output/catalog-knowledge-model.json",
  "src/lib/catalog-taxonomy.js",
  "src/lib/catalog-knowledge-model.js",
  "src/lib/product-knowledge-base.js",
  "src/lib/catalog-collection-governance.js",
  "src/lib/catalog-collection-plan.js",
  "src/lib/shopify-seo-batch-intelligence.js",
  "scripts/validate-product-listing-intelligence.mjs",
]);

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

export function validateReleaseTarget({
  shopUrl = process.env.SALT_SHOP_URL || defaultShopUrl,
  expectedHost = process.env.SALT_RELEASE_EXPECTED_SHOP_HOST || "0309d3-72.myshopify.com",
} = {}) {
  let parsed;
  try {
    parsed = new URL(String(shopUrl || defaultShopUrl).trim());
  } catch {
    throw new Error(`SALT_SHOP_URL is not a valid URL: ${shopUrl}`);
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error(`SALT_SHOP_URL must use http or https: ${shopUrl}`);
  }
  const host = normalized(parsed.hostname);
  const requiredHost = normalized(expectedHost);
  if (requiredHost && host !== requiredHost) {
    throw new Error(`Release target mismatch: expected ${requiredHost}, received ${host || "missing host"}.`);
  }
  return { url: parsed.origin, host };
}

function assertCondition(condition, message, failures) {
  if (!condition) failures.push(message);
}

export function validateCollectionGovernance() {
  const failures = [];
  const policies = Array.isArray(COLLECTION_GOVERNANCE_POLICIES) ? COLLECTION_GOVERNANCE_POLICIES : [];
  const handles = new Set();
  const tags = new Set();

  assertCondition(
    DEFAULT_READ_ONLY_LIVE_COLLECTION_HANDLES.map(normalized).includes("test"),
    "unmanaged test collection is not read-only",
    failures,
  );
  assertCondition(
    policies.some((policy) => policy === ALL_PRODUCTS_COLLECTION_POLICY || policy?.handle === "all-products"),
    "all-products boundary policy is missing",
    failures,
  );

  for (const policy of policies) {
    const handle = normalized(policy?.handle);
    assertCondition(Boolean(handle), "collection policy has no handle", failures);
    if (!handle) continue;
    if (handles.has(handle)) failures.push(`duplicate collection policy handle: ${handle}`);
    handles.add(handle);

    if (policy.kind === "semantic") {
      const ruleTags = semanticCollectionRuleTags(policy).map(normalized).filter(Boolean);
      assertCondition(Boolean(policy.title), `${handle}: collection title is missing`, failures);
      assertCondition(ruleTags.length > 0, `${handle}: collection rule has no tag`, failures);
      for (const tag of ruleTags) {
        if (tag.includes(":")) failures.push(`${handle}: non-canonical namespaced rule tag ${tag}`);
        if (tags.has(tag)) failures.push(`duplicate semantic collection rule tag: ${tag}`);
        tags.add(tag);
      }
      const source = buildSemanticCollectionSource(policy);
      const conditions = source.inclusion?.conditions || [];
      const expectedMatchType = ruleTags.length > 1 ? "ANY" : "ALL";
      assertCondition(
        source.inclusion?.matchType === expectedMatchType,
        `${handle}: rule match type does not preserve ${expectedMatchType} semantics`,
        failures,
      );
      assertCondition(
        conditions.length === ruleTags.length,
        `${handle}: rule condition count does not match its managed tags`,
        failures,
      );
      for (const [index, condition] of conditions.entries()) {
        const values = condition?.productTag?.values || [];
        assertCondition(
          condition?.productTag?.relation === "TAGGED_WITH" && condition?.productTag?.matchType === "ANY" &&
            values.length === 1 && normalized(values[0]) === ruleTags[index],
          `${handle}: malformed product-tag condition ${index + 1}`,
          failures,
        );
      }
    }

    if (policy.kind === "price") {
      const source = buildPriceCollectionSource(policy);
      const conditions = source.inclusion?.conditions || [];
      const hasBoundary = Number.isFinite(policy.maximumExclusive) || Number.isFinite(policy.minimumExclusive);
      assertCondition(hasBoundary, `${handle}: price policy has no boundary`, failures);
      assertCondition(source.inclusion?.matchType === "ALL", `${handle}: price rule must use ALL semantics`, failures);
      assertCondition(conditions.length === 1, `${handle}: price rule must have one variant-price condition`, failures);
    }
  }

  for (const [legacyHandle, targetHandle] of Object.entries(RETIRED_COLLECTION_HANDLE_MAP)) {
    const target = canonicalCollectionHandle(targetHandle);
    if (!handles.has(target)) failures.push(`retired collection ${legacyHandle} points to missing target ${target}`);
  }
  for (const handle of REQUIRED_COLLECTION_POLICIES) {
    if (!handles.has(handle)) failures.push(`required collection policy is missing: ${handle}`);
  }

  if (failures.length) {
    throw new Error(`Collection governance preflight failed: ${failures.join("; ")}`);
  }

  return {
    status: "verified",
    version: COLLECTION_GOVERNANCE_VERSION,
    policies: policies.length,
    semanticPolicies: SEMANTIC_COLLECTION_POLICIES.length,
    pricePolicies: PRICE_COLLECTION_POLICIES.length,
    requiredPolicies: REQUIRED_COLLECTION_POLICIES.length,
    readOnlyLiveCollections: [...DEFAULT_READ_ONLY_LIVE_COLLECTION_HANDLES],
    retiredCollectionMappings: Object.keys(RETIRED_COLLECTION_HANDLE_MAP).length,
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readAndValidateApprovals(resolvedRootDir) {
  const approvalEnvByFile = new Map([
    ["docs/catalog-taxonomy-approval.json", "SALT_CATALOG_TAXONOMY_APPROVAL_ID"],
    ["docs/catalog-collection-approval.json", "SALT_CATALOG_COLLECTIONS_APPROVAL_ID"],
    ["docs/catalog-price-rework-approval.json", "SALT_CATALOG_PRICE_REWORK_APPROVAL_ID"],
    ["docs/catalog-cost-based-pricing-approval.json", "SALT_CATALOG_COST_BASED_PRICING_APPROVAL_ID"],
    ["docs/catalog-market-price-margin-approval.json", "SALT_CATALOG_MARKET_PRICE_MARGIN_APPROVAL_ID"],
    ["docs/catalog-collection-merge-approval.json", "SALT_CATALOG_COLLECTION_MERGES_APPROVAL_ID"],
  ]);
  const approvals = [];
  for (const relativePath of RELEASE_PREFLIGHT_APPROVAL_FILES) {
    const filePath = resolve(resolvedRootDir, relativePath);
    let manifest;
    try {
      manifest = await readJson(filePath);
    } catch (error) {
      throw new Error(`Release approval manifest could not be read at ${relativePath}: ${error.message}`);
    }
    if (manifest?.approved !== true) throw new Error(`Release approval is not marked approved: ${relativePath}`);
    const approvalId = String(manifest?.approvalId || "").trim();
    if (!approvalId) throw new Error(`Release approval has no approvalId: ${relativePath}`);
    const configuredId = String(process.env[approvalEnvByFile.get(relativePath)] || "").trim();
    if (configuredId && configuredId !== approvalId) {
      throw new Error(`Configured approval ID does not match ${relativePath}: ${configuredId}`);
    }
    if (relativePath === "docs/catalog-taxonomy-approval.json" && manifest.taxonomyVersion !== CATALOG_TAXONOMY_VERSION) {
      throw new Error(`Taxonomy approval targets ${manifest.taxonomyVersion || "missing"}, expected ${CATALOG_TAXONOMY_VERSION}.`);
    }
    if (relativePath === "docs/catalog-collection-approval.json") {
      if (manifest.taxonomyVersion !== CATALOG_TAXONOMY_VERSION) {
        throw new Error(`Collection approval targets taxonomy ${manifest.taxonomyVersion || "missing"}, expected ${CATALOG_TAXONOMY_VERSION}.`);
      }
      if (manifest.collectionPlanVersion !== CATALOG_COLLECTION_PLAN_VERSION) {
        throw new Error(`Collection approval targets plan ${manifest.collectionPlanVersion || "missing"}, expected ${CATALOG_COLLECTION_PLAN_VERSION}.`);
      }
      if (manifest.governanceVersion !== COLLECTION_GOVERNANCE_VERSION) {
        throw new Error(`Collection approval targets governance ${manifest.governanceVersion || "missing"}, expected ${COLLECTION_GOVERNANCE_VERSION}.`);
      }
    }
    approvals.push({ file: relativePath, approvalId });
  }
  return approvals;
}

async function fingerprintInputs(resolvedRootDir, profile, target) {
  const signatures = await Promise.all(PREFLIGHT_INPUTS.map(async (relativePath) => {
    const filePath = resolve(resolvedRootDir, relativePath);
    try {
      const file = await stat(filePath);
      return `${relativePath}:${file.size}:${file.mtimeMs}`;
    } catch {
      return `${relativePath}:missing`;
    }
  }));
  return createHash("sha256")
    .update(JSON.stringify({ profile, target, signatures }))
    .digest("hex");
}

async function readCachedPreflight(cachePath, fingerprint) {
  try {
    const cached = await readJson(cachePath);
    if (cached?.status === "verified" && cached?.fingerprint === fingerprint) return cached;
  } catch {
    // Cache misses are expected after a catalog or governance change.
  }
  return null;
}

export async function runReleasePreflight({ rootDir: providedRootDir = rootDir, profile = "catalog" } = {}) {
  const resolvedRootDir = resolve(providedRootDir);
  const target = validateReleaseTarget();
  const governance = validateCollectionGovernance();
  const approvals = await readAndValidateApprovals(resolvedRootDir);
  const knowledgeModel = await readCatalogKnowledgeModel({ required: true });
  assertCatalogKnowledgeModel(knowledgeModel);
  const fingerprint = await fingerprintInputs(resolvedRootDir, profile, target);
  const cachePath = resolve(resolvedRootDir, "output", listingIntelligenceCacheName);
  const cached = await readCachedPreflight(cachePath, fingerprint);
  let listingIntelligence;
  let reused = false;
  if (cached) {
    listingIntelligence = cached.listingIntelligence;
    reused = true;
    process.stdout.write("Reusing verified product-listing intelligence preflight for unchanged release inputs.\n");
  } else {
    listingIntelligence = await validateProductListingIntelligence({
      rootDir: resolvedRootDir,
      model: knowledgeModel,
    });
    await mkdir(resolve(resolvedRootDir, "output"), { recursive: true });
    const nextCache = {
      status: "verified",
      schemaVersion: 1,
      fingerprint,
      verifiedAt: new Date().toISOString(),
      profile,
      target,
      governance,
      listingIntelligence,
    };
    const temporaryPath = `${cachePath}.tmp-${process.pid}`;
    await writeFile(temporaryPath, `${JSON.stringify(nextCache, null, 2)}\n`, "utf8");
    await rename(temporaryPath, cachePath);
  }

  return {
    status: "verified",
    profile,
    target,
    approvals,
    governance,
    knowledgeModel: {
      modelVersion: knowledgeModel.modelVersion,
      trainingRecords: Number(knowledgeModel.trainingRecords || 0),
      trainingFingerprint: knowledgeModel.trainingFingerprint,
    },
    listingIntelligence,
    fingerprint,
    reused,
  };
}

async function main() {
  const report = await runReleasePreflight({ profile: process.env.SALT_RELEASE_PROFILE || "catalog" });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message || error}\n`);
    process.exitCode = 1;
  });
}
