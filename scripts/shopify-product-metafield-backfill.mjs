#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { normalizeHandleValue, toShopifyGid } from "../src/lib/shopify-seo-batch.js";
import { inferShopifyTaxonomyCategory } from "../src/lib/shopify-product-category.js";
import { mergeProductCustomData, normalizeProductCustomData, normalizeShopCustomData } from "../src/lib/product-custom-data.js";
import {
  buildMarketingBackfillPlan,
  buildMarketingMetafieldSetBatches,
} from "../src/lib/shopify-marketing-metafield-backfill.js";
import {
  BACKFILL_FIELD_IDS,
  buildBackfillPlan,
  buildMetafieldSetBatches,
} from "../src/lib/shopify-product-metafield-backfill.js";

const DEFAULT_SHOP_BASE = "https://0309d3-72.myshopify.com";
const DEFAULT_OUTPUT_FILE = resolve(process.cwd(), "output", "product-metafield-backfill-manifest.json");
const DEFAULT_INPUT_DIR = resolve(process.cwd(), "public", "data");
const PRODUCT_CATALOG_CHECKPOINT = resolve(process.cwd(), "output", ".shopify-metafield-live-catalog.json");
const PRODUCT_CUSTOM_DATA_CHECKPOINT = resolve(process.cwd(), "output", ".shopify-metafield-custom-data.json");
const SHOP_BASE = process.env.SALT_SHOP_URL || DEFAULT_SHOP_BASE;
const SHOP_DOMAIN = new URL(SHOP_BASE).hostname;
const SHOPIFY_ADMIN_API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION || "2026-07";
const SHOPIFY_CLI_AGENT_INFO = process.env.SHOPIFY_CLI_AGENT_INFO || "n:salt-shine-enhancer|v:1|p:openai";
const SHOPIFY_CLI_AGENT_IDS =
  process.env.SHOPIFY_CLI_AGENT_IDS || `s:${process.env.CONVERSATION_ID || "local"}|r:${process.pid}|i:salt-shine-enhancer`;
const JUDGEME_PROXY_BASE_URL = process.env.SALT_JUDGEME_PROXY_BASE_URL || "https://www.saltonlinestore.com";
const JUDGEME_PUBLIC_TOKEN =
  process.env.VITE_JUDGEME_PUBLIC_TOKEN ||
  process.env.JUDGEME_PUBLIC_TOKEN ||
  process.env.SALT_JUDGEME_PUBLIC_TOKEN ||
  "TQ0rk940ADN89zj_f83SKuTYIfY";
const BACKFILL_APPLY_CONCURRENCY = Math.max(1, Number(process.env.SALT_BACKFILL_APPLY_CONCURRENCY || 1));
const JUDGEME_SHOP_DOMAINS = Array.from(
  new Set(
    [
      process.env.SALT_JUDGEME_SHOP_DOMAIN,
      process.env.VITE_JUDGEME_SHOP_DOMAIN,
      process.env.SALT_SHOP_URL,
      process.env.VITE_SALT_SHOP_URL,
      process.env.VITE_SHOPIFY_STOREFRONT_URL,
      DEFAULT_SHOP_BASE,
    ]
      .map((value) => normalizeDomain(value))
      .filter(Boolean),
  ),
);
const JUDGEME_FETCH_ENABLED = process.env.SALT_BACKFILL_LIVE_JUDGEME !== "0";
const JUDGEME_CONCURRENCY = Number(process.env.SALT_BACKFILL_JUDGEME_CONCURRENCY || 8);
const DIAPER_METAOBJECT_DEFINITION_ID = "gid://shopify/MetaobjectDefinition/9632874595";
const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const args = {
    dryRun: true,
    apply: false,
    inputDir: DEFAULT_INPUT_DIR,
    outputFile: DEFAULT_OUTPUT_FILE,
    limitProducts: 0,
    productIds: [],
    productHandles: [],
    productHandlesFile: "",
    onlyFields: [],
    skipLiveReviews: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--apply") {
      args.apply = true;
      args.dryRun = false;
      continue;
    }

    if (token === "--dry-run") {
      args.dryRun = true;
      args.apply = false;
      continue;
    }

    if (token === "--input-dir") {
      if (!next) {
        throw new Error("Missing value for --input-dir");
      }
      args.inputDir = resolve(process.cwd(), next);
      index += 1;
      continue;
    }

    if (token === "--output-file") {
      if (!next) {
        throw new Error("Missing value for --output-file");
      }
      args.outputFile = resolve(process.cwd(), next);
      index += 1;
      continue;
    }

    if (token === "--limit-products" || token === "--sample") {
      if (!next) {
        throw new Error("Missing value for --limit-products");
      }
      args.limitProducts = Math.max(0, Number(next) || 0);
      index += 1;
      continue;
    }

    if (token === "--product-id") {
      if (!next) {
        throw new Error("Missing value for --product-id");
      }
      args.productIds.push(...String(next).split(",").map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0));
      index += 1;
      continue;
    }

    if (token === "--product-handle") {
      if (!next) {
        throw new Error("Missing value for --product-handle");
      }
      args.productHandles.push(
        ...String(next)
          .split(",")
          .map((value) => normalizeHandleValue(value))
          .filter(Boolean),
      );
      index += 1;
      continue;
    }

    if (token === "--product-handles-file") {
      if (!next) {
        throw new Error("Missing value for --product-handles-file");
      }
      args.productHandlesFile = resolve(process.cwd(), next);
      index += 1;
      continue;
    }

    if (token === "--only-field") {
      if (!next) {
        throw new Error("Missing value for --only-field");
      }
      args.onlyFields.push(...String(next).split(",").map((value) => value.trim()).filter(Boolean));
      index += 1;
      continue;
    }

    if (token === "--skip-live-reviews") {
      args.skipLiveReviews = true;
      continue;
    }
  }

  if (args.apply) {
    args.dryRun = false;
  }

  return args;
}

