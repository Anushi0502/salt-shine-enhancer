#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { asArray, createShopifyAdminGraphQLClient, normalizeText } from "./shopify-admin-graphql-client.mjs";

const execFileAsync = promisify(execFile);
const rootDir = resolve(import.meta.dirname, "..");
const defaultOutputPath = resolve(rootDir, "output", "shopify-missing-cost-product-deletion-manifest.json");
const approvalId = "salt-missing-cost-deletion-2026-08-27-approved";
const pageSize = Math.max(1, Math.min(250, Number(process.env.SALT_MISSING_COST_PRODUCT_PAGE_SIZE || 100)));
const variantPageSize = Math.max(1, Math.min(250, Number(process.env.SALT_MISSING_COST_VARIANT_PAGE_SIZE || 100)));
const pollDelayMs = Math.max(250, Number(process.env.SALT_MISSING_COST_DELETE_POLL_DELAY_MS || 1500));
const pollAttempts = Math.max(1, Number(process.env.SALT_MISSING_COST_DELETE_POLL_ATTEMPTS || 240));
const bulkPollDelayMs = Math.max(1000, Number(process.env.SALT_MISSING_COST_BULK_POLL_DELAY_MS || 5000));
const client = createShopifyAdminGraphQLClient({ rootDir, agentName: "missing-cost-product-delete" });

const PRODUCT_FIELDS = /* GraphQL */ `
  id
  handle
  title
  status
  variants(first: $variantFirst) {
    nodes {
      id
      title
      sku
      inventoryItem { unitCost { amount currencyCode } }
    }
    pageInfo { hasNextPage endCursor }
  }
`;

const ACTIVE_PRODUCTS_QUERY = /* GraphQL */ `
  query MissingCostActiveProducts($first: Int!, $variantFirst: Int!, $after: String) {
    products(first: $first, after: $after, query: "status:active") {
      nodes { ${PRODUCT_FIELDS} }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const PRODUCT_BY_ID_QUERY = /* GraphQL */ `
  query MissingCostProductById($id: ID!, $variantFirst: Int!) {
    product(id: $id) { ${PRODUCT_FIELDS} }
  }
