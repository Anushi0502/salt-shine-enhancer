#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  buildProductAnomalyAudit,
  parseAnomalyMoney,
} from "../src/lib/catalog-product-anomaly-audit.js";
import {
  DEFAULT_COST_BASED_BANDS,
  DEFAULT_COST_BASED_CLOTHING_MIN_CONTRIBUTION_MARGIN,
  DEFAULT_COST_BASED_MIN_CONTRIBUTION_MARGIN,
  DEFAULT_COST_BASED_OVERHEAD,
  costBasedTargetPrice,
  isClothingProduct,
} from "../src/lib/shopify-variant-cost-pricing.js";
import { asArray, createShopifyAdminGraphQLClient, normalizeText } from "./shopify-admin-graphql-client.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const defaultOutputPath = resolve(rootDir, "output", "shopify-product-anomaly-audit.json");
const outputPath = resolve(rootDir, process.env.SALT_PRODUCT_ANOMALY_AUDIT_OUTPUT || defaultOutputPath);
const client = createShopifyAdminGraphQLClient({ rootDir, agentName: "product-anomaly-audit" });
const priceFloor = Math.max(0, Number(process.env.SALT_CATALOG_PRICE_FLOOR || 35));
const costOverhead = Math.max(0, Number(process.env.SALT_VARIANT_COST_OVERHEAD || DEFAULT_COST_BASED_OVERHEAD));
const minContributionMargin = Math.min(0.99, Math.max(0, Number(process.env.SALT_VARIANT_COST_MIN_CONTRIBUTION_MARGIN || DEFAULT_COST_BASED_MIN_CONTRIBUTION_MARGIN)));
const clothingMinContributionMargin = Math.min(0.99, Math.max(0, Number(process.env.SALT_VARIANT_COST_CLOTHING_MIN_CONTRIBUTION_MARGIN || DEFAULT_COST_BASED_CLOTHING_MIN_CONTRIBUTION_MARGIN)));
const bulkOperationId = String(process.env.SALT_PRODUCT_ANOMALY_AUDIT_BULK_OPERATION_ID || "").trim();

const BULK_OPERATION_RUN_QUERY = /* GraphQL */ `
  mutation ProductAnomalyAuditRun($query: String!) {
    bulkOperationRunQuery(query: $query) {
      bulkOperation { id status }
      userErrors { field message }
    }
  }
`;

const BULK_OPERATION_STATUS_QUERY = /* GraphQL */ `
  query ProductAnomalyAuditStatus($id: ID!) {
    bulkOperation(id: $id) {
      id status errorCode objectCount url partialDataUrl createdAt completedAt
    }
  }
`;

const BULK_ACTIVE_PRODUCTS_QUERY = /* GraphQL */ `
  {
    products(query: "status:active", sortKey: ID) {
      edges {
        node {
          id
          handle
          title
          productType
          vendor
          tags
          options { id name position values }
          variants {
            edges {
              node {
                id
                title
                sku
                price
                compareAtPrice
                selectedOptions { name value }
                inventoryItem { unitCost { amount currencyCode } }
              }
            }
          }
        }
      }
    }
  }
`;

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