function normalizeDomain(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProtocol).hostname.toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
  }
}

function getShopifyCliEnv() {
  return {
    ...process.env,
    SHOPIFY_CLI_AGENT_INFO,
    SHOPIFY_CLI_AGENT_IDS,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkArray(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function isRetryableShopifyCliError(error) {
  const text = [error?.message, error?.stderr, error?.stdout, error?.code].filter(Boolean).join("\n").toLowerCase();

  return [
    "429",
    "too many requests",
    "retry-after",
    "temporarily unavailable",
    "service unavailable",
    "gateway timeout",
    "timeout",
    "aborted before it completed",
    "enotfound",
    "eai_again",
    "etimedout",
    "econnreset",
    "socket hang up",
    "fetch failed",
  ].some((needle) => text.includes(needle));
}

function formatMetafieldUserErrors(userErrors = []) {
  return userErrors
    .map((error) => `${error.field ? `${error.field.join(".")}: ` : ""}${error.message}`)
    .join(" | ");
}

function partitionMetafieldUserErrors(userErrors = [], entryCount = 0) {
  const failedIndexes = new Set();
  const nonEntryErrors = [];

  for (const error of Array.isArray(userErrors) ? userErrors : []) {
    const field = Array.isArray(error?.field) ? error.field : [];
    const maybeIndex = field[0] === "metafields" ? Number(field[1]) : Number.NaN;
    if (Number.isInteger(maybeIndex) && maybeIndex >= 0 && maybeIndex < entryCount) {
      failedIndexes.add(maybeIndex);
      continue;
    }

    nonEntryErrors.push(error);
  }

  return { failedIndexes, nonEntryErrors };
}

function computeCliRetryDelayMs(attempt) {
  const jitterMs = Math.floor(Math.random() * 500);
  return Math.min(60_000, 1500 * 2 ** attempt + jitterMs);
}

async function runShopifyStoreGraphQL(query, variables = {}, { allowMutations = false } = {}) {
  const serializedVariables = variables && Object.keys(variables).length ? variables : null;
  const tempDir = await mkdtemp(join(tmpdir(), "salt-shopify-cli-"));
  const queryFile = join(tempDir, "operation.graphql");
  const outputFile = join(tempDir, "result.json");
  const variableFile = join(tempDir, "variables.json");

  try {
    await writeFile(queryFile, query, "utf8");
    if (serializedVariables) {
      await writeFile(variableFile, JSON.stringify(serializedVariables, null, 2), "utf8");
    }

    const args = [
      "store",
      "execute",
      "--store",
      SHOP_DOMAIN,
      "--version",
      SHOPIFY_ADMIN_API_VERSION,
      "--query-file",
      queryFile,
      "--output-file",
      outputFile,
      "--json",
    ];

    if (serializedVariables) {
      args.push("--variable-file", variableFile);
    }

    if (allowMutations) {
      args.push("--allow-mutations");
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await execFileAsync("shopify", args, {
          env: getShopifyCliEnv(),
          maxBuffer: 10 * 1024 * 1024,
        });
        break;
      } catch (error) {
        if (attempt < 4 && isRetryableShopifyCliError(error)) {
          const delayMs = computeCliRetryDelayMs(attempt);
          process.stdout.write(
            `Shopify CLI request failed; retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt + 1}/4)\n`,
          );
          await sleep(delayMs);
          continue;
        }

        throw error;
      }
    }

    const rawOutput = await readFile(outputFile, "utf8");
    const parsedOutput = JSON.parse(rawOutput);
    if (Array.isArray(parsedOutput.errors) && parsedOutput.errors.length) {
      const message = parsedOutput.errors.map((entry) => entry.message || "Unknown GraphQL error").join(" | ");
      throw new Error(`Shopify CLI GraphQL errors for ${SHOP_DOMAIN}: ${message}`);
    }

    return parsedOutput.data || parsedOutput || {};
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function parseBadgeNumber(html, pattern) {
  const match = String(html || "").match(pattern);
  if (!match?.[1]) {
    return 0;
  }

  const normalized = match[1].replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeJudgeMeHtml(raw) {
  if (!raw) {
    return "";
  }

  return raw
    .replace(/<style[^>]*jdgm-temp-hiding-style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(
      /(<div[^>]*class=['"][^'"]*jdgm-(?:rev-widg|prev-badge)[^'"]*['"][^>]*?)\sstyle=['"]display:\s*none;?['"]/gi,
      "$1",
    );
}

const PRODUCT_CUSTOM_DATA_QUERY = /* GraphQL */ `
  query ProductCustomData($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        legacyResourceId
        handle
        title
        category {
          id
          name
          fullName
        }
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
        searchProductBoosts: metafield(
          namespace: "shopify--discovery--product_search_boost"
          key: "queries"
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
        disclosures: metafield(namespace: "shopify", key: "disclosure") {
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

const PRODUCT_CATALOG_QUERY = /* GraphQL */ `
  query ProductMetafieldCatalog($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: ID) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        legacyResourceId
        handle
        title
        descriptionHtml
        productType
        vendor
        tags
        status
        createdAt
        updatedAt
        publishedAt
        variants(first: 1) {
          nodes {
            id
            legacyResourceId
            title
            price
            compareAtPrice
            availableForSale
            sku
            barcode
          }
        }
      }
    }
  }
`;

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

function parseRatingValue(value) {
  if (value && typeof value === "object") {
    if (value.value != null) {
      return Number(value.value);
    }

    if (value.rating != null) {
      return Number(value.rating);
    }
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeLiveProductCustomDataNode(node) {
  if (!node) {
    return null;
  }

  return normalizeProductCustomData({
    subtitle: node.subtitle?.jsonValue ?? node.subtitle?.value ?? null,
    badgeText: node.badgeText?.jsonValue ?? node.badgeText?.value ?? null,
    highlights: normalizeStringList(node.highlights?.jsonValue ?? node.highlights?.value ?? []),
    collectionSignal: node.collectionSignal?.jsonValue ?? node.collectionSignal?.value ?? null,
    rating: parseRatingValue(node.rating?.jsonValue ?? node.rating?.value ?? null),
    ratingCount: node.ratingCount?.jsonValue ?? node.ratingCount?.value ?? null,
    relatedProductsDisplay: node.relatedProductsDisplay?.jsonValue ?? node.relatedProductsDisplay?.value ?? null,
    relatedProducts: normalizeMetafieldReferenceList(node.relatedProducts?.references?.nodes || []),
    complementaryProducts: normalizeMetafieldReferenceList(node.complementaryProducts?.references?.nodes || []),
    searchProductBoosts: normalizeStringList(node.searchProductBoosts?.jsonValue ?? node.searchProductBoosts?.value ?? []),
    googleCustomProduct: parseBooleanValue(node.googleCustomProduct?.jsonValue ?? node.googleCustomProduct?.value ?? null),
    shopChannelMinimumQuantity:
      node.shopChannelMinimumQuantity?.jsonValue ?? node.shopChannelMinimumQuantity?.value ?? null,
    diaperType:
      node.diaperType?.jsonValue ??
      node.diaperType?.value ??
      (Array.isArray(node.diaperType?.references?.nodes) && node.diaperType.references.nodes.length
        ? node.diaperType.references.nodes
        : null) ??
      null,
  });
}

async function fetchLiveProductCustomDataMap(products) {
  const productIds = Array.isArray(products)
    ? products
        .map((product) => toShopifyGid("Product", product.id))
        .filter(Boolean)
    : [];

  const fingerprint = `${productIds.length}:${productIds[0] || ""}:${productIds.at(-1) || ""}`;
  try {
    const checkpoint = await loadJson(PRODUCT_CUSTOM_DATA_CHECKPOINT, "metafield custom-data checkpoint");
    const age = Date.now() - new Date(checkpoint?.generatedAt || 0).getTime();
    if (
      checkpoint?.complete &&
      checkpoint?.fingerprint === fingerprint &&
      Number.isFinite(age) &&
      age >= 0 &&
      age < 6 * 60 * 60 * 1000 &&
      Array.isArray(checkpoint.records)
    ) {
      process.stdout.write(`Using fresh metafield readback checkpoint for ${checkpoint.records.length} products\n`);
      return new Map(checkpoint.records);
    }
  } catch {
    // Missing or stale checkpoints fall through to live Shopify reads.
  }

  const records = new Map();
  const batches = chunkArray(productIds, 50);
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    if (!batch.length) {
      continue;
    }

    const payload = await runShopifyStoreGraphQL(PRODUCT_CUSTOM_DATA_QUERY, {
      ids: batch,
    });

    const nodes = Array.isArray(payload?.nodes) ? payload.nodes : [];
    for (const node of nodes) {
      if (!node?.legacyResourceId) {
        continue;
      }

      const customData = normalizeLiveProductCustomDataNode(node) || normalizeProductCustomData({});
      records.set(Number(node.legacyResourceId), {
        customData,
        category: node.category
          ? {
              id: String(node.category.id || ""),
              name: String(node.category.name || ""),
              fullName: String(node.category.fullName || ""),
            }
          : null,
        disclosures: normalizeMetafieldReferenceList(node.disclosures?.references?.nodes || []),
      });
    }

    if ((batchIndex + 1) % 10 === 0 || batchIndex + 1 === batches.length) {
      process.stdout.write(`Read live metafields batch ${batchIndex + 1}/${batches.length} (${records.size} products)\n`);
    }
  }

  await mkdir(dirname(PRODUCT_CUSTOM_DATA_CHECKPOINT), { recursive: true });
  await writeFile(
    PRODUCT_CUSTOM_DATA_CHECKPOINT,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      complete: true,
      fingerprint,
      records: Array.from(records.entries()),
    })}\n`,
    "utf8",
  );

  return records;
}

function normalizeLiveCatalogProduct(node) {
  const id = Number(node?.legacyResourceId || 0);
  if (!id || !node?.handle) {
    return null;
  }

  const variants = (node.variants?.nodes || []).map((variant) => ({
    id: Number(variant.legacyResourceId || 0),
    title: String(variant.title || ""),
    price: String(variant.price || ""),
    compare_at_price: variant.compareAtPrice == null ? null : String(variant.compareAtPrice),
    available: Boolean(variant.availableForSale),
    sku: String(variant.sku || ""),
    barcode: String(variant.barcode || ""),
  }));

  return {
    id,
    admin_graphql_api_id: String(node.id || toShopifyGid("Product", id)),
    handle: normalizeHandleValue(node.handle),
    title: String(node.title || ""),
    body_html: String(node.descriptionHtml || ""),
    product_type: String(node.productType || ""),
    vendor: String(node.vendor || ""),
    tags: Array.isArray(node.tags) ? node.tags : [],
    status: String(node.status || "").toLowerCase(),
    created_at: node.createdAt || null,
    updated_at: node.updatedAt || null,
    published_at: node.publishedAt || null,
    variants,
    images: [],
    image: null,
  };
}

async function fetchLiveProductCatalog() {
  let checkpoint = null;
  try {
    checkpoint = await loadJson(PRODUCT_CATALOG_CHECKPOINT, "metafield live catalog checkpoint");
  } catch {
    checkpoint = null;
  }

  const checkpointAge = Date.now() - new Date(checkpoint?.generatedAt || 0).getTime();
  const checkpointIsFresh = Number.isFinite(checkpointAge) && checkpointAge >= 0 && checkpointAge < 6 * 60 * 60 * 1000;
  if (checkpointIsFresh && checkpoint?.complete && Array.isArray(checkpoint.products) && checkpoint.products.length) {
    process.stdout.write(`Using fresh Admin product catalog checkpoint with ${checkpoint.products.length} products\n`);
    return checkpoint.products;
  }

  const products = checkpointIsFresh && !checkpoint?.complete && Array.isArray(checkpoint?.products)
    ? checkpoint.products
    : [];
  let after = products.length ? checkpoint?.endCursor || null : null;
  let page = Number(checkpointIsFresh ? checkpoint?.page || 0 : 0);

  if (products.length) {
    process.stdout.write(`Resuming Admin product catalog after ${products.length} products\n`);
  }

  do {
    const payload = await runShopifyStoreGraphQL(PRODUCT_CATALOG_QUERY, { first: 250, after });
    const connection = payload?.products || {};
    const pageProducts = (connection.nodes || []).map(normalizeLiveCatalogProduct).filter(Boolean);
    products.push(...pageProducts);
    page += 1;
    process.stdout.write(`Fetched Admin product catalog page ${page}: ${pageProducts.length} (${products.length} total)\n`);
    after = connection.pageInfo?.hasNextPage ? connection.pageInfo.endCursor : null;

    await mkdir(dirname(PRODUCT_CATALOG_CHECKPOINT), { recursive: true });
    await writeFile(
      PRODUCT_CATALOG_CHECKPOINT,
      `${JSON.stringify({
        generatedAt: checkpointIsFresh && checkpoint?.generatedAt ? checkpoint.generatedAt : new Date().toISOString(),
        complete: !after,
        page,
        endCursor: after,
        products,
      })}\n`,
      "utf8",
    );
  } while (after);

  return products;
}

function parseJudgeMeBadge(html) {
  const rating =
    parseBadgeNumber(html, /data-average-rating=["']([0-5](?:\.\d+)?)["']/i) ||
    parseBadgeNumber(html, /data-score=["']([0-5](?:\.\d+)?)["']/i) ||
    parseBadgeNumber(html, /\b([0-5](?:\.\d+)?)\s*(?:out of 5|stars?)/i);
  const reviewCount =
    parseBadgeNumber(html, /data-number-of-reviews=["']([0-9,]+)["']/i) ||
    parseBadgeNumber(html, /data-number-of-ratings=["']([0-9,]+)["']/i) ||
    parseBadgeNumber(html, /\b([0-9][0-9,]*)\s+(?:reviews?|ratings?)\b/i);

  if (!rating && !reviewCount) {
    return null;
  }

  return {
    rating: Math.min(5, Math.max(0, rating || 0)),
    reviewCount: Math.max(0, reviewCount || 0),
  };
}

function parseJudgeMeWidgetSummary(html) {
  if (!html || typeof DOMParser === "undefined") {
    return null;
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const widgetRoot = doc.querySelector(".jdgm-rev-widg");
  const rootCount = Number(widgetRoot?.getAttribute("data-number-of-reviews") || 0);
  const rootAverage = Number(widgetRoot?.getAttribute("data-average-rating") || 0);

  const reviewNodes = Array.from(doc.querySelectorAll(".jdgm-rev"));
  const reviewCountFromNodes = reviewNodes.length;
  const averageFromNodes =
    reviewCountFromNodes > 0
      ? reviewNodes.reduce((sum, node) => {
          const score = Number(node.querySelector(".jdgm-rev__rating")?.getAttribute("data-score") || 0);
          return sum + (Number.isFinite(score) ? score : 0);
        }, 0) / reviewCountFromNodes
      : 0;

  const reviewCount = Math.max(rootCount, reviewCountFromNodes);
  const rating =
    reviewCountFromNodes >= rootCount && averageFromNodes > 0
      ? averageFromNodes
      : rootAverage > 0
        ? rootAverage
        : averageFromNodes;

  if (!reviewCount && !rating) {
    return null;
  }

  return {
    rating: Math.min(5, Math.max(0, rating || 0)),
    reviewCount: Math.max(0, reviewCount || 0),
  };
}

function buildJudgeMeProxyUrl(pathname, searchParams) {
  const cleanPath = String(pathname || "").replace(/^\/+/, "");
  const baseUrl = JUDGEME_PROXY_BASE_URL.replace(/\/+$/, "");
  const url = new URL(`${baseUrl}/api/judgeme/${cleanPath}`);

  if (searchParams) {
    searchParams.forEach((value, key) => {
      if (key === "t") {
        return;
      }

      url.searchParams.append(key, value);
    });
  }

  return url.toString();
}

async function requestJudgeMeSummary(productId, shopDomain) {
  if (!JUDGEME_PUBLIC_TOKEN) {
    return null;
  }

  const baseParams = new URLSearchParams({
    public_token: JUDGEME_PUBLIC_TOKEN,
    api_token: JUDGEME_PUBLIC_TOKEN,
    shop_domain: shopDomain,
    external_id: String(productId),
    t: String(Date.now()),
  });

  const previewEndpoint = buildJudgeMeProxyUrl("widgets/preview_badge", baseParams);
  const widgetEndpoint = buildJudgeMeProxyUrl(
    "widgets/product_review",
    new URLSearchParams({
      ...Object.fromEntries(baseParams.entries()),
      page: "1",
      per_page: "100",
    }),
  );

  const [previewResponse, widgetResponse] = await Promise.all([
    fetch(previewEndpoint, { credentials: "omit" }),
    fetch(widgetEndpoint, { credentials: "omit" }),
  ]);

  if (!previewResponse.ok && !widgetResponse.ok) {
    return null;
  }

  const previewPayload = previewResponse.ok ? await previewResponse.json() : {};
  const widgetPayload = widgetResponse.ok ? await widgetResponse.json() : {};
  const badgeSummary = parseJudgeMeBadge(normalizeJudgeMeHtml(String(previewPayload.badge || "")));
  const widgetSummary = parseJudgeMeWidgetSummary(normalizeJudgeMeHtml(String(widgetPayload.widget || "")));

  if (!badgeSummary && !widgetSummary) {
    return null;
  }

  const badgeCount = badgeSummary?.reviewCount || 0;
  const widgetCount = widgetSummary?.reviewCount || 0;
  const finalReviewCount = Math.max(badgeCount, widgetCount);
  const finalRating =
    widgetCount >= badgeCount && (widgetSummary?.rating || 0) > 0
      ? Number(widgetSummary?.rating || 0)
      : (badgeSummary?.rating || 0) > 0
        ? Number(badgeSummary?.rating || 0)
        : Number(widgetSummary?.rating || 0);

  return {
    productId,
    rating: Math.min(5, Math.max(0, finalRating || 0)),
    reviewCount: Math.max(0, finalReviewCount || 0),
    source: "judgeme",
  };
}

async function collectJudgeMeSummaries(products) {
  const summaries = new Map();
  if (!JUDGEME_FETCH_ENABLED || !JUDGEME_PUBLIC_TOKEN) {
    return summaries;
  }

  const candidates = [];
  for (const product of products) {
    const existing = normalizeProductCustomData({
      ...(product.customData || {}),
      rating: product.customData?.rating ?? product.average_rating ?? null,
      ratingCount: product.customData?.ratingCount ?? product.total_reviews ?? null,
    });

    const missingRating = existing.rating == null;
    const missingCount = existing.ratingCount == null;
    if (missingRating || missingCount) {
      candidates.push({ product, missingRating, missingCount });
    }
  }

  if (!candidates.length) {
    return summaries;
  }

  for (const shopDomain of JUDGEME_SHOP_DOMAINS) {
    const unresolved = candidates.filter((entry) => !summaries.has(entry.product.id));

    if (!unresolved.length) {
      break;
    }

    const parallelism = Math.max(1, Math.min(JUDGEME_CONCURRENCY, unresolved.length));
    let index = 0;

    const runWorker = async () => {
      while (index < unresolved.length) {
        const current = unresolved[index];
        index += 1;

        try {
          const summary = await requestJudgeMeSummary(current.product.id, shopDomain);
          if (summary) {
            summaries.set(current.product.id, summary);
          }
        } catch {
          // Ignore transient Judge.me failures and keep the existing snapshot data.
        }
      }
    };

    await Promise.all(Array.from({ length: parallelism }, () => runWorker()));
  }

  return summaries;
}

async function fetchLiveShopRecord() {
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
}

async function loadJson(filePath, label) {
  const raw = await readFile(filePath, "utf8");
  const payload = JSON.parse(raw);
  if (!payload) {
    throw new Error(`Unable to parse ${label} at ${filePath}`);
  }

  return payload;
}

async function loadOptionalJson(filePath) {
  try {
    return await loadJson(filePath, "Shopify SEO live catalog");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    process.stdout.write(`Optional live catalog unavailable at ${filePath}: ${error.message}\n`);
    return null;
  }
}

function mergeReleaseCatalogProducts(localProducts, liveCatalogProducts) {
  const local = Array.isArray(localProducts) ? [...localProducts] : [];
  const handles = new Set(local.map((product) => normalizeHandleValue(product?.handle || "")).filter(Boolean));
  const liveOnly = (Array.isArray(liveCatalogProducts) ? liveCatalogProducts : []).filter((product) => {
    const handle = normalizeHandleValue(product?.handle || "");
    return handle && !handles.has(handle);
  });

  return [...local, ...liveOnly];
}

function filterProducts(products, { productIds, productHandles, limitProducts }) {
  let filtered = Array.isArray(products) ? [...products] : [];

  if (Array.isArray(productIds) && productIds.length) {
    const idSet = new Set(productIds.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0));
    filtered = filtered.filter((product) => idSet.has(Number(product?.id || 0)));
  }

  if (Array.isArray(productHandles) && productHandles.length) {
    const handleSet = new Set(productHandles.map((value) => normalizeHandleValue(value)).filter(Boolean));
    filtered = filtered.filter((product) => handleSet.has(normalizeHandleValue(product?.handle || "")));
  }

  filtered.sort((left, right) => Number(left?.id || 0) - Number(right?.id || 0));

  if (Number.isFinite(limitProducts) && limitProducts > 0) {
    filtered = filtered.slice(0, limitProducts);
  }

  return filtered;
}

async function discoverDiaperTypeOptions() {
  const definitionQuery = /* GraphQL */ `
    query DiaperTypeDefinition($id: ID!) {
      metaobjectDefinition(id: $id) {
        id
        name
        type
      }
    }
  `;

  try {
    const definitionPayload = await runShopifyStoreGraphQL(definitionQuery, {
      id: DIAPER_METAOBJECT_DEFINITION_ID,
    });
    const definition = definitionPayload.metaobjectDefinition;
    const metaobjectType = String(definition?.type || "").trim();
    if (!metaobjectType) {
      return {
        discovered: false,
        definition: null,
        options: [],
      };
    }

    const metaobjectsQuery = /* GraphQL */ `
      query DiaperTypeMetaobjects($type: String!, $first: Int!) {
        metaobjects(type: $type, first: $first) {
          nodes {
            id
            handle
            displayName
            type
          }
        }
      }
    `;

    const metaobjectPayload = await runShopifyStoreGraphQL(metaobjectsQuery, {
      type: metaobjectType,
      first: 100,
    });
    const nodes = Array.isArray(metaobjectPayload?.metaobjects?.nodes) ? metaobjectPayload.metaobjects.nodes : [];

    return {
      discovered: nodes.length > 0,
      definition,
      options: nodes.map((node) => ({
        id: String(node?.id || "").trim(),
        handle: String(node?.handle || "").trim(),
        displayName: String(node?.displayName || "").trim(),
        type: String(node?.type || "").trim(),
      })),
    };
  } catch (error) {
    process.stdout.write(`Diaper type discovery skipped: ${error.message}\n`);
    return {
      discovered: false,
      definition: null,
      options: [],
    };
  }
}

const DISCLOSURE_METAOBJECT_TYPES = [
  "shopify--disclosure-us-cpsc-choking_small_parts",
  "shopify--disclosure-us-cpsc-choking_balloons",
  "shopify--disclosure-us-cpsc-choking_marbles",
  "shopify--disclosure-us-cpsc-choking_small_balls",
  "shopify--disclosure-us-ca-prop65-cancer",
  "shopify--disclosure-us-ca-prop65-reproductive",
  "shopify--disclosure-us-ca-prop65-cancer_reproductive",
  "shopify--disclosure-us-ca-prop65-alcohol",
  "shopify--disclosure-custom",
];

async function discoverDisclosureOptions() {
  const query = /* GraphQL */ `
    query DisclosureMetaobjects($type: String!, $first: Int!) {
      metaobjects(type: $type, first: $first) {
        nodes {
          id
          handle
          displayName
          type
        }
      }
    }
  `;
  const options = [];

  for (const type of DISCLOSURE_METAOBJECT_TYPES) {
    try {
      const payload = await runShopifyStoreGraphQL(query, { type, first: 100 });
      for (const node of payload?.metaobjects?.nodes || []) {
        if (node?.id) {
          options.push({
            id: String(node.id),
            handle: String(node.handle || ""),
            displayName: String(node.displayName || ""),
            type: String(node.type || type),
          });
        }
      }
    } catch (error) {
      process.stdout.write(`Disclosure discovery skipped for ${type}: ${error.message}\n`);
    }
  }

  return { discovered: options.length > 0, options };
}

function buildCategoryPlans(products) {
  return (Array.isArray(products) ? products : [])
    .filter((product) => !product?.shopifyCategory?.id)
    .map((product) => ({ product, category: inferShopifyTaxonomyCategory(product) }))
    .filter((entry) => entry.category)
    .map(({ product, category }) => ({
      productId: Number(product.id),
      productGid: toShopifyGid("Product", product.id),
      handle: normalizeHandleValue(product.handle || ""),
      title: String(product.title || ""),
      categoryId: category.id,
      categoryName: category.name,
      confidence: category.confidence,
      reason: category.reason,
    }));
}

async function applyCategoryPlans(plans) {
  const results = [];
  const batches = chunkArray(plans, 15);

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    const declarations = batch.map((_, index) => `$p${index}: ProductUpdateInput!`).join(", ");
    const fields = batch
      .map(
        (_, index) => `p${index}: productUpdate(product: $p${index}) {
          product { id category { id name fullName } }
          userErrors { field message }
        }`,
      )
      .join("\n");
    const variables = Object.fromEntries(
      batch.map((plan, index) => [`p${index}`, { id: plan.productGid, category: plan.categoryId }]),
    );
    const payload = await runShopifyStoreGraphQL(
      `mutation ProductCategoryBackfill(${declarations}) { ${fields} }`,
      variables,
      { allowMutations: true },
    );

    for (let index = 0; index < batch.length; index += 1) {
      const plan = batch[index];
      const response = payload?.[`p${index}`] || {};
      const errors = Array.isArray(response.userErrors) ? response.userErrors : [];
      if (errors.length) {
        throw new Error(`${plan.handle}: category update failed: ${formatMetafieldUserErrors(errors)}`);
      }
      if (response.product?.category?.id !== plan.categoryId) {
        throw new Error(`${plan.handle}: category readback mismatch`);
      }
      results.push({
        ...plan,
        verifiedCategoryId: response.product.category.id,
        verifiedAt: new Date().toISOString(),
      });
    }

    process.stdout.write(`Category batch ${batchIndex + 1}/${batches.length} verified (${batch.length} products)\n`);
  }

  return results;
}

async function writeManifest(filePath, manifest) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function applySingleBatch(batch, batchIndex, batchTotal) {
  const mutation = /* GraphQL */ `
    mutation BackfillProductMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
          value
          updatedAt
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;

  let pendingEntries = [...batch.entries];
  let appliedEntries = 0;
  const failedWrites = [];
  const batchLabel =
    Array.isArray(batch.ownerDescriptors) && batch.ownerDescriptors.length
      ? `${batch.ownerDescriptors.length} owner group(s)`
      : `${batch.productIds?.length || 0} product(s)`;

  process.stdout.write(
    `Applying batch ${batchIndex + 1}/${batchTotal} with ${batch.entries.length} metafield(s) across ${batchLabel}\n`,
  );

  while (pendingEntries.length) {
    const payload = await runShopifyStoreGraphQL(
      mutation,
      {
        metafields: pendingEntries.map((entry) => ({
          ownerId: entry.ownerId,
          namespace: entry.namespace,
          key: entry.key,
          type: entry.type,
          value: entry.value,
        })),
      },
      { allowMutations: true },
    );

    const response = payload.metafieldsSet || {};
    const userErrors = Array.isArray(response.userErrors) ? response.userErrors : [];
    if (!userErrors.length) {
      appliedEntries += pendingEntries.length;
      pendingEntries = [];
      break;
    }

    const { failedIndexes, nonEntryErrors } = partitionMetafieldUserErrors(userErrors, pendingEntries.length);
    if (nonEntryErrors.length || !failedIndexes.size) {
      throw new Error(`Shopify metafieldsSet failed for batch ${batchIndex + 1}: ${formatMetafieldUserErrors(userErrors)}`);
    }

    const nextPendingEntries = [];
    pendingEntries.forEach((entry, entryIndex) => {
      if (failedIndexes.has(entryIndex)) {
        failedWrites.push({
          ownerType: entry.ownerType || "PRODUCT",
          ownerId: entry.ownerId,
          ownerHandle: entry.ownerHandle || entry.productHandle || null,
          ownerTitle: entry.ownerTitle || entry.productTitle || null,
          fieldId: entry.fieldId,
          reason: entry.reason,
          error: formatMetafieldUserErrors(
            userErrors.filter((error) => {
              const field = Array.isArray(error?.field) ? error.field : [];
              return field[0] === "metafields" && Number(field[1]) === entryIndex;
            }),
          ),
        });
        return;
      }

      nextPendingEntries.push(entry);
    });

    pendingEntries = nextPendingEntries;

    if (pendingEntries.length) {
      process.stdout.write(
        `Batch ${batchIndex + 1}: skipped ${failedIndexes.size} incompatible metafield(s), retrying ${pendingEntries.length} remaining\n`,
      );
    }
  }

  return {
    batch: batchIndex + 1,
    owners: batch.ownerDescriptors || batch.productIds || [],
    writeCount: appliedEntries,
    metafields: appliedEntries,
    skippedWriteCount: failedWrites.length,
    skippedWrites: failedWrites,
  }
}

async function applyBatches(batches) {
  const results = new Array(batches.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= batches.length) {
        return;
      }

      results[index] = await applySingleBatch(batches[index], index, batches.length);
    }
  };

  const workerCount = Math.min(BACKFILL_APPLY_CONCURRENCY, batches.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results.filter(Boolean);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.productHandlesFile) {
    const rawHandles = await readFile(args.productHandlesFile, "utf8");
    let parsedHandles;
    try {
      parsedHandles = JSON.parse(rawHandles);
    } catch {
      parsedHandles = rawHandles.split(/\r?\n/);
    }
    if (!Array.isArray(parsedHandles)) {
      throw new Error(`Product handles file must contain a JSON array or one handle per line: ${args.productHandlesFile}`);
    }
    args.productHandles.push(...parsedHandles.map((value) => normalizeHandleValue(value)).filter(Boolean));
    args.productHandles = [...new Set(args.productHandles)];
  }
  const productsPath = resolve(args.inputDir, "products.json");
  const releaseCatalogPath =
    process.env.SALT_SHOPIFY_SEO_LIVE_CATALOG || resolve(process.cwd(), "output", ".shopify-seo-live-catalog.json");
  const collectionsPath = resolve(args.inputDir, "collections.json");
  const collectionProductsPath = resolve(args.inputDir, "collection-products.json");
  const shopPath = resolve(args.inputDir, "shop.json");

  const productsPayload = await loadJson(productsPath, "products payload");
  const releaseCatalogPayload = await loadOptionalJson(releaseCatalogPath);
  const collectionsPayload = await loadJson(collectionsPath, "collections payload");
  const collectionProductsPayload = await loadJson(collectionProductsPath, "collection-products payload");
  const shopPayload = await loadJson(shopPath, "shop payload");

  const localProducts = Array.isArray(productsPayload.products) ? productsPayload.products : [];
  const hasExplicitSelection = Boolean(args.productIds.length || args.productHandles.length || args.productHandlesFile);
  const liveCatalogProducts = hasExplicitSelection
    ? releaseCatalogPayload?.products
    : await fetchLiveProductCatalog();
  const allProducts = mergeReleaseCatalogProducts(localProducts, liveCatalogProducts);
  const requestedProducts = filterProducts(allProducts, args);
  if (!requestedProducts.length) {
    throw new Error("No products matched the backfill selection");
  }

  const liveCustomDataMap = await fetchLiveProductCustomDataMap(requestedProducts);
  const selectedProducts = requestedProducts.filter((product) => liveCustomDataMap.has(Number(product.id)));
  if (!selectedProducts.length) {
    throw new Error("No selected products still exist in Shopify");
  }
  const hydratedProducts = selectedProducts.map((product) => {
    const liveRecord = liveCustomDataMap.get(Number(product.id));
    if (!liveRecord) {
      return product;
    }

    return {
      ...product,
      customData: mergeProductCustomData(product.customData, liveRecord.customData),
      shopifyCategory: liveRecord.category,
      disclosures: liveRecord.disclosures,
    };
  });

  const reviewSummaries = args.skipLiveReviews ? new Map() : await collectJudgeMeSummaries(hydratedProducts);
  const diaperDiscovery = await discoverDiaperTypeOptions();
  const disclosureDiscovery = await discoverDisclosureOptions();

  const backfillPlan = buildBackfillPlan({
    products: hydratedProducts,
    collections: Array.isArray(collectionsPayload.collections) ? collectionsPayload.collections : [],
    collectionProducts: collectionProductsPayload,
    reviewSummaries,
    diaperTypeOptions: diaperDiscovery.options,
    disclosureOptions: disclosureDiscovery.options,
  });
  const marketingBackfillPlan = buildMarketingBackfillPlan({
    products: hydratedProducts,
    collections: Array.isArray(collectionsPayload.collections) ? collectionsPayload.collections : [],
    collectionProducts: collectionProductsPayload,
    shop:
      /^gid:\/\/shopify\/Shop\/\d+$/i.test(String(shopPayload?.shop?.id || ""))
        ? shopPayload.shop
        : await fetchLiveShopRecord(),
  });

  const onlyFields = new Set(args.onlyFields);
  const scopeWrites = (plans) =>
    !onlyFields.size
      ? plans
      : plans
          .map((plan) => ({
            ...plan,
            writes: (plan.writes || []).filter((write) => onlyFields.has(write.fieldId)),
          }))
          .filter((plan) => plan.writes.length);
  const productPlans = scopeWrites(backfillPlan.productPlans);
  const marketingPlans = scopeWrites(marketingBackfillPlan.ownerPlans);
  const productBatches = buildMetafieldSetBatches(productPlans, 25);
  const marketingBatches = buildMarketingMetafieldSetBatches(marketingPlans, 25);
  const batches = [...productBatches, ...marketingBatches];
  const categoryPlans = onlyFields.size ? [] : buildCategoryPlans(hydratedProducts);
  const scopedWritesByField = {};
  for (const plan of productPlans) {
    for (const write of plan.writes || []) {
      scopedWritesByField[write.fieldId] = (scopedWritesByField[write.fieldId] || 0) + 1;
    }
  }
  const scopedProductSummary = onlyFields.size
    ? {
        ...backfillPlan.summary,
        productsWithWrites: productPlans.length,
        totalWrites: productPlans.reduce((sum, plan) => sum + plan.writes.length, 0),
        writesByField: scopedWritesByField,
      }
    : backfillPlan.summary;
  const manifest = {
    generatedAt: new Date().toISOString(),
    mode: args.apply ? "apply" : "dry-run",
    dryRun: args.dryRun,
    input: {
      productsPath,
      releaseCatalogPath,
      collectionsPath,
      collectionProductsPath,
      shopPath,
      selection: {
        productIds: args.productIds,
        productHandles: args.productHandles,
        productHandlesFile: args.productHandlesFile || null,
        limitProducts: args.limitProducts,
        onlyFields: args.onlyFields,
        requestedProductCount: requestedProducts.length,
        liveProductCount: selectedProducts.length,
        missingLiveHandles: requestedProducts
          .filter((product) => !liveCustomDataMap.has(Number(product.id)))
          .map((product) => normalizeHandleValue(product.handle || ""))
          .filter(Boolean),
      },
      catalogAugmentedProducts: Math.max(0, allProducts.length - localProducts.length),
    },
    discovery: {
      diaperType: diaperDiscovery.discovered
        ? {
            discovered: true,
            definitionId: diaperDiscovery.definition?.id || null,
            definitionName: diaperDiscovery.definition?.name || null,
            type: diaperDiscovery.definition?.type || null,
            optionCount: diaperDiscovery.options.length,
          }
        : {
            discovered: false,
            definitionId: null,
            definitionName: null,
            type: null,
            optionCount: 0,
          },
      disclosures: {
        discovered: disclosureDiscovery.discovered,
        optionCount: disclosureDiscovery.options.length,
        policy: "approved references plus explicit warning evidence only",
      },
      skippedDefinitions: disclosureDiscovery.discovered ? [] : ["Disclosures: no approved reference objects"],
    },
    summary: {
      ...scopedProductSummary,
      marketing: marketingBackfillPlan.summary,
      batchesPlanned: batches.length,
      productBatchesPlanned: productBatches.length,
      marketingBatchesPlanned: marketingBatches.length,
      categoryUpdatesPlanned: categoryPlans.length,
    },
    products: productPlans,
    marketing: marketingPlans,
    categories: categoryPlans,
    batches: batches.map((batch, index) => ({
      batch: index + 1,
      owners: batch.ownerDescriptors || batch.productIds || [],
      writeCount: batch.entries.length,
      writes: batch.entries.map((entry) => ({
        ownerType: entry.ownerType || "PRODUCT",
        ownerId: entry.ownerId,
        ownerHandle: entry.ownerHandle || entry.productHandle || null,
        ownerTitle: entry.ownerTitle || entry.productTitle || null,
        fieldId: entry.fieldId,
        namespace: entry.namespace,
        key: entry.key,
        type: entry.type,
        reason: entry.reason,
      })),
    })),
  };

  await writeManifest(args.outputFile, manifest);
  process.stdout.write(`Manifest written to ${args.outputFile}\n`);
  process.stdout.write(
    `Dry-run plan: ${scopedProductSummary.totalWrites + marketingPlans.reduce((sum, plan) => sum + plan.writes.length, 0)} metafield write(s) and ${categoryPlans.length} category update(s) across ${scopedProductSummary.productsWithWrites} product(s) and ${marketingBackfillPlan.summary.scannedCollections} collection(s)\n`,
  );

  if (!args.apply) {
    process.stdout.write("Dry-run complete. No Shopify writes were made.\n");
    return;
  }

  if (!batches.length && !categoryPlans.length) {
    process.stdout.write("No metafield or category writes were needed.\n");
    return;
  }

  const applyResults = batches.length ? await applyBatches(batches) : [];
  const categoryResults = categoryPlans.length ? await applyCategoryPlans(categoryPlans) : [];
  manifest.applied = {
    completedAt: new Date().toISOString(),
    batchCount: applyResults.length,
    writeCount: applyResults.reduce((sum, entry) => sum + entry.writeCount, 0),
    skippedWriteCount: applyResults.reduce((sum, entry) => sum + (entry.skippedWriteCount || 0), 0),
    batches: applyResults,
    categoryCount: categoryResults.length,
    categories: categoryResults,
  };
  await writeManifest(args.outputFile, manifest);
  await rm(PRODUCT_CUSTOM_DATA_CHECKPOINT, { force: true });
  process.stdout.write(`Apply complete. Updated manifest written to ${args.outputFile}\n`);
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
