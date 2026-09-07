#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { getCatalogTaxonomyDefinitions } from "../src/lib/catalog-taxonomy.js";

const rootDir = resolve(import.meta.dirname, "..");
const outputDir = resolve(rootDir, "output");
const defaultCatalogPath = resolve(outputDir, "release-catalog-source.json");
const defaultKnowledgePath = resolve(outputDir, "product-knowledge.json");
const defaultOutputPath = resolve(outputDir, "visual-taxonomy-catalog-candidate-manifest.jsonl");

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseArgs(argv) {
  const args = {
    catalog: process.env.SALT_VISUAL_TRAINING_CATALOG || defaultCatalogPath,
    knowledge: process.env.SALT_VISUAL_TRAINING_KNOWLEDGE || defaultKnowledgePath,
    output: process.env.SALT_VISUAL_CANDIDATE_MANIFEST || defaultOutputPath,
  };
  const flags = new Map([
    ["--catalog", "catalog"],
    ["--knowledge", "knowledge"],
    ["--output", "output"],
  ]);
  for (let index = 2; index < argv.length; index += 1) {
    const key = flags.get(argv[index]);
    if (!key || !argv[index + 1]) throw new Error(`Expected --catalog, --knowledge, or --output value; got ${argv[index]}.`);
    args[key] = argv[index + 1];
    index += 1;
  }
  return Object.fromEntries(Object.entries(args).map(([key, value]) => [key, resolve(value)]));
}

function productId(product) {
  return String(product?.id || product?.legacyResourceId || product?.productId || product?.handle || "").trim();
}

function imageUrls(product) {
  const media = asArray(product?.media?.nodes || product?.media);
  return [...new Set(asArray(product?.images).concat(media).map((image) => {
    if (typeof image === "string") return image;
    return image?.src || image?.url || image?.image?.url || "";
  }).filter((url) => /^https?:\/\//i.test(url)))];
}

function deterministicSplit(id) {
  const digest = createHash("sha256").update(String(id)).digest("hex");
  const bucket = Number.parseInt(digest.slice(0, 8), 16) / 0xffffffff;
  return bucket < 0.8 ? "train" : bucket < 0.9 ? "validation" : "test";
}

function readKnowledgeIndex(knowledge) {
  return new Map(asArray(knowledge?.products).map((entry) => [
    String(entry?.id || entry?.productId || entry?.handle || ""),
    entry,
  ]));
}

export function buildCatalogCandidateManifest({ catalog, knowledge } = {}) {
  const products = asArray(catalog?.products || catalog)
    .filter((product) => String(product?.status || "ACTIVE").toLowerCase() === "active");
  const knowledgeById = readKnowledgeIndex(knowledge);
  const allowedRules = new Set(getCatalogTaxonomyDefinitions().map((definition) => definition.id));
  const records = [];
  const seen = new Set();
  const excluded = { missingKnowledge: 0, reviewRequired: 0, invalidRule: 0, noImages: 0 };

  for (const product of products) {
    const id = productId(product);
    const knowledgeEntry = knowledgeById.get(id) || knowledgeById.get(String(product?.handle || ""));
    const ruleId = String(knowledgeEntry?.classificationRule || "").trim();
    if (!knowledgeEntry) {
      excluded.missingKnowledge += 1;
      continue;
    }
    if (knowledgeEntry.reviewRequired === true) {
      excluded.reviewRequired += 1;
      continue;
    }
    if (!allowedRules.has(ruleId)) {
      excluded.invalidRule += 1;
      continue;
    }
    const urls = imageUrls(product);
    if (!urls.length) {
      excluded.noImages += 1;
      continue;
    }
    for (const [imageIndex, sourceUrl] of urls.entries()) {
      const key = `${id}\n${sourceUrl}`;
      if (seen.has(key)) continue;
      seen.add(key);
      records.push({
        sourceUrl,
        productId: id,
        ruleId,
        labelSource: "deterministic-candidate",
        candidateOnly: true,
        split: deterministicSplit(id),
        imageIndex,
        sourceEvidence: {
          classificationConfidence: Number(knowledgeEntry.confidence || 0),
          typeKey: String(knowledgeEntry.typeKey || ""),
          specificType: String(knowledgeEntry.specificType || ""),
          knowledgeModelVersion: String(knowledgeEntry.modelEvidence?.modelVersion || knowledge?.knowledgeModel?.version || ""),
        },
      });
    }
  }
  records.sort((left, right) => `${left.productId}\n${left.sourceUrl}`.localeCompare(`${right.productId}\n${right.sourceUrl}`));
  return {
    records,
    summary: {
      activeProducts: products.length,
      includedProducts: new Set(records.map((record) => record.productId)).size,
      imageUrls: records.length,
      excluded,
      labelPolicy: "deterministic-candidate-only; never human-reviewed and never a release classification",
    },
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  const args = parseArgs(process.argv);
  const [catalog, knowledge] = await Promise.all([readJson(args.catalog), readJson(args.knowledge)]);
  const result = buildCatalogCandidateManifest({ catalog, knowledge });
  await writeFile(args.output, `${result.records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ output: args.output, ...result.summary }, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

export { deterministicSplit, imageUrls, parseArgs };
