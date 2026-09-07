#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";

import {
  DEFAULT_COST_BASED_BANDS,
  DEFAULT_COST_BASED_CLOTHING_MIN_CONTRIBUTION_MARGIN,
  DEFAULT_COST_BASED_MIN_CONTRIBUTION_MARGIN,
  DEFAULT_COST_BASED_OVERHEAD,
  DEFAULT_COST_BASED_POLICY_ID,
  buildCostBasedVariantPricePlan,
  buildVariantCostPriceAlignmentPlan,
  costBasedTargetPrice,
  costProtectedMinimumPrice,
  isClothingProduct,
} from "../src/lib/shopify-variant-cost-pricing.js";
import { validateCostBasedPricingApproval } from "../src/lib/shopify-cost-based-pricing-approval.js";
import { normalizePlainText } from "../src/lib/shopify-seo-batch.js";
import { createShopifyAdminGraphQLClient } from "./shopify-admin-graphql-client.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const execFileAsync = promisify(execFile);
const defaultOutputPath = resolve(rootDir, "output", "shopify-variant-cost-price-alignment-manifest.json");
const client = createShopifyAdminGraphQLClient({ rootDir, agentName: "variant-cost-price-alignment" });
const costBasedApprovalPath = resolve(rootDir, "docs", "catalog-cost-based-pricing-approval.json");
const pricingPolicy = String(process.env.SALT_VARIANT_COST_PRICING_POLICY || "legacy-peer-alignment").trim();
const tolerance = Math.max(0, Number(process.env.SALT_VARIANT_COST_TOLERANCE || 2));
const priceFloor = Math.max(0, Number(process.env.SALT_CATALOG_PRICE_FLOOR || 35));
const campaignCostPerOrder = Math.max(0, Number(process.env.SALT_VARIANT_COST_CAMPAIGN_COST_PER_ORDER || 18));
const costBasedOverhead = Math.max(0, Number(process.env.SALT_VARIANT_COST_OVERHEAD || DEFAULT_COST_BASED_OVERHEAD));
const minContributionMargin = Math.min(
  0.99,
  Math.max(0, Number(process.env.SALT_VARIANT_COST_MIN_CONTRIBUTION_MARGIN || DEFAULT_COST_BASED_MIN_CONTRIBUTION_MARGIN)),
);
const clothingMinContributionMargin = Math.min(
  0.99,
  Math.max(0, Number(process.env.SALT_VARIANT_COST_CLOTHING_MIN_CONTRIBUTION_MARGIN || DEFAULT_COST_BASED_CLOTHING_MIN_CONTRIBUTION_MARGIN)),
);
const costBasedPolicyId = String(process.env.SALT_VARIANT_COST_POLICY_ID || DEFAULT_COST_BASED_POLICY_ID).trim();
const costBasedBands = parseCostBands(process.env.SALT_VARIANT_COST_BANDS_JSON);
const fetchMode = String(process.env.SALT_VARIANT_COST_FETCH_MODE || (pricingPolicy === "cost-band-v2" ? "bulk" : "paged")).trim();
const requestedBulkOperationId = String(process.env.SALT_VARIANT_COST_BULK_OPERATION_ID || "").trim();

