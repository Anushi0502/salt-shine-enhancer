#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  buildGptSeoPrompt,
  GPT_SEO_RECORD_SCHEMA_VERSION,
  normalizeGptSeoRecord,
  normalizeKey,
  productGptEvidence,
  validateGptSeoRecord,
} from "../src/lib/gpt-seo-enrichment.js";
import { fetchAllProducts } from "./shopify-seo-release.mjs";
import { mapWithConcurrency } from "./lib/performance-runtime.mjs";
import { submitGptSeoBatchWithAppleScript } from "./gpt-seo-applescript-bridge.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const defaultOutput = resolve(rootDir, "output", "gpt-seo-enrichment.json");
const defaultHandlesOutput = resolve(rootDir, "output", "gpt-seo-selected-handles.json");
const model = String(process.env.SALT_GPT_SEO_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini").trim();
const apiBase = String(process.env.SALT_GPT_SEO_API_BASE || "https://api.openai.com/v1").replace(/\/$/, "");
const defaultProvider = String(process.env.SALT_GPT_SEO_PROVIDER || "applescript").trim().toLowerCase();
const appleScriptBridgePath = resolve(rootDir, "scripts", "gpt-seo-applescript.applescript");
const appleScriptQueueDir = resolve(rootDir, "output", "gpt-seo-applescript");

function parseArgs(argv) {
  const args = {
    scope: String(process.env.SALT_RELEASE_SEO_SCOPE || "all-products").trim().toLowerCase(),
    provider: defaultProvider,
    batchSize: Math.max(1, Math.min(500, Number(process.env.SALT_GPT_SEO_BATCH_SIZE || 500))),
    concurrency: Math.max(1, Math.min(16, Number(process.env.SALT_GPT_SEO_CONCURRENCY || 8))),
    output: defaultOutput,
    handlesOutput: defaultHandlesOutput,
    resume: process.env.SALT_GPT_SEO_RESUME !== "0",
  };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--scope" && next) args.scope = String(next).trim().toLowerCase(), index += 1;
    else if (token === "--batch-size" && next) args.batchSize = Math.max(1, Math.min(500, Number(next) || 500)), index += 1;
    else if (token === "--concurrency" && next) args.concurrency = Math.max(1, Math.min(16, Number(next) || 8)), index += 1;
    else if (token === "--output" && next) args.output = resolve(rootDir, next), index += 1;
    else if (token === "--handles-output" && next) args.handlesOutput = resolve(rootDir, next), index += 1;
    else if (token === "--provider" && next) args.provider = String(next).trim().toLowerCase(), index += 1;
    else if (token === "--no-resume") args.resume = false;
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (!["all-products", "new-products"].includes(args.scope)) throw new Error(`Unsupported GPT SEO scope: ${args.scope}`);
  if (!["applescript", "api"].includes(args.provider)) throw new Error(`Unsupported GPT SEO provider: ${args.provider}`);
  return args;
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
  return createHash("sha256").update(products.map((product) => normalizeKey(product.handle)).sort().join("\n")).digest("hex");
}

async function writeJsonAtomically(path, value) {
  await mkdir(resolve(path, ".."), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

async function readJsonIfPresent(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function readHandleSelection(path) {
  const payload = await readJsonIfPresent(path);
  const handles = Array.isArray(payload) ? payload : payload?.handles;
  return Array.isArray(handles) ? new Set(handles.map(normalizeKey).filter(Boolean)) : null;
}

async function readCatalogCandidate(path) {
  if (!path) return null;
  const payload = await readJsonIfPresent(path);
  const products = Array.isArray(payload) ? payload : payload?.products;
  if (!Array.isArray(products) || !products.length) return null;
  const activeProducts = products.filter((product) => {
    const status = String(product?.status || "").trim().toUpperCase();
    return !status || status === "ACTIVE";
  });
  return activeProducts.length ? activeProducts : null;
}

async function loadCatalog(retryInfo) {
  if (process.env.SALT_GPT_SEO_REUSE_SHARED_SNAPSHOT === "1") {
    const candidates = [
      process.env.SALT_GPT_SEO_CATALOG_PATH,
      process.env.SALT_RELEASE_CATALOG_SOURCE_PATH,
      resolve(rootDir, "output", "release-catalog-snapshot.json"),
    ].filter(Boolean);
    for (const candidate of candidates) {
      const products = await readCatalogCandidate(resolve(rootDir, candidate));
      if (products) {
        process.stdout.write(`Reusing shared catalog snapshot for GPT SEO: ${products.length} active products from ${resolve(rootDir, candidate)}.\n`);
        return { products, method: `shared-snapshot:${resolve(rootDir, candidate)}` };
      }
    }
  }
  return { products: await fetchAllProducts(retryInfo), method: "live-shopify-catalog" };
}

async function selectProducts(products, scope) {
  if (scope === "all-products") return { products, method: "all-active-products" };
  const explicitPath = String(process.env.SALT_GPT_SEO_NEW_PRODUCTS_HANDLES_PATH || "").trim();
  if (explicitPath) {
    const handles = await readHandleSelection(resolve(rootDir, explicitPath));
    if (!handles?.size) throw new Error(`New-product GPT SEO handle file is empty or invalid: ${explicitPath}`);
    const selected = products.filter((product) => handles.has(normalizeKey(product.handle)));
    if (selected.length !== handles.size) throw new Error(`New-product GPT SEO handle file contains ${handles.size - selected.length} handles missing from the active catalog.`);
    return { products: selected, method: `explicit-handle-file:${explicitPath}` };
  }
  const prior = await readJsonIfPresent(resolve(rootDir, "output", "shopify-seo-release-manifest.json"));
  const knownHandles = new Set((prior?.products || [])
    .filter((entry) => ["updated-verified", "skipped-exact-match"].includes(entry?.status))
    .map((entry) => normalizeKey(entry.handle))
    .filter(Boolean));
  if (prior?.policy?.initialFullCatalogPassComplete && knownHandles.size) {
    return { products: products.filter((product) => !knownHandles.has(normalizeKey(product.handle))), method: "not-in-completed-full-seo-manifest" };
  }
  const lookbackDays = Math.max(1, Math.min(30, Number(process.env.SALT_GPT_SEO_NEW_PRODUCT_LOOKBACK_DAYS || 7)));
  const since = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  const selected = products.filter((product) => {
    const createdAt = Date.parse(String(product.createdAt || product.created_at || ""));
    const updatedAt = Date.parse(String(product.updatedAt || product.updated_at || ""));
    return Math.max(createdAt || 0, updatedAt || 0) >= since;
  });
  return { products: selected, method: `created-or-updated-within-${lookbackDays}-days` };
}

async function requestGpt(product, apiKey) {
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(`${apiBase}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0.15,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "You are a strict ecommerce SEO editor. Output valid JSON only and never invent product facts." },
            { role: "user", content: buildGptSeoPrompt(product) },
          ],
        }),
        signal: AbortSignal.timeout(Math.max(30_000, Number(process.env.SALT_GPT_SEO_REQUEST_TIMEOUT_MS || 120_000))),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`GPT SEO HTTP ${response.status}: ${String(payload?.error?.message || "request failed").slice(0, 300)}`);
      const content = payload?.choices?.[0]?.message?.content;
      if (!content) throw new Error("GPT SEO response contained no message content");
      const parsed = JSON.parse(String(content).replace(/^```json\s*/i, "").replace(/\s*```$/, ""));
      const validation = validateGptSeoRecord(product, parsed);
      return {
        handle: normalizeKey(product.handle),
        evidenceFingerprint: productFingerprint(product),
        accepted: validation.accepted,
        issues: validation.issues,
        matchedEvidenceTokens: validation.matchedEvidenceTokens,
        record: normalizeGptSeoRecord(parsed, product),
      };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolvePromise) => setTimeout(resolvePromise, Math.min(30_000, 1000 * 2 ** attempt)));
    }
  }
  return {
    handle: normalizeKey(product.handle),
    evidenceFingerprint: productFingerprint(product),
    accepted: false,
    issues: [`provider-error:${String(lastError?.message || lastError || "unknown").slice(0, 300)}`],
    matchedEvidenceTokens: [],
    record: normalizeGptSeoRecord({}, product),
  };
}

function appleScriptRequestId(products, batchIndex) {
  return createHash("sha256")
    .update(JSON.stringify({
      batchIndex,
      products: products.map((product) => ({ handle: normalizeKey(product.handle), fingerprint: productFingerprint(product) })),
    }))
    .digest("hex");
}

function appleScriptPrompt({ inputPath, responsePath, batchIndex, batchCount, productCount }) {
  return [
    "You are the GPT SEO worker for SALT Online Store.",
    `Process the attached JSON input file at ${inputPath}. It contains ${productCount} products in batch ${batchIndex}/${batchCount}.`,
    "For every product, create product-centered SEO using only its supplied evidence: title, descriptionHtml, seoTitle, seoDescription, category, metafields, and searchTerms.",
    "Keep each product family, model, size, color, quantity, and compatibility exact. Do not invent facts or mix products between records.",
    "Use the ChatGPT Work mode's local file-writing capability now. Do not merely describe the result in chat.",
    "Return no markdown and no explanation in chat. First write one JSON object to the exact response path below, then verify that the file exists and parses as JSON.",
    `Response path: ${responsePath}`,
    "The response file is the only accepted output. Do not write to Shopify or any other remote system.",
    'Response shape: {"requestId":"<copied requestId>","schemaVersion":2,"batchIndex":<copied batchIndex>,"records":[{"handle":"...","accepted":true,"record":{"title":"...","descriptionHtml":"...","seoTitle":"...","seoDescription":"...","category":{"department":"...","category":"...","subcategory":"...","productType":"..."},"metafields":{"badgeText":"...","highlights":["..."],"collectionSignal":"...","typeAttributes":{}},"searchTerms":["..."]}}]}.',
    "Do not modify Shopify or any other remote system. The release will validate and apply the response separately.",
  ].join("\n");
}

async function readResponseIfReady(responsePath, requestId, batchIndex) {
  try {
    const parsed = JSON.parse(await readFile(responsePath, "utf8"));
    if (parsed?.requestId !== requestId) return null;
    if (Number(parsed?.schemaVersion) !== GPT_SEO_RECORD_SCHEMA_VERSION) {
      throw new Error(`AppleScript GPT batch ${batchIndex} response schemaVersion must be ${GPT_SEO_RECORD_SCHEMA_VERSION}.`);
    }
    if (Number(parsed?.batchIndex) !== batchIndex) {
      throw new Error(`AppleScript GPT batch response index mismatch: expected ${batchIndex}, received ${parsed?.batchIndex}.`);
    }
    if (!Array.isArray(parsed.records)) throw new Error(`AppleScript GPT batch ${batchIndex} response has no records array.`);
    return parsed.records;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

async function waitForAppleScriptResponse({ responsePath, requestId, batchIndex }) {
  const timeoutMs = Math.max(60_000, Number(process.env.SALT_GPT_SEO_APPLESCRIPT_TIMEOUT_MS || 1_800_000));
  const pollMs = Math.max(1_000, Number(process.env.SALT_GPT_SEO_APPLESCRIPT_POLL_MS || 2_000));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const records = await readResponseIfReady(responsePath, requestId, batchIndex);
    if (records) return records;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, pollMs));
  }
  throw new Error(
    `AppleScript GPT batch ${batchIndex} timed out waiting for ${responsePath}. ` +
    "The release did not apply this batch; complete the response file in ChatGPT and resume.",
  );
}

async function requestAppleScriptBatch(products, { batchIndex, batchCount }) {
  await mkdir(appleScriptQueueDir, { recursive: true });
  const requestId = appleScriptRequestId(products, batchIndex);
  const prefix = `batch-${String(batchIndex).padStart(4, "0")}`;
  const inputPath = resolve(appleScriptQueueDir, `${prefix}.input.json`);
  const promptPath = resolve(appleScriptQueueDir, `${prefix}.prompt.txt`);
  const responsePath = resolve(appleScriptQueueDir, `${prefix}.response.json`);
  const input = {
    schemaVersion: GPT_SEO_RECORD_SCHEMA_VERSION,
    requestId,
    provider: "chatgpt-applescript",
    model,
    batchIndex,
    batchCount,
    products: products.map((product) => ({
      handle: normalizeKey(product.handle),
      evidenceFingerprint: productFingerprint(product),
      evidence: productGptEvidence(product),
    })),
  };
  const promptText = `${appleScriptPrompt({ inputPath, responsePath, batchIndex, batchCount, productCount: products.length })}\n`;
  const existingRecords = await readResponseIfReady(responsePath, requestId, batchIndex);
  if (!existingRecords) {
    await rm(responsePath, { force: true });
    await writeJsonAtomically(inputPath, input);
    await writeFile(promptPath, promptText, "utf8");
    await submitGptSeoBatchWithAppleScript({
      inputPath,
      promptPath,
      responsePath,
      scriptPath: appleScriptBridgePath,
      requestId,
    });
  }
  const rawRecords = existingRecords || await waitForAppleScriptResponse({ responsePath, requestId, batchIndex });
  if (rawRecords.length !== products.length) {
    throw new Error(`AppleScript GPT batch ${batchIndex} returned ${rawRecords.length}/${products.length} records.`);
  }
  const productsByHandle = new Map(products.map((product) => [normalizeKey(product.handle), product]));
  return rawRecords.map((entry) => {
    const handle = normalizeKey(entry?.handle || entry?.record?.handle);
    const product = productsByHandle.get(handle);
    if (!product) {
      return {
        handle,
        evidenceFingerprint: "",
        accepted: false,
        issues: ["response-handle-not-in-request"],
        record: normalizeGptSeoRecord({}, { handle }),
      };
    }
    const validation = validateGptSeoRecord(product, entry.record || entry);
    return {
      handle,
      evidenceFingerprint: productFingerprint(product),
      accepted: validation.accepted,
      issues: validation.issues,
      matchedEvidenceTokens: validation.matchedEvidenceTokens,
      record: normalizeGptSeoRecord(entry.record || entry, product),
    };
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (args.provider === "api" && !apiKey) throw new Error("GPT SEO API provider requires OPENAI_API_KEY; no Shopify SEO writes were started.");
  const retryInfo = [];
  const catalog = await loadCatalog(retryInfo);
  const liveProducts = catalog.products;
  const selected = await selectProducts(liveProducts, args.scope);
  if (!selected.products.length) throw new Error(`GPT SEO selected zero products for ${args.scope}.`);
  const boundary = catalogBoundary(selected.products);
  const previous = args.resume ? await readJsonIfPresent(args.output) : null;
  const reusable = previous?.schemaVersion === GPT_SEO_RECORD_SCHEMA_VERSION && previous?.model === model && previous?.scope === args.scope && previous?.catalogBoundary === boundary;
  const priorRecords = new Map(reusable ? (previous.records || []).map((record) => [record.handle, record]) : []);
  const records = [];
  let reused = 0;
  for (let start = 0; start < selected.products.length; start += args.batchSize) {
    const batch = selected.products.slice(start, start + args.batchSize);
    const reusableRecords = [];
    const pendingProducts = [];
    for (const product of batch) {
      const handle = normalizeKey(product.handle);
      const priorRecord = priorRecords.get(handle);
      if (priorRecord && priorRecord.evidenceFingerprint === productFingerprint(product) && (priorRecord.accepted || process.env.SALT_GPT_SEO_REPROCESS_REJECTED !== "1")) {
        reusableRecords.push(priorRecord);
        reused += 1;
      } else {
        pendingProducts.push(product);
      }
    }
    const batchRecords = args.provider === "applescript"
      ? pendingProducts.length
        ? await requestAppleScriptBatch(pendingProducts, {
          batchIndex: Math.floor(start / args.batchSize) + 1,
          batchCount: Math.ceil(selected.products.length / args.batchSize),
          })
        : []
      : await mapWithConcurrency(pendingProducts, args.concurrency, (product) => requestGpt(product, apiKey));
    const recordsByHandle = new Map([...reusableRecords, ...batchRecords].map((record) => [record.handle, record]));
    const orderedBatchRecords = batch.map((product) => recordsByHandle.get(normalizeKey(product.handle))).filter(Boolean);
    if (orderedBatchRecords.length !== batch.length) throw new Error(`GPT SEO batch ${Math.floor(start / args.batchSize) + 1} lost product records before checkpoint.`);
    records.push(...orderedBatchRecords);
    const checkpoint = {
      schemaVersion: GPT_SEO_RECORD_SCHEMA_VERSION,
      status: "checkpoint",
      generatedAt: new Date().toISOString(),
      model,
      scope: args.scope,
      selectionMethod: selected.method,
      catalogMethod: catalog.method,
      catalogBoundary: boundary,
      batchSize: args.batchSize,
      concurrency: args.provider === "applescript" ? 1 : args.concurrency,
      provider: args.provider,
      retryInfo,
      processed: records.length,
      total: selected.products.length,
      accepted: records.filter((record) => record.accepted).length,
      rejected: records.filter((record) => !record.accepted).length,
      records,
    };
    await writeJsonAtomically(args.output, checkpoint);
    process.stdout.write(`GPT SEO batch checkpoint: ${records.length}/${selected.products.length} products; accepted ${checkpoint.accepted}, rejected ${checkpoint.rejected}.\n`);
  }
  await writeJsonAtomically(args.handlesOutput, { generatedAt: new Date().toISOString(), scope: args.scope, handles: selected.products.map((product) => normalizeKey(product.handle)).sort() });
  const rejected = records.filter((record) => !record.accepted);
  const manifest = {
    schemaVersion: GPT_SEO_RECORD_SCHEMA_VERSION,
    status: rejected.length ? "rejected-records" : "completed",
    completedAt: rejected.length ? "" : new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    model,
    scope: args.scope,
    selectionMethod: selected.method,
    catalogMethod: catalog.method,
    catalogBoundary: boundary,
    batchSize: args.batchSize,
    concurrency: args.provider === "applescript" ? 1 : args.concurrency,
    provider: args.provider,
    reused,
    retryInfo,
    summary: { selected: selected.products.length, accepted: records.length - rejected.length, rejected: rejected.length, batches: Math.ceil(selected.products.length / args.batchSize) },
    records,
  };
  await writeJsonAtomically(args.output, manifest);
  process.stdout.write(`${JSON.stringify({ output: args.output, handlesOutput: args.handlesOutput, summary: manifest.summary, status: manifest.status }, null, 2)}\n`);
  if (rejected.length) throw new Error(`GPT SEO quality gate rejected ${rejected.length} product(s); no guarded SEO apply should start.`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => {
    process.stderr.write(`GPT SEO enrichment failed: ${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}
