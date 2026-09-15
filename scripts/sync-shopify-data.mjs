#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  normalizeCollectionCustomData,
  normalizeProductCustomData,
  normalizeProductReferenceList,
  normalizeShopCustomData,
} from "../src/lib/product-custom-data.js";
import { readProductCatalogPayload } from "./product-catalog-files.mjs";
import { filterOnlineStoreProducts, filterProductIdsToCatalog } from "./shopify-publication.mjs";
import { createShopifyAdminGraphQLClient } from "./shopify-admin-graphql-client.mjs";

const DEFAULT_SHOP_BASE = "https://0309d3-72.myshopify.com";
const baseUrl = process.env.SALT_SHOP_URL || DEFAULT_SHOP_BASE;
const limit = Number(process.env.SALT_PAGE_LIMIT || 250);
const adminAccessToken =
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SALT_SHOPIFY_ADMIN_ACCESS_TOKEN || "";
const adminApiVersion = process.env.SHOPIFY_ADMIN_API_VERSION || "2026-07";
const adminGraphqlUrl = `${new URL(baseUrl).origin}/admin/api/${adminApiVersion}/graphql.json`;
const aboutHandle = process.env.SALT_ABOUT_HANDLE || "about-us";
const blogHandleInput = process.env.SALT_BLOG_HANDLE || "posts,news,blog,journal,updates,whom-we-serve";
const blogHandles = Array.from(
  new Set(
    blogHandleInput
      .split(",")
      .map((handle) => handle.trim())
      .filter(Boolean),
  ),
);
const outDir = resolve(process.cwd(), "public", "data");
function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, Math.floor(parsed)))
    : fallback;
}

const configuredRequestSpacingMs = Number(process.env.SALT_SHOPIFY_REQUEST_DELAY_MS ?? 250);
const requestSpacingMs = Number.isFinite(configuredRequestSpacingMs)
  ? Math.max(0, configuredRequestSpacingMs)
  : 250;
const requestConcurrency = boundedInteger(process.env.SALT_SHOPIFY_READ_CONCURRENCY, 4, 1, 8);
const enrichmentConcurrency = boundedInteger(process.env.SALT_SHOPIFY_ENRICHMENT_CONCURRENCY, 4, 1, 8);
const collectionProductReadConcurrency = boundedInteger(
  process.env.SALT_COLLECTION_PRODUCT_READ_CONCURRENCY,
  4,
  1,
  8,
);
const requestTimeoutMs = Number(process.env.SALT_SHOPIFY_REQUEST_TIMEOUT_MS ?? 45_000);
const maxRequestAttempts = Number(process.env.SALT_SHOPIFY_MAX_REQUEST_ATTEMPTS ?? 8);
const maxRetryDelayMs = Number(process.env.SALT_SHOPIFY_MAX_RETRY_DELAY_MS ?? 60_000);
const publicRetryBaseDelayMs = Number(process.env.SALT_SHOPIFY_PUBLIC_RETRY_BASE_DELAY_MS ?? 2000);
const adminRetryBaseDelayMs = Number(process.env.SALT_SHOPIFY_ADMIN_RETRY_BASE_DELAY_MS ?? 1500);
const storefrontBoundaryMode = String(process.env.SALT_SHOPIFY_STOREFRONT_BOUNDARY || "live").trim().toLowerCase();
const runningCanonicalRelease = /^(?:release|release:core|release:daily|release:product|release:products)$/.test(
  process.env.npm_lifecycle_event || "",
);
const skipGeneratedListingPayloads =
  process.argv.includes("--skip-generated-listings") ||
  /^(1|true|yes)$/i.test(process.env.SALT_RELEASE_SKIP_GENERATED_LISTINGS || "") ||
  runningCanonicalRelease;
// A canonical release must not publish a stale collection membership snapshot
// after a live collection repair. Keep the cache fallback for standalone
// storefront syncs, but make release-time membership reads fail closed.
const forceLiveCollectionMemberships =
  /^(1|true|yes)$/i.test(process.env.SALT_SHOPIFY_FORCE_LIVE_COLLECTION_MEMBERSHIPS || "") ||
  skipGeneratedListingPayloads ||
  runningCanonicalRelease;
const releaseCatalogSourcePath = resolve(
  process.env.SALT_RELEASE_CATALOG_SOURCE_PATH || "output/release-catalog-source.json",
);
const generatedListingPayloadPattern = /^(?:products(?:-\d{4})?|product-search(?:-\d{4})?|home-(?:featured|collection)-products)\.json$/;
const skipProductEnrichment = /^(1|true|yes)$/i.test(process.env.SALT_SHOPIFY_SKIP_PRODUCT_ENRICHMENT || "");
const syncActiveCatalog = /^(1|true|yes)$/i.test(process.env.SALT_SHOPIFY_SYNC_ACTIVE_CATALOG || "");
const preferCompleteProductEnrichmentCache = /^(1|true|yes)$/i.test(
  process.env.SALT_SHOPIFY_USE_COMPLETE_CUSTOM_DATA_CACHE || "",
);
const forceLiveProductEnrichment = /^(1|true|yes)$/i.test(
  process.env.SALT_SHOPIFY_FORCE_LIVE_PRODUCT_ENRICHMENT || "",
);
const fetchVariantCostsWithCompleteCache = /^(1|true|yes)$/i.test(
  process.env.SALT_SHOPIFY_CACHE_VARIANT_COSTS || "",
);
const useCliAdminPricing = /^(1|true|yes)$/i.test(process.env.SALT_SHOPIFY_USE_CLI_ADMIN_PRICING || "");
const collectionsPath = resolve(outDir, "collections.json");
const collectionProductsPath = resolve(outDir, "collection-products.json");
const collectionMergeManifestPath = resolve(process.cwd(), "output", "catalog-collection-merge-manifest.json");
const productCustomDataBulkPath = resolve(process.cwd(), "output", ".shopify-metafield-custom-data-bulk.jsonl");
const productCustomDataCheckpointPath = resolve(
  process.cwd(),
  "output",
  ".shopify-product-custom-data-checkpoint.json",
);
const variantCostCheckpointPath = resolve(process.cwd(), "output", ".shopify-variant-cost-checkpoint.json");
const aboutPath = resolve(outDir, "about.json");
const blogPostsPath = resolve(outDir, "blog-posts.json");
const shopPath = resolve(outDir, "shop.json");
let forceLiveCollectionHandles = new Set();
let cachedCollectionProductsByHandle;
let requestActive = 0;
let requestLastStartAt = 0;
let requestPumpTimer = null;
const requestWaiters = [];
const shopifyAdminClient = createShopifyAdminGraphQLClient({
  rootDir: process.cwd(),
  agentName: "sync",
});

