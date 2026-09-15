#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  GPT_SEO_RECORD_SCHEMA_VERSION,
  normalizeGptSeoRecord,
  normalizeKey,
  productGptEvidence,
  validateGptSeoRecord,
} from "../src/lib/gpt-seo-enrichment.js";
import { createShopifyAdminGraphQLClient } from "./shopify-admin-graphql-client.mjs";
import { mapWithConcurrency } from "./lib/performance-runtime.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const manifestPath = resolve(rootDir, "output", "gpt-seo-enrichment.json");
const checkpointPath = resolve(rootDir, "output", "gpt-seo-metafield-apply.json");
const shopifyAdminClient = createShopifyAdminGraphQLClient({ rootDir, agentName: "gpt-seo-metafields" });
const shopifyReadConcurrency = Math.max(1, Math.min(16, Number(process.env.SALT_GPT_SEO_METAFIELD_READ_CONCURRENCY || process.env.SALT_SHOPIFY_READ_CONCURRENCY || 4)));
const shopifyMaxAttempts = Math.max(1, Number(process.env.SALT_SHOPIFY_MAX_REQUEST_ATTEMPTS || 10));
const shopifyMaxRetryDelayMs = Math.max(1_000, Number(process.env.SALT_SHOPIFY_MAX_RETRY_DELAY_MS || 120_000));
const productsPerCheckpoint = Math.max(1, Math.min(500, Number(process.env.SALT_GPT_SEO_BATCH_SIZE || 500)));
const metafieldsPerMutation = 25;
const productsPerMutation = 5;

const PRODUCT_FIELDS = /* GraphQL */ `
  id
  handle
  title
  descriptionHtml
  productType
  vendor
  tags
  status
  createdAt
  updatedAt
  category { id name fullName }
  variants(first: 80) {
    nodes {
      title
      sku
      selectedOptions { name value }
    }
  }
  queryTerms: metafield(namespace: "salt-search", key: "query_terms") { jsonValue value }
  badgeText: metafield(namespace: "salt-marketing", key: "badge_text") { jsonValue value }
  highlights: metafield(namespace: "salt-marketing", key: "highlights") { jsonValue value }
  collectionSignal: metafield(namespace: "salt-marketing", key: "collection_signal") { jsonValue value }
  typeAttributes: metafield(namespace: "salt-gpt-seo", key: "type_attributes") { jsonValue value }
`;

const ACTIVE_PRODUCTS_QUERY = /* GraphQL */ `
  query GptSeoActiveProducts($first: Int!, $after: String, $query: String!) {
    products(first: $first, after: $after, query: $query) {
      nodes { ${PRODUCT_FIELDS} }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const PRODUCTS_BY_ID_QUERY = /* GraphQL */ `
  query GptSeoProductsById($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product { ${PRODUCT_FIELDS} }
    }
  }
`;

const SET_METAFIELDS_MUTATION = /* GraphQL */ `
  mutation SetGptSeoProductMetafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key value jsonValue }
      userErrors { field message code }
    }
  }
