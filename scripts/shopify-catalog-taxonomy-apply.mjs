#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import {
  buildCatalogTaxonomyReleasePlan,
  buildManagedTagAdditions,
  isActiveShopifyProduct,
  taxonomyMetafieldMatches,
  verifyTaxonomyTaskReadback,
} from "../src/lib/catalog-taxonomy-release.js";
import { readProductCatalogPayload } from "./product-catalog-files.mjs";

const execFileAsync = promisify(execFile);
const rootDir = resolve(import.meta.dirname, "..");
const inputDir = resolve(rootDir, "public", "data");
const defaultOutputPath = resolve(rootDir, "output", "catalog-taxonomy-apply-manifest.json");
const shopBase = process.env.SALT_SHOP_URL || "https://0309d3-72.myshopify.com";
const storeDomain = new URL(shopBase).hostname;
const apiVersion = process.env.SHOPIFY_ADMIN_API_VERSION || "2026-07";
const adminAccessToken = (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SALT_SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
const adminGraphqlUrl = `${new URL(shopBase).origin}/admin/api/${apiVersion}/graphql.json`;
const cliBinary = process.env.SHOPIFY_CLI_BINARY || "shopify";
const cliAgentInfo = process.env.SHOPIFY_CLI_AGENT_INFO || "n:salt-shine-enhancer|v:1|p:catalog-taxonomy-release";
const cliAgentIds =
  process.env.SHOPIFY_CLI_AGENT_IDS ||
  `s:${process.env.CONVERSATION_ID || "local"}|r:${process.pid}|i:catalog-taxonomy-release`;
const requestDelayMs = Math.max(0, Number(process.env.SALT_SHOPIFY_REQUEST_DELAY_MS || 300));
const maxAttempts = Math.max(1, Number(process.env.SALT_SHOPIFY_MAX_REQUEST_ATTEMPTS || 5));
const maxRetryDelayMs = Math.max(1000, Number(process.env.SALT_SHOPIFY_MAX_RETRY_DELAY_MS || 30_000));
const batchSize = Math.max(1, Math.min(25, Number(process.env.SALT_CATALOG_TAXONOMY_BATCH_SIZE || 20)));
const concurrency = Math.max(1, Math.min(8, Number(process.env.SALT_CATALOG_TAXONOMY_CONCURRENCY || 2)));
const activeProductQuery = "status:active";

const PRODUCT_SELECTION = /* GraphQL */ `
  id
  handle
  title
  descriptionHtml
  productType
  vendor
  status
  tags
  taxonomyMetafield: metafield(namespace: "salt_taxonomy", key: "classification") {
    namespace
    key
    type
    value
  }
`;

const ACTIVE_PRODUCTS_QUERY = /* GraphQL */ `
  query CatalogTaxonomyProducts($first: Int!, $after: String, $query: String!) {
    products(first: $first, after: $after, query: $query) {
      nodes {
        ${PRODUCT_SELECTION}
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const PRODUCTS_BY_ID_QUERY = /* GraphQL */ `
  query CatalogTaxonomyProductsById($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        ${PRODUCT_SELECTION}
      }
    }
  }
`;

const METAFIELDS_SET_MUTATION = /* GraphQL */ `
  mutation CatalogTaxonomyMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        namespace
        key
        type
        value
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function parseArgs(argv) {
  const args = {
    mode: "dry-run",
    output: defaultOutputPath,
    sample: 0,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--apply") {
      args.mode = "apply";
      continue;
    }
    if (token === "--dry-run") {
      args.mode = "dry-run";
      continue;
    }
    if (token === "--output") {
      args.output = resolve(rootDir, argv[index + 1] || args.output);
      index += 1;
      continue;
    }
    if (token === "--sample") {
      args.sample = Math.max(0, Number(argv[index + 1] || 0) || 0);
      index += 1;
    }
  }

  return args;
}

function getCliEnv() {
  return {
    ...process.env,
    SHOPIFY_CLI_AGENT_INFO: cliAgentInfo,
    SHOPIFY_CLI_AGENT_IDS: cliAgentIds,
  };
}

function formatGraphqlErrors(errors) {
  return asArray(errors)
    .map((entry) => normalizeText(entry?.message || "Unknown Shopify GraphQL error"))
    .filter(Boolean)
    .join(" | ");
}

function parseGraphQlPayload(raw) {
  const text = String(raw || "").trim();
  const jsonStart = text.indexOf("{");
  if (jsonStart < 0) {
    throw new Error(text || "Shopify returned no JSON payload");
  }

  const payload = JSON.parse(text.slice(jsonStart));
  if (asArray(payload?.errors).length) {
    throw new Error(formatGraphqlErrors(payload.errors));
  }
  if (asArray(payload?.data?.errors).length) {
    throw new Error(formatGraphqlErrors(payload.data.errors));
  }
  return payload?.data || payload || {};
}