`;

const VARIANT_CONTINUATION_QUERY = /* GraphQL */ `
  query MissingCostVariantContinuation($id: ID!, $first: Int!, $after: String) {
    product(id: $id) {
      variants(first: $first, after: $after) {
        nodes {
          id
          title
          sku
          inventoryItem { unitCost { amount currencyCode } }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const BULK_OPERATION_RUN_QUERY = /* GraphQL */ `
  mutation MissingCostBulkRead($query: String!) {
    bulkOperationRunQuery(query: $query) {
      bulkOperation { id status }
      userErrors { field message }
    }
  }
`;

const BULK_OPERATION_STATUS_QUERY = /* GraphQL */ `
  query MissingCostBulkStatus($id: ID!) {
    bulkOperation(id: $id) { id status errorCode objectCount url }
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
                inventoryItem { unitCost { amount currencyCode } }
              }
            }
          }
        }
      }
    }
  }
`;

const PRODUCT_DELETE_MUTATION = /* GraphQL */ `
  mutation MissingCostProductDelete($input: ProductDeleteInput!, $synchronous: Boolean!) {
    productDelete(input: $input, synchronous: $synchronous) {
      deletedProductId
      productDeleteOperation { id status deletedProductId }
      userErrors { field message }
    }
  }
`;

const PRODUCT_OPERATION_QUERY = /* GraphQL */ `
  query MissingCostProductDeleteOperation($id: ID!) {
    productOperation(id: $id) {
      ... on ProductDeleteOperation {
        id
        status
        deletedProductId
        userErrors { field message }
      }
    }
  }
`;

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function parseArgs(argv) {
  const args = { mode: "dry-run", output: defaultOutputPath, sourceManifest: "" };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--dry-run") args.mode = "dry-run";
    else if (token === "--apply") args.mode = "apply";
    else if (token === "--output" && argv[index + 1]) args.output = resolve(rootDir, argv[++index]);
    else if (token === "--source-manifest" && argv[index + 1]) args.sourceManifest = resolve(rootDir, argv[++index]);
  }
  return args;
}

function formatErrors(errors) {
  return asArray(errors)
    .map((entry) => `${asArray(entry?.field).join(".")} ${normalizeText(entry?.message || "Shopify user error")}`.trim())
    .filter(Boolean)
    .join("; ");
}

function variantCost(variant) {
  const value = variant?.inventoryItem?.unitCost?.amount ?? variant?.cost_per_item;
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function missingCostVariants(product) {
  return asArray(product?.variants).filter((variant) => variantCost(variant) === null);
}

function normalizeProduct(product) {
  return {
    ...product,
    variants: asArray(product?.variants?.nodes || product?.variants).map((variant) => ({
      ...variant,
      cost_per_item: variant?.inventoryItem?.unitCost?.amount ?? "",
    })),
    variantPageInfo: product?.variants?.pageInfo || product?.variantPageInfo || { hasNextPage: false, endCursor: null },
  };
}

async function completeProductVariants(product, retryInfo) {
  const variants = [...asArray(product?.variants)];
  let after = product?.variantPageInfo?.endCursor || null;
  let hasNextPage = Boolean(product?.variantPageInfo?.hasNextPage);
  while (hasNextPage) {
    const payload = await client.run(
      VARIANT_CONTINUATION_QUERY,
      { id: product.id, first: variantPageSize, after },
      { operation: `read missing-cost variant continuation for ${product.handle}`, retryInfo },
    );
    const connection = payload?.product?.variants;
    if (!connection) throw new Error(`Shopify returned no variant continuation for ${product.handle}`);
    variants.push(...asArray(connection.nodes));
    hasNextPage = Boolean(connection.pageInfo?.hasNextPage);
    after = connection.pageInfo?.endCursor || null;
    if (hasNextPage && !after) throw new Error(`Variant continuation for ${product.handle} has no cursor`);
  }
  return normalizeProduct({ ...product, variants: { nodes: variants, pageInfo: { hasNextPage: false, endCursor: null } } });
}

async function fetchActiveProductsPaged(retryInfo) {
  const products = [];
  let after = null;
  let page = 0;
  while (true) {
    page += 1;
    const payload = await client.run(
      ACTIVE_PRODUCTS_QUERY,
      { first: pageSize, variantFirst: variantPageSize, after },
      { operation: `read active products for missing-cost scan page ${page}`, retryInfo },
    );
    const connection = payload?.products;
    if (!connection) throw new Error("Shopify returned no active products connection for missing-cost scan.");
    const pageProducts = asArray(connection.nodes);
    const completed = await Promise.all(pageProducts.map((product) => completeProductVariants(normalizeProduct(product), retryInfo)));
    products.push(...completed);
    process.stdout.write(`Missing-cost scan progress: ${products.length} active product(s).\n`);
    if (!connection.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor || null;
    if (!after) throw new Error("Shopify returned a next page without a cursor during missing-cost scan.");
  }
  return products;
}

async function waitForBulkOperation(operationId, retryInfo) {
  while (true) {
    const payload = await client.run(
      BULK_OPERATION_STATUS_QUERY,
      { id: operationId },
      { operation: `read missing-cost bulk operation ${operationId}`, retryInfo },
    );
    const operation = payload?.bulkOperation;
    if (!operation) throw new Error(`Missing-cost bulk operation ${operationId} was not found.`);
    process.stdout.write(`Missing-cost bulk scan: ${operation.status}, ${operation.objectCount || 0} object(s).\n`);
    if (operation.status === "COMPLETED") return operation;
    if (["FAILED", "CANCELED", "EXPIRED"].includes(operation.status)) {
      throw new Error(`Missing-cost bulk scan ended ${operation.status}: ${operation.errorCode || "unknown error"}`);
    }
    await sleep(bulkPollDelayMs);
  }
}

async function readBulkProducts(operationUrl, retryInfo) {
  const response = await fetch(operationUrl);
  if (!response.ok) throw new Error(`Missing-cost bulk scan download failed (${response.status})`);
  if (!response.body) throw new Error("Missing-cost bulk scan returned no response body.");
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  const productRecords = new Map();
  let buffer = "";
  let recordsRead = 0;
  const productFor = (id) => {
    const existing = productRecords.get(id);
    if (existing) return existing;
    const product = { id, handle: "", title: "", variants: [] };
    productRecords.set(id, product);
    return product;
  };
  const consumeLine = (line) => {
    if (!line.trim()) return;
    const record = JSON.parse(line);
    recordsRead += 1;
    if (record.__parentId) {
      productFor(record.__parentId).variants.push({
        id: record.id,
        title: record.title,
        sku: record.sku,
        inventoryItem: record.inventoryItem,
      });
    } else if (record.id && record.handle) {
      const product = productFor(record.id);
      product.handle = record.handle;
      product.title = record.title;
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      consumeLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  buffer += decoder.decode();
  consumeLine(buffer);
  const products = [...productRecords.values()]
    .filter((product) => product.handle)
    .map((product) => normalizeProduct(product));
  productRecords.clear();
  process.stdout.write(`Missing-cost bulk scan complete: ${products.length} active product(s), ${recordsRead} records.\n`);
  return products;
}

async function fetchActiveProductsBulk(retryInfo) {
  const started = await client.run(
    BULK_OPERATION_RUN_QUERY,
    { query: BULK_ACTIVE_PRODUCTS_QUERY },
    { allowMutations: true, operation: "start missing-cost active catalog bulk scan", retryInfo },
  );
  const errors = formatErrors(started?.bulkOperationRunQuery?.userErrors);
  if (errors) throw new Error(`Missing-cost bulk scan failed to start: ${errors}`);
  const operationId = started?.bulkOperationRunQuery?.bulkOperation?.id;
  if (!operationId) throw new Error("Shopify returned no missing-cost bulk scan operation id.");
  const operation = await waitForBulkOperation(operationId, retryInfo);
  if (!operation.url) throw new Error("Missing-cost bulk scan completed without a result URL.");
  return readBulkProducts(operation.url, retryInfo);
}

async function fetchActiveProducts(retryInfo) {
  if (/^paged$/i.test(process.env.SALT_MISSING_COST_SCAN_MODE || "")) {
    return fetchActiveProductsPaged(retryInfo);
  }
  try {
    return await fetchActiveProductsBulk(retryInfo);
  } catch (error) {
    if (!/^1$/i.test(process.env.SALT_MISSING_COST_SCAN_ALLOW_PAGED_FALLBACK || "1")) throw error;
    process.stderr.write(`Missing-cost bulk scan unavailable; using paginated live scan: ${normalizeText(error?.message || error)}\n`);
    return fetchActiveProductsPaged(retryInfo);
  }
}

async function fetchProductById(id, retryInfo, operation) {
  const payload = await client.run(
    PRODUCT_BY_ID_QUERY,
    { id, variantFirst: variantPageSize },
    { operation, retryInfo },
  );
  const product = payload?.product;
  return product ? completeProductVariants(normalizeProduct(product), retryInfo) : null;
}

async function readSourceHandles(sourceManifest) {
  if (!sourceManifest) return null;
  const parsed = JSON.parse(await readFile(sourceManifest, "utf8"));
  const entries = [
    ...asArray(parsed?.blockingHeld),
    ...asArray(parsed?.held),
  ].filter((entry) => entry?.reason === "missing-live-cost-for-cost-based-pricing");
  const handles = new Set(entries.map((entry) => normalizeText(entry?.handle).toLowerCase()).filter(Boolean));
  if (!handles.size) throw new Error(`Source pricing manifest contains no missing-cost product handles: ${sourceManifest}`);
  return handles;
}

function candidateFromProduct(product) {
  const missing = missingCostVariants(product);
  return {
    productId: product.id,
    handle: normalizeText(product.handle),
    title: normalizeText(product.title),
    missingVariants: missing.map((variant) => ({
      variantId: variant.id || "",
      title: normalizeText(variant.title),
      sku: normalizeText(variant.sku),
      reason: "missing-live-cost-for-cost-based-pricing",
    })),
    status: "pending",
    operationId: "",
    verifiedAt: "",
    failure: "",
  };
}

async function writeManifest(filePath, manifest) {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

function refreshSummary(manifest) {
  const tasks = asArray(manifest.tasks);
  manifest.summary.wouldDelete = tasks.filter((task) => task.status === "would-delete").length;
  manifest.summary.deletedVerified = tasks.filter((task) => task.status === "deleted-verified").length;
  manifest.summary.skippedCostAdded = tasks.filter((task) => task.status === "skipped-cost-added").length;
  manifest.summary.alreadyDeleted = tasks.filter((task) => task.status === "already-deleted").length;
  manifest.summary.failed = tasks.filter((task) => task.status === "failed").length;
}

async function verifyApprovalForApply() {
  if (process.env.SALT_DELETE_MISSING_COST_PRODUCTS_APPROVED !== "1") {
    throw new Error("Missing-cost product deletion requires SALT_DELETE_MISSING_COST_PRODUCTS_APPROVED=1.");
  }
  if (normalizeText(process.env.SALT_DELETE_MISSING_COST_PRODUCTS_APPROVAL_ID) !== approvalId) {
    throw new Error(`Missing-cost product deletion approval id must be ${approvalId}.`);
  }
  try {
    await execFileAsync(process.execPath, ["scripts/catalog-cost-based-pricing-approval.mjs"], {
      cwd: rootDir,
      env: process.env,
      maxBuffer: 2 * 1024 * 1024,
    });
  } catch (error) {
    const details = normalizeText(error?.stderr || error?.stdout || error?.message || error);
    throw new Error(`Cost-based pricing approval verification failed before deletion: ${details}`);
  }
}

async function waitForDeleteOperation(operationId, productId, retryInfo) {
  for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
    const payload = await client.run(
      PRODUCT_OPERATION_QUERY,
      { id: operationId },
      { operation: `read missing-cost deletion operation ${operationId}`, retryInfo },
    );
    const operation = payload?.productOperation;
    if (!operation) throw new Error(`Product delete operation ${operationId} was not found.`);
    const errors = formatErrors(operation.userErrors);
    if (errors) throw new Error(`Product delete operation ${operationId} failed: ${errors}`);
    if (operation.status === "COMPLETE") {
      if (operation.deletedProductId && operation.deletedProductId !== productId) {
        throw new Error(`Delete operation ${operationId} completed for an unexpected product.`);
      }
      return;
    }
    if (!["CREATED", "ACTIVE"].includes(operation.status)) {
      throw new Error(`Product delete operation ${operationId} returned unexpected status ${operation.status || "unknown"}.`);
    }
    await sleep(pollDelayMs);
  }
  throw new Error(`Timed out waiting for product delete operation ${operationId}.`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.mode === "apply") await verifyApprovalForApply();
  const retryInfo = [];
  const sourceHandles = await readSourceHandles(args.sourceManifest);
  const activeProducts = await fetchActiveProducts(retryInfo);
  const scopedProducts = sourceHandles
    ? activeProducts.filter((product) => sourceHandles.has(normalizeText(product.handle).toLowerCase()))
    : activeProducts;
  const candidates = scopedProducts.filter((product) => missingCostVariants(product).length > 0).map(candidateFromProduct);
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: args.mode,
    output: args.output,
    source: {
      store: client.storeDomain,
      apiVersion: client.apiVersion,
      query: "status:active",
      sourceManifest: args.sourceManifest || null,
      freshLiveRead: true,
    },
    policy: {
      approvalId,
      scope: sourceHandles ? "active products still matching the approved missing-cost source manifest" : "all active products",
      deletion: "permanent deletion only when a fresh live read still finds at least one variant with no live unit cost",
      readback: "each delete operation and post-delete product read are required",
      noGuessing: "missing cost is never fabricated or written; the product is removed only under the explicit approved policy",
    },
    summary: {
      activeProducts: activeProducts.length,
      scopedProducts: scopedProducts.length,
      missingCostProducts: candidates.length,
      missingCostVariants: candidates.reduce((total, task) => total + task.missingVariants.length, 0),
      wouldDelete: 0,
      deletedVerified: 0,
      skippedCostAdded: 0,
      alreadyDeleted: 0,
      failed: 0,
    },
    retryInfo,
    tasks: candidates,
  };

  if (args.mode === "dry-run") {
    for (const task of manifest.tasks) task.status = "would-delete";
    refreshSummary(manifest);
    await writeManifest(args.output, manifest);
    process.stdout.write(`Missing-cost dry run complete: ${manifest.summary.wouldDelete} active product(s) would be permanently deleted after fresh re-read.\n`);
    return;
  }

  for (const task of manifest.tasks) {
    const taskRetryInfo = [];
    try {
      const current = await fetchProductById(task.productId, taskRetryInfo, `missing-cost pre-delete read ${task.handle}`);
      if (!current) {
        task.status = "already-deleted";
      } else if (String(current.status || "").toLowerCase() !== "active") {
        task.status = "skipped-not-active";
      } else if (!missingCostVariants(current).length) {
        task.status = "skipped-cost-added";
      } else {
        const payload = await client.run(
          PRODUCT_DELETE_MUTATION,
          { input: { id: task.productId }, synchronous: false },
          { allowMutations: true, operation: `delete missing-cost product ${task.handle}`, retryInfo: taskRetryInfo },
        );
        const result = payload?.productDelete;
        const errors = formatErrors(result?.userErrors);
        if (errors) throw new Error(errors);
        task.operationId = normalizeText(result?.productDeleteOperation?.id);
        if (task.operationId) {
          await waitForDeleteOperation(task.operationId, task.productId, taskRetryInfo);
        } else if (result?.deletedProductId !== task.productId) {
          throw new Error("Shopify did not return a deletion confirmation.");
        }
        const afterDelete = await fetchProductById(task.productId, taskRetryInfo, `missing-cost post-delete read ${task.handle}`);
        if (afterDelete) throw new Error("Product still exists after Shopify confirmed deletion.");
        task.status = "deleted-verified";
      }
      task.verifiedAt = new Date().toISOString();
    } catch (error) {
      task.status = "failed";
      task.failure = normalizeText(error?.message || error);
      task.verifiedAt = new Date().toISOString();
    }
    manifest.retryInfo.push(...taskRetryInfo);
    refreshSummary(manifest);
    await writeManifest(args.output, manifest);
  }

  manifest.completedAt = new Date().toISOString();
  refreshSummary(manifest);
  await writeManifest(args.output, manifest);
  if (manifest.summary.failed) {
    throw new Error(`Missing-cost product deletion failed for ${manifest.summary.failed} product(s); see ${args.output}.`);
  }
  process.stdout.write(`Missing-cost product deletion complete: ${manifest.summary.deletedVerified} product(s) permanently deleted and verified.\n`);
}

export { missingCostVariants, variantCost };

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
