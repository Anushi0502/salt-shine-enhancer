#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  buildProductAnomalyRepairPlan,
  optionValuesMatchTarget,
  productOptions,
  variantCost,
} from "../src/lib/catalog-product-anomaly-repair.js";
import { buildProductAnomalyAudit } from "../src/lib/catalog-product-anomaly-audit.js";
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
const defaultManifestPath = resolve(rootDir, "output", "shopify-product-anomaly-repair-manifest.json");
const approvalEnv = "SALT_CATALOG_PRODUCT_ANOMALY_REPAIR_APPROVED";
const policyId = String(process.env.SALT_PRODUCT_ANOMALY_REPAIR_POLICY_ID || "cost-peer-outlier-draft-2026-09-12").trim();
const priceFloor = Math.max(0, Number(process.env.SALT_CATALOG_PRICE_FLOOR || 35));
const costOverhead = Math.max(0, Number(process.env.SALT_VARIANT_COST_OVERHEAD || DEFAULT_COST_BASED_OVERHEAD));
const minContributionMargin = Math.min(0.99, Math.max(0, Number(process.env.SALT_VARIANT_COST_MIN_CONTRIBUTION_MARGIN || DEFAULT_COST_BASED_MIN_CONTRIBUTION_MARGIN)));
const clothingMinContributionMargin = Math.min(0.99, Math.max(0, Number(process.env.SALT_VARIANT_COST_CLOTHING_MIN_CONTRIBUTION_MARGIN || DEFAULT_COST_BASED_CLOTHING_MIN_CONTRIBUTION_MARGIN)));
const applyConcurrency = Math.max(1, Math.min(6, Number(process.env.SALT_PRODUCT_ANOMALY_APPLY_CONCURRENCY || 4)));
const client = createShopifyAdminGraphQLClient({ rootDir, agentName: "product-anomaly-repair" });

const BULK_OPERATION_RUN_QUERY = /* GraphQL */ `
  mutation ProductAnomalyRepairRun($query: String!) {
    bulkOperationRunQuery(query: $query) {
      bulkOperation { id status }
      userErrors { field message }
    }
  }
`;