function parseArgs(argv) {
  const args = { strict: false, operationId: bulkOperationId };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--strict") args.strict = true;
    else if (token === "--bulk-operation-id" && argv[index + 1]) args.operationId = String(argv[++index]).trim();
    else if (token === "--output" && argv[index + 1]) args.output = resolve(rootDir, argv[++index]);
    else if (token === "--apply") throw new Error("Product anomaly audit is read-only; no apply mode exists.");
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function productRecordFor(products, id) {
  const existing = products.get(id);
  if (existing) return existing;
  const created = { id, handle: "", title: "", productType: "", vendor: "", tags: [], options: [], variants: [] };
  products.set(id, created);
  return created;
}

async function waitForBulkOperation(operationId) {
  while (true) {
    const payload = await client.run(BULK_OPERATION_STATUS_QUERY, { id: operationId }, {
      operation: "product anomaly audit bulk status",
    });
    const operation = payload?.bulkOperation;
    if (!operation) throw new Error(`Product anomaly audit bulk operation not found: ${operationId}`);
    process.stdout.write(`Product anomaly audit bulk: ${operation.status}, ${operation.objectCount || 0} object(s).\n`);
    if (operation.status === "COMPLETED") return operation;
    if (["FAILED", "CANCELED", "EXPIRED"].includes(operation.status)) {
      throw new Error(`Product anomaly audit bulk ended ${operation.status}: ${operation.errorCode || "unknown error"}`);
    }
    await sleep(5000);
  }
}

async function startBulkOperation() {
  const payload = await client.run(BULK_OPERATION_RUN_QUERY, { query: BULK_ACTIVE_PRODUCTS_QUERY }, {
    allowMutations: true,
    operation: "start full active product anomaly audit",
  });
  const errors = asArray(payload?.bulkOperationRunQuery?.userErrors);
  if (errors.length) throw new Error(errors.map((error) => normalizeText(error?.message)).filter(Boolean).join("; "));
  const operationId = payload?.bulkOperationRunQuery?.bulkOperation?.id;
  if (!operationId) throw new Error("Shopify returned no product anomaly audit bulk operation id.");
  return operationId;
}

async function parseBulkResponse(response) {
  if (!response.body) throw new Error("Product anomaly audit bulk response has no body.");
  const products = new Map();
  const variants = new Map();
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let recordsRead = 0;

  const consumeLine = (line) => {
    if (!line.trim()) return;
    const node = JSON.parse(line);
    recordsRead += 1;
    const parentId = String(node.__parentId || "").trim();
    if (parentId) {
      const parent = products.get(parentId);
      if (parent && node.id && (node.price !== undefined || node.selectedOptions !== undefined || node.inventoryItem !== undefined)) {
        const variant = {
          id: node.id,
          title: node.title,
          sku: node.sku,
          price: node.price,
          compareAtPrice: node.compareAtPrice,
          selectedOptions: node.selectedOptions,
          inventoryItem: node.inventoryItem,
        };
        parent.variants.push(variant);
        variants.set(String(node.id), variant);
      }
      return;
    }
    if (node.id && node.handle) {
      const product = productRecordFor(products, String(node.id));
      Object.assign(product, {
        id: node.id,
        handle: node.handle,
        title: node.title,
        productType: node.productType,
        vendor: node.vendor,
        tags: node.tags,
        options: node.options,
      });
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
      process.stdout.write(`Product anomaly audit parse: ${recordsRead} records, ${products.size} products.\n`);
    }
  }
  buffer += decoder.decode();
  consumeLine(buffer);

  const normalizedProducts = [...products.values()]
    .filter((product) => product.handle)
    .map((product) => ({ ...product, variants: product.variants.filter((variant) => variant?.id) }));
  return { products: normalizedProducts, recordsRead, variantRecords: variants.size };
}

function costTargetForVariant(product, _variant, cost) {
  if (!Number.isFinite(cost) || cost < 0) return null;
  return costBasedTargetPrice(cost, {
    overhead: costOverhead,
    priceFloor,
    minContributionMargin,
    clothingMinContributionMargin,
    clothing: isClothingProduct(product),
    bands: DEFAULT_COST_BASED_BANDS,
  });
}

async function writeJsonAtomically(path, value) {
  await mkdir(resolve(path, ".."), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

async function run() {
  const args = parseArgs(process.argv);
  const operationId = args.operationId || await startBulkOperation();
  if (args.operationId) process.stdout.write(`Reusing product anomaly audit bulk operation ${operationId}.\n`);
  const operation = await waitForBulkOperation(operationId);
  if (!operation.url) throw new Error("Completed product anomaly audit bulk operation returned no result URL.");
  const response = await fetch(operation.url);
  if (!response.ok) throw new Error(`Product anomaly audit bulk download failed (${response.status}).`);
  const { products, recordsRead, variantRecords } = await parseBulkResponse(response);
  if (!products.length) throw new Error("Product anomaly audit received no active products.");

  const audit = buildProductAnomalyAudit(products, { costTargetForVariant, priceFloor });
  const optionRecords = products.reduce((total, product) => total + asArray(product.options).length, 0);
  const variantCount = products.reduce((total, product) => total + product.variants.length, 0);
  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    mode: "read-only",
    source: {
      kind: "shopify-admin-bulk-query",
      storeDomain: client.storeDomain,
      apiVersion: client.apiVersion,
      query: "status:active",
      bulkOperationId: operationId,
      bulkObjectCount: Number(operation.objectCount || 0),
      recordsRead,
      products: products.length,
      variants: variantCount,
      variantRecords,
    },
    policy: {
      optionAudit: "validate declared option names/values against selected options and flag semantic label/value contradictions",
      priceAudit: "cross-product robust peer median plus same-product dispersion; every valid variant and compare-at is inspected",
      costPolicyContext: {
        priceFloor,
        overhead: costOverhead,
        minContributionMargin,
        clothingMinContributionMargin,
        bands: DEFAULT_COST_BASED_BANDS,
      },
      writesApplied: false,
    },
    summary: {
      ...audit.summary,
      optionsInspected: optionRecords,
      variantsInspected: variantCount,
      recordsRead,
      coverageExact: products.length > 0 && products.every((product) => product.id && product.handle),
    },
    optionAnomalies: audit.optionAnomalies,
    priceAnomalies: audit.priceAnomalies,
    costAnomalies: audit.costAnomalies,
    priceSummary: audit.priceSummary,
    costSummary: audit.costSummary,
  };
  const destination = args.output || outputPath;
  await writeJsonAtomically(destination, report);
  process.stdout.write(`${JSON.stringify({ output: destination, summary: report.summary, priceSummary: report.priceSummary }, null, 2)}\n`);
  if (args.strict && (report.summary.optionCritical || report.summary.priceCritical || !report.summary.coverageExact)) {
    throw new Error(`Strict product anomaly audit failed: ${report.summary.optionCritical} critical option issue(s), ${report.summary.priceCritical} critical price issue(s), coverageExact=${report.summary.coverageExact}.`);
  }
}

run().catch((error) => {
  process.stderr.write(`Product anomaly audit failed: ${error?.stack || error}\n`);
  process.exitCode = 1;
});
