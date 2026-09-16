#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  COLLECTION_GOVERNANCE_VERSION,
  SEMANTIC_COLLECTION_POLICIES,
  buildProductCollectionTags,
} from "../src/lib/catalog-collection-governance.js";

const rootDir = resolve(import.meta.dirname, "..");
const outputPath = resolve(rootDir, "output", "collection-repair-rules-validation.json");

const EMPTY_KNOWLEDGE = Object.freeze({
  proposedTags: [],
  collectionTargets: [],
  classificationRule: "general-merchandise",
});

const REPAIR_CASES = Object.freeze([
  {
    id: "home-safety-mouse-exclusion",
    product: { title: "Ergonomic Wireless Computer Mouse", handle: "ergonomic-wireless-computer-mouse", product_type: "home safety" },
    knowledge: { proposedTags: ["home-safety"], collectionTargets: ["home-safety"], classificationRule: "home-safety" },
    forbidden: ["home-safety"],
  },
  {
    id: "hats-bottle-opener-exclusion",
    product: { title: "Stainless Steel Beer Bottle Opener", handle: "stainless-steel-beer-bottle-opener" },
    knowledge: { proposedTags: ["hats"], collectionTargets: ["hats"], classificationRule: "hats-caps" },
    forbidden: ["hats"],
  },
  {
    id: "connector-gender-phrase-exclusion",
    product: {
      title: "Male to Female USB C Connector Adapter Cable",
      handle: "male-to-female-usb-c-connector-adapter-cable",
      product_type: "Electronic Accessory",
    },
    knowledge: {
      audience: { id: "men" },
      proposedTags: ["mens-accessories", "men-fashion"],
      collectionTargets: ["mens-accessories", "mens-fashion", "men-collection"],
      classificationRule: "mens-accessories",
    },
    forbidden: ["mens-accessories", "mens-fashion", "men-collection"],
  },
  {
    id: "direct-mens-apparel-preserved",
    product: {
      title: "Men's Cotton Crew Neck T-Shirt",
      handle: "mens-cotton-crew-neck-t-shirt",
      product_type: "Men's T-Shirt",
    },
    knowledge: {
      audience: { id: "men" },
      subcategoryId: "t-shirts",
      proposedTags: ["men", "men-fashion"],
      collectionTargets: ["men-collection"],
      classificationRule: "t-shirts",
    },
    required: ["men-t-shirt", "mens-fashion", "men-collection"],
  },
  {
    id: "gifts-for-dad-evidence",
    product: { title: "Leather Gift Set for Dad", handle: "leather-gift-set-for-dad" },
    knowledge: EMPTY_KNOWLEDGE,
    required: ["gifts-for-dad"],
  },
  {
    id: "gifts-for-mom-evidence",
    product: { title: "Personalized Birthday Present for Mom", handle: "personalized-birthday-present-for-mom" },
    knowledge: EMPTY_KNOWLEDGE,
    required: ["gifts-for-mom"],
  },
  {
    id: "daily-living-aids-evidence",
    product: { title: "Adjustable Elderly Bed Rail Assistive Support", handle: "adjustable-elderly-bed-rail" },
    knowledge: EMPTY_KNOWLEDGE,
    required: ["daily-living-aids"],
  },
  {
    id: "senior-living-solutions-evidence",
    product: { title: "Caregiver Daily Living Aid for Assisted Living", handle: "caregiver-daily-living-aid" },
    knowledge: EMPTY_KNOWLEDGE,
    required: ["senior-living-solutions"],
  },
  {
    id: "candles-evidence",
    product: { title: "Scented Soy Candle in Glass Jar", handle: "scented-soy-candle-glass-jar" },
    knowledge: { ...EMPTY_KNOWLEDGE, subcategoryId: "candles-home-fragrance" },
    required: ["candles"],
  },
  {
    id: "candles-steel-tool-exclusion",
    product: { title: "Stainless Steel Candle Wax Melting Pot", handle: "stainless-steel-candle-wax-melting-pot" },
    knowledge: { ...EMPTY_KNOWLEDGE, subcategoryId: "cookware" },
    forbidden: ["candles"],
  },
  {
    id: "pet-feeding-subcategory-evidence",
    product: { title: "Portable Dog Feeder Bowl", handle: "portable-dog-feeder-bowl" },
    knowledge: { departmentId: "pets", subcategoryId: "pet-feeding-accessories", proposedTags: [], collectionTargets: [] },
    required: ["pet-feeding"],
  },
  {
    id: "pet-grooming-wording-evidence",
    product: { title: "Pet Grooming Brush and Nail Trimmer", handle: "pet-grooming-brush-nail-trimmer" },
    knowledge: { departmentId: "pets", subcategoryId: "pet-grooming-tools", proposedTags: [], collectionTargets: [] },
    required: ["pet-grooming"],
  },
]);

const REQUIRED_POLICIES = [
  "home-safety",
  "hats",
  "gifts-for-dad",
  "gifts-for-mom",
  "daily-living-aids",
  "senior-living-solutions",
  "candles",
];

export function validateCollectionRepairRules() {
  const policyHandles = new Set(SEMANTIC_COLLECTION_POLICIES.map((policy) => policy.handle));
  for (const handle of REQUIRED_POLICIES) assert(policyHandles.has(handle), `Missing governed collection policy: ${handle}`);

  const cases = REPAIR_CASES.map((repairCase) => {
    const tags = buildProductCollectionTags(repairCase.product, repairCase.knowledge);
    for (const tag of repairCase.required || []) assert(tags.includes(tag), `${repairCase.id} did not assign ${tag}`);
    for (const tag of repairCase.forbidden || []) assert(!tags.includes(tag), `${repairCase.id} incorrectly assigned ${tag}`);
    return { id: repairCase.id, tags };
  });

  return {
    schemaVersion: 1,
    governanceVersion: COLLECTION_GOVERNANCE_VERSION,
    requiredPolicies: REQUIRED_POLICIES,
    cases,
    status: "passed",
  };
}

export async function writeCollectionRepairRuleReport() {
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "deterministic-collection-repair-rule-validation",
    policy: "Collection exclusions are evaluated before stale taxonomy tags or collection targets; positive evidence must be present for expanded collections.",
    ...validateCollectionRepairRules(),
  };
  await mkdir(resolve(rootDir, "output"), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function main() {
  const report = await writeCollectionRepairRuleReport();
  process.stdout.write(`Collection repair rule validation passed: ${report.cases.length} regression cases, ${report.requiredPolicies.length} governed policies.\n`);
  process.stdout.write(`Saved ${outputPath}\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message || error}\n`);
    process.exitCode = 1;
  });
}
