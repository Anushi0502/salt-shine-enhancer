#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { assertCatalogKnowledgeModel } from "../src/lib/catalog-knowledge-model.js";
import { buildSeoBatchPlan } from "../src/lib/shopify-seo-batch-intelligence.js";
import { classifyProductKnowledge } from "../src/lib/product-knowledge-base.js";
import { readCatalogKnowledgeModel } from "./catalog-knowledge-model-files.mjs";
import { readProductCatalogPayload } from "./product-catalog-files.mjs";

const rootDir = resolve(import.meta.dirname, "..");

const GENERIC_CONTENT_PATTERN = /serves the specific function identified|confirmed product facts and available options|this product follows the|specific everyday task identified|generic product|unclassified product/i;
const SUPPLIER_CONTENT_PATTERN = /Brand Name:|Choice:|High Concerned Chemical:|Origin:|Model Number:/i;
const NOISY_TITLE_PATTERN = /high quality|best seller|wholesale|dropshipping|free shipping|factory direct|product listing/i;

const FIXTURES = Object.freeze([
  {
    id: "listing-preflight-tripod",
    handle: "fangtuosi-1800mm-tripod-for-smartphone-camera-tripods-stand",
    title: "Fangtuosi 1800mm Tripod for Smartphone Camera Tripods Stand",
    body: "Adjustable 1800mm tripod stand for smartphones and cameras with a wireless remote.",
    expectedTitle: /tripod/i,
    expectedBody: /tripod|smartphone|camera/i,
  },
  {
    id: "listing-preflight-earbuds-case",
    handle: "tpu-case-for-airpods-4-generation-wireless-earbuds",
    title: "TPU Case for AirPods 4 Generation Wireless Earbuds",
    body: "Transparent TPU protective case for AirPods 4 wireless earbuds.",
    expectedTitle: /AirPods|earbuds/i,
    expectedBody: /AirPods|earbuds|TPU/i,
  },
  {
    id: "listing-preflight-school-lunch-box",
    handle: "insulated-school-lunch-box-for-kids",
    title: "Insulated School Lunch Box for Kids",
    body: "Reusable insulated lunch container for school meals.",
    expectedTitle: /lunch/i,
    expectedBody: /lunch|container|school/i,
  },
]);

function rowFor(product) {
  return {
    Handle: product.handle,
    Title: product.title,
    "Body (HTML)": product.body || product.body_html || "",
    "Product Type": product.product_type || "",
    Tags: Array.isArray(product.tags) ? product.tags.join(", ") : "",
    "Product ID": product.id,
    "Option1 Value": Array.isArray(product.variants) ? product.variants[0]?.title || "" : "",
  };
}

function sampleProducts(products, limit = 64) {
  if (products.length <= limit) return products;
  return Array.from({ length: limit }, (_, index) => products[Math.floor(index * products.length / limit)]);
}

async function readCatalogForRoot(resolvedRootDir) {
  const explicitSource = String(process.env.SALT_RELEASE_CATALOG_SOURCE_PATH || "").trim();
  const sourceCandidates = [
    explicitSource,
    resolve(resolvedRootDir, "output", "release-catalog-source.json"),
  ].filter(Boolean);
  for (const sourcePath of sourceCandidates) {
    try {
      const payload = JSON.parse(await readFile(resolve(resolvedRootDir, sourcePath), "utf8"));
      if (Array.isArray(payload?.products) && payload.products.length) return payload;
    } catch {
      // Fall through to the normal sharded public catalog reader.
    }
  }
  return readProductCatalogPayload(resolve(resolvedRoot, "public", "data"));
}