`;

function parseArgs(argv) {
  const args = { apply: false, dryRun: true, resume: true };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--apply") args.apply = true, args.dryRun = false;
    else if (token === "--dry-run") args.apply = false, args.dryRun = true;
    else if (token === "--no-resume") args.resume = false;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function catalogBoundary(products) {
  return hash(products.map((product) => normalizeKey(product.handle)).sort().join("\n"));
}

function productFingerprint(product) {
  return hash(JSON.stringify({
    id: product?.id || "",
    handle: product?.handle || "",
    updatedAt: product?.updatedAt || product?.updated_at || "",
    title: product?.title || "",
    descriptionHtml: product?.descriptionHtml || product?.body_html || "",
    variants: productGptEvidence(product).variants,
  }));
}

function parseJson(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return value;
  }
}

function fieldJsonValue(field) {
  return parseJson(field?.jsonValue ?? field?.value, null);
}

function isGptSeoProtectedProduct(product) {
  const marker = fieldJsonValue(product?.typeAttributes);
  return Boolean(
    marker &&
    typeof marker === "object" &&
    (marker.generatedBy === "salt-gpt-seo" || Number(marker.schemaVersion) >= GPT_SEO_RECORD_SCHEMA_VERSION),
  );
}

function normalizeList(value) {
  const parsed = parseJson(value, []);
  return Array.isArray(parsed) ? parsed.map((entry) => String(entry || "").trim()).filter(Boolean) : [];
}

function normalizeComparable(value) {
  if (Array.isArray(value)) return value.map(normalizeComparable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalizeComparable(value[key])]));
  }
  return value ?? null;
}

function valuesEqual(actual, expected) {
  return stableJson(normalizeComparable(actual)) === stableJson(normalizeComparable(expected));
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

function runShopify(query, variables, options = {}) {
  return shopifyAdminClient.run(query, variables, {
    ...options,
    maxAttempts: options.maxAttempts || shopifyMaxAttempts,
    maxRetryDelayMs: options.maxRetryDelayMs || shopifyMaxRetryDelayMs,
  });
}

async function fetchActiveProducts(retryInfo) {
  const products = [];
  let after = null;
  let page = 0;
  while (true) {
    page += 1;
    const payload = await runShopify(
      ACTIVE_PRODUCTS_QUERY,
      { first: 250, after, query: "status:active" },
      { operation: `GPT metafield active product page ${page}`, retryInfo },
    );
    const connection = payload?.products;
    if (!connection) throw new Error("Shopify returned no active product connection for GPT metafield apply");
    products.push(...(Array.isArray(connection.nodes) ? connection.nodes.filter((product) => String(product?.status || "").toUpperCase() === "ACTIVE") : []));
    if (!connection.pageInfo?.hasNextPage) break;
    if (!connection.pageInfo.endCursor) throw new Error(`GPT metafield active product page ${page} has no end cursor`);
    after = connection.pageInfo.endCursor;
  }
  return products;
}

async function fetchProductsById(ids, retryInfo) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const batches = [];
  for (let index = 0; index < uniqueIds.length; index += 250) batches.push(uniqueIds.slice(index, index + 250));
  const results = await mapWithConcurrency(batches, shopifyReadConcurrency, (batch, index) => runShopify(
    PRODUCTS_BY_ID_QUERY,
    { ids: batch },
    { operation: `GPT metafield readback ${index + 1}/${batches.length}`, retryInfo },
  ));
  return new Map(results.flatMap((payload) => Array.isArray(payload?.nodes) ? payload.nodes.filter((product) => product?.id) : []).map((product) => [product.id, product]));
}

function manifestRecords(manifest) {
  return Array.isArray(manifest?.records)
    ? manifest.records.filter((entry) => entry?.accepted !== false).map((entry) => ({
      ...entry,
      record: normalizeGptSeoRecord(entry.record || entry),
    }))
    : [];
}

function typeAttributesValue(manifest, record) {
  return JSON.stringify({
    schemaVersion: GPT_SEO_RECORD_SCHEMA_VERSION,
    generatedBy: "salt-gpt-seo",
    model: manifest.model || "",
    immutable: true,
    protectedFields: [
      "title",
      "descriptionHtml",
      "seo.title",
      "seo.description",
      "category",
      "salt-search.query_terms",
      "salt-marketing.badge_text",
      "salt-marketing.highlights",
      "salt-marketing.collection_signal",
      "salt-gpt-seo.type_attributes",
    ],
    category: record.category,
    productType: record.category.productType,
    attributes: record.metafields.typeAttributes,
  });
}

function buildEntries(manifest, product, entry) {
  const record = entry.record;
  const entries = [
    { namespace: "salt-search", key: "query_terms", type: "list.single_line_text_field", value: JSON.stringify(record.searchTerms) },
    { namespace: "salt-marketing", key: "highlights", type: "list.single_line_text_field", value: JSON.stringify(record.metafields.highlights) },
    { namespace: "salt-marketing", key: "collection_signal", type: "single_line_text_field", value: record.metafields.collectionSignal },
    { namespace: "salt-gpt-seo", key: "type_attributes", type: "json", value: typeAttributesValue(manifest, record) },
  ];
  if (record.metafields.badgeText) {
    entries.splice(1, 0, {
      namespace: "salt-marketing",
      key: "badge_text",
      type: "single_line_text_field",
      value: record.metafields.badgeText,
    });
  }
  return entries.map((field) => ({ ...field, ownerId: product.id, ownerHandle: product.handle }));
}

function expectedFields(manifest, record) {
  const fields = {
    "salt-search.query_terms": record.searchTerms,
    "salt-marketing.highlights": record.metafields.highlights,
    "salt-marketing.collection_signal": record.metafields.collectionSignal,
    "salt-gpt-seo.type_attributes": JSON.parse(typeAttributesValue(manifest, record)),
  };
  if (record.metafields.badgeText) fields["salt-marketing.badge_text"] = record.metafields.badgeText;
  return fields;
}

function readField(product, namespace, key) {
  const alias = {
    "salt-search.query_terms": "queryTerms",
    "salt-marketing.badge_text": "badgeText",
    "salt-marketing.highlights": "highlights",
    "salt-marketing.collection_signal": "collectionSignal",
    "salt-gpt-seo.type_attributes": "typeAttributes",
  }[`${namespace}.${key}`];
  return alias ? product?.[alias] : null;
}

function assertReadback(manifest, product, record) {
  const failures = [];
  for (const [fieldId, expected] of Object.entries(expectedFields(manifest, record))) {
    const [namespace, key] = fieldId.split(".");
    const field = readField(product, namespace, key);
    const actual = fieldId.endsWith("query_terms") || fieldId.endsWith("highlights")
      ? normalizeList(fieldJsonValue(field))
      : fieldId.endsWith("collection_signal") || fieldId.endsWith("badge_text")
        ? String(fieldJsonValue(field) ?? field?.value ?? "")
        : fieldJsonValue(field);
    if (!valuesEqual(actual, expected)) failures.push(`${product.handle}:${fieldId}`);
  }
  if (failures.length) throw new Error(`GPT metafield readback mismatch: ${failures.join(", ")}`);
}

async function applyMutation(entries, retryInfo, batchLabel) {
  const payload = await runShopify(
    SET_METAFIELDS_MUTATION,
    { metafields: entries.map(({ ownerId, namespace, key, type, value }) => ({ ownerId, namespace, key, type, value })) },
    { allowMutations: true, operation: `GPT metafield mutation ${batchLabel}`, retryInfo },
  );
  const userErrors = Array.isArray(payload?.metafieldsSet?.userErrors) ? payload.metafieldsSet.userErrors : [];
  if (userErrors.length) {
    throw new Error(`GPT metafield mutation ${batchLabel} failed: ${userErrors.map((error) => `${error?.field?.join(".") || "metafields"}: ${error?.message || "unknown error"}`).join(" | ")}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const retryInfo = [];
  const manifest = await readJsonIfPresent(manifestPath);
  if (manifest?.schemaVersion !== GPT_SEO_RECORD_SCHEMA_VERSION || manifest?.status !== "completed") {
    throw new Error(`GPT SEO manifest is not a completed schema-${GPT_SEO_RECORD_SCHEMA_VERSION} manifest; refusing metafield writes.`);
  }
  const entries = manifestRecords(manifest);
  if (!entries.length || manifest.summary?.rejected) throw new Error("GPT SEO manifest has no fully accepted records; refusing metafield writes.");
  const liveProducts = await fetchActiveProducts(retryInfo);
  const liveByHandle = new Map();
  for (const product of liveProducts) {
    const handle = normalizeKey(product.handle);
    if (!handle) continue;
    if (liveByHandle.has(handle)) throw new Error(`Duplicate active Shopify handle in GPT metafield scope: ${handle}`);
    liveByHandle.set(handle, product);
  }

  const recordByHandle = new Map();
  for (const entry of entries) {
    const handle = normalizeKey(entry.handle || entry.record.handle);
    if (!handle || recordByHandle.has(handle)) throw new Error(`GPT SEO manifest contains a duplicate or empty handle: ${handle || "missing"}`);
    recordByHandle.set(handle, { ...entry, handle });
    const live = liveByHandle.get(handle);
    if (!live) throw new Error(`GPT SEO product is missing from the active Shopify catalog: ${handle}`);
    const alreadyProtected = isGptSeoProtectedProduct(live);
    if (!alreadyProtected) {
      const validation = validateGptSeoRecord(live, entry.record);
      if (!validation.accepted) throw new Error(`${handle}: GPT record no longer passes live evidence validation: ${validation.issues.join(", ")}`);
      if (entry.evidenceFingerprint && entry.evidenceFingerprint !== productFingerprint(live)) {
        throw new Error(`${handle}: live product changed after GPT generation; regenerate the GPT batch before applying.`);
      }
    }
  }

  const selectedProducts = [...recordByHandle.keys()].sort().map((handle) => liveByHandle.get(handle));
  if (manifest.scope === "all-products") {
    if (selectedProducts.length !== liveProducts.length || manifest.catalogBoundary !== catalogBoundary(liveProducts)) {
      throw new Error(`GPT SEO catalog boundary drifted before metafield apply: manifest=${manifest.catalogBoundary} live=${catalogBoundary(liveProducts)}`);
    }
  } else if (manifest.catalogBoundary !== catalogBoundary(selectedProducts)) {
    throw new Error(`GPT SEO selected-product boundary drifted before metafield apply: manifest=${manifest.catalogBoundary} live=${catalogBoundary(selectedProducts)}`);
  }

  const manifestFingerprint = hash(stableJson({
    schemaVersion: manifest.schemaVersion,
    model: manifest.model,
    scope: manifest.scope,
    catalogBoundary: manifest.catalogBoundary,
    records: entries.map((entry) => [entry.handle, entry.evidenceFingerprint, entry.record.schemaVersion]),
  }));
  const previous = args.resume ? await readJsonIfPresent(checkpointPath) : null;
  const completedHandles = new Set(previous?.manifestFingerprint === manifestFingerprint ? previous.completedHandles || [] : []);
  const protectedHandles = new Set(selectedProducts.filter(isGptSeoProtectedProduct).map((product) => normalizeKey(product.handle)));
  for (const handle of protectedHandles) completedHandles.add(handle);
  if (args.dryRun) {
    process.stdout.write(`${JSON.stringify({ mode: "dry-run", scope: manifest.scope, selected: selectedProducts.length, alreadyProtected: protectedHandles.size, productsPerCheckpoint, metafieldsPerMutation, manifestFingerprint }, null, 2)}\n`);
    return;
  }

  let applied = completedHandles.size;
  for (let start = 0; start < selectedProducts.length; start += productsPerCheckpoint) {
    const productBatch = selectedProducts.slice(start, start + productsPerCheckpoint).filter((product) => !completedHandles.has(normalizeKey(product.handle)));
    if (!productBatch.length) continue;
    for (let offset = 0; offset < productBatch.length; offset += productsPerMutation) {
      const productChunk = productBatch.slice(offset, offset + productsPerMutation);
      const metafieldEntries = productChunk.flatMap((product) => buildEntries(manifest, product, recordByHandle.get(normalizeKey(product.handle))));
      await applyMutation(metafieldEntries, retryInfo, `${start + offset + 1}-${start + offset + productChunk.length}`);
      const readback = await fetchProductsById(productChunk.map((product) => product.id), retryInfo);
      for (const product of productChunk) {
        const live = readback.get(product.id);
        if (!live) throw new Error(`GPT metafield readback could not find ${product.handle}`);
        assertReadback(manifest, live, recordByHandle.get(normalizeKey(product.handle)).record);
      }
      process.stdout.write(`GPT product metafields verified ${Math.min(start + offset + productChunk.length, selectedProducts.length)}/${selectedProducts.length}.\n`);
    }
    for (const product of productBatch) completedHandles.add(normalizeKey(product.handle));
    applied = completedHandles.size;
    await writeJsonAtomically(checkpointPath, {
      schemaVersion: GPT_SEO_RECORD_SCHEMA_VERSION,
      status: "checkpoint",
      generatedAt: new Date().toISOString(),
      manifestFingerprint,
      scope: manifest.scope,
      catalogBoundary: manifest.catalogBoundary,
      productsPerCheckpoint,
      metafieldsPerMutation,
      applied,
      alreadyProtected: protectedHandles.size,
      total: selectedProducts.length,
      completedHandles: [...completedHandles].sort(),
      retryInfo,
    });
  }

  const result = {
    schemaVersion: GPT_SEO_RECORD_SCHEMA_VERSION,
    status: "completed",
    completedAt: new Date().toISOString(),
    manifestFingerprint,
    scope: manifest.scope,
    catalogBoundary: manifest.catalogBoundary,
    productsPerCheckpoint,
    metafieldsPerMutation,
    applied,
    alreadyProtected: protectedHandles.size,
    total: selectedProducts.length,
    retryInfo,
  };
  await writeJsonAtomically(checkpointPath, result);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => {
    process.stderr.write(`GPT product metafield apply failed: ${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}