function isRetryable(error) {
  return /429|rate limit|throttl|timeout|timed out|5\d\d|network|socket|temporar|aborted|enotfound|eai_again|getaddrinfo|dns/i.test(
    String(error?.message || error),
  );
}

let lastRequestFinishedAt = 0;

async function runShopifyGraphQL(query, variables, { allowMutations = false, operation = "Shopify request", retryInfo = [] } = {}) {
  const waitFor = requestDelayMs - (Date.now() - lastRequestFinishedAt);
  if (waitFor > 0) {
    await sleep(waitFor);
  }

  let attempt = 0;
  while (true) {
    try {
      if (adminAccessToken) {
        const response = await fetch(adminGraphqlUrl, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": adminAccessToken,
          },
          body: JSON.stringify({ query, variables: variables || {} }),
        });
        const raw = await response.text();
        if (!response.ok) {
          throw new Error(`Admin GraphQL HTTP ${response.status}: ${raw.slice(0, 500)}`);
        }
        lastRequestFinishedAt = Date.now();
        return parseGraphQlPayload(raw);
      }

      const tempDir = await mkdtemp(join(tmpdir(), "salt-catalog-taxonomy-"));
      const queryPath = join(tempDir, "operation.graphql");
      const variablesPath = join(tempDir, "variables.json");
      const outputFile = join(tempDir, "result.json");
      try {
        await Promise.all([
          writeFile(queryPath, query, "utf8"),
          writeFile(variablesPath, JSON.stringify(variables || {}, null, 2), "utf8"),
        ]);
        const args = [
          "store",
          "execute",
          "--store",
          storeDomain,
          "--version",
          apiVersion,
          "--query-file",
          queryPath,
          "--variable-file",
          variablesPath,
          "--output-file",
          outputFile,
          "--json",
        ];
        if (allowMutations) {
          args.push("--allow-mutations");
        }
        const result = await execFileAsync(cliBinary, args, {
          cwd: rootDir,
          env: getCliEnv(),
          maxBuffer: 20 * 1024 * 1024,
        });
        let raw = result.stdout || "";
        try {
          raw = await readFile(outputFile, "utf8");
        } catch {
          // Some Shopify CLI versions only emit the JSON response on stdout.
        }
        lastRequestFinishedAt = Date.now();
        return parseGraphQlPayload(raw);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      lastRequestFinishedAt = Date.now();
      if (!isRetryable(error) || attempt >= maxAttempts - 1) {
        throw new Error(`${operation} failed: ${normalizeText(error?.message || error)}`);
      }

      const delayMs = Math.min(maxRetryDelayMs, Math.max(requestDelayMs, 1000 * 2 ** attempt));
      retryInfo.push({
        operation,
        attempt: attempt + 1,
        delayMs,
        message: normalizeText(error?.message || error).slice(0, 500),
        at: new Date().toISOString(),
      });
      process.stdout.write(`${operation} failed; retrying in ${Math.ceil(delayMs / 1000)}s\n`);
      await sleep(delayMs);
      attempt += 1;
    }
  }
}

async function verifyApprovalForApply() {
  try {
    await execFileAsync(process.execPath, ["scripts/catalog-taxonomy-approval.mjs"], {
      cwd: rootDir,
      env: process.env,
      maxBuffer: 2 * 1024 * 1024,
    });
  } catch (error) {
    const details = normalizeText(error?.stderr || error?.stdout || error?.message || error);
    throw new Error(`Approved taxonomy release verification failed: ${details}`);
  }
}

function assertActiveProduct(product, operation) {
  if (!isActiveShopifyProduct(product)) {
    throw new Error(`${operation}: ${product?.handle || product?.id || "unknown product"} is not active.`);
  }
}

async function fetchActiveProducts(retryInfo) {
  const products = [];
  let after = null;
  let page = 0;

  while (true) {
    page += 1;
    const data = await runShopifyGraphQL(
      ACTIVE_PRODUCTS_QUERY,
      { first: 250, after, query: activeProductQuery },
      { operation: `active product page ${page}`, retryInfo },
    );
    const connection = data?.products;
    if (!connection) {
      throw new Error("Shopify returned no products connection. Grant read_products access before this release.");
    }

    for (const product of asArray(connection.nodes)) {
      assertActiveProduct(product, "active product query");
      products.push(product);
    }

    if (!connection.pageInfo?.hasNextPage) {
      break;
    }
    if (!connection.pageInfo.endCursor) {
      throw new Error(`Active product page ${page} hasNextPage without an end cursor.`);
    }
    after = connection.pageInfo.endCursor;
  }

  return products;
}