const BULK_OPERATION_STATUS_QUERY = /* GraphQL */ `
  query ProductAnomalyRepairStatus($id: ID!) {
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

const PRODUCT_QUERY = /* GraphQL */ `
  query ProductAnomalyRepairProduct($id: ID!, $variantAfter: String) {
    product(id: $id) {
      id
      handle
      title
      status
      productType
      vendor
      tags
      options { id name position values }
      variants(first: 250, after: $variantAfter) {
        nodes {
          id
          title
          sku
          price
          compareAtPrice
          selectedOptions { name value }
          inventoryItem { unitCost { amount currencyCode } }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const PRODUCT_OPTION_UPDATE_MUTATION = /* GraphQL */ `
  mutation ProductAnomalyRepairOption($productId: ID!, $option: OptionUpdateInput!, $variantStrategy: ProductOptionUpdateVariantStrategy!) {
    productOptionUpdate(productId: $productId, option: $option, variantStrategy: $variantStrategy) {
      product { id handle title status options { id name position values } }
      userErrors { field message }
    }
  }
`;

const PRODUCT_UPDATE_MUTATION = /* GraphQL */ `
  mutation ProductAnomalyRepairStatus($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id handle title status }
      userErrors { field message }
    }
  }
`;

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

function parseArgs(argv) {
  const args = { mode: "dry-run", manifest: defaultManifestPath };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--dry-run") args.mode = "dry-run";
    else if (token === "--apply") args.mode = "apply";
    else if (token === "--verify") args.mode = "verify";
    else if ((token === "--manifest" || token === "--output") && argv[index + 1]) args.manifest = resolve(rootDir, argv[++index]);
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

function consumeBulkLine(products, line) {
  if (!line.trim()) return;
  const node = JSON.parse(line);
  const parentId = String(node.__parentId || "").trim();
  if (parentId) {
    const parent = products.get(parentId);
    if (parent && node.id && (node.price !== undefined || node.selectedOptions !== undefined || node.inventoryItem !== undefined)) {
      parent.variants.push({
        id: node.id,
        title: node.title,
        sku: node.sku,
        price: node.price,
        compareAtPrice: node.compareAtPrice,
        selectedOptions: node.selectedOptions,
        inventoryItem: node.inventoryItem,
      });
    }
    return;
  }
  if (node.id && node.handle) {
    Object.assign(productRecordFor(products, String(node.id)), {
      id: node.id,
      handle: node.handle,
      title: node.title,
      productType: node.productType,
      vendor: node.vendor,
      tags: node.tags,
      options: node.options,
    });
  }
}

async function waitForBulkOperation(operationId) {
  while (true) {
    const payload = await client.run(BULK_OPERATION_STATUS_QUERY, { id: operationId }, { operation: "product anomaly repair bulk status" });
    const operation = payload?.bulkOperation;
    if (!operation) throw new Error(`Product anomaly repair bulk operation not found: ${operationId}`);
    process.stdout.write(`Product anomaly repair bulk: ${operation.status}, ${operation.objectCount || 0} object(s).\n`);
    if (operation.status === "COMPLETED") return operation;
    if (["FAILED", "CANCELED", "EXPIRED"].includes(operation.status)) {
      throw new Error(`Product anomaly repair bulk ended ${operation.status}: ${operation.errorCode || "unknown error"}`);
    }
    await sleep(5000);
  }
}

async function fetchActiveProducts() {
  if (process.env.SALT_PRODUCT_ANOMALY_REPAIR_REUSE_SHARED_SNAPSHOT === "1") {
    const candidates = [
      process.env.SALT_PRODUCT_ANOMALY_REPAIR_SOURCE_PATH,
      process.env.SALT_RELEASE_CATALOG_SOURCE_PATH,
      resolve(rootDir, "output", "release-catalog-source.json"),
    ].filter(Boolean);
    for (const candidate of candidates) {
      try {
        const payload = JSON.parse(await readFile(resolve(rootDir, candidate), "utf8"));
        const products = (Array.isArray(payload) ? payload : payload?.products)
          ?.filter((product) => !product?.status || String(product.status).toUpperCase() === "ACTIVE");
        if (Array.isArray(products) && products.length) {
          const normalizedProducts = products
            .filter((product) => product?.id && product?.handle)
            .map((product) => ({
              ...product,
              variants: asArray(product.variants).filter((variant) => variant?.id),
            }));
          if (normalizedProducts.length && normalizedProducts.every((product) => product.variants.length > 0)) {
            process.stdout.write(`Product anomaly repair reusing shared catalog snapshot: ${normalizedProducts.length} active products from ${resolve(rootDir, candidate)}.\n`);
            return {
              products: normalizedProducts,
              source: {
                kind: "shared-release-catalog-snapshot",
                path: resolve(rootDir, candidate),
                products: normalizedProducts.length,
                variants: normalizedProducts.reduce((total, product) => total + product.variants.length, 0),
                coverageExact: true,
              },
            };
          }
        }
      } catch {
        // Fall through to a fresh Shopify bulk read when the shared snapshot
        // is absent, incomplete, or not parseable.
      }
    }
  }
  const started = await client.run(BULK_OPERATION_RUN_QUERY, { query: BULK_ACTIVE_PRODUCTS_QUERY }, {
    allowMutations: true,
    operation: "start full active product anomaly repair audit",
  });
  const errors = asArray(started?.bulkOperationRunQuery?.userErrors);
  if (errors.length) throw new Error(errors.map((error) => normalizeText(error?.message)).filter(Boolean).join("; "));
  const operationId = started?.bulkOperationRunQuery?.bulkOperation?.id;
  if (!operationId) throw new Error("Shopify returned no product anomaly repair bulk operation id.");
  const operation = await waitForBulkOperation(operationId);
  if (!operation.url) throw new Error("Completed product anomaly repair bulk operation returned no result URL.");
  const response = await fetch(operation.url);
  if (!response.ok) throw new Error(`Product anomaly repair bulk download failed (${response.status}).`);

  const products = new Map();
  const decoder = new TextDecoder();
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Product anomaly repair bulk response has no readable body.");
  let buffer = "";
  let recordsRead = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      consumeBulkLine(products, buffer.slice(0, newlineIndex));
      recordsRead += 1;
      buffer = buffer.slice(newlineIndex + 1);
      newlineIndex = buffer.indexOf("\n");
    }
    if (recordsRead && recordsRead % 50_000 === 0) process.stdout.write(`Product anomaly repair parse: ${recordsRead} records, ${products.size} products.\n`);
  }
  buffer += decoder.decode();
  if (buffer.trim()) {
    consumeBulkLine(products, buffer);
    recordsRead += 1;
  }
  const normalizedProducts = [...products.values()]
    .filter((product) => product.id && product.handle)
    .map((product) => ({ ...product, variants: product.variants.filter((variant) => variant?.id) }));
  if (!normalizedProducts.length) throw new Error("Product anomaly repair received no active products.");
  return {
    products: normalizedProducts,
    source: {
      kind: "shopify-admin-bulk-query",
      storeDomain: client.storeDomain,
      apiVersion: client.apiVersion,
      query: "status:active",
      bulkOperationId: operationId,
      bulkObjectCount: Number(operation.objectCount || 0),
      recordsRead,
      products: normalizedProducts.length,
      variants: normalizedProducts.reduce((total, product) => total + product.variants.length, 0),
      coverageExact: normalizedProducts.every((product) => product.id && product.handle && product.variants.length > 0),
    },
  };
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
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function assertManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== 1) throw new Error("Product anomaly repair manifest schema is unsupported.");
  if (manifest.policy?.policyId !== policyId) throw new Error("Product anomaly repair policy ID does not match the current release policy.");
  if (manifest.source?.coverageExact !== true) throw new Error("Product anomaly repair manifest does not contain an exact active-catalog boundary.");
  if (!Array.isArray(manifest.tasks?.optionRenames) || !Array.isArray(manifest.tasks?.costDrafts)) {
    throw new Error("Product anomaly repair manifest is missing its repair task lists.");
  }
}

function formatUserErrors(errors) {
  return asArray(errors)
    .map((error) => normalizeText(error?.message || error))
    .filter(Boolean)
    .join("; ");
}

function toProductGid(productId) {
  const value = String(productId || "").trim();
  if (value.startsWith("gid://shopify/Product/")) return value;
  const numericId = value.match(/(\d+)$/)?.[1] || "";
  return numericId ? `gid://shopify/Product/${numericId}` : value;
}

async function fetchProduct(productId) {
  const variants = [];
  let after = null;
  let product = null;
  const productGid = toProductGid(productId);
  while (true) {
    const payload = await client.run(PRODUCT_QUERY, { id: productGid, variantAfter: after }, { operation: `read product anomaly repair ${productId}` });
    if (!payload?.product) return null;
    product ||= { ...payload.product, variants: [] };
    variants.push(...asArray(payload.product.variants?.nodes));
    const pageInfo = payload.product.variants?.pageInfo;
    if (!pageInfo?.hasNextPage) break;
    after = pageInfo.endCursor;
    if (!after) throw new Error(`Product ${productId} variant pagination returned no cursor.`);
  }
  return { ...product, variants };
}

function exactOptionReadback(product, task) {
  const options = productOptions(product);
  const option = options.find((entry) => entry.id === task.optionId);
  if (!option || option.name !== task.toName) return { ok: false, reason: "target option name was not read back exactly" };
  if (JSON.stringify(option.values) !== JSON.stringify(task.values)) return { ok: false, reason: "option values changed during rename" };
  const oldName = String(task.fromName || "").trim().toLowerCase();
  const selectedNames = asArray(product.variants).flatMap((variant) => asArray(variant?.selectedOptions).map((entry) => String(entry?.name || "").trim().toLowerCase()));
  if (oldName && selectedNames.includes(oldName)) return { ok: false, reason: "variant selectedOptions still expose the old option name" };
  return { ok: true };
}

function costEvidenceStillMatches(product, task) {
  const liveVariants = asArray(product?.variants);
  if (liveVariants.length !== task.variants.length) return { ok: false, reason: "variant count changed after dry-run" };
  const byId = new Map(liveVariants.map((variant) => [String(variant?.id || ""), variant]));
  for (const planned of task.variants) {
    const live = byId.get(planned.id);
    const liveCost = variantCost(live);
    if (!live || !Number.isFinite(liveCost) || Math.abs(liveCost - planned.costPerItem) >= 0.005) {
      return { ok: false, reason: `unit cost changed or is missing for variant ${planned.id}` };
    }
  }
  return { ok: true };
}

async function applyOptionTask(task) {
  if (["already-exact", "applied-verified", "verified"].includes(task.status)) return task;
  const product = await fetchProduct(task.productId);
  if (!product) return { ...task, status: "held-product-missing", error: "product no longer exists" };
  if (String(product.status).toUpperCase() !== "ACTIVE") return { ...task, status: "held-non-active", error: `product status is ${product.status}` };
  const option = productOptions(product).find((entry) => entry.id === task.optionId);
  const targetExists = productOptions(product).some((entry) => entry.id !== task.optionId && entry.name.toLowerCase() === task.toName.toLowerCase());
  if (!option) return { ...task, status: "held-option-missing", error: "option no longer exists" };
  if (option.name === task.toName) {
    const readback = exactOptionReadback(product, task);
    return readback.ok ? { ...task, status: "already-exact", verifiedAt: new Date().toISOString() } : { ...task, status: "failed-readback", error: readback.reason };
  }
  if (targetExists || !optionValuesMatchTarget(option.values, task.toName, product)) {
    return { ...task, status: "held-stale-evidence", error: targetExists ? "target option name collision" : "live option values no longer prove the planned semantic" };
  }
  const payload = await client.run(PRODUCT_OPTION_UPDATE_MUTATION, {
    productId: toProductGid(task.productId),
    option: { id: task.optionId, name: task.toName },
    variantStrategy: "LEAVE_AS_IS",
  }, { allowMutations: true, operation: `rename product option ${task.productId}` });
  const mutation = payload?.productOptionUpdate;
  const errors = formatUserErrors(mutation?.userErrors);
  if (errors) return { ...task, status: "failed", error: errors };
  const updated = await fetchProduct(task.productId);
  const readback = exactOptionReadback(updated, task);
  if (!readback.ok) return { ...task, status: "failed-readback", error: readback.reason };
  return { ...task, status: "applied-verified", appliedAt: new Date().toISOString(), verifiedAt: new Date().toISOString() };
}

async function applyCostTask(task) {
  if (["already-draft", "drafted-verified", "verified"].includes(task.status)) return task;
  const product = await fetchProduct(task.productId);
  if (!product) return { ...task, status: "held-product-missing", error: "product no longer exists" };
  const liveStatus = String(product.status || "").toUpperCase();
  if (liveStatus === "DRAFT") return { ...task, status: "already-draft", verifiedAt: new Date().toISOString() };
  if (liveStatus !== "ACTIVE") return { ...task, status: "held-non-active", error: `product status is ${product.status}` };
  const evidence = costEvidenceStillMatches(product, task);
  if (!evidence.ok) return { ...task, status: "held-stale-evidence", error: evidence.reason };
  const payload = await client.run(PRODUCT_UPDATE_MUTATION, {
    product: { id: toProductGid(task.productId), status: "DRAFT" },
  }, { allowMutations: true, operation: `draft cost outlier ${task.productId}` });
  const mutation = payload?.productUpdate;
  const errors = formatUserErrors(mutation?.userErrors);
  if (errors) return { ...task, status: "failed", error: errors };
  const updated = await fetchProduct(task.productId);
  if (String(updated?.status || "").toUpperCase() !== "DRAFT") return { ...task, status: "failed-readback", error: "product status did not read back as DRAFT" };
  return { ...task, status: "drafted-verified", appliedAt: new Date().toISOString(), verifiedAt: new Date().toISOString() };
}

async function runWithConcurrency(items, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.min(applyConcurrency, Math.max(1, items.length));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

async function runDryRun(destination) {
  const { products, source } = await fetchActiveProducts();
  const audit = buildProductAnomalyAudit(products, { costTargetForVariant, priceFloor });
  const plan = buildProductAnomalyRepairPlan(products, audit);
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: "dry-run",
    policy: {
      policyId,
      approvalEnv,
      optionAction: "rename only when every declared value proves the same dimension or hair-color semantic and no option-name collision exists",
      costAction: "draft only when every live variant has a cost and the product median is at least 4x and $100 above at least five comparable product medians and at or above peer p95",
      draftStatus: "DRAFT",
      priceFloor,
      costOverhead,
      minContributionMargin,
      clothingMinContributionMargin,
    },
    source,
    audit: {
      summary: audit.summary,
      priceSummary: audit.priceSummary,
      costSummary: audit.costSummary,
      optionAnomalies: audit.optionAnomalies,
      costAnomalies: audit.costAnomalies,
    },
    tasks: {
      optionRenames: plan.optionTasks,
      optionHeld: plan.optionHeld,
      costDrafts: plan.costTasks,
      costHeld: plan.costHeld,
    },
    summary: {
      ...plan.summary,
      coverageExact: source.coverageExact,
      writesApplied: false,
      applyConcurrency,
    },
  };
  await writeJsonAtomically(destination, manifest);
  process.stdout.write(`${JSON.stringify({ output: destination, summary: manifest.summary, priceSummary: audit.priceSummary, costSummary: audit.costSummary }, null, 2)}\n`);
  if (!source.coverageExact) throw new Error("Product anomaly repair dry-run did not cover every active product with variants.");
  if (plan.optionHeld.length || plan.costHeld.length) {
    process.stdout.write(`Held anomaly tasks quarantined: ${plan.optionHeld.length} option task(s), ${plan.costHeld.length} cost task(s); no unsafe writes were started.\n`);
  }
}

async function checkpointManifest(path, manifest) {
  manifest.updatedAt = new Date().toISOString();
  await writeJsonAtomically(path, manifest);
}

async function runApply(path) {
  if (process.env[approvalEnv] !== "1") throw new Error(`Set ${approvalEnv}=1 only for the approved product anomaly repair run.`);
  const manifest = await readJson(path);
  assertManifest(manifest);
  if (manifest.mode !== "dry-run" && manifest.mode !== "apply") throw new Error("Product anomaly repair apply requires a dry-run manifest.");
  manifest.mode = "apply";
  manifest.policy.approvalId = String(process.env.SALT_PRODUCT_ANOMALY_REPAIR_APPROVAL_ID || policyId).trim();
  const checkpointQueue = { current: Promise.resolve() };
  const checkpoint = () => {
    checkpointQueue.current = checkpointQueue.current.then(() => checkpointManifest(path, manifest));
    return checkpointQueue.current;
  };

  const optionTasks = manifest.tasks.optionRenames;
  const costTasks = manifest.tasks.costDrafts;
  const optionResults = await runWithConcurrency(optionTasks, async (task, index) => {
    const result = await applyOptionTask(task);
    manifest.tasks.optionRenames[index] = result;
    await checkpoint();
    process.stdout.write(`Option repair ${index + 1}/${optionTasks.length}: ${result.handle} -> ${result.status}\n`);
    return result;
  });
  const costResults = await runWithConcurrency(costTasks, async (task, index) => {
    const result = await applyCostTask(task);
    manifest.tasks.costDrafts[index] = result;
    await checkpoint();
    process.stdout.write(`Cost outlier ${index + 1}/${costTasks.length}: ${result.handle} -> ${result.status}\n`);
    return result;
  });
  await checkpointQueue.current;
  const failures = [...optionResults, ...costResults].filter((task) => String(task.status).startsWith("failed") || String(task.status).startsWith("held-"));
  manifest.summary = {
    ...manifest.summary,
    writesApplied: true,
    optionAppliedVerified: optionResults.filter((task) => ["already-exact", "applied-verified"].includes(task.status)).length,
    costDraftedVerified: costResults.filter((task) => ["already-draft", "drafted-verified"].includes(task.status)).length,
    failures: failures.length,
  };
  await checkpointManifest(path, manifest);
  if (failures.length) throw new Error(`Product anomaly repair apply failed or was held for ${failures.length} task(s): ${failures.slice(0, 8).map((task) => `${task.handle || task.productId}: ${task.error || task.status}`).join(" | ")}`);
  process.stdout.write(`${JSON.stringify({ output: path, summary: manifest.summary }, null, 2)}\n`);
}

async function runVerify(path) {
  const manifest = await readJson(path);
  assertManifest(manifest);
  const optionTasks = manifest.tasks.optionRenames.filter((task) => !String(task.status).startsWith("held-"));
  const costTasks = manifest.tasks.costDrafts.filter((task) => !String(task.status).startsWith("held-"));
  const optionResults = await runWithConcurrency(optionTasks, async (task) => {
    const product = await fetchProduct(task.productId);
    const readback = product ? exactOptionReadback(product, task) : { ok: false, reason: "product no longer exists" };
    return { task, ok: readback.ok, reason: readback.reason || "" };
  });
  const costResults = await runWithConcurrency(costTasks, async (task) => {
    const product = await fetchProduct(task.productId);
    const ok = String(product?.status || "").toUpperCase() === "DRAFT";
    return { task, ok, reason: ok ? "" : `live status is ${product?.status || "missing"}` };
  });
  const failures = [...optionResults, ...costResults].filter((result) => !result.ok);
  const unresolved = [
    ...manifest.tasks.optionRenames.filter((task) => !["already-exact", "applied-verified", "verified"].includes(task.status)),
    ...manifest.tasks.costDrafts.filter((task) => !["already-draft", "drafted-verified", "verified"].includes(task.status)),
  ];
  manifest.summary = {
    ...manifest.summary,
    verifiedAt: new Date().toISOString(),
    optionVerified: optionResults.filter((result) => result.ok).length,
    costVerified: costResults.filter((result) => result.ok).length,
    readbackFailures: failures.length,
    unresolved: unresolved.length,
    heldOptionTasks: asArray(manifest.tasks.optionHeld).length,
    heldCostTasks: asArray(manifest.tasks.costHeld).length,
  };
  await checkpointManifest(path, manifest);
  process.stdout.write(`${JSON.stringify({ output: path, summary: manifest.summary }, null, 2)}\n`);
  if (failures.length || unresolved.length) {
    throw new Error(`Product anomaly repair live readback failed: ${failures.length} readback failure(s), ${unresolved.length} unresolved task(s).`);
  }
}

async function run() {
  const args = parseArgs(process.argv);
  if (args.mode === "dry-run") await runDryRun(args.manifest);
  else if (args.mode === "apply") await runApply(args.manifest);
  else await runVerify(args.manifest);
}

run().catch((error) => {
  process.stderr.write(`Product anomaly repair failed: ${error?.stack || error}\n`);
  process.exitCode = 1;
});
