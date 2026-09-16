#!/usr/bin/env node

import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";

import {
  GPT_SEO_RECORD_SCHEMA_VERSION,
  normalizeGptSeoRecord,
  normalizeKey,
  productGptEvidence,
  validateGptSeoRecord,
} from "../src/lib/gpt-seo-enrichment.js";
import { normalizeHandleValue } from "../src/lib/shopify-seo-batch.js";
import { submitGptSeoBatchWithAppleScript } from "./gpt-seo-applescript-bridge.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const enrichmentPath = resolve(rootDir, process.env.SALT_GPT_SEO_ENRICHMENT_PATH || "output/gpt-seo-enrichment.json");
const liveCatalogPath = resolve(rootDir, process.env.SALT_SHOPIFY_SEO_LIVE_CATALOG || "output/.shopify-seo-live-catalog.json");
const handlesOutput = resolve(rootDir, "output/gpt-seo-selected-handles.json");
const queueDir = resolve(rootDir, "output", "gpt-seo-applescript");
const model = String(process.env.SALT_GPT_SEO_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini").trim();

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function productFingerprint(product) {
  return createHash("sha256").update(JSON.stringify({
    id: product?.id || "",
    handle: product?.handle || "",
    updatedAt: product?.updatedAt || product?.updated_at || "",
    title: product?.title || "",
    descriptionHtml: product?.descriptionHtml || product?.body_html || "",
    variants: productGptEvidence(product).variants,
  })).digest("hex");
}

function catalogBoundary(products) {
  return `sha256-${createHash("sha256")
    .update(products.map((product) => normalizeHandleValue(product.handle)).sort().join("\n"))
    .digest("hex")}`;
}

function canonicalizeRecord(record, product) {
  const normalized = normalizeGptSeoRecord(record, product);
  const taxonomy = productGptEvidence(product).verifiedTaxonomy || {};
  return {
    ...normalized,
    category: {
      department: taxonomy.department || normalized.category.department,
      category: taxonomy.category || normalized.category.category,
      subcategory: taxonomy.subcategory || normalized.category.subcategory,
      productType: taxonomy.productType || normalized.category.productType,
    },
  };
}

async function writeJsonAtomically(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  // The final write is intentionally last; readers never observe a partial JSON file.
  await rename(temporaryPath, filePath);
}

function promptText({ inputPath, responsePath, productCount }) {
  return [
    "You are the GPT SEO repair worker for SALT Online Store.",
    `Process the attached JSON input file at ${inputPath}. It contains ${productCount} products whose live Shopify evidence changed since an earlier GPT SEO artifact.`,
    "Regenerate product-centered SEO from the supplied current evidence only: title, descriptionHtml, seoTitle, seoDescription, category, metafields, and searchTerms.",
    "Keep each product family, model, size, color, quantity, and compatibility exact. Do not invent facts or mix products between records.",
    "category must copy the supplied verifiedTaxonomy values exactly.",
    "Use the ChatGPT Work mode's local file-writing capability now. Do not merely describe the result in chat.",
    `Response path: ${responsePath}`,
    "The response file is the only accepted output. Do not write to Shopify or any other remote system.",
    `Response shape: {"requestId":"<copied requestId>","schemaVersion":2,"batchIndex":1,"records":[{"handle":"...","accepted":true,"record":{"title":"...","descriptionHtml":"...","seoTitle":"...","seoDescription":"...","category":{"department":"...","category":"...","subcategory":"...","productType":"..."},"metafields":{"badgeText":"...","highlights":["..."],"collectionSignal":"...","typeAttributes":{}},"searchTerms":["..."]}}]}.`,
    "Return no markdown or explanation in chat. Write and verify the JSON file first.",
  ].join("\n");
}

async function readResponse(responsePath, requestId, productCount) {
  const timeoutMs = Math.max(60_000, Number(process.env.SALT_GPT_SEO_APPLESCRIPT_TIMEOUT_MS || 1_800_000));
  const pollMs = Math.max(1_000, Number(process.env.SALT_GPT_SEO_APPLESCRIPT_POLL_MS || 2_000));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = JSON.parse(await readFile(responsePath, "utf8"));
      if (response?.requestId === requestId && Number(response?.schemaVersion) === GPT_SEO_RECORD_SCHEMA_VERSION && Number(response?.batchIndex) === 1) {
        if (!Array.isArray(response.records) || response.records.length !== productCount) {
          throw new Error(`GPT repair response returned ${response.records?.length || 0}/${productCount} records.`);
        }
        return response.records;
      }
    } catch (error) {
      if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, pollMs));
  }
  throw new Error(`Timed out waiting for GPT repair response at ${responsePath}.`);
}