async function fetchProductsById(ids, retryInfo, operation) {
  const uniqueIds = [...new Set(asArray(ids).filter(Boolean))];
  if (!uniqueIds.length) {
    return new Map();
  }

  const data = await runShopifyGraphQL(
    PRODUCTS_BY_ID_QUERY,
    { ids: uniqueIds },
    { operation, retryInfo },
  );
  const products = asArray(data?.nodes).filter((product) => product?.id);
  for (const product of products) {
    assertActiveProduct(product, operation);
  }
  return new Map(products.map((product) => [product.id, product]));
}

async function writeManifest(filePath, manifest) {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

function manifestTask(task, status = "pending") {
  return {
    productId: task.productId,
    localProductId: task.localProductId,
    handle: task.handle,
    title: task.title,
    initialTags: task.initialTags,
    proposedTags: task.proposedTags,
    tagsToAdd: task.tagsToAdd,
    taxonomyMetafield: task.taxonomyMetafield,
    metafieldNeedsUpdate: task.metafieldNeedsUpdate,
    knowledge: task.knowledge,
    status,
    verifiedAt: "",
    failure: "",
  };
}

function refreshManifestSummary(manifest) {
  const tasks = asArray(manifest.tasks);
  manifest.summary.wouldUpdate = tasks.filter((task) => task.status === "would-update").length;
  manifest.summary.updatedVerified = tasks.filter((task) => task.status === "updated-verified").length;
  manifest.summary.exact = tasks.filter((task) => task.status === "skipped-exact-match").length;
  manifest.summary.failed = tasks.filter((task) => task.status === "failed").length;
  manifest.summary.tagsToAdd = tasks.reduce((total, task) => total + asArray(task.tagsToAdd).length, 0);
  manifest.summary.metafieldsToSet = tasks.filter((task) => task.metafieldNeedsUpdate).length;
}

function createManifest({ mode, plan, output }) {
  return {
    schemaVersion: 1,
    runId: `${Date.now()}-${process.pid}`,
    startedAt: new Date().toISOString(),
    completedAt: "",
    mode,
    output,
    source: {
      catalog: resolve(inputDir, "products.json"),
      store: storeDomain,
      apiVersion,
      productQuery: activeProductQuery,
    },
    policy: {
      scope: "all active Shopify products before final sales-channel publication",
      salesChannelQuery: "none; publication is intentionally deferred to the final release phase",
      publicationMutation: "none",
      existingTags: "preserve exactly",
      managedTags: "add-only salt namespace",
      prices: "preserve",
      variants: "no mutation",
      collections: "no mutation",
      categoryMutation: "no mutation in taxonomy tag/metafield phase",
      metafield: "salt_taxonomy.classification JSON only",
      readback: "tag superset and exact classification metafield required",
      batchSize,
      concurrency,
    },
    summary: {
      ...plan.summary,
      wouldUpdate: 0,
      updatedVerified: 0,
      exact: 0,
      failed: 0,
    },
    skipped: plan.skipped,
    retryInfo: [],
    tasks: plan.tasks.map((task) => manifestTask(task)),
  };
}

function markFailed(manifestTaskEntry, error) {
  manifestTaskEntry.status = "failed";
  manifestTaskEntry.failure = normalizeText(error?.message || error);
  manifestTaskEntry.verifiedAt = new Date().toISOString();
}

function refreshTaskAgainstLive(task, liveProduct) {
  assertActiveProduct(liveProduct, "Pre-write readback");
  const taxonomyMetafield = task.taxonomyMetafield;
  return {
    ...task,
    initialTags: asArray(liveProduct.tags).map(normalizeText).filter(Boolean),
    tagsToAdd: buildManagedTagAdditions(liveProduct.tags, task.proposedTags),
    metafieldNeedsUpdate: !taxonomyMetafieldMatches(liveProduct, taxonomyMetafield),
  };
}

function buildTagsAddMutation(tasks) {
  const mutations = [];
  const variables = {};
  const aliases = [];

  tasks.forEach((task, index) => {
    if (!task.tagsToAdd.length) {
      return;
    }
    const operationIndex = aliases.length;
    const idVariable = `id${operationIndex}`;
    const tagsVariable = `tags${operationIndex}`;
    const alias = `tag${operationIndex}`;
    variables[idVariable] = task.productId;
    variables[tagsVariable] = task.tagsToAdd;
    aliases.push({ alias, task });
    mutations.push(
      `${alias}: tagsAdd(id: $${idVariable}, tags: $${tagsVariable}) { userErrors { field message } }`,
    );
  });

  if (!mutations.length) {
    return null;
  }

  const declarations = aliases.flatMap((_, index) => [`$id${index}: ID!`, `$tags${index}: [String!]!`]);
  return {
    query: `mutation CatalogTaxonomyTagsAdd(${declarations.join(", ")}) { ${mutations.join(" ")} }`,
    variables,
    aliases,
  };
}

async function applyTagBatch(tasks, retryInfo, batchLabel) {
  const mutation = buildTagsAddMutation(tasks);
  if (!mutation) {
    return;
  }

  const payload = await runShopifyGraphQL(mutation.query, mutation.variables, {
    allowMutations: true,
    operation: `taxonomy tag batch ${batchLabel}`,
    retryInfo,
  });
  const failures = mutation.aliases
    .map(({ alias, task }) => ({ task, errors: asArray(payload?.[alias]?.userErrors) }))
    .filter((entry) => entry.errors.length);
  if (failures.length) {
    throw new Error(
      failures
        .map(({ task, errors }) => `${task.handle}: ${formatGraphqlErrors(errors)}`)
        .join(" | "),
    );
  }
}

async function applyMetafieldBatch(tasks, retryInfo, batchLabel) {
  const pending = tasks.filter((task) => task.metafieldNeedsUpdate);
  if (!pending.length) {
    return;
  }

  const payload = await runShopifyGraphQL(
    METAFIELDS_SET_MUTATION,
    {
      metafields: pending.map((task) => task.taxonomyMetafield),
    },
    {
      allowMutations: true,
      operation: `taxonomy metafield batch ${batchLabel}`,
      retryInfo,
    },
  );
  const errors = asArray(payload?.metafieldsSet?.userErrors);
  if (errors.length) {
    throw new Error(formatGraphqlErrors(errors));
  }
}

function assertTaskReadback(task, product) {
  const verification = verifyTaxonomyTaskReadback(task, product);
  if (verification.ok) {
    return;
  }
  const issues = [];
  if (verification.missingExistingTags.length) {
    issues.push(`existing tags missing: ${verification.missingExistingTags.join(", ")}`);
  }
  if (verification.missingManagedTags.length) {
    issues.push(`managed tags missing: ${verification.missingManagedTags.join(", ")}`);
  }
  if (!verification.metafieldMatches) {
    issues.push("classification metafield mismatch");
  }
  throw new Error(issues.join("; "));
}

async function runCatalogTaxonomyRelease({ mode, output, sample }) {
  if (mode === "apply") {
    await verifyApprovalForApply();
  }

  const retryInfo = [];
  const [catalog, liveProducts] = await Promise.all([
    readProductCatalogPayload(inputDir),
    fetchActiveProducts(retryInfo),
  ]);
  const localByHandle = new Map(
    asArray(catalog.products)
      .map((product) => [normalizeText(product?.handle).toLowerCase(), product])
      .filter(([handle]) => Boolean(handle)),
  );
  const sourceProducts = liveProducts.map((liveProduct) => {
    const handle = normalizeText(liveProduct?.handle).toLowerCase();
    const localProduct = localByHandle.get(handle) || {};
    return {
      ...localProduct,
      id: localProduct.id || liveProduct.id,
      handle: liveProduct.handle || localProduct.handle,
      title: liveProduct.title || localProduct.title,
      body_html: liveProduct.descriptionHtml || localProduct.body_html,
      product_type: liveProduct.productType || localProduct.product_type,
      vendor: liveProduct.vendor || localProduct.vendor,
      tags: asArray(liveProduct.tags),
    };
  });
  const localProducts = sample > 0 ? sourceProducts.slice(0, sample) : sourceProducts;
  const plan = buildCatalogTaxonomyReleasePlan(localProducts, liveProducts);
  const manifest = createManifest({ mode, plan, output });
  manifest.retryInfo = retryInfo;

  if (mode === "dry-run") {
    for (const entry of manifest.tasks) {
      entry.status = entry.tagsToAdd.length || entry.metafieldNeedsUpdate ? "would-update" : "skipped-exact-match";
    }
    manifest.completedAt = new Date().toISOString();
    refreshManifestSummary(manifest);
    await writeManifest(output, manifest);
    process.stdout.write(
      `Catalog taxonomy dry run complete: ${manifest.summary.wouldUpdate} would update, ${manifest.summary.exact} exact, ${manifest.summary.skipped} skipped.\n`,
    );
    return manifest;
  }

  const manifestById = new Map(manifest.tasks.map((task) => [task.productId, task]));
  // Re-read every product that still needs a mutation. Exact products are
  // excluded on resume so an interrupted release only retries live mismatches.
  const actionableTasks = plan.tasks.filter(
    (task) => task.tagsToAdd.length > 0 || task.metafieldNeedsUpdate,
  );

  // Batches are disjoint, so they can be verified concurrently. Checkpoint
  // writes remain serialized to keep the manifest valid if a worker fails.
  const batchTotal = Math.ceil(actionableTasks.length / batchSize);
  let nextBatchIndex = 0;
  let firstFailure = null;
  let manifestWriteChain = Promise.resolve();
  const queueManifestWrite = () => {
    manifestWriteChain = manifestWriteChain.then(async () => {
      refreshManifestSummary(manifest);
      await writeManifest(output, manifest);
    });
    return manifestWriteChain;
  };

  const processBatch = async (batch, batchLabel) => {
    const batchRetryInfo = [];

    try {
      const currentById = await fetchProductsById(
        batch.map((task) => task.productId),
        batchRetryInfo,
        `taxonomy pre-write read batch ${batchLabel}`,
      );
      const currentTasks = [];
      for (const task of batch) {
        const current = currentById.get(task.productId);
        const manifestTaskEntry = manifestById.get(task.productId);
        if (!current) {
          throw new Error(`${task.handle}: product is no longer active.`);
        }
        const refreshed = refreshTaskAgainstLive(task, current);
        currentTasks.push(refreshed);
        Object.assign(manifestTaskEntry, manifestTask(refreshed));
      }

      await Promise.all([
        applyTagBatch(currentTasks, batchRetryInfo, batchLabel),
        applyMetafieldBatch(currentTasks, batchRetryInfo, batchLabel),
      ]);

      const finalById = await fetchProductsById(
        currentTasks.map((task) => task.productId),
        batchRetryInfo,
        `taxonomy final readback batch ${batchLabel}`,
      );
      for (const task of currentTasks) {
        const manifestTaskEntry = manifestById.get(task.productId);
        const finalProduct = finalById.get(task.productId);
        if (!finalProduct) {
          throw new Error(`${task.handle}: product disappeared or became inactive before readback.`);
        }
        assertTaskReadback(task, finalProduct);
        const changed = task.tagsToAdd.length > 0 || task.metafieldNeedsUpdate;
        Object.assign(manifestTaskEntry, manifestTask(task, changed ? "updated-verified" : "skipped-exact-match"), {
          verifiedAt: new Date().toISOString(),
        });
      }
      process.stdout.write(`Catalog taxonomy batch ${batchLabel} verified (${currentTasks.length} products)\n`);
    } catch (error) {
      for (const task of batch) {
        const entry = manifestById.get(task.productId);
        if (entry?.status !== "updated-verified") {
          markFailed(entry, error);
        }
      }
      manifest.retryInfo.push(...batchRetryInfo);
      await queueManifestWrite();
      throw error;
    }

    manifest.retryInfo.push(...batchRetryInfo);
    await queueManifestWrite();
  };

  const worker = async () => {
    while (!firstFailure) {
      const batchIndex = nextBatchIndex;
      nextBatchIndex += 1;
      if (batchIndex >= batchTotal) {
        return;
      }

      const start = batchIndex * batchSize;
      const batch = actionableTasks.slice(start, start + batchSize);
      try {
        await processBatch(batch, `${batchIndex + 1}/${batchTotal}`);
      } catch (error) {
        firstFailure ||= error;
        return;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, batchTotal) }, () => worker()),
  );
  await manifestWriteChain;
  if (firstFailure) {
    throw firstFailure;
  }

  for (const task of plan.tasks) {
    const entry = manifestById.get(task.productId);
    if (entry?.status === "pending") {
      entry.status = "skipped-exact-match";
      entry.verifiedAt = new Date().toISOString();
    }
  }

  manifest.completedAt = new Date().toISOString();
  refreshManifestSummary(manifest);
  await writeManifest(output, manifest);
  process.stdout.write(
    `Catalog taxonomy release complete: ${manifest.summary.updatedVerified} updated and verified, ${manifest.summary.exact} exact, ${manifest.summary.skipped} skipped.\n`,
  );
  return manifest;
}

async function main() {
  const args = parseArgs(process.argv);
  await runCatalogTaxonomyRelease(args);
}

main().catch((error) => {
  process.stderr.write(`${error.message || error}\n`);
  process.exitCode = 1;
});