async function removeGeneratedListingPayloads() {
  let entries;
  try {
    entries = await readdir(outDir);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  const staleFiles = entries.filter((entry) => generatedListingPayloadPattern.test(entry));
  await Promise.all(staleFiles.map((file) => rm(resolve(outDir, file), { force: true })));
  if (staleFiles.length) {
    process.stdout.write(`Removed ${staleFiles.length} stale generated listing payload files\n`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(value) {
  if (!value) {
    return null;
  }

  const numericSeconds = Number(value);
  if (Number.isFinite(numericSeconds) && numericSeconds >= 0) {
    return Math.round(numericSeconds * 1000);
  }

  const parsedDate = Date.parse(value);
  if (Number.isFinite(parsedDate)) {
    return Math.max(0, parsedDate - Date.now());
  }

  return null;
}

function computeRetryDelayMs(response, attempt, baseDelayMs) {
  const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
  if (retryAfterMs !== null) {
    return Math.min(retryAfterMs, maxRetryDelayMs);
  }

  const jitterMs = Math.floor(Math.random() * 500);
  return Math.min(maxRetryDelayMs, baseDelayMs * 2 ** attempt + jitterMs);
}

function pumpRequestQueue() {
  if (requestPumpTimer) {
    clearTimeout(requestPumpTimer);
    requestPumpTimer = null;
  }

  while (requestActive < requestConcurrency && requestWaiters.length) {
    const waitMs = Math.max(0, requestLastStartAt + requestSpacingMs - Date.now());
    if (waitMs > 0) {
      requestPumpTimer = setTimeout(pumpRequestQueue, waitMs);
      requestPumpTimer.unref?.();
      return;
    }

    const resolveRequest = requestWaiters.shift();
    requestActive += 1;
    requestLastStartAt = Date.now();
    resolveRequest?.();
  }
}

async function runRateLimitedRequest(task) {
  await new Promise((resolveRequest) => {
    requestWaiters.push(resolveRequest);
    pumpRequestQueue();
  });

  try {
    return await task();
  } finally {
    requestActive = Math.max(0, requestActive - 1);
    pumpRequestQueue();
  }
}

async function fetchJsonUrl(url, { attempt = 0, maxAttempts = maxRequestAttempts } = {}) {
  let response;
  try {
    response = await runRateLimitedRequest(() => fetch(url, {
      signal: AbortSignal.timeout(requestTimeoutMs),
    }));
  } catch (error) {
    if (attempt < maxAttempts - 1) {
      const backoffDelay = Math.min(
        maxRetryDelayMs,
        publicRetryBaseDelayMs * 2 ** attempt + Math.floor(Math.random() * 500),
      );
      process.stdout.write(
        `Network failure on ${url}; retrying in ${Math.round(backoffDelay / 1000)}s (attempt ${attempt + 1}/${maxAttempts - 1})\n`,
      );
      await sleep(backoffDelay);
      return fetchJsonUrl(url, { attempt: attempt + 1, maxAttempts });
    }
    throw error;
  }

  if (!response.ok) {
    if ((response.status === 429 || (response.status >= 500 && response.status < 600)) && attempt < maxAttempts - 1) {
      const backoffDelay = computeRetryDelayMs(response, attempt, publicRetryBaseDelayMs);

      process.stdout.write(
        `Transient failure on ${url}; retrying in ${Math.round(backoffDelay / 1000)}s (attempt ${attempt + 1}/${maxAttempts - 1})\n`,
      );
      await sleep(backoffDelay);
      return fetchJsonUrl(url, { attempt: attempt + 1, maxAttempts });
    }

    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return response.json();
}

async function loadCachedCollectionProducts() {
  if (cachedCollectionProductsByHandle) {
    return cachedCollectionProductsByHandle;
  }

  const raw = await readFile(collectionProductsPath, "utf8");
  const payload = JSON.parse(raw);
  cachedCollectionProductsByHandle = new Map(
    Object.entries(payload?.collections || {}).map(([handle, entry]) => [
      handle,
      Array.isArray(entry?.productIds) ? entry.productIds : [],
    ]),
  );
  return cachedCollectionProductsByHandle;
}

async function fetchCollectionProductIdsFromCachedFile(handle) {
  const cachedProducts = await loadCachedCollectionProducts();
  const productIds = cachedProducts.get(handle) || [];

  if (!productIds.length) {
    process.stdout.write(`Cached collection products payload missing handle "${handle}"\n`);
    return [];
  }

  process.stdout.write(`Using cached collection ids for "${handle}" with ${productIds.length} products\n`);
  return productIds;
}

async function loadForcedLiveCollectionHandles() {
  try {
    const manifest = JSON.parse(await readFile(collectionMergeManifestPath, "utf8"));
    if (manifest?.mode !== "apply" || !manifest?.completedAt) return;

    forceLiveCollectionHandles = new Set(
      (Array.isArray(manifest.sourceCollections) ? manifest.sourceCollections : [])
        .map((row) => String(row?.targetHandle || "").trim())
        .filter(Boolean),
    );
    if (forceLiveCollectionHandles.size) {
      process.stdout.write(
        `Forcing live collection membership reads for completed merge targets: ${[...forceLiveCollectionHandles].join(", ")}\n`,
      );
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      const message = error instanceof Error ? error.message : "unknown merge manifest error";
      process.stdout.write(`Could not read collection merge manifest; retaining normal membership cache behavior (${message})\n`);
    }
  }
}

function buildAdminUrl(pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  const adminBase = new URL(baseUrl).origin;
  return `${adminBase}/admin/api/${adminApiVersion}${pathOrUrl}`;
}

function extractNextPageUrl(linkHeader) {
  if (!linkHeader) {
    return null;
  }

  for (const entry of linkHeader.split(",")) {
    const match = entry.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

async function fetchAdminResponse(pathOrUrl, { attempt = 0, maxAttempts = maxRequestAttempts } = {}) {
  if (!adminAccessToken) {
    throw new Error("Shopify Admin API token not configured");
  }

  const url = buildAdminUrl(pathOrUrl);
  let response;
  try {
    response = await runRateLimitedRequest(() =>
      fetch(url, {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": adminAccessToken,
        },
        signal: AbortSignal.timeout(requestTimeoutMs),
      }),
    );
  } catch (error) {
    if (attempt < maxAttempts - 1) {
      const delayMs = Math.min(
        maxRetryDelayMs,
        adminRetryBaseDelayMs * 2 ** attempt + Math.floor(Math.random() * 500),
      );
      process.stdout.write(
        `Admin network failure on ${url}; retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt + 1}/${maxAttempts - 1})\n`,
      );
      await sleep(delayMs);
      return fetchAdminResponse(pathOrUrl, { attempt: attempt + 1, maxAttempts });
    }
    throw error;
  }

  if (!response.ok) {
    if (response.status === 429 && attempt < maxAttempts - 1) {
      const delayMs = computeRetryDelayMs(response, attempt, adminRetryBaseDelayMs);
      process.stdout.write(
        `Rate limited on ${url}; retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt + 1}/${maxAttempts - 1})\n`,
      );
      await sleep(delayMs);
      return fetchAdminResponse(pathOrUrl, { attempt: attempt + 1, maxAttempts });
    }

    throw new Error(`Admin request failed (${response.status}) for ${url}`);
  }

  return response;
}

async function fetchAdminJson(path, options = {}) {
  const response = await fetchAdminResponse(path, options);
  return response.json();
}

async function fetchAdminGraphQL(query, variables = {}, { attempt = 0, maxAttempts = maxRequestAttempts } = {}) {
  if (!adminAccessToken) {
    throw new Error("Shopify Admin API token not configured");
  }

  let response;
  try {
    response = await runRateLimitedRequest(() =>
      fetch(adminGraphqlUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": adminAccessToken,
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(requestTimeoutMs),
      }),
    );
  } catch (error) {
    if (attempt < maxAttempts - 1) {
      const delayMs = Math.min(
        maxRetryDelayMs,
        adminRetryBaseDelayMs * 2 ** attempt + Math.floor(Math.random() * 500),
      );
      process.stdout.write(
        `Admin GraphQL network failure; retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt + 1}/${maxAttempts - 1})\n`,
      );
      await sleep(delayMs);
      return fetchAdminGraphQL(query, variables, { attempt: attempt + 1, maxAttempts });
    }
    throw error;
  }

  if (!response.ok) {
    if ((response.status === 429 || (response.status >= 500 && response.status < 600)) && attempt < maxAttempts - 1) {
      const delayMs = computeRetryDelayMs(response, attempt, adminRetryBaseDelayMs);
      process.stdout.write(
        `GraphQL request failed on ${adminGraphqlUrl}; retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt + 1}/${maxAttempts - 1})\n`,
      );
      await sleep(delayMs);
      return fetchAdminGraphQL(query, variables, { attempt: attempt + 1, maxAttempts });
    }

    throw new Error(`Admin GraphQL request failed (${response.status}) for ${adminGraphqlUrl}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    const message = payload.errors.map((error) => error.message || "Unknown GraphQL error").join(" | ");
    throw new Error(`Admin GraphQL errors for ${adminGraphqlUrl}: ${message}`);
  }

  return payload.data || {};
}

function runShopifyStoreGraphQL(query, variables = {}, options = {}) {
  return shopifyAdminClient.run(query, variables, {
    ...options,
    maxAttempts: options.maxAttempts || maxRequestAttempts,
    maxRetryDelayMs: options.maxRetryDelayMs || maxRetryDelayMs,
  });
}

function runShopifyStoreGraphQLWithRetry(query, variables, { label } = {}) {
  return runShopifyStoreGraphQL(query, variables, {
    operation: label || "Shopify sync GraphQL request",
  });
}

function enrichmentFingerprint(productIds) {
  return createHash("sha256").update(productIds.join("\n")).digest("hex");
}

async function readEnrichmentCheckpoint(filePath, fingerprint, requiredIds = []) {
  try {
    const payload = JSON.parse(await readFile(filePath, "utf8"));
    if (payload?.version !== 1) {
      return null;
    }

    const completedIds = new Set(Array.isArray(payload.completedIds) ? payload.completedIds.map(String) : []);
    const coversRequiredIds = requiredIds.length > 0 && requiredIds.every((id) => completedIds.has(String(id)));
    if (payload.fingerprint !== fingerprint && !coversRequiredIds) {
      return null;
    }

    return {
      completedIds,
      records: payload.records && typeof payload.records === "object" ? payload.records : {},
    };
  } catch (error) {
    if (error?.code !== "ENOENT") {
      process.stdout.write(`Ignoring invalid enrichment checkpoint ${filePath}: ${error.message}\n`);
    }
    return null;
  }
}

async function writeEnrichmentCheckpoint(filePath, fingerprint, completedIds, records) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    JSON.stringify(
      {
        version: 1,
        fingerprint,
        completedIds: [...completedIds],
        records,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
}

const SHOP_CUSTOM_DATA_QUERY = /* GraphQL */ `
  query ShopCustomData {
    shop {
      id
      name
      bannerText: metafield(namespace: "salt-marketing", key: "banner_text") {
        jsonValue
        value
      }
      trustStrip: metafield(namespace: "salt-marketing", key: "trust_strip") {
        jsonValue
        value
      }
    }
  }
`;

async function fetchAdminPaged(key, endpoint) {
  if (!adminAccessToken) {
    throw new Error("Shopify Admin API token not configured");
  }

  const rows = [];
  let nextUrl = (() => {
    const url = new URL(buildAdminUrl(endpoint));
    url.searchParams.set("limit", String(limit));
    return url.toString();
  })();

  while (nextUrl) {
    const response = await fetchAdminResponse(nextUrl);
    const json = await response.json();
    const chunk = Array.isArray(json[key]) ? json[key] : [];

    rows.push(...chunk);
    process.stdout.write(`Fetched admin ${key} page: ${chunk.length}\n`);

    nextUrl = extractNextPageUrl(response.headers.get("link"));
  }

  return dedupeRowsByStableIdentity(rows, key);
}

async function fetchPaged(key, endpoint) {
  const rows = [];
  let page = 1;

  while (true) {
    const url = `${baseUrl}${endpoint}?limit=${limit}&page=${page}`;
    const json = await fetchJsonUrl(url);
    const chunk = Array.isArray(json[key]) ? json[key] : [];

    rows.push(...chunk);
    process.stdout.write(`Fetched ${key} page ${page}: ${chunk.length}\n`);

    if (chunk.length < limit) {
      break;
    }

    page += 1;
  }

  return dedupeRowsByStableIdentity(rows, key);
}

function dedupeRowsByStableIdentity(rows, label) {
  const uniqueRows = [];
  const indexByIdentity = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const identity = String(row?.id || row?.admin_graphql_api_id || row?.handle || "")
      .trim()
      .toLowerCase();

    if (!identity) {
      uniqueRows.push(row);
      continue;
    }

    const existingIndex = indexByIdentity.get(identity);
    if (existingIndex === undefined) {
      indexByIdentity.set(identity, uniqueRows.length);
      uniqueRows.push(row);
      continue;
    }

    const existing = uniqueRows[existingIndex];
    const existingUpdatedAt = Date.parse(String(existing?.updated_at || existing?.updatedAt || ""));
    const candidateUpdatedAt = Date.parse(String(row?.updated_at || row?.updatedAt || ""));
    if (Number.isFinite(candidateUpdatedAt) && candidateUpdatedAt > existingUpdatedAt) {
      uniqueRows[existingIndex] = row;
    }
  }

  const duplicateCount = rows.length - uniqueRows.length;
  if (duplicateCount > 0) {
    process.stdout.write(`Deduplicated ${duplicateCount} duplicate ${label} rows by stable Shopify identity\n`);
  }

  return uniqueRows;
}

const PRODUCT_CUSTOM_DATA_QUERY = /* GraphQL */ `
  query ProductCustomData($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        legacyResourceId
        handle
        title
        subtitle: metafield(namespace: "descriptors", key: "subtitle") {
          jsonValue
          value
        }
        badgeText: metafield(namespace: "salt-marketing", key: "badge_text") {
          jsonValue
          value
        }
        highlights: metafield(namespace: "salt-marketing", key: "highlights") {
          jsonValue
          value
        }
        collectionSignal: metafield(namespace: "salt-marketing", key: "collection_signal") {
          jsonValue
          value
        }
        rating: metafield(namespace: "reviews", key: "rating") {
          jsonValue
          value
        }
        ratingCount: metafield(namespace: "reviews", key: "rating_count") {
          jsonValue
          value
        }
        relatedProductsDisplay: metafield(
          namespace: "shopify--discovery--product_recommendation"
          key: "related_products_display"
        ) {
          jsonValue
          value
        }
        relatedProducts: metafield(
          namespace: "shopify--discovery--product_recommendation"
          key: "related_products"
        ) {
          references(first: 50) {
            nodes {
              ... on Product {
                id
                legacyResourceId
                handle
                title
                productType
                vendor
              }
            }
          }
        }
        complementaryProducts: metafield(
          namespace: "shopify--discovery--product_recommendation"
          key: "complementary_products"
        ) {
          references(first: 50) {
            nodes {
              ... on Product {
                id
                legacyResourceId
                handle
                title
                productType
                vendor
              }
            }
          }
        }
        complementaryProductsFallback: metafield(
          namespace: "salt-recommendations"
          key: "complementary_products"
        ) {
          references(first: 50) {
            nodes {
              ... on Product {
                id
                legacyResourceId
                handle
                title
                productType
                vendor
              }
            }
          }
        }
        searchProductBoosts: metafield(
          namespace: "shopify--discovery--product_search_boost"
          key: "queries"
        ) {
          jsonValue
          value
        }
        searchProductBoostFallback: metafield(
          namespace: "salt-search"
          key: "query_terms"
        ) {
          jsonValue
          value
        }
        googleCustomProduct: metafield(namespace: "mm-google-shopping", key: "custom_product") {
          jsonValue
          value
        }
        shopChannelMinimumQuantity: metafield(
          namespace: "salt-marketing"
          key: "shop_channel_minimum_quantity"
        ) {
          jsonValue
          value
        }
        diaperType: metafield(namespace: "shopify", key: "diaper-type") {
          jsonValue
          value
          references(first: 50) {
            nodes {
              ... on Metaobject {
                id
                handle
                displayName
                type
              }
            }
          }
        }
      }
    }
  }
`;

const PRODUCT_VARIANT_COST_QUERY = /* GraphQL */ `
  query ProductVariantCostData($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        legacyResourceId
        variants(first: 250) {
          nodes {
            id
            legacyResourceId
            inventoryItem {
              unitCost {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }
  }
`;

const PRODUCT_VARIANT_PRICING_QUERY = /* GraphQL */ `
  query ProductVariantPricing($after: String) {
    productVariants(first: 250, after: $after) {
      nodes {
        legacyResourceId
        price
        compareAtPrice
        availableForSale
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const BULK_VARIANT_PRICING_MUTATION = /* GraphQL */ `
  mutation StartVariantPricingExport {
    bulkOperationRunQuery(
      query: """
        {
          productVariants {
            edges {
              node {
                legacyResourceId
                price
                compareAtPrice
                availableForSale
              }
            }
          }
        }
      """
    ) {
      bulkOperation {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const BULK_OPERATION_STATUS_QUERY = /* GraphQL */ `
  query CurrentBulkVariantPricingExport {
    currentBulkOperation {
      id
      status
      errorCode
      objectCount
      fileSize
      url
      partialDataUrl
    }
  }
`;

const COLLECTION_CUSTOM_DATA_QUERY = /* GraphQL */ `
  query CollectionCustomData($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Collection {
        id
        legacyResourceId
        handle
        title
        heroKicker: metafield(namespace: "salt-marketing", key: "hero_kicker") {
          jsonValue
          value
        }
        heroSummary: metafield(namespace: "salt-marketing", key: "hero_summary") {
          jsonValue
          value
        }
        featuredProducts: metafield(namespace: "salt-marketing", key: "featured_products") {
          references(first: 50) {
            nodes {
              ... on Product {
                id
                legacyResourceId
                handle
                title
                productType
                vendor
              }
            }
          }
        }
        trustStrip: metafield(namespace: "salt-marketing", key: "trust_strip") {
          jsonValue
          value
        }
      }
    }
  }
`;

function chunkArray(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }));

  return results;
}

function extractNumericId(input) {
  const text = String(input || "").trim();
  if (!text) {
    return "";
  }

  const match = text.match(/\d+/);
  return match?.[0] || text;
}

function toShopifyGid(type, value) {
  const normalizedType = String(type || "Product").trim() || "Product";
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  if (/^gid:\/\/shopify\/[a-z0-9_]+\/\d+$/i.test(text)) {
    return text;
  }

  const numeric = extractNumericId(text);
  if (!numeric) {
    return "";
  }

  return `gid://shopify/${normalizedType}/${numeric}`;
}

function normalizeMetafieldReferenceNode(node) {
  if (!node || typeof node !== "object") {
    return null;
  }

  return {
    id: String(node.id || "").trim(),
    legacyResourceId: Number(node.legacyResourceId || 0) || null,
    handle: String(node.handle || "").trim(),
    title: String(node.title || node.displayName || node.name || "").trim(),
    productType: String(node.productType || "").trim(),
    vendor: String(node.vendor || "").trim(),
    referenceType: String(node.__typename || node.type || "").trim(),
  };
}

function normalizeMetafieldReferenceList(nodes) {
  const references = Array.isArray(nodes) ? nodes : [];
  const seen = new Set();
  const result = [];

  for (const node of references) {
    const normalized = normalizeMetafieldReferenceNode(node);
    if (!normalized) {
      continue;
    }

    const key = normalized.legacyResourceId ? String(normalized.legacyResourceId) : normalized.id || normalized.handle;
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function parseBooleanValue(value) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value || "").trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  return null;
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .flatMap((entry) => String(entry || "").split(/[\n,;|]+/g))
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
    );
  }

  const raw = String(value || "").trim();
  if (!raw) {
    return [];
  }

  return Array.from(
    new Set(
      raw
        .split(/[\n,;|]+/g)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeCustomDataNode(node) {
  if (!node) {
    return null;
  }

  const diaperTypeReferences = normalizeMetafieldReferenceList(node.diaperType?.references?.nodes || []);

  return normalizeProductCustomData({
    subtitle: node.subtitle?.jsonValue ?? node.subtitle?.value ?? null,
    badgeText: node.badgeText?.jsonValue ?? node.badgeText?.value ?? null,
    highlights: normalizeStringList(node.highlights?.jsonValue ?? node.highlights?.value ?? []),
    collectionSignal: node.collectionSignal?.jsonValue ?? node.collectionSignal?.value ?? null,
    rating: node.rating?.jsonValue ?? node.rating?.value ?? null,
    ratingCount: node.ratingCount?.jsonValue ?? node.ratingCount?.value ?? null,
    relatedProductsDisplay:
      node.relatedProductsDisplay?.jsonValue ?? node.relatedProductsDisplay?.value ?? null,
    relatedProducts: normalizeMetafieldReferenceList(
      node.relatedProducts?.references?.nodes || [],
    ),
    complementaryProducts: normalizeMetafieldReferenceList(
      node.complementaryProducts?.references?.nodes || [],
    ),
    complementaryProductsFallback: normalizeMetafieldReferenceList(
      node.complementaryProductsFallback?.references?.nodes || [],
    ),
    searchProductBoosts: normalizeStringList(
      node.searchProductBoosts?.jsonValue ?? node.searchProductBoosts?.value ?? [],
    ),
    searchProductBoostFallback: normalizeStringList(
      node.searchProductBoostFallback?.jsonValue ?? node.searchProductBoostFallback?.value ?? [],
    ),
    googleCustomProduct: parseBooleanValue(
      node.googleCustomProduct?.jsonValue ?? node.googleCustomProduct?.value ?? null,
    ),
    shopChannelMinimumQuantity: node.shopChannelMinimumQuantity?.jsonValue ?? node.shopChannelMinimumQuantity?.value ?? null,
    diaperType:
      node.diaperType?.jsonValue ??
      node.diaperType?.value ??
      (diaperTypeReferences.length ? diaperTypeReferences : null) ??
      null,
  });
}

function normalizeMoneyValue(value) {
  const amount = value?.amount ?? value?.presentment_money?.amount ?? value?.current_amount;
  if (amount == null) {
    return "";
  }

  const numeric = Number(amount);
  return Number.isFinite(numeric) && numeric > 0 ? numeric.toFixed(2) : "";
}

function normalizeVariantCostNode(node) {
  if (!node?.legacyResourceId) {
    return null;
  }

  const variants = Array.isArray(node.variants?.nodes) ? node.variants.nodes : [];
  const variantCosts = new Map();

  for (const variant of variants) {
    const variantLegacyId = String(variant?.legacyResourceId || "").trim();
    const cost = normalizeMoneyValue(variant?.inventoryItem?.unitCost);
    if (!variantLegacyId || !cost) {
      continue;
    }

    variantCosts.set(variantLegacyId, cost);
  }

  return variantCosts.size
    ? {
        productLegacyId: String(node.legacyResourceId),
        variantCosts,
      }
    : null;
}

function normalizeCollectionCustomDataNode(node) {
  if (!node) {
    return null;
  }

  return normalizeCollectionCustomData({
    heroKicker: node.heroKicker?.jsonValue ?? node.heroKicker?.value ?? null,
    heroSummary: node.heroSummary?.jsonValue ?? node.heroSummary?.value ?? null,
    featuredProducts: normalizeMetafieldReferenceList(node.featuredProducts?.references?.nodes || []),
    trustStrip: normalizeStringList(node.trustStrip?.jsonValue ?? node.trustStrip?.value ?? []),
  });
}

async function fetchProductCustomDataMap(products) {
  if (!Array.isArray(products) || !products.length) {
    return new Map();
  }

  const productIds = products
    .map((product) => product.admin_graphql_api_id || toShopifyGid("Product", product.id))
    .filter(Boolean);

  const batches = chunkArray(productIds, 50);
  const records = new Map();
  const fingerprint = enrichmentFingerprint(productIds);
  const checkpoint = await readEnrichmentCheckpoint(productCustomDataCheckpointPath, fingerprint, productIds);
  const completedIds = checkpoint?.completedIds || new Set();

  if (checkpoint) {
    for (const [productId, customData] of Object.entries(checkpoint.records)) {
      records.set(productId, customData);
    }
    process.stdout.write(
      `Resuming Shopify custom-data enrichment from ${completedIds.size}/${productIds.length} products\n`,
    );
  }

  const pendingBatchIndexes = batches
    .map((batch, batchIndex) => batch.every((id) => completedIds.has(String(id))) ? null : batchIndex)
    .filter((batchIndex) => batchIndex !== null);
  for (let groupStart = 0; groupStart < pendingBatchIndexes.length; groupStart += enrichmentConcurrency) {
    const group = pendingBatchIndexes.slice(groupStart, groupStart + enrichmentConcurrency);
    const results = await Promise.all(group.map(async (batchIndex) => {
      const batch = batches[batchIndex];
      const payload = adminAccessToken
        ? await fetchAdminGraphQL(PRODUCT_CUSTOM_DATA_QUERY, { ids: batch })
        : await runShopifyStoreGraphQLWithRetry(PRODUCT_CUSTOM_DATA_QUERY, { ids: batch }, {
            label: `custom-data batch ${batchIndex + 1}/${batches.length}`,
          });
      return { batch, nodes: Array.isArray(payload?.nodes) ? payload.nodes : [] };
    }));

    for (const { batch, nodes } of results) {
      for (const node of nodes) {
        if (!node?.legacyResourceId) continue;
        const customData = normalizeCustomDataNode(node);
        if (customData) records.set(String(node.legacyResourceId), customData);
      }
      batch.forEach((id) => completedIds.add(String(id)));
    }
    await writeEnrichmentCheckpoint(
      productCustomDataCheckpointPath,
      fingerprint,
      completedIds,
      Object.fromEntries(records),
    );
  }

  return records;
}

function parseBulkReferenceIds(field) {
  const raw = field?.jsonValue ?? field?.value ?? [];
  let values = raw;

  if (typeof values === "string") {
    try {
      values = JSON.parse(values);
    } catch {
      values = [];
    }
  }

  if (!Array.isArray(values)) {
    values = values ? [values] : [];
  }

  return values
    .map((value) => (typeof value === "string" ? value : String(value?.id || "")))
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildBulkReferenceNodes(field, productsByGid) {
  return parseBulkReferenceIds(field).map((id) => {
    const referencedProduct = productsByGid.get(id);
    if (!referencedProduct) {
      return { id, legacyResourceId: Number(extractNumericId(id)) || null, title: id };
    }

    return {
      id: referencedProduct.id,
      legacyResourceId: referencedProduct.legacyResourceId,
      handle: referencedProduct.handle,
      title: referencedProduct.title,
      productType: referencedProduct.productType,
      vendor: referencedProduct.vendor,
    };
  });
}

function attachBulkCustomDataReferences(node, productsByGid) {
  const result = { ...node };
  for (const key of [
    "relatedProducts",
    "complementaryProducts",
    "complementaryProductsFallback",
    "diaperType",
  ]) {
    if (!node?.[key]) {
      continue;
    }

    result[key] = {
      ...node[key],
      references: { nodes: buildBulkReferenceNodes(node[key], productsByGid) },
    };
  }

  return result;
}

async function loadProductCustomDataBulkCache(products, { allowPartial = false } = {}) {
  const raw = await readFile(productCustomDataBulkPath, "utf8");
  const selectedIds = new Set(
    products
      .map((product) => product.admin_graphql_api_id || toShopifyGid("Product", product.id))
      .filter(Boolean),
  );
  const productNodes = new Map();

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const node = JSON.parse(line);
    if (!node?.__parentId && selectedIds.has(node.id)) {
      productNodes.set(node.id, node);
    }
  }

  if (!allowPartial && productNodes.size !== selectedIds.size) {
    throw new Error(
      `completed Shopify metafield bulk cache is incomplete (${productNodes.size}/${selectedIds.size} products)`,
    );
  }

  const records = new Map();
  for (const node of productNodes.values()) {
    const customData = normalizeCustomDataNode(attachBulkCustomDataReferences(node, productNodes));
    if (customData) {
      records.set(String(node.legacyResourceId), customData);
    }
  }

  if (!allowPartial && records.size !== products.length) {
    throw new Error(
      `completed Shopify metafield bulk cache normalized ${records.size}/${products.length} products`,
    );
  }

  return records;
}

async function fetchProductVariantCostMap(products) {
  if (!Array.isArray(products) || !products.length) {
    return new Map();
  }

  const productIds = products
    .map((product) => product.admin_graphql_api_id || toShopifyGid("Product", product.id))
    .filter(Boolean);

  const batches = chunkArray(productIds, 50);
  const records = new Map();
  const fingerprint = enrichmentFingerprint(productIds);
  const checkpoint = await readEnrichmentCheckpoint(variantCostCheckpointPath, fingerprint, productIds);
  const completedIds = checkpoint?.completedIds || new Set();

  if (checkpoint) {
    for (const [productId, costs] of Object.entries(checkpoint.records)) {
      records.set(productId, new Map(Object.entries(costs || {})));
    }
    process.stdout.write(
      `Resuming Shopify variant-cost enrichment from ${completedIds.size}/${productIds.length} products\n`,
    );
  }

  const pendingBatchIndexes = batches
    .map((batch, batchIndex) => batch.every((id) => completedIds.has(String(id))) ? null : batchIndex)
    .filter((batchIndex) => batchIndex !== null);
  for (let groupStart = 0; groupStart < pendingBatchIndexes.length; groupStart += enrichmentConcurrency) {
    const group = pendingBatchIndexes.slice(groupStart, groupStart + enrichmentConcurrency);
    const results = await Promise.all(group.map(async (batchIndex) => {
      const batch = batches[batchIndex];
      const payload = adminAccessToken
        ? await fetchAdminGraphQL(PRODUCT_VARIANT_COST_QUERY, { ids: batch })
        : await runShopifyStoreGraphQLWithRetry(PRODUCT_VARIANT_COST_QUERY, { ids: batch }, {
            label: `variant-cost batch ${batchIndex + 1}/${batches.length}`,
          });
      return { batch, nodes: Array.isArray(payload?.nodes) ? payload.nodes : [] };
    }));

    for (const { batch, nodes } of results) {
      for (const node of nodes) {
        const normalized = normalizeVariantCostNode(node);
        if (normalized) records.set(normalized.productLegacyId, normalized.variantCosts);
      }
      batch.forEach((id) => completedIds.add(String(id)));
    }
    await writeEnrichmentCheckpoint(
      variantCostCheckpointPath,
      fingerprint,
      completedIds,
      Object.fromEntries([...records].map(([productId, costs]) => [productId, Object.fromEntries(costs)])),
    );
  }

  return records;
}

function applyProductEnrichment(products, customDataMap, variantCostMap = new Map()) {
  return products.map((product) => {
    const customData = customDataMap.get(String(product.id)) || null;
    const variantCosts = variantCostMap.get(String(product.id)) || null;
    const variants = Array.isArray(product.variants)
      ? product.variants.map((variant) => {
          const legacyVariantId = String(variant?.legacyResourceId || variant?.id || "").trim();
          const cost = legacyVariantId ? variantCosts?.get(legacyVariantId) || "" : "";
          if (!cost) {
            return variant;
          }

          return {
            ...variant,
            cost,
            cost_per_item: cost,
          };
        })
      : product.variants;

    if (!customData) {
      return variants === product.variants ? product : { ...product, variants };
    }

    return {
      ...product,
      customData,
      variants,
      average_rating: product.average_rating ?? customData.rating ?? undefined,
      total_reviews: product.total_reviews ?? customData.ratingCount ?? undefined,
    };
  });
}

async function fetchProductVariantPricingMapFromBulkOperation() {
  const current = await runShopifyStoreGraphQL(BULK_OPERATION_STATUS_QUERY);
  const currentOperation = current?.currentBulkOperation;
  const activeStatuses = new Set(["CREATED", "RUNNING"]);
  let operation = activeStatuses.has(currentOperation?.status)
    ? currentOperation
    : null;

  if (!operation) {
    const started = await runShopifyStoreGraphQL(BULK_VARIANT_PRICING_MUTATION, {}, { allowMutations: true });
    const result = started?.bulkOperationRunQuery;
    const userErrors = Array.isArray(result?.userErrors) ? result.userErrors : [];
    if (userErrors.length) {
      throw new Error(userErrors.map((error) => error.message || "Bulk export failed").join(" | "));
    }

    operation = result?.bulkOperation;
  }

  if (!operation?.id) {
    throw new Error("Shopify bulk variant pricing export did not return an operation");
  }

  process.stdout.write(`Waiting for Shopify bulk variant pricing export ${operation.id}\n`);
  let status = operation.status;
  let completed = operation;
  while (activeStatuses.has(status)) {
    await sleep(1500);
    const payload = await runShopifyStoreGraphQL(BULK_OPERATION_STATUS_QUERY);
    completed = payload?.currentBulkOperation;
    status = completed?.status;
    process.stdout.write(
      `Bulk variant pricing export ${status || "UNKNOWN"}: ${completed?.objectCount || 0} records\n`,
    );
  }

  if (status !== "COMPLETED" || !completed?.url) {
    throw new Error(
      `Shopify bulk variant pricing export ${status || "UNKNOWN"}: ${completed?.errorCode || "no download URL"}`,
    );
  }

  const response = await fetch(completed.url);
  if (!response.ok) {
    throw new Error(`Shopify bulk variant pricing download failed (${response.status})`);
  }

  const records = new Map();
  const lines = (await response.text()).split("\n");
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    const variant = JSON.parse(line);
    if (!variant?.legacyResourceId) {
      continue;
    }

    records.set(String(variant.legacyResourceId), {
      price: String(variant.price || ""),
      compare_at_price: variant.compareAtPrice == null ? null : String(variant.compareAtPrice),
      available: Boolean(variant.availableForSale),
    });
  }

  process.stdout.write(`Downloaded Shopify bulk variant pricing: ${records.size} variants\n`);
  return records;
}

async function fetchProductVariantPricingMap() {
  if (useCliAdminPricing) {
    return fetchProductVariantPricingMapFromBulkOperation();
  }

  const records = new Map();
  let after = null;
  let page = 0;

  while (true) {
    const payload = adminAccessToken
      ? await fetchAdminGraphQL(PRODUCT_VARIANT_PRICING_QUERY, { after })
      : await runShopifyStoreGraphQL(PRODUCT_VARIANT_PRICING_QUERY, { after });
    const connection = payload?.productVariants;
    if (!connection) {
      throw new Error("Shopify Admin pricing query returned no productVariants connection");
    }

    for (const variant of connection.nodes || []) {
      if (!variant?.legacyResourceId) {
        continue;
      }

      records.set(String(variant.legacyResourceId), {
        price: String(variant.price || ""),
        compare_at_price: variant.compareAtPrice == null ? null : String(variant.compareAtPrice),
        available: Boolean(variant.availableForSale),
      });
    }

    page += 1;
    if (page % 10 === 0 || !connection.pageInfo?.hasNextPage) {
      process.stdout.write(`Fetched Admin variant pricing page ${page}: ${records.size} variants\n`);
    }

    if (!connection.pageInfo?.hasNextPage) {
      break;
    }

    after = connection.pageInfo.endCursor;
  }

  return records;
}

function applyAdminVariantPricing(products, pricingMap) {
  let matched = 0;
  const nextProducts = products.map((product) => {
    const variants = Array.isArray(product.variants)
      ? product.variants.map((variant) => {
          const variantId = String(variant?.legacyResourceId || variant?.id || "");
          const pricing = pricingMap.get(variantId);
          if (!pricing) {
            return variant;
          }

          matched += 1;
          return {
            ...variant,
            price: pricing.price,
            compare_at_price: pricing.compare_at_price,
            available: pricing.available,
          };
        })
      : product.variants;

    return variants === product.variants ? product : { ...product, variants };
  });

  process.stdout.write(`Applied Admin pricing to ${matched} catalog variants\n`);
  return nextProducts;
}

async function fetchCollectionCustomDataMap(collections) {
  if (!Array.isArray(collections) || !collections.length) {
    return new Map();
  }

  const collectionIds = collections
    .map((collection) => collection.admin_graphql_api_id || toShopifyGid("Collection", collection.id))
    .filter(Boolean);

  const batches = chunkArray(collectionIds, 50);
  const records = new Map();

  const payloads = await Promise.all(
    batches.map((batch) => adminAccessToken
      ? fetchAdminGraphQL(COLLECTION_CUSTOM_DATA_QUERY, { ids: batch })
      : runShopifyStoreGraphQL(COLLECTION_CUSTOM_DATA_QUERY, { ids: batch })),
  );

  for (const payload of payloads) {
    const nodes = Array.isArray(payload?.nodes) ? payload.nodes : [];

    for (const node of nodes) {
      if (!node?.legacyResourceId) {
        continue;
      }

      const customData = normalizeCollectionCustomDataNode(node);
      if (!customData) {
        continue;
      }

      records.set(String(node.legacyResourceId), customData);
    }
  }

  return records;
}

async function fetchShopCustomData() {
  if (!adminAccessToken) {
    try {
      const payload = await runShopifyStoreGraphQL(SHOP_CUSTOM_DATA_QUERY);
      const shop = payload?.shop || {};

      return {
        id: String(shop.id || "shop"),
        name: String(shop.name || "SALT"),
        customData: normalizeShopCustomData({
          bannerText: shop.bannerText?.jsonValue ?? shop.bannerText?.value ?? null,
          trustStrip: normalizeStringList(shop.trustStrip?.jsonValue ?? shop.trustStrip?.value ?? []),
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      process.stdout.write(`Shopify CLI shop lookup failed; using fallback shop payload (${message})\n`);
      return {
        id: "shop",
        name: "SALT",
        customData: normalizeShopCustomData({
          bannerText: "",
          trustStrip: [],
        }),
      };
    }
  }

  const payload = await fetchAdminGraphQL(SHOP_CUSTOM_DATA_QUERY);
  const shop = payload?.shop || {};

  return {
    id: String(shop.id || "shop"),
    name: String(shop.name || "SALT"),
    customData: normalizeShopCustomData({
      bannerText: shop.bannerText?.jsonValue ?? shop.bannerText?.value ?? null,
      trustStrip: normalizeStringList(shop.trustStrip?.jsonValue ?? shop.trustStrip?.value ?? []),
    }),
  };
}

async function fetchCollectionProductIds(handle) {
  const forceLive = forceLiveCollectionMemberships || forceLiveCollectionHandles.has(handle);
  if (!forceLive) {
    try {
      return await fetchCollectionProductIdsFromCachedFile(handle);
    } catch (cacheError) {
      const cacheMessage = cacheError instanceof Error ? cacheError.message : "unknown cache error";
      process.stdout.write(`Cached collection ids unavailable for "${handle}"; falling back to live fetch (${cacheMessage})\n`);
    }
  } else {
    const reason = forceLiveCollectionMemberships
      ? "canonical release"
      : "completed merge target";
    process.stdout.write(`Bypassing cached collection ids for ${reason} "${handle}"\n`);
  }

  const ids = [];
  let page = 1;

  try {
    while (true) {
      const url = `${baseUrl}/collections/${handle}/products.json?limit=${limit}&page=${page}&sort_by=manual`;
      const payload = await fetchJsonUrl(url);
      const products = Array.isArray(payload.products) ? payload.products : [];

      ids.push(...products.map((product) => product.id));

      if (products.length < limit) {
        break;
      }

      page += 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    if (forceLive) {
      const reason = forceLiveCollectionMemberships
        ? "canonical release"
        : "completed merge target";
      throw new Error(`Live collection ids failed for ${reason} "${handle}": ${message}`);
    }
    process.stdout.write(`Live collection ids failed for "${handle}"; trying cached mapping (${message})\n`);

    try {
      return await fetchCollectionProductIdsFromCachedFile(handle);
    } catch (cacheError) {
      const cacheMessage = cacheError instanceof Error ? cacheError.message : "unknown cache error";
      process.stdout.write(
        `Skipping collection "${handle}" after live and cached lookups failed (${message}; ${cacheMessage})\n`,
      );
      return [];
    }
  }

  return ids;
}

function sortByUpdatedAt(items) {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a.updated_at || a.published_at || "1970-01-01");
    const bTime = Date.parse(b.updated_at || b.published_at || "1970-01-01");
    return bTime - aTime;
  });
}

function decodeEntities(input = "") {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(input = "") {
  return input
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function excerptFromHtml(input = "", limitChars = 200) {
  const cleaned = stripHtml(input);
  if (cleaned.length <= limitChars) {
    return cleaned;
  }

  return `${cleaned.slice(0, limitChars - 1).trimEnd()}…`;
}

function firstImageSrcFromHtml(input = "") {
  const match = input.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] || null;
}

function firstAtomImageSrc(input = "") {
  const patterns = [
    /<media:content[^>]+url=["']([^"']+)["']/i,
    /<media:thumbnail[^>]+url=["']([^"']+)["']/i,
    /<link[^>]+rel=["']enclosure["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+type=["']image\/[^"']+["'][^>]+href=["']([^"']+)["']/i,
    /<enclosure[^>]+url=["']([^"']+)["']/i,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function readTag(input, tagName) {
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = input.match(pattern);
  return match?.[1]?.trim() || "";
}

function parseBlogEntriesFromAtom(atomXml) {
  const matches = [...atomXml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)];

  return matches
    .map((match) => {
      const block = match[1] || "";
      const id = decodeEntities(readTag(block, "id"));
      const publishedAt = readTag(block, "published");
      const updatedAt = readTag(block, "updated");
      const title = decodeEntities(readTag(block, "title"));
      const author = decodeEntities(readTag(block, "name")) || "SALT";
      const linkMatch = block.match(
        /<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["'][^>]*>/i,
      );
      const url = decodeEntities(linkMatch?.[1] || id);
      const handle = url.split("/").filter(Boolean).at(-1) || "";
      const rawContent = readTag(block, "content");
      const contentHtml = rawContent
        .replace(/^<!\[CDATA\[/i, "")
        .replace(/\]\]>$/i, "")
        .trim();
      const image = firstAtomImageSrc(block) || firstImageSrcFromHtml(contentHtml);

      return {
        id,
        handle,
        url,
        title,
        author,
        publishedAt,
        updatedAt,
        excerpt: excerptFromHtml(contentHtml),
        contentHtml,
        image,
      };
    })
    .filter((entry) => Boolean(entry.handle && entry.url && entry.title))
    .sort((a, b) => Date.parse(b.publishedAt || "1970-01-01") - Date.parse(a.publishedAt || "1970-01-01"));
}

async function fetchAboutPage() {
  const endpoint = `${baseUrl}/pages/${aboutHandle}.json`;

  try {
    const response = await fetch(endpoint);
    if (response.status === 404) {
      throw new Error(`Request failed (404) for ${endpoint}`);
    }

    if (!response.ok) {
      throw new Error(`Request failed (${response.status}) for ${endpoint}`);
    }

    const payload = await response.json();
    const page = payload?.page || {};

    return {
      id: Number(page.id || 0),
      handle: page.handle || aboutHandle,
      title: page.title || "About",
      bodyHtml: page.body_html || "",
      publishedAt: page.published_at || "",
      updatedAt: page.updated_at || "",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";

    try {
      return await fetchAboutPageFromCachedFile();
    } catch (cacheError) {
      const cacheMessage = cacheError instanceof Error ? cacheError.message : "unknown cache error";
      process.stdout.write(`About page fetch failed; using blank fallback (${message}; ${cacheMessage})\n`);
      return {
        id: 0,
        handle: aboutHandle,
        title: "About",
        bodyHtml: "",
        publishedAt: "",
        updatedAt: "",
      };
    }
  }
}

async function fetchBlogPostsFromAdmin() {
  if (!adminAccessToken) {
    return null;
  }

  const blogsPayload = await fetchAdminJson("/blogs.json?limit=250&fields=id,handle,title");
  const blogs = Array.isArray(blogsPayload.blogs) ? blogsPayload.blogs : [];

  for (const handle of blogHandles) {
    const matchedBlog = blogs.find((blog) => String(blog.handle || "").trim() === handle);
    if (!matchedBlog?.id) {
      process.stdout.write(`Admin blog handle "${handle}" not found\n`);
      continue;
    }

    const articlesPayload = await fetchAdminJson(
      `/blogs/${matchedBlog.id}/articles.json?limit=250&published_status=published&fields=id,handle,title,author,published_at,updated_at,summary_html,body_html,image`,
    );
    const articles = Array.isArray(articlesPayload.articles) ? articlesPayload.articles : [];
    const posts = articles
      .map((article) => {
        const contentHtml = article.body_html || "";
        const summaryHtml = article.summary_html || "";
        const image =
          article.image?.src || article.image?.url || firstImageSrcFromHtml(contentHtml) || null;

        return {
          id: String(article.id || ""),
          handle: String(article.handle || ""),
          url: `${new URL(baseUrl).origin}/blogs/${handle}/${article.handle}`,
          title: article.title || "",
          author: article.author || "SALT",
          publishedAt: article.published_at || "",
          updatedAt: article.updated_at || "",
          excerpt: excerptFromHtml(summaryHtml || contentHtml),
          contentHtml,
          image,
        };
      })
      .filter((entry) => Boolean(entry.handle && entry.title && entry.url))
      .sort(
        (a, b) => Date.parse(b.publishedAt || b.updatedAt || "1970-01-01") - Date.parse(a.publishedAt || a.updatedAt || "1970-01-01"),
      );

    if (!posts.length) {
      process.stdout.write(`Admin blog handle "${handle}" returned 0 published posts\n`);
      continue;
    }

    process.stdout.write(`Using Admin API blog handle "${handle}" with ${posts.length} posts\n`);
    return {
      blogHandle: handle,
      source: "shopify-admin-api",
      posts,
    };
  }

  return null;
}

async function fetchBlogPosts() {
  let adminResult = null;
  try {
    adminResult = await fetchBlogPostsFromAdmin();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    process.stdout.write(`Admin blog feed unavailable; falling back to public/cache feeds (${message})\n`);
  }

  if (adminResult) {
    return adminResult;
  }

  if (adminAccessToken) {
    try {
      return await fetchBlogPostsFromCachedFile();
    } catch (cacheError) {
      const cacheMessage = cacheError instanceof Error ? cacheError.message : "unknown cache error";
      process.stdout.write(`Cached blog payload unavailable; trying public feeds (${cacheMessage})\n`);
    }
  }

  for (const handle of blogHandles) {
    try {
      const response = await fetch(`${baseUrl}/blogs/${handle}.atom`);
      if (response.status === 404) {
        process.stdout.write(`Blog handle "${handle}" not found on ${baseUrl}\n`);
        continue;
      }

      if (!response.ok) {
        throw new Error(`Request failed (${response.status}) for ${baseUrl}/blogs/${handle}.atom`);
      }

      const atom = await response.text();
      const posts = parseBlogEntriesFromAtom(atom);

      if (!posts.length) {
        process.stdout.write(`Blog handle "${handle}" returned 0 published posts\n`);
        continue;
      }

      process.stdout.write(`Using blog handle "${handle}" with ${posts.length} posts\n`);
      return {
        blogHandle: handle,
        source: baseUrl,
        posts,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      process.stdout.write(`Blog handle "${handle}" fetch failed (${message})\n`);
    }
  }

  try {
    return await fetchBlogPostsFromCachedFile();
  } catch (cacheError) {
    const cacheMessage = cacheError instanceof Error ? cacheError.message : "unknown cache error";
    process.stdout.write(`No public blog feed found; saving zero live posts (${cacheMessage})\n`);
    return {
      blogHandle: blogHandles[0] || "posts",
      source: baseUrl,
      posts: [],
    };
  }
}

async function fetchProductsFromCachedFile() {
  const payload = await readProductCatalogPayload(outDir);
  const products = Array.isArray(payload.products) ? payload.products : [];

  if (!products.length) {
    throw new Error("Cached product payload is empty");
  }

  const publishedProducts = filterOnlineStoreProducts(products);
  if (!publishedProducts.length) {
    throw new Error("Cached product payload contains no products published to Online Store");
  }

  process.stdout.write(
    `Using cached product payload with ${products.length} products; kept ${publishedProducts.length} published Online Store products\n`,
  );
  return publishedProducts;
}

async function mergeAdminProductsWithStorefrontFeed(adminProducts) {
  let storefrontProducts;
  let boundarySource = "live";

  if (["cache", "cached", "snapshot"].includes(storefrontBoundaryMode)) {
    storefrontProducts = await fetchProductsFromCachedFile();
    boundarySource = "cached";
    process.stdout.write("Using cached Online Store boundary by explicit configuration\n");
  } else {
    try {
      storefrontProducts = await fetchPublishedStorefrontProducts();
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown storefront feed error";
      storefrontProducts = await fetchProductsFromCachedFile();
      boundarySource = "cached";
      process.stdout.write(`Live Online Store boundary unavailable; using cached boundary with current Admin product data (${message})\n`);
    }
  }

  const adminById = new Map(adminProducts.map((product) => [String(product?.id || ""), product]));
  const adminByHandle = new Map(
    adminProducts.map((product) => [String(product?.handle || "").trim().toLowerCase(), product]),
  );

  const boundaryProducts = boundarySource === "cached"
    ? storefrontProducts.filter((storefrontProduct) => {
        const hasAdminMatch =
          adminById.has(String(storefrontProduct?.id || "")) ||
          adminByHandle.has(String(storefrontProduct?.handle || "").trim().toLowerCase());
        return hasAdminMatch;
      })
    : storefrontProducts;

  if (boundarySource === "cached" && boundaryProducts.length !== storefrontProducts.length) {
    process.stdout.write(
      `Removed ${storefrontProducts.length - boundaryProducts.length} stale cached products absent from the fresh Admin feed\n`,
    );
  }

  const mergedProducts = boundaryProducts.map((storefrontProduct) => {
    const adminProduct =
      adminById.get(String(storefrontProduct?.id || "")) ||
      adminByHandle.get(String(storefrontProduct?.handle || "").trim().toLowerCase()) ||
      null;

    if (!adminProduct) {
      return storefrontProduct;
    }

    if (boundarySource === "cached") {
      const adminVariantsById = new Map(
        (Array.isArray(adminProduct.variants) ? adminProduct.variants : [])
          .map((variant) => [String(variant?.id || variant?.legacyResourceId || ""), variant])
          .filter(([variantId]) => variantId),
      );
      const variants = storefrontProduct.variants?.length
        ? storefrontProduct.variants.map((storefrontVariant) => {
            const adminVariant = adminVariantsById.get(String(storefrontVariant?.id || storefrontVariant?.legacyResourceId || ""));
            if (!adminVariant) {
              return storefrontVariant;
            }

            return {
              ...storefrontVariant,
              price: adminVariant.price ?? storefrontVariant.price,
              compare_at_price: adminVariant.compare_at_price ?? storefrontVariant.compare_at_price ?? null,
            };
          })
        : adminProduct.variants;

      return {
        ...storefrontProduct,
        ...adminProduct,
        // Cached data supplies channel membership and the complete public variant set;
        // fresh Admin data supplies current variant pricing.
        variants,
      };
    }

    // The public Online Store feed is authoritative for channel membership and
    // complete variants; Admin data supplies fields not exposed publicly.
    return {
      ...adminProduct,
      ...storefrontProduct,
      variants: storefrontProduct.variants,
    };
  });

  process.stdout.write(
    `Merged Online Store feed boundary: ${mergedProducts.length} products and ${mergedProducts.reduce((count, product) => count + (product.variants?.length || 0), 0)} complete variants\n`,
  );
  return mergedProducts;
}

async function fetchPublishedStorefrontProducts() {
  const products = await fetchPaged("products", "/products.json");
  const publishedProducts = filterOnlineStoreProducts(products);
  if (!publishedProducts.length) {
    throw new Error("Shopify storefront product feed returned no products published to Online Store");
  }

  process.stdout.write(
    `Using live storefront product feed with ${publishedProducts.length} published Online Store products\n`,
  );
  return publishedProducts;
}

const ACTIVE_CATALOG_PRODUCTS_QUERY = /* GraphQL */ `
  query ActiveCatalogProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, query: "status:active") {
      nodes {
        id
        legacyResourceId
        handle
        title
        descriptionHtml
        vendor
        productType
        status
        tags
        createdAt
        updatedAt
        publishedAt
        media(first: 100) {
          nodes {
            __typename
            ... on MediaImage { id alt image { url } }
          }
        }
        variants(first: 250) {
          nodes {
            id
            legacyResourceId
            title
            sku
            price
            compareAtPrice
            inventoryQuantity
          }
        }
        resourcePublications(first: 100) {
          nodes { isPublished channel { name } }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

function normalizeActiveCatalogProduct(node) {
  const images = (Array.isArray(node?.media?.nodes) ? node.media.nodes : [])
    .filter((media) => media?.__typename === "MediaImage" && media?.image?.url)
    .map((media) => ({
      id: Number(String(media.id || "").match(/(\d+)$/)?.[1]) || media.id || 0,
      src: media.image.url,
      alt: media.alt || "",
    }));
  const variants = Array.isArray(node?.variants?.nodes) ? node.variants.nodes : [];
  return {
    id: Number(node?.legacyResourceId) || node?.id || 0,
    legacyResourceId: String(node?.legacyResourceId || ""),
    handle: node?.handle || "",
    title: node?.title || "",
    body_html: node?.descriptionHtml || "",
    descriptionHtml: node?.descriptionHtml || "",
    vendor: node?.vendor || "",
    product_type: node?.productType || "",
    productType: node?.productType || "",
    status: node?.status || "ACTIVE",
    tags: Array.isArray(node?.tags) ? node.tags : [],
    created_at: node?.createdAt || "",
    updated_at: node?.updatedAt || "",
    published_at: node?.publishedAt || null,
    images,
    image: images[0] || null,
    resourcePublications: node?.resourcePublications || { nodes: [] },
    variants: variants.map((variant) => ({
      id: Number(variant?.legacyResourceId) || variant?.id || 0,
      legacyResourceId: String(variant?.legacyResourceId || ""),
      title: variant?.title || "",
      sku: variant?.sku || "",
      price: variant?.price || "",
      compare_at_price: variant?.compareAtPrice || null,
      inventory_quantity: variant?.inventoryQuantity ?? null,
    })),
  };
}

async function fetchActiveCatalogProducts() {
  const products = [];
  let after = null;
  let page = 0;
  while (true) {
    const payload = adminAccessToken
      ? await fetchAdminGraphQL(ACTIVE_CATALOG_PRODUCTS_QUERY, { first: limit, after })
      : await runShopifyStoreGraphQL(ACTIVE_CATALOG_PRODUCTS_QUERY, { first: limit, after });
    const connection = payload?.products;
    if (!connection) throw new Error("Active catalog GraphQL query returned no products connection");
    const nodes = Array.isArray(connection.nodes) ? connection.nodes : [];
    products.push(...nodes.map(normalizeActiveCatalogProduct));
    page += 1;
    process.stdout.write(`Fetched active catalog page ${page}: ${nodes.length} products\n`);
    if (!connection.pageInfo?.hasNextPage) break;
    if (!connection.pageInfo?.endCursor) throw new Error("Active catalog page hasNextPage without an end cursor");
    after = connection.pageInfo.endCursor;
  }
  process.stdout.write(`Using full active catalog boundary with ${products.length} products\n`);
  return products;
}

async function fetchCollectionsFromCachedFile() {
  const raw = await readFile(collectionsPath, "utf8");
  const payload = JSON.parse(raw);
  const collections = Array.isArray(payload.collections) ? payload.collections : [];

  if (!collections.length) {
    throw new Error("Cached collections payload is empty");
  }

  process.stdout.write(`Using cached collections payload with ${collections.length} collections\n`);
  return collections;
}

async function fetchAboutPageFromCachedFile() {
  const raw = await readFile(aboutPath, "utf8");
  const payload = JSON.parse(raw);
  const page = payload?.page || {};

  if (!page?.title) {
    throw new Error("Cached about payload is empty");
  }

  process.stdout.write("Using cached About page payload\n");
  return {
    id: Number(page.id || 0),
    handle: page.handle || aboutHandle,
    title: page.title || "About",
    bodyHtml: page.bodyHtml || "",
    publishedAt: page.publishedAt || "",
    updatedAt: page.updatedAt || "",
  };
}

async function fetchBlogPostsFromCachedFile() {
  const raw = await readFile(blogPostsPath, "utf8");
  const payload = JSON.parse(raw);
  const posts = Array.isArray(payload.posts) ? payload.posts : [];

  if (!posts.length) {
    throw new Error("Cached blog payload is empty");
  }

  process.stdout.write(`Using cached blog payload with ${posts.length} posts\n`);
  return {
    blogHandle: payload.blogHandle || blogHandles[0] || "posts",
    source: payload.source || baseUrl,
    posts,
  };
}

async function fetchProductsForSync() {
  try {
    let products = syncActiveCatalog
      ? await fetchActiveCatalogProducts()
      : adminAccessToken
        ? await fetchAdminPaged("products", "/products.json?status=active&published_status=published")
        : await fetchPaged("products", "/products.json");

    if (products.length) {
      const publishedProducts = filterOnlineStoreProducts(products);
      if (!syncActiveCatalog && !publishedProducts.length) {
        throw new Error("Shopify product feed returned no active products published to Online Store");
      }

      if (!syncActiveCatalog && publishedProducts.length !== products.length) {
        process.stdout.write(
          `Filtered ${products.length - publishedProducts.length} products excluded from Online Store\n`,
        );
        products = publishedProducts;
      }

      if (adminAccessToken && !syncActiveCatalog) {
        products = await mergeAdminProductsWithStorefrontFeed(products);
      }

      if (adminAccessToken || useCliAdminPricing) {
        const pricingMap = await fetchProductVariantPricingMap();
        products = applyAdminVariantPricing(products, pricingMap);
      }

      if (skipProductEnrichment) {
        let cachedProducts = [];
        try {
          cachedProducts = (await readProductCatalogPayload(outDir)).products;
        } catch {
          // A first-time sync can run without an older catalog to overlay.
        }

        const cachedById = new Map(cachedProducts.map((product) => [String(product?.id), product]));
        const cachedByHandle = new Map(
          cachedProducts.map((product) => [String(product?.handle || "").trim().toLowerCase(), product]),
        );
        const fastProducts = products.map((product) => {
          const cachedMatch =
            cachedById.get(String(product?.id)) ||
            cachedByHandle.get(String(product?.handle || "").trim().toLowerCase()) ||
            null;

          return cachedMatch?.customData
            ? {
                ...product,
                customData: cachedMatch.customData,
                average_rating: product.average_rating ?? cachedMatch.average_rating,
                total_reviews: product.total_reviews ?? cachedMatch.total_reviews,
              }
            : product;
        });

        process.stdout.write(
          `Using ${adminAccessToken ? "Admin API" : "Shopify CLI"} product feed with ${products.length} products; skipped optional product enrichment for fast catalog refresh\n`,
        );
        return fastProducts;
      }

      if (preferCompleteProductEnrichmentCache && !forceLiveProductEnrichment) {
        try {
          const cachedCustomDataMap = await loadProductCustomDataBulkCache(products);
          let variantCostMap = new Map();
          if (fetchVariantCostsWithCompleteCache) {
            try {
              variantCostMap = await fetchProductVariantCostMap(products);
            } catch (error) {
              const message = error instanceof Error ? error.message : "unknown variant cost error";
              process.stdout.write(
                `Complete custom-data cache loaded; live variant costs unavailable, retaining source costs (${message})\n`,
              );
            }
          } else {
            process.stdout.write(
              "Complete custom-data cache loaded; deferring live variant-cost reads to the dedicated pricing gate\n",
            );
          }

          const cachedProducts = applyProductEnrichment(products, cachedCustomDataMap, variantCostMap);
          process.stdout.write(
            `Using complete Shopify bulk cache for ${cachedProducts.length} products with ${cachedCustomDataMap.size} metafield payloads and ${variantCostMap.size} variant cost payloads\n`,
          );
          return cachedProducts;
      } catch (error) {
          const message = error instanceof Error ? error.message : "unknown complete-cache error";
          process.stdout.write(`Complete Shopify bulk cache not usable; continuing with live enrichment (${message})\n`);
          try {
            const partialCustomDataMap = await loadProductCustomDataBulkCache(products, { allowPartial: true });
            const missingProducts = products.filter((product) => !partialCustomDataMap.has(String(product.id)));
            if (partialCustomDataMap.size && missingProducts.length < products.length) {
              process.stdout.write(
                `Reusing ${partialCustomDataMap.size} cached merchandising payloads; ` +
                  `fetching ${missingProducts.length} missing product(s) live\n`,
              );
              const [liveCustomDataMap, variantCostMap] = await Promise.all([
                fetchProductCustomDataMap(missingProducts),
                fetchProductVariantCostMap(products),
              ]);
              const mergedCustomDataMap = new Map(partialCustomDataMap);
              for (const [productId, customData] of liveCustomDataMap) {
                mergedCustomDataMap.set(productId, customData);
              }
              const enrichedProducts = applyProductEnrichment(products, mergedCustomDataMap, variantCostMap);
              process.stdout.write(
                `${adminAccessToken ? "Using Admin API" : "Using Shopify CLI"} product feed with ${products.length} products, ` +
                  `${mergedCustomDataMap.size} cached/live metafield payloads, and ${variantCostMap.size} variant cost payloads\n`,
              );
              return enrichedProducts;
            }
          } catch (partialCacheError) {
            const partialMessage = partialCacheError instanceof Error ? partialCacheError.message : "unknown partial-cache error";
            process.stdout.write(`Partial Shopify bulk cache unavailable; continuing with full live enrichment (${partialMessage})\n`);
          }
        }
      } else if (forceLiveProductEnrichment) {
        process.stdout.write("Forcing live product merchandising enrichment after the final catalog write generation\n");
      }

      try {
        const [customDataMap, variantCostMap] = await Promise.all([
          fetchProductCustomDataMap(products),
          fetchProductVariantCostMap(products),
        ]);
        const enrichedProducts = applyProductEnrichment(products, customDataMap, variantCostMap);

        process.stdout.write(
          `${adminAccessToken ? "Using Admin API" : "Using Shopify CLI"} product feed with ${products.length} products, ${customDataMap.size} metafield payloads, and ${variantCostMap.size} variant cost payloads\n`,
        );
        return enrichedProducts;
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        try {
          const cachedCustomDataMap = await loadProductCustomDataBulkCache(products);
          const recoveredProducts = applyProductEnrichment(products, cachedCustomDataMap);

          process.stdout.write(
            `${adminAccessToken ? "Admin" : "CLI"} product metafield fetch failed; recovered complete custom data from Shopify bulk cache (${message})\n`,
          );
          process.stdout.write(
            `${adminAccessToken ? "Using Admin API" : "Using Shopify CLI"} product feed with ${recoveredProducts.length} products and ${cachedCustomDataMap.size} recovered metafield payloads\n`,
          );
          return recoveredProducts;
        } catch (cacheError) {
          const cacheMessage = cacheError instanceof Error ? cacheError.message : "unknown bulk cache error";
          const enrichmentError = new Error(
            `product merchandising enrichment failed and no complete recovery cache is available: ${message}; ${cacheMessage}`,
          );
          enrichmentError.code = "PRODUCT_ENRICHMENT_INCOMPLETE";
          throw enrichmentError;
        }
      }
    }

    process.stdout.write(
      `${adminAccessToken ? "Admin API" : "Storefront"} product feed returned 0 products; falling back to storefront JSON\n`,
    );
  } catch (error) {
    if (error?.code === "PRODUCT_ENRICHMENT_INCOMPLETE") {
      throw error;
    }

    const message = error instanceof Error ? error.message : "unknown error";
    process.stdout.write(
      `${adminAccessToken ? "Admin" : "CLI"} product feed failed; falling back to cached/storefront JSON (${message})\n`,
    );
  }

  try {
    return await fetchPublishedStorefrontProducts();
  } catch (liveError) {
    const message = liveError instanceof Error ? liveError.message : "unknown live storefront error";
    process.stdout.write(`Live storefront product feed unavailable; trying cached data (${message})\n`);
  }

  try {
    return await fetchProductsFromCachedFile();
  } catch (cacheError) {
    const message = cacheError instanceof Error ? cacheError.message : "unknown cache error";
    process.stdout.write(`Cached product payload unavailable; falling back to storefront JSON (${message})\n`);
  }

  return fetchPublishedStorefrontProducts();
}

async function fetchCollectionsForSync() {
  try {
    const collections = adminAccessToken
      ? await fetchAdminPaged("collections", "/collections.json")
      : await fetchPaged("collections", "/collections.json");

    if (collections.length) {
      try {
        const customDataMap = await fetchCollectionCustomDataMap(collections);
        const enrichedCollections = collections.map((collection) => {
          const customData = customDataMap.get(String(collection.id)) || null;
          if (!customData) {
            return collection;
          }

          return {
            ...collection,
            customData,
          };
        });

        process.stdout.write(
          `${adminAccessToken ? "Using Admin API" : "Using Shopify CLI"} collections feed with ${collections.length} collections and ${customDataMap.size} metafield payloads\n`,
        );
        return enrichedCollections;
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        process.stdout.write(
          `${adminAccessToken ? "Admin" : "CLI"} collection metafield fetch failed; returning collection feed without custom data (${message})\n`,
        );
        process.stdout.write(
          `${adminAccessToken ? "Using Admin API" : "Using Shopify CLI"} collections feed with ${collections.length} collections\n`,
        );
        return collections;
      }
    }

    process.stdout.write(
      `${adminAccessToken ? "Admin API" : "Storefront"} collections feed returned 0 collections; falling back to storefront JSON\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    process.stdout.write(
      `${adminAccessToken ? "Admin" : "CLI"} collections feed failed; falling back to cached/storefront JSON (${message})\n`,
    );
  }

  try {
    const cachedCollections = await fetchCollectionsFromCachedFile();
    if (adminAccessToken && cachedCollections.length) {
      try {
        const customDataMap = await fetchCollectionCustomDataMap(cachedCollections);
        const enrichedCollections = cachedCollections.map((collection) => {
          const customData = customDataMap.get(String(collection.id)) || null;
          return customData ? { ...collection, customData } : collection;
        });
        process.stdout.write(
          `Using cached collection membership with live Admin collection metafields (${customDataMap.size} payloads)\n`,
        );
        return enrichedCollections;
      } catch (error) {
        const customDataMessage = error instanceof Error ? error.message : "unknown collection metafield error";
        process.stdout.write(`Live Admin collection metafields unavailable; retaining cached collection data (${customDataMessage})\n`);
      }
    }

    return cachedCollections;
  } catch (cacheError) {
    const message = cacheError instanceof Error ? cacheError.message : "unknown cache error";
    process.stdout.write(`Cached collections payload unavailable; falling back to storefront JSON (${message})\n`);
  }

  return fetchPaged("collections", "/collections.json");
}

async function fetchShopForSync() {
  try {
    return await fetchShopCustomData();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    process.stdout.write(`Shop custom data fetch failed; using fallback shop payload (${message})\n`);
    return {
      id: "shop",
      name: "SALT",
      customData: normalizeShopCustomData({
        bannerText: "",
        trustStrip: [],
      }),
    };
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  process.stdout.write(
    `Sync throughput: ${requestConcurrency} Shopify reads, ${enrichmentConcurrency} enrichment batches, ` +
      `${collectionProductReadConcurrency} collection mappings (request spacing ${requestSpacingMs}ms)\n`,
  );
  await loadForcedLiveCollectionHandles();

  const [products, collections, aboutPage, blogResult, shop] = await Promise.all([
    fetchProductsForSync(),
    fetchCollectionsForSync(),
    fetchAboutPage(),
    fetchBlogPosts(),
    fetchShopForSync(),
  ]);

  const productPayload = {
    generatedAt: startedAt,
    source: baseUrl,
    total: products.length,
    products: sortByUpdatedAt(products),
  };

  const collectionPayload = {
    generatedAt: startedAt,
    source: baseUrl,
    total: collections.length,
    collections: sortByUpdatedAt(collections),
  };

  const collectionProductMap = {
    generatedAt: startedAt,
    source: baseUrl,
    totalCollections: collections.length,
    collections: {},
  };

  const aboutPayload = {
    generatedAt: startedAt,
    source: baseUrl,
    page: aboutPage,
  };

  const blogPayload = {
    generatedAt: startedAt,
    source: blogResult.source,
    blogHandle: blogResult.blogHandle,
    total: blogResult.posts.length,
    posts: blogResult.posts,
  };

  const shopPayload = {
    generatedAt: startedAt,
    source: baseUrl,
    shop,
  };

  // Shopify's all-products collection endpoint is paginated and the cached
  // mapping can lag behind the live product feed. Build this membership from
  // the same feed used for the catalog so the shop grid cannot silently omit
  // newly synced products.
  const allProductIds = products
    .map((product) => Number(product.id))
    .filter((productId) => Number.isFinite(productId) && productId > 0);

  const collectionMappings = await mapWithConcurrency(
    collections,
    collectionProductReadConcurrency,
    async (collection) => {
      const isAllProducts = collection.handle === "all-products";
      const ids = isAllProducts ? allProductIds : await fetchCollectionProductIds(collection.handle);
      const visibleIds = filterProductIdsToCatalog(ids, products);

      if (isAllProducts) {
        collection.products_count = visibleIds.length;
        // Do not synthesize a collection metafield value in the local snapshot.
        // The collection backfill must compare the live hero summary and write a
        // changed generated value before final readback.
      }

      process.stdout.write(
        `Fetched collection mapping ${collection.handle}: ${visibleIds.length} published products\n`,
      );
      return [collection.handle, {
        title: collection.title,
        productIds: visibleIds,
      }];
    },
  );
  for (const [handle, mapping] of collectionMappings) {
    collectionProductMap.collections[handle] = mapping;
  }

  await mkdir(outDir, { recursive: true });
  let productManifest = null;
  let productSearchManifest = null;
  let productSearchPayload = null;
  if (skipGeneratedListingPayloads) {
    await removeGeneratedListingPayloads();
    await mkdir(dirname(releaseCatalogSourcePath), { recursive: true });
    await writeFile(
      releaseCatalogSourcePath,
      JSON.stringify(productPayload),
      "utf8",
    );
  } else {
    const [{ buildProductSearchPayload }, { writeProductCatalogPayload }, { writeProductSearchPayload }] = await Promise.all([
      import("./product-search-index.mjs"),
      import("./product-catalog-files.mjs"),
      import("./product-search-files.mjs"),
    ]);
    productSearchPayload = buildProductSearchPayload(productPayload);
    productManifest = await writeProductCatalogPayload(outDir, productPayload);
    productSearchManifest = await writeProductSearchPayload(outDir, productSearchPayload);
  }
  await writeFile(collectionsPath, JSON.stringify(collectionPayload));
  await writeFile(collectionProductsPath, JSON.stringify(collectionProductMap));
  await writeFile(aboutPath, JSON.stringify(aboutPayload));
  await writeFile(blogPostsPath, JSON.stringify(blogPayload));
  await writeFile(shopPath, JSON.stringify(shopPayload));

  if (skipGeneratedListingPayloads) {
    process.stdout.write(
      `Skipped generated product/search listing payloads; saved ${productPayload.total} products to ${releaseCatalogSourcePath}\n`,
    );
  } else {
    process.stdout.write(
      `Saved ${productPayload.total} products to public/data/products.json across ${productManifest.shardCount} shards (max ${productManifest.shardMaxBytes} bytes each)\n`,
    );
    process.stdout.write(
      `Saved ${productSearchPayload.total} compact search products to public/data/product-search.json across ${productSearchManifest.shardCount} shards (max ${productSearchManifest.shardMaxBytes} bytes each)\n`,
    );
  }
  process.stdout.write(`Saved ${collectionPayload.total} collections to public/data/collections.json\n`);
  process.stdout.write(
    `Saved collection product mapping to public/data/collection-products.json\n`,
  );
  process.stdout.write(`Saved About page to public/data/about.json\n`);
  process.stdout.write(`Saved ${blogPayload.total} blog posts to public/data/blog-posts.json\n`);
  process.stdout.write(`Saved shop metadata to public/data/shop.json\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