function validateCatalogIdentity(products) {
  const failures = [];
  const handles = new Set();
  for (const product of products) {
    const handle = String(product?.handle || "").trim().toLowerCase();
    const title = String(product?.title || "").trim();
    if (!handle) failures.push("product is missing a handle");
    if (!title) failures.push(`${handle || "unknown product"}: title is missing`);
    if (handle && handles.has(handle)) failures.push(`${handle}: duplicate handle`);
    if (handle) handles.add(handle);
    if (failures.length >= 20) break;
  }
  if (failures.length) throw new Error(`Catalog identity validation failed: ${failures.join("; ")}`);
  return { products: products.length, uniqueHandles: handles.size };
}

function validateKnowledgeSamples(products, model) {
  const failures = [];
  for (const product of sampleProducts(products)) {
    const knowledge = classifyProductKnowledge(product, { knowledgeModel: model });
    const handle = String(product?.handle || "unknown-product");
    if (!String(knowledge?.specificType || "").trim()) failures.push(`${handle}: missing specific product type`);
    if (!String(knowledge?.specificTypeKey || "").trim()) failures.push(`${handle}: missing stable specific type key`);
    if (!String(knowledge?.classificationRule || "").trim()) failures.push(`${handle}: missing classification rule`);
    if (!Array.isArray(knowledge?.searchTerms) || !knowledge.searchTerms.length) failures.push(`${handle}: missing search terms`);
    if (failures.length >= 20) break;
  }
  if (failures.length) throw new Error(`Catalog listing-intelligence validation failed: ${failures.join("; ")}`);
  return { checked: Math.min(products.length, 64) };
}

async function validateSeoFixtures(model) {
  const failures = [];
  const plan = await buildSeoBatchPlan(FIXTURES.map(rowFor), {
    products: [],
    collections: [],
    collectionProducts: [],
    resolveCategoryId: async () => null,
    knowledgeModel: model,
  });

  for (const [index, fixture] of FIXTURES.entries()) {
    const profile = plan.products?.[index];
    const title = String(profile?.intelligence?.canonicalTitle || profile?.productInput?.title || "").trim();
    const body = String(
      profile?.intelligence?.canonicalDescriptionHtml || profile?.productInput?.descriptionHtml || "",
    );
    if (title.length < 20) failures.push(`${fixture.handle}: generated title is too short`);
    if (!fixture.expectedTitle.test(title)) failures.push(`${fixture.handle}: title lost product evidence (${title})`);
    if (!fixture.expectedBody.test(body)) failures.push(`${fixture.handle}: description lost product evidence`);
    if (GENERIC_CONTENT_PATTERN.test(body)) failures.push(`${fixture.handle}: generic fallback copy detected`);
    if (SUPPLIER_CONTENT_PATTERN.test(body)) failures.push(`${fixture.handle}: supplier-only metadata leaked`);
    if (NOISY_TITLE_PATTERN.test(title)) failures.push(`${fixture.handle}: noisy title detected`);
  }
  if (failures.length) throw new Error(`SEO listing-intelligence validation failed: ${failures.join("; ")}`);
  return { fixtures: FIXTURES.length };
}

export async function validateProductListingIntelligence({ rootDir: providedRootDir = rootDir, model = null } = {}) {
  const resolvedRootDir = resolve(providedRootDir);
  const knowledgeModel = model || await readCatalogKnowledgeModel({ required: true });
  assertCatalogKnowledgeModel(knowledgeModel);
  const payload = await readCatalogForRoot(resolvedRootDir);
  const products = Array.isArray(payload?.products) ? payload.products : [];
  if (!products.length) throw new Error("Catalog listing-intelligence validation found no products.");

  const identity = validateCatalogIdentity(products);
  const knowledge = validateKnowledgeSamples(products, knowledgeModel);
  const seo = await validateSeoFixtures(knowledgeModel);
  return {
    status: "verified",
    catalogProducts: products.length,
    ...identity,
    ...knowledge,
    ...seo,
    modelRecords: Number(knowledgeModel.trainingRecords || 0),
    modelVersion: knowledgeModel.modelVersion,
  };
}

async function main() {
  const report = await validateProductListingIntelligence();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message || error}\n`);
    process.exitCode = 1;
  });
}