function parseCostBands(raw) {
  if (!raw) return DEFAULT_COST_BASED_BANDS;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`SALT_VARIANT_COST_BANDS_JSON is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error("SALT_VARIANT_COST_BANDS_JSON must be a non-empty array.");
  }
  return parsed;
}

async function verifyCostBasedPricingApproval() {
  const approval = await readFile(costBasedApprovalPath, "utf8").then(JSON.parse).catch((error) => {
    throw new Error(`Cost-based pricing approval could not be read: ${error.message}`);
  });
  return validateCostBasedPricingApproval(approval);
}
const pageSize = Math.max(1, Math.min(250, Number(process.env.SALT_VARIANT_COST_PAGE_SIZE || 100)));
const variantPageSize = Math.max(1, Math.min(250, Number(process.env.SALT_VARIANT_COST_VARIANT_PAGE_SIZE || 50)));
const readbackAttempts = Math.max(1, Number(process.env.SALT_VARIANT_COST_READBACK_ATTEMPTS || 5));
const applyConcurrency = Math.max(1, Math.min(4, Number(process.env.SALT_VARIANT_COST_APPLY_CONCURRENCY || 2)));
const readConcurrency = Math.max(1, Math.min(6, Number(process.env.SALT_VARIANT_COST_READ_CONCURRENCY || 4)));
const bulkInputMaxBytes = Math.max(1_000_000, Number(process.env.SALT_VARIANT_COST_BULK_INPUT_MAX_BYTES || 10_000_000));
const bulkVariantsPerInput = Math.max(1, Math.min(2048, Number(process.env.SALT_VARIANT_COST_BULK_VARIANTS_PER_INPUT || 100)));
const priceOutlierRatio = Math.max(1, Number(process.env.SALT_VARIANT_PRICE_OUTLIER_RATIO || 2.5));
const priceOutlierMinimumDelta = Math.max(0, Number(process.env.SALT_VARIANT_PRICE_OUTLIER_MINIMUM_DELTA || 25));
const variantPeerOutlierRatio = Math.max(1, Number(process.env.SALT_VARIANT_PEER_OUTLIER_RATIO || 2.5));
const variantPeerOutlierMinimumDelta = Math.max(0, Number(process.env.SALT_VARIANT_PEER_OUTLIER_MINIMUM_DELTA || 25));

const PRODUCTS_QUERY = /* GraphQL */ `
  query VariantCostPriceProducts($first: Int!, $variantFirst: Int!, $after: String) {
    products(first: $first, after: $after, query: "status:active") {
      nodes {
        id
        handle
        title
        variants(first: $variantFirst) {
          nodes {
            id
            title
            sku
            price
            compareAtPrice
            inventoryItem { unitCost { amount currencyCode } }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const VARIANT_CONTINUATION_QUERY = /* GraphQL */ `
  query VariantCostPriceVariantContinuation($id: ID!, $first: Int!, $after: String) {
    product(id: $id) {
      variants(first: $first, after: $after) {
        nodes {
          id
          title
          sku
          price
          compareAtPrice
          inventoryItem { unitCost { amount currencyCode } }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const PRODUCT_QUERY = /* GraphQL */ `
  query VariantCostPriceProduct($id: ID!) {
    product(id: $id) {
      id
      handle
      title
      variants(first: 250) {
        nodes {
          id
          title
          sku
          price
          compareAtPrice
          inventoryItem { unitCost { amount currencyCode } }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const UPDATE_MUTATION = /* GraphQL */ `
  mutation VariantCostPriceUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      product { id }
      userErrors { field message code }
    }
  }
`;

const BULK_OPERATION_RUN_QUERY = /* GraphQL */ `
  mutation VariantCostPriceRunBulkQuery($query: String!) {
    bulkOperationRunQuery(query: $query) {
      bulkOperation { id status }
      userErrors { field message }
    }
  }
`;

const BULK_OPERATION_STATUS_QUERY = /* GraphQL */ `
  query VariantCostPriceBulkStatus($id: ID!) {
    bulkOperation(id: $id) {
      id status errorCode objectCount url partialDataUrl createdAt completedAt
    }
  }
`;

const STAGED_UPLOAD_CREATE_MUTATION = /* GraphQL */ `
  mutation VariantCostPriceStagedUpload($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url parameters { name value } }
      userErrors { field message }
    }
  }
`;

const BULK_OPERATION_RUN_MUTATION = /* GraphQL */ `
  mutation VariantCostPriceRunBulkMutation($mutation: String!, $stagedUploadPath: String!) {
    bulkOperationRunMutation(mutation: $mutation, stagedUploadPath: $stagedUploadPath) {
      bulkOperation { id status }
      userErrors { field message }
    }
  }
`;

const BULK_MUTATION_STATUS_QUERY = /* GraphQL */ `
  query VariantCostPriceBulkMutationStatus($id: ID!) {
    bulkOperation(id: $id) {
      id status errorCode objectCount url partialDataUrl completedAt
    }
  }
`;

const BULK_VARIANT_PRICE_MUTATION = /* GraphQL */ `
  mutation VariantCostPriceBulk($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      product { id }
      userErrors { field message code }
    }
  }
`;

const BULK_ACTIVE_PRODUCTS_QUERY = /* GraphQL */ `
  {
    products(query: "status:active") {
      edges {
        node {
          id
          handle
          title
          variants {
            edges {
              node {
                id
                title
                sku
                price
                compareAtPrice
                inventoryItem { unitCost { amount currencyCode } }
              }
            }
          }
        }
      }
    }
  }
`;

function parseArgs(argv) {
  const args = { mode: "dry-run", output: defaultOutputPath };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--apply") args.mode = "apply";
    else if (token === "--verify") args.mode = "verify";
    else if (token === "--dry-run") args.mode = "dry-run";
    else if (token === "--output" && argv[index + 1]) args.output = resolve(rootDir, argv[++index]);
  }
  return args;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function variantArray(product) {
  if (Array.isArray(product?.variants)) return product.variants;
  return asArray(product?.variants?.nodes);
}

function normalizeMoney(value) {
  if (value === null || value === undefined || value === "") return "";
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : "";
}

function normalizeProduct(product) {
  return {
    ...product,
    variants: asArray(product?.variants?.nodes).map((variant) => ({
      ...variant,
      cost_per_item: variant?.inventoryItem?.unitCost?.amount || "",
    })),
    variantPageInfo: product?.variants?.pageInfo || product?.variantPageInfo || { hasNextPage: false, endCursor: null },
  };
}

async function completeProductVariants(product) {
  const variants = [...asArray(product?.variants)];
  let after = product?.variantPageInfo?.endCursor || null;
  let hasNextPage = Boolean(product?.variantPageInfo?.hasNextPage);
  while (hasNextPage) {
    const payload = await client.run(
      VARIANT_CONTINUATION_QUERY,
      { id: product.id, first: variantPageSize, after },
      { operation: `read variant cost continuation for ${product.handle}` },
    );
    const connection = payload?.product?.variants;
    if (!connection) throw new Error(`Shopify returned no variant continuation for ${product.handle}`);
    variants.push(...asArray(connection.nodes));
    hasNextPage = Boolean(connection.pageInfo?.hasNextPage);
    after = connection.pageInfo?.endCursor || null;
    if (hasNextPage && !after) throw new Error(`Variant continuation for ${product.handle} has no cursor`);
  }
  return normalizeProduct({ ...product, variants: { nodes: variants, pageInfo: { hasNextPage: false, endCursor: after } } });
}

async function fetchActiveProducts() {
  const productRecords = new Map();
  let after = null;
  while (true) {
    const payload = await client.run(
      PRODUCTS_QUERY,
      { first: pageSize, variantFirst: variantPageSize, after },
      { operation: "read active variant costs and prices" },
    );
    const connection = payload?.products;
    const pageProducts = asArray(connection?.nodes);
    for (let index = 0; index < pageProducts.length; index += readConcurrency) {
      const batch = pageProducts.slice(index, index + readConcurrency);
      const completed = await Promise.all(batch.map((product) => completeProductVariants(normalizeProduct(product))));
      products.push(...completed);
      if (products.length % 250 < completed.length || !connection?.pageInfo?.hasNextPage && products.length === 1) {
        process.stdout.write(`Pricing read progress: ${products.length} active product(s).\n`);
      }
    }
    if (!connection?.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor || null;
    if (!after) throw new Error("Shopify returned a next page without a cursor while reading variant costs");
  }
  return products;
}

async function waitForBulkOperation(operationId) {
  while (true) {
    const payload = await client.run(
      BULK_OPERATION_STATUS_QUERY,
      { id: operationId },
      { operation: "read cost-based pricing bulk operation status" },
    );
    const operation = payload?.bulkOperation;
    if (!operation) throw new Error(`Cost-based pricing bulk operation not found: ${operationId}`);
    process.stdout.write(`Pricing bulk read: ${operation.status}, ${operation.objectCount || 0} object(s).\n`);
    if (operation.status === "COMPLETED") return operation;
    if (["FAILED", "CANCELED", "EXPIRED"].includes(operation.status)) {
      throw new Error(`Cost-based pricing bulk read ended ${operation.status}: ${operation.errorCode || "unknown error"}`);
    }
    await sleep(5000);
  }
}

async function readBulkJsonlResponse(response) {
  if (!response.body) {
    throw new Error("Completed cost-based pricing bulk read returned no response body");
  }

  const productRecords = new Map();
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let recordsRead = 0;
  const productRecordFor = (id) => {
    const existing = productRecords.get(id);
    if (existing) return existing;
    const record = { id, handle: "", title: "", variants: [] };
    productRecords.set(id, record);
    return record;
  };

  const consumeLine = (line) => {
    if (!line.trim()) return;
    const node = JSON.parse(line);
    recordsRead += 1;
    if (node.__parentId) {
      productRecordFor(node.__parentId).variants.push({
        id: node.id,
        title: node.title,
        sku: node.sku,
        price: node.price,
        compareAtPrice: node.compareAtPrice,
        inventoryItem: node.inventoryItem,
      });
      return;
    }

    if (node.id && node.handle) {
      const product = productRecordFor(node.id);
      product.handle = node.handle;
      product.title = node.title;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      consumeLine(buffer.slice(0, newlineIndex));
      buffer = buffer.slice(newlineIndex + 1);
      newlineIndex = buffer.indexOf("\n");
    }

    if (recordsRead && recordsRead % 50_000 === 0) {
      process.stdout.write(`Pricing bulk parse progress: ${recordsRead} records, ${productRecords.size} products.\n`);
    }
  }

  buffer += decoder.decode();
  consumeLine(buffer);
  const products = [...productRecords.values()]
    .filter((product) => product.handle)
    .map((product) => normalizeProduct({
      ...product,
      variants: {
        nodes: product.variants,
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    }));
  productRecords.clear();
  return { products, recordsRead };
}

async function fetchActiveProductsBulk({ reuseRequested = true } = {}) {
  let operationId = reuseRequested ? requestedBulkOperationId : "";
  if (operationId) {
    process.stdout.write(`Reusing requested cost-based pricing bulk read ${operationId}.\n`);
  } else {
    const started = await client.run(
      BULK_OPERATION_RUN_QUERY,
      { query: BULK_ACTIVE_PRODUCTS_QUERY },
      { allowMutations: true, operation: "start active variant cost and price bulk read" },
    );
    const errors = asArray(started?.bulkOperationRunQuery?.userErrors);
    if (errors.length) throw new Error(`Cost-based pricing bulk read failed to start: ${JSON.stringify(errors)}`);
    operationId = started?.bulkOperationRunQuery?.bulkOperation?.id;
    if (!operationId) throw new Error("Shopify returned no cost-based pricing bulk read operation id");
  }
  const operation = await waitForBulkOperation(operationId);
  if (!operation.url) throw new Error("Completed cost-based pricing bulk read returned no result URL");
  const response = await fetch(operation.url);
  if (!response.ok) throw new Error(`Cost-based pricing bulk read download failed (${response.status})`);
  const { products, recordsRead } = await readBulkJsonlResponse(response);
  if (typeof global.gc === "function") global.gc();
  process.stdout.write(`Pricing bulk read complete: ${products.length} active product(s), ${products.reduce((total, product) => total + variantArray(product).length, 0)} variant(s) from ${recordsRead} records.\n`);
  return products;
}

function manifestForPlan(plan, mode) {
  const products = [...plan.byHandle.entries()].map(([handle, updates]) => ({ handle, updates }));
  return {
    generatedAt: new Date().toISOString(),
    mode,
    policy: {
      pricingPolicy,
      policyId: pricingPolicy === "cost-band-v2" ? costBasedPolicyId : "legacy-peer-alignment",
      tolerance,
      priceFloor,
      pageSize,
      variantPageSize,
      fetchMode,
      readbackAttempts,
      applyConcurrency,
      readConcurrency,
      bulkInputMaxBytes,
      bulkVariantsPerInput,
      priceOutlierRatio,
      priceOutlierMinimumDelta,
      variantPeerOutlierRatio,
      variantPeerOutlierMinimumDelta,
      targetPrice: pricingPolicy === "cost-band-v2"
        ? "every variant receives an independent live-cost target; targets may raise or lower random prices, never below the price floor"
        : "cost protection never lowers prices; deterministic same-product peer outliers may be normalized to their verified peer anchor, while cost and margin floors are always enforced",
      wildPriceOutliers: "same-product non-quantity variants within the cost tolerance are normalized only when price ratio and absolute range both exceed the configured thresholds; every change is read back",
      quantityTiers: "same-quantity color/material peers are normalized only when live costs are within tolerance; ambiguous cost gaps are reported for review",
      compareAt: pricingPolicy === "cost-band-v2"
        ? "preserve an existing compare-at only when it remains strictly above the new target; clear invalid values; never invent compare-at prices"
        : "align deterministic peer outliers to the verified peer anchor; clear if it would become invalid after an increase",
      sourceOfTruth: "live Shopify variant inventoryItem.unitCost and price",
      campaignCostPerOrder,
      overhead: costBasedOverhead,
      minContributionMargin,
      clothingMinContributionMargin,
      costBands: pricingPolicy === "cost-band-v2" ? costBasedBands : undefined,
      contributionFormula: "max(price floor, ceil((cost per item + campaign cost per order) / (1 - minimum contribution margin), cents))",
      clothingFormula: "clothing uses the higher contribution margin and rounds upward to the next .99 retail price",
      costBasedFormula: pricingPolicy === "cost-band-v2"
        ? "max(price floor, (cost per item + overhead) * cost-band multiplier, (cost per item + overhead) / (1 - contribution margin)); round upward to .99"
        : undefined,
    },
    summary: plan.summary,
    products,
    held: plan.held,
    priceReview: plan.priceReview || [],
    blockingHeld: plan.blockingHeld || [],
    failures: [],
  };
}

async function writeManifest(path, payload) {
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeApplyCheckpoint(path, payload) {
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(payload)}\n`, "utf8");
  await rename(temporaryPath, path);
}

function assertNoHeld(plan) {
  if ((plan.blockingHeld || []).length) {
    throw new Error(`Variant cost-price alignment held ${plan.blockingHeld.length} unsafe group(s); no price writes were started.`);
  }
}

function productIdForGraphql(product) {
  const raw = String(product?.id || "");
  return raw.startsWith("gid://") ? raw : `gid://shopify/Product/${raw}`;
}

function buildMutationInputs(updates) {
  return updates.map((update) => ({
    id: update.variantId.startsWith("gid://") ? update.variantId : `gid://shopify/ProductVariant/${update.variantId}`,
    price: update.price,
    ...(Object.prototype.hasOwnProperty.call(update, "compareAtPrice") ? { compareAtPrice: update.compareAtPrice } : {}),
  }));
}

function toBulkVariantInput(update) {
  return {
    id: update.variantId.startsWith("gid://") ? update.variantId : `gid://shopify/ProductVariant/${update.variantId}`,
    price: update.price,
    ...(Object.prototype.hasOwnProperty.call(update, "compareAtPrice") ? { compareAtPrice: update.compareAtPrice } : {}),
  };
}

function readbackFailures(product, updates) {
  const liveById = new Map(variantArray(product).map((variant) => [String(variant?.id), variant]));
  return updates.flatMap((update) => {
    const id = update.variantId.startsWith("gid://") ? update.variantId : `gid://shopify/ProductVariant/${update.variantId}`;
    const live = liveById.get(id);
    if (!live) return [{ variantId: id, reason: "variant-not-found" }];
    const failures = [];
    if (normalizeMoney(live.price) !== normalizeMoney(update.price)) {
      failures.push({ variantId: id, reason: "price-readback-mismatch", expected: update.price, actual: live.price });
    }
    if (Object.prototype.hasOwnProperty.call(update, "compareAtPrice") && normalizeMoney(live.compareAtPrice) !== normalizeMoney(update.compareAtPrice)) {
      failures.push({ variantId: id, reason: "compare-at-readback-mismatch", expected: update.compareAtPrice, actual: live.compareAtPrice });
    }
    return failures;
  });
}

function costProtectionFailures(product) {
  if (pricingPolicy === "cost-band-v2") {
    return variantArray(product).flatMap((variant) => {
      const cost = Number(
        variant?.cost_per_item ??
          variant?.cost ??
          variant?.inventoryItem?.unitCost?.amount ??
          variant?.inventory_item?.cost,
      );
      const price = Number(variant?.price);
      const expected = costBasedTargetPrice(cost, {
        overhead: costBasedOverhead,
        priceFloor,
        minContributionMargin,
        clothingMinContributionMargin,
        clothing: isClothingProduct(product),
        bands: costBasedBands,
      });
      if (!expected || !Number.isFinite(price)) {
        return [{
          variantId: String(variant?.id || ""),
          reason: "cost-based-price-invariant-missing-input",
          costPerItem: normalizeMoney(cost),
          actualPrice: normalizeMoney(price),
        }];
      }
      const failures = [];
      if (normalizeMoney(price) !== normalizeMoney(expected)) {
        failures.push({
          variantId: String(variant?.id || ""),
          reason: "cost-based-price-readback-mismatch",
          costPerItem: normalizeMoney(cost),
          expectedPrice: expected,
          actualPrice: normalizeMoney(price),
        });
      }
      const compareAt = Number(variant?.compareAtPrice ?? variant?.compare_at_price);
      if (Number.isFinite(compareAt) && compareAt > 0 && compareAt <= price) {
        failures.push({
          variantId: String(variant?.id || ""),
          reason: "invalid-compare-at-price",
          actualPrice: normalizeMoney(price),
          compareAtPrice: normalizeMoney(compareAt),
        });
      }
      return failures;
    });
  }
  return variantArray(product).flatMap((variant) => {
    const cost = Number(
      variant?.cost_per_item ??
        variant?.cost ??
        variant?.inventoryItem?.unitCost?.amount ??
        variant?.inventory_item?.cost,
    );
    const price = Number(variant?.price);
    const minimum = costProtectedMinimumPrice(cost, {
      campaignCostPerOrder,
      minContributionMargin,
      clothingMinContributionMargin,
      retailPriceEnding: isClothingProduct(product),
      priceFloor,
    });
    if (!minimum || !Number.isFinite(price) || price + 0.005 >= Number(minimum)) return [];
    return [{
      variantId: String(variant?.id || ""),
      reason: "cost-campaign-target-violation",
      costPerItem: normalizeMoney(cost),
      expectedMinimumPrice: minimum,
      actualPrice: normalizeMoney(price),
    }];
  });
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function readBackAlignedProduct(product, updates) {
  let lastProduct = null;
  let failures = [];
  for (let attempt = 0; attempt < readbackAttempts; attempt += 1) {
    const readback = await client.run(PRODUCT_QUERY, { id: productIdForGraphql(product) }, { operation: `read back aligned variant prices for ${product.handle}` });
    lastProduct = await completeProductVariants(normalizeProduct(readback?.product));
    failures = readbackFailures(lastProduct, updates);
    if (!failures.length) return { product: lastProduct, failures: [] };
    if (attempt < readbackAttempts - 1) await sleep(Math.min(8_000, 1_000 * 2 ** attempt));
  }
  return { product: lastProduct, failures };
}

async function applyPlan(plan, manifest, outputPath) {
  assertNoHeld(plan);
  const productsByHandle = new Map(plan.products.map((product) => [normalizePlainText(product.handle), product]));
  const completed = new Set(asArray(manifest.appliedProducts));
  const entries = [...plan.byHandle.entries()].filter(([handle]) => !completed.has(handle));
  const checkpointPath = `${outputPath}.checkpoint.json`;
  let cursor = 0;
  let stopped = false;
  let checkpointQueue = Promise.resolve();
  const persistCheckpoint = () => {
    checkpointQueue = checkpointQueue.then(() => writeApplyCheckpoint(checkpointPath, {
      mode: "apply",
      appliedProducts: manifest.appliedProducts || [],
      failures: manifest.failures || [],
      updatedAt: new Date().toISOString(),
    }));
    return checkpointQueue;
  };

  process.stdout.write(`Applying ${entries.length} product(s) with concurrency ${applyConcurrency}; resuming past ${completed.size} verified product(s).\n`);

  const applyOne = async ([handle, updates]) => {
    const product = productsByHandle.get(handle);
    if (!product) throw new Error(`Missing live product for cost-price plan handle ${handle}`);
    const payload = await client.run(
      UPDATE_MUTATION,
      { productId: productIdForGraphql(product), variants: buildMutationInputs(updates) },
      { allowMutations: true, operation: `align variant prices for ${handle}` },
    );
    const errors = asArray(payload?.productVariantsBulkUpdate?.userErrors);
    if (errors.length) throw new Error(`${handle}: ${JSON.stringify(errors)}`);
    const { failures } = await readBackAlignedProduct(product, updates);
    if (failures.length) {
      manifest.failures.push({ handle, failures });
      await persistCheckpoint();
      throw new Error(`${handle}: ${failures.length} variant price readback failure(s)`);
    }
    manifest.appliedProducts = [...new Set([...(manifest.appliedProducts || []), handle])];
    await persistCheckpoint();
  };

  const worker = async () => {
    while (!stopped) {
      const entry = entries[cursor++];
      if (!entry) return;
      try {
        await applyOne(entry);
      } catch (error) {
        stopped = true;
        throw error;
      }
    }
  };

  const workerCount = Math.min(applyConcurrency, Math.max(1, entries.length));
  const results = await Promise.allSettled(Array.from({ length: workerCount }, () => worker()));
  await checkpointQueue;
  const rejected = results.find((result) => result.status === "rejected");
  if (rejected) throw rejected.reason;
  if (manifest.failures?.length) throw new Error(`Variant cost-price alignment failed for ${manifest.failures.length} product(s)`);
}

async function uploadBulkPricingInput(inputPath) {
  const payload = await client.run(
    STAGED_UPLOAD_CREATE_MUTATION,
    {
      input: [{
        resource: "BULK_MUTATION_VARIABLES",
        filename: basename(inputPath),
        mimeType: "text/jsonl",
        httpMethod: "POST",
      }],
    },
    { allowMutations: true, operation: "cost-based pricing staged upload" },
  );
  const errors = asArray(payload?.stagedUploadsCreate?.userErrors);
  if (errors.length) throw new Error(`Cost-based pricing staged upload failed: ${JSON.stringify(errors)}`);
  const target = payload?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target?.url) throw new Error("Shopify returned no cost-based pricing staged upload target");
  const curlArgs = ["-sS", "-X", "POST", target.url];
  for (const parameter of target.parameters || []) curlArgs.push("-F", `${parameter.name}=${parameter.value}`);
  curlArgs.push("-F", `file=@${inputPath};type=text/jsonl`);
  await execFileAsync("curl", curlArgs, { cwd: rootDir, maxBuffer: 20 * 1024 * 1024 });
  const stagedUploadPath = (target.parameters || []).find((parameter) => parameter.name === "key")?.value;
  if (!stagedUploadPath) throw new Error("Shopify cost-based pricing staged upload returned no key");
  return stagedUploadPath;
}

async function waitForBulkPricingMutation(operationId) {
  while (true) {
    const payload = await client.run(
      BULK_MUTATION_STATUS_QUERY,
      { id: operationId },
      { operation: "read cost-based pricing bulk mutation status" },
    );
    const operation = payload?.bulkOperation;
    if (!operation) throw new Error(`Cost-based pricing bulk mutation not found: ${operationId}`);
    process.stdout.write(`Pricing bulk mutation: ${operation.status}, ${operation.objectCount || 0} object(s).\n`);
    if (operation.status === "COMPLETED") return operation;
    if (["FAILED", "CANCELED", "EXPIRED"].includes(operation.status)) {
      throw new Error(`Cost-based pricing bulk mutation ended ${operation.status}: ${operation.errorCode || "unknown error"}`);
    }
    await sleep(5000);
  }
}

function buildBulkApplyParts(plan, outputPath, completedHandles) {
  const productsByHandle = new Map(plan.products.map((product) => [normalizePlainText(product.handle), product]));
  const parts = [];
  let current = { entries: [], bytes: 0 };

  const flush = () => {
    if (!current.entries.length) return;
    parts.push(current);
    current = { entries: [], bytes: 0 };
  };

  for (const [handle, updates] of plan.byHandle.entries()) {
    if (completedHandles.has(handle)) continue;
    const product = productsByHandle.get(handle);
    if (!product) throw new Error(`Missing live product for cost-price plan handle ${handle}`);
    for (let index = 0; index < updates.length; index += bulkVariantsPerInput) {
      const chunk = updates.slice(index, index + bulkVariantsPerInput);
      const input = {
        productId: productIdForGraphql(product),
        variants: chunk.map(toBulkVariantInput),
      };
      const line = JSON.stringify(input);
      const lineBytes = Buffer.byteLength(line) + 1;
      if (current.entries.length && current.bytes + lineBytes > bulkInputMaxBytes) flush();
      current.entries.push({ handle, productId: input.productId, updates: chunk, line });
      current.bytes += lineBytes;
    }
  }
  flush();

  return parts.map((part, index) => ({
    ...part,
    index,
    inputPath: outputPath.replace(/\.json$/i, `-bulk-input-${index + 1}.jsonl`),
    resultPath: outputPath.replace(/\.json$/i, `-bulk-result-${index + 1}.jsonl`),
  }));
}

async function verifyBulkPricingResult(resultPath, part) {
  const resultLines = (await readFile(resultPath, "utf8")).split(/\r?\n/).filter(Boolean);
  const resultsByLine = new Map();
  for (const [fallbackIndex, line] of resultLines.entries()) {
    const payload = JSON.parse(line);
    const lineNumber = Number.isInteger(Number(payload?.__lineNumber))
      ? Number(payload.__lineNumber)
      : fallbackIndex;
    resultsByLine.set(lineNumber, payload);
  }
  if (resultsByLine.size !== part.entries.length) {
    throw new Error(`Cost-based pricing bulk result covered ${resultsByLine.size}/${part.entries.length} input line(s)`);
  }
  for (let index = 0; index < part.entries.length; index += 1) {
    const payload = resultsByLine.get(index);
    if (!payload) throw new Error(`Cost-based pricing bulk result missing input line ${index}`);
    const errors = [
      ...asArray(payload.errors),
      ...asArray(payload?.data?.productVariantsBulkUpdate?.userErrors),
    ];
    if (errors.length) {
      throw new Error(`${part.entries[index].handle}: ${JSON.stringify(errors)}`);
    }
    if (!payload?.data?.productVariantsBulkUpdate) {
      throw new Error(`${part.entries[index].handle}: bulk result returned no productVariantsBulkUpdate payload`);
    }
  }
}

async function applyPlanBulk(plan, manifest, outputPath) {
  assertNoHeld(plan);
  const completed = new Set(asArray(manifest.appliedProducts));
  const parts = buildBulkApplyParts(plan, outputPath, completed);
  const checkpointPath = `${outputPath}.checkpoint.json`;
  const remainingChunks = new Map();
  for (const part of parts) {
    for (const entry of part.entries) remainingChunks.set(entry.handle, (remainingChunks.get(entry.handle) || 0) + 1);
  }

  const persistCheckpoint = () => writeApplyCheckpoint(checkpointPath, {
    mode: "apply",
    appliedProducts: manifest.appliedProducts || [],
    failures: manifest.failures || [],
    bulkOperations: manifest.bulkOperations || [],
    updatedAt: new Date().toISOString(),
  });

  process.stdout.write(`Applying ${parts.length} pricing bulk part(s), resuming past ${completed.size} verified product(s).\n`);
  for (const part of parts) {
    process.stdout.write(`Pricing bulk apply: part ${part.index + 1}/${parts.length}, ${part.entries.length} mutation line(s), ${part.bytes} byte(s).\n`);
    try {
      await writeFile(part.inputPath, `${part.entries.map((entry) => entry.line).join("\n")}\n`, "utf8");
      const stagedUploadPath = await uploadBulkPricingInput(part.inputPath);
      const started = await client.run(
        BULK_OPERATION_RUN_MUTATION,
        { mutation: BULK_VARIANT_PRICE_MUTATION, stagedUploadPath },
        { allowMutations: true, operation: `start cost-based pricing bulk mutation part ${part.index + 1}` },
      );
      const startErrors = asArray(started?.bulkOperationRunMutation?.userErrors);
      if (startErrors.length) throw new Error(`Cost-based pricing bulk mutation failed to start: ${JSON.stringify(startErrors)}`);
      const operationId = started?.bulkOperationRunMutation?.bulkOperation?.id;
      if (!operationId) throw new Error("Shopify returned no cost-based pricing bulk mutation operation id");
      const operation = await waitForBulkPricingMutation(operationId);
      if (!operation.url) throw new Error("Completed cost-based pricing bulk mutation returned no result URL");
      await execFileAsync("curl", ["-sS", "-L", operation.url, "-o", part.resultPath], {
        cwd: rootDir,
        maxBuffer: 20 * 1024 * 1024,
      });
      await verifyBulkPricingResult(part.resultPath, part);

      const completedInPart = new Set();
      for (const entry of part.entries) {
        remainingChunks.set(entry.handle, remainingChunks.get(entry.handle) - 1);
        if (remainingChunks.get(entry.handle) === 0) completedInPart.add(entry.handle);
      }
      manifest.appliedProducts = [...new Set([...(manifest.appliedProducts || []), ...completedInPart])];
      manifest.bulkOperations = [
        ...(manifest.bulkOperations || []),
        {
          part: part.index + 1,
          id: operation.id,
          status: operation.status,
          objectCount: Number(operation.objectCount || 0),
          inputPath: part.inputPath,
          resultPath: part.resultPath,
        },
      ];
      await persistCheckpoint();
      process.stdout.write(`Pricing bulk apply verified: part ${part.index + 1}/${parts.length}; ${manifest.appliedProducts.length} product(s) complete.\n`);
    } catch (error) {
      manifest.failures = [...(manifest.failures || []), { part: part.index + 1, reason: error.message }];
      await persistCheckpoint();
      throw error;
    }
  }

  process.stdout.write("Reading the complete active catalog back after pricing bulk mutations.\n");
  const liveProducts = await fetchActiveProductsBulk({ reuseRequested: false });
  const liveByHandle = new Map(liveProducts.map((product) => [normalizePlainText(product.handle), product]));
  const failures = [];
  for (const [handle, updates] of plan.byHandle.entries()) {
    const product = liveByHandle.get(normalizePlainText(handle));
    if (!product) failures.push({ handle, reason: "product-not-found-after-bulk-apply" });
    else failures.push(...readbackFailures(product, updates).map((failure) => ({ handle, ...failure })));
  }
  for (const product of liveProducts) {
    failures.push(...costProtectionFailures(product).map((failure) => ({
      handle: normalizePlainText(product?.handle),
      ...failure,
    })));
  }
  if (failures.length) {
    manifest.failures = [...(manifest.failures || []), ...failures];
    await persistCheckpoint();
    throw new Error(`Cost-based pricing live readback failed for ${failures.length} variant or product invariant(s)`);
  }
  process.stdout.write(`Pricing bulk live readback exact: ${liveProducts.length} active product(s), zero mismatches.\n`);
}

async function readPriorApplyManifest(path) {
  let prior = null;
  let checkpoint = null;
  try {
    prior = JSON.parse(await readFile(path, "utf8"));
  } catch {
    // The main manifest can be mid-write after an interrupted legacy run.
  }
  try {
    checkpoint = JSON.parse(await readFile(`${path}.checkpoint.json`, "utf8"));
  } catch {
    // No lightweight checkpoint is expected on the first run.
  }
  if (prior?.mode !== "apply" && checkpoint?.mode !== "apply") return null;
  return {
    ...(prior || {}),
    appliedProducts: [...new Set([
      ...asArray(prior?.appliedProducts),
      ...asArray(checkpoint?.appliedProducts),
    ])],
    failures: [
      ...asArray(prior?.failures),
      ...asArray(checkpoint?.failures),
    ],
  };
}

async function removeApplyCheckpoint(path) {
  try {
    await unlink(`${path}.checkpoint.json`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (pricingPolicy === "cost-band-v2" && (args.mode === "apply" || args.mode === "verify")) {
    await verifyCostBasedPricingApproval();
  }
  const products = pricingPolicy === "cost-band-v2" && fetchMode === "bulk"
    ? await fetchActiveProductsBulk({ reuseRequested: args.mode !== "verify" })
    : await fetchActiveProducts();
  const plan = pricingPolicy === "cost-band-v2"
    ? buildCostBasedVariantPricePlan(products, {
      overhead: costBasedOverhead,
      priceFloor,
      minContributionMargin,
      clothingMinContributionMargin,
      bands: costBasedBands,
      policyId: costBasedPolicyId,
    })
    : buildVariantCostPriceAlignmentPlan(products, {
      tolerance,
      priceFloor,
      campaignCostPerOrder,
      minContributionMargin,
      clothingMinContributionMargin,
      priceOutlierRatio,
      priceOutlierMinimumDelta,
      variantPeerOutlierRatio,
      variantPeerOutlierMinimumDelta,
    });
  plan.products = products;
  const manifest = manifestForPlan(plan, args.mode);
  if (args.mode === "apply") {
    const prior = await readPriorApplyManifest(args.output);
    const plannedHandles = new Set(plan.byHandle.keys());
    manifest.appliedProducts = asArray(prior?.appliedProducts).filter((handle) => plannedHandles.has(handle));
  }

  if (args.mode === "verify") {
    const prior = JSON.parse(await readFile(args.output, "utf8"));
    const liveByHandle = new Map(products.map((product) => [normalizePlainText(product.handle), product]));
    const failures = [];
    const priorProducts = asArray(prior.products);
    if (priorProducts.length) {
      for (const entry of priorProducts) {
        const product = liveByHandle.get(normalizePlainText(entry.handle));
        if (!product) failures.push({ handle: entry.handle, reason: "product-not-found" });
        else failures.push(...readbackFailures(product, entry.updates).map((failure) => ({ handle: entry.handle, ...failure })));
      }
    } else {
      for (const [handle, updates] of plan.byHandle.entries()) {
        const product = liveByHandle.get(normalizePlainText(handle));
        if (!product) failures.push({ handle, reason: "product-not-found" });
        else failures.push(...readbackFailures(product, updates).map((failure) => ({ handle, ...failure })));
      }
      if (!plan.byHandle.size) {
        manifest.verification = {
          source: "full-live invariant audit",
          productsInspected: products.length,
          variantsInspected: plan.summary.variantsInspected,
          productsWithUnalignedUpdates: 0,
          heldQuantityTierGroups: plan.held.length,
        };
      }
    }
    for (const product of products) {
      failures.push(...costProtectionFailures(product).map((failure) => ({
        handle: normalizePlainText(product?.handle),
        ...failure,
      })));
    }
    manifest.mode = "verify";
    manifest.products = priorProducts.length ? priorProducts : [];
    manifest.failures = failures;
    manifest.verification = {
      source: "full-live cost and price invariant audit",
      productsInspected: products.length,
      variantsInspected: plan.summary.variantsInspected,
      campaignCostPerOrder,
      minContributionMargin,
      clothingMinContributionMargin,
      priceFloor,
    };
    await writeManifest(args.output, manifest);
    if (failures.length) throw new Error(`Variant cost-price verification failed for ${failures.length} variant(s)`);
    process.stdout.write(`Variant cost-price verification passed: ${prior.products.length} product group(s), zero mismatches.\n`);
    return;
  }

  await writeManifest(args.output, manifest);
  if (args.mode === "dry-run") {
    if ((plan.blockingHeld || []).length) throw new Error(`Variant cost-price dry-run held ${plan.blockingHeld.length} unsafe group(s); review ${args.output}.`);
    process.stdout.write(`Variant cost-price dry-run complete: ${plan.summary.variantsToUpdate} variant price update(s) across ${plan.summary.productsWithUpdates} product(s).\n`);
    return;
  }

  if (pricingPolicy === "cost-band-v2" && fetchMode === "bulk") {
    await applyPlanBulk(plan, manifest, args.output);
  } else {
    await applyPlan(plan, manifest, args.output);
  }
  manifest.completedAt = new Date().toISOString();
  await writeManifest(args.output, manifest);
  await removeApplyCheckpoint(args.output);
  process.stdout.write(`Variant cost-price alignment complete: ${manifest.appliedProducts?.length || 0} product(s) updated and read back.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