async function main() {
  const previous = JSON.parse(await readFile(enrichmentPath, "utf8"));
  if (previous?.schemaVersion !== GPT_SEO_RECORD_SCHEMA_VERSION || previous?.status !== "completed") {
    throw new Error(`GPT enrichment must be a completed schema-${GPT_SEO_RECORD_SCHEMA_VERSION} manifest before live reconciliation.`);
  }
  if (previous.scope !== "all-products") throw new Error(`Expected all-products GPT enrichment, received ${previous.scope || "missing"}.`);

  const livePayload = JSON.parse(await readFile(liveCatalogPath, "utf8"));
  const liveProducts = Array.isArray(livePayload) ? livePayload : livePayload?.products;
  if (!Array.isArray(liveProducts) || !liveProducts.length) throw new Error(`Live catalog snapshot has no products: ${liveCatalogPath}`);

  // Use the same Shopify slug normalization as the guarded apply. The GPT
  // validator's token key removes diacritics differently and can create a
  // false boundary mismatch for handles such as "trắng".
  const previousEntries = Array.isArray(previous.records) ? previous.records : [];
  const previousByHandle = new Map(previousEntries.map((entry) => [normalizeHandleValue(entry.handle || entry.record?.handle), entry]));
  const previousByLegacyKey = new Map(previousEntries.map((entry) => [normalizeKey(entry.handle || entry.record?.handle), entry]));
  const liveByHandle = new Map(liveProducts.map((product) => [normalizeHandleValue(product.handle), product]));
  const repairProducts = [];
  const matchedPreviousEntries = new Set();
  for (const product of liveProducts) {
    const handle = normalizeHandleValue(product.handle);
    const prior = previousByHandle.get(handle) || previousByLegacyKey.get(normalizeKey(product.handle));
    if (!prior) {
      repairProducts.push(product);
      continue;
    }
    matchedPreviousEntries.add(prior);
    const validation = validateGptSeoRecord(product, prior.record || prior);
    const handleRepresentationChanged = text(prior.handle || prior.record?.handle) !== handle;
    if (!validation.accepted || handleRepresentationChanged) repairProducts.push(product);
  }
  const staleHandles = previousEntries
    .filter((entry) => !matchedPreviousEntries.has(entry))
    .map((entry) => normalizeHandleValue(entry.handle || entry.record?.handle))
    .filter(Boolean);
  const liveBoundary = catalogBoundary(liveProducts);

  if (!repairProducts.length && !staleHandles.length) {
    if (previous.catalogBoundary !== liveBoundary) {
      await writeJsonAtomically(enrichmentPath, {
        ...previous,
        catalogBoundary: liveBoundary,
        generatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
      process.stdout.write(`GPT live reconciliation: no drift found; normalized catalog boundary across ${liveProducts.length} products.\n`);
    } else {
      process.stdout.write(`GPT live reconciliation: no drift found across ${liveProducts.length} products.\n`);
    }
    return;
  }

  process.stdout.write(`GPT live reconciliation: ${repairProducts.length} product(s) require fresh GPT copy; ${staleHandles.length} stale artifact record(s) will be quarantined.\n`);
  const requestId = createHash("sha256").update(JSON.stringify({
    repairProducts: repairProducts.map((product) => ({ handle: normalizeHandleValue(product.handle), fingerprint: productFingerprint(product) })),
    boundary: liveBoundary,
  })).digest("hex");
  const prefix = `live-reconcile-${Date.now()}`;
  const inputPath = resolve(queueDir, `${prefix}.input.json`);
  const promptPath = resolve(queueDir, `${prefix}.prompt.txt`);
  const responsePath = resolve(queueDir, `${prefix}.response.json`);
  const input = {
    schemaVersion: GPT_SEO_RECORD_SCHEMA_VERSION,
    requestId,
    provider: "chatgpt-applescript",
    model,
    batchIndex: 1,
    batchCount: 1,
    products: repairProducts.map((product) => ({
      handle: normalizeHandleValue(product.handle),
      evidenceFingerprint: productFingerprint(product),
      evidence: productGptEvidence(product),
    })),
  };
  await mkdir(queueDir, { recursive: true });
  await writeJsonAtomically(inputPath, input);
  await writeFile(promptPath, `${promptText({ inputPath, responsePath, productCount: repairProducts.length })}\n`, "utf8");
  await submitGptSeoBatchWithAppleScript({
    inputPath,
    promptPath,
    responsePath,
    scriptPath: resolve(rootDir, "scripts", "gpt-seo-applescript.applescript"),
    requestId,
  });
  const rawRecords = await readResponse(responsePath, requestId, repairProducts.length);
  const productsByHandle = new Map();
  for (const product of repairProducts) {
    productsByHandle.set(normalizeHandleValue(product.handle), product);
    // ChatGPT may echo an older ASCII key for a diacritic handle. Accept it
    // only as a lookup alias; the canonical Shopify slug is written below.
    productsByHandle.set(normalizeKey(product.handle), product);
  }
  const repairedByHandle = new Map();
  for (const entry of rawRecords) {
    const responseHandle = text(entry?.handle || entry?.record?.handle);
    const product = productsByHandle.get(normalizeHandleValue(responseHandle))
      || productsByHandle.get(normalizeKey(responseHandle));
    if (!product) throw new Error(`GPT repair returned an unexpected handle: ${responseHandle || "missing"}`);
    const handle = normalizeHandleValue(product.handle);
    const record = canonicalizeRecord(entry.record || entry, product);
    const validation = validateGptSeoRecord(product, record);
    if (!validation.accepted) throw new Error(`${handle}: repaired GPT record failed validation: ${validation.issues.join(", ")}`);
    repairedByHandle.set(handle, {
      handle,
      evidenceFingerprint: productFingerprint(product),
      accepted: true,
      issues: [],
      matchedEvidenceTokens: validation.matchedEvidenceTokens,
      record: validation.record,
    });
  }
  if (repairedByHandle.size !== repairProducts.length) throw new Error(`GPT repair returned ${repairedByHandle.size}/${repairProducts.length} unique handles.`);

  const records = liveProducts.map((product) => {
    const handle = normalizeHandleValue(product.handle);
    return repairedByHandle.get(handle) || previousByHandle.get(handle);
  });
  const reconciledByHandle = new Map(records.map((entry) => [normalizeHandleValue(entry?.handle), entry]));
  const finalIssues = [];
  for (const product of liveProducts) {
    const handle = normalizeHandleValue(product.handle);
    const entry = reconciledByHandle.get(handle);
    if (!entry) {
      finalIssues.push(`${handle}: missing reconciled GPT record`);
      continue;
    }
    const validation = validateGptSeoRecord(product, entry.record || entry);
    if (!validation.accepted) finalIssues.push(`${handle}: ${validation.issues.join(", ")}`);
  }
  if (finalIssues.length) throw new Error(`GPT live reconciliation final gate failed: ${finalIssues.slice(0, 12).join(" | ")}`);

  const backupPath = `${enrichmentPath}.pre-live-reconcile-${Date.now()}.json`;
  await copyFile(enrichmentPath, backupPath);
  const manifest = {
    ...previous,
    status: "completed",
    generatedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    catalogMethod: "live-shopify-catalog-reconciled",
    catalogBoundary: liveBoundary,
    reused: liveProducts.length - repairProducts.length,
    summary: {
      selected: liveProducts.length,
      accepted: liveProducts.length,
      rejected: 0,
      batches: previous.summary?.batches || 0,
    },
    liveReconciliation: {
      repairedProducts: repairProducts.length,
      staleArtifactRecordsQuarantined: staleHandles.length,
      backupPath,
      responsePath,
    },
    records,
  };
  await writeJsonAtomically(enrichmentPath, manifest);
  await writeJsonAtomically(handlesOutput, {
    generatedAt: new Date().toISOString(),
    scope: "all-products",
    handles: liveProducts.map((product) => normalizeHandleValue(product.handle)).sort(),
  });
  process.stdout.write(JSON.stringify({
    status: manifest.status,
    liveProducts: liveProducts.length,
    repairedProducts: repairProducts.length,
    staleArtifactRecordsQuarantined: staleHandles.length,
    backupPath,
    responsePath,
  }, null, 2) + "\n");
}

main().catch((error) => {
  process.stderr.write(`GPT live reconciliation failed: ${error?.stack || error}\n`);
  process.exitCode = 1;
});
