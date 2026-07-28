#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { promisify } from "node:util";

import { normalizeHandleValue, normalizePlainText } from "../src/lib/shopify-seo-batch.js";
import { readProductCatalogPayload } from "./product-catalog-files.mjs";

const execFileAsync = promisify(execFile);
const rootDir = resolve(import.meta.dirname, "..");
const defaultInputPath = resolve(rootDir, "public", "data", "products.json");
const defaultOutputPath = resolve(rootDir, "output", "shopify-variant-image-mapping-manifest.json");
const defaultHandlesPath = resolve(rootDir, "output", "shopify-seo-scope-handles.json");
const storeDomain = new URL(process.env.SALT_SHOP_URL || "https://0309d3-72.myshopify.com").hostname;
const apiVersion = process.env.SHOPIFY_ADMIN_API_VERSION || "2026-07";
const cliBinary = process.env.SHOPIFY_CLI_BINARY || "shopify";
const requestDelayMs = Math.max(0, Number(process.env.SALT_SHOPIFY_REQUEST_DELAY_MS || 0));
const maxAttempts = Math.max(1, Number(process.env.SALT_SHOPIFY_MAX_REQUEST_ATTEMPTS || 5));
const maxBatchProducts = Math.max(1, Math.min(25, Number(process.env.SALT_VARIANT_IMAGE_BATCH_SIZE || 25)));
const applyConcurrency = Math.max(1, Number(process.env.SALT_VARIANT_IMAGE_APPLY_CONCURRENCY || 2));
const verifyConcurrency = Math.max(1, Number(process.env.SALT_VARIANT_IMAGE_VERIFY_CONCURRENCY || 5));
const interBatchDelayMs = Math.max(0, Number(process.env.SALT_VARIANT_IMAGE_INTER_BATCH_DELAY_MS || 500));
const TARGET_QUERY_COST = 900;

const liveProductPageSize = Math.max(
  1,
  Math.min(10, Number(process.env.SALT_VARIANT_IMAGE_PAGE_SIZE || 10))
);

const liveVariantPageSize = Math.max(
  1,
  Math.min(25, Number(process.env.SALT_VARIANT_IMAGE_VARIANT_PAGE_SIZE || 25))
);

const liveMediaPageSize = Math.max(
  1,
  Math.min(25, Number(process.env.SALT_VARIANT_IMAGE_MEDIA_PAGE_SIZE || 25))
);
const graphqlTimeoutMs = Math.max(30_000, Number(process.env.SALT_SHOPIFY_GRAPHQL_TIMEOUT_MS || 120_000));

const LIVE_PRODUCTS_QUERY = /* GraphQL */ `
  query ShopifyVariantImageProducts($first: Int!, $after: String, $variantFirst: Int!, $mediaFirst: Int!) {
    products(first: $first, after: $after) {
      nodes {
        id
        handle
        title
        variants(first: $variantFirst) {
          nodes {
            id
            title
            sku
            selectedOptions {
              name
              value
            }
            image {
              id
              url
              altText
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        media(first: $mediaFirst) {
          nodes {
            __typename
            ... on MediaImage {
              id
              image {
                url
                altText
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

function parseArgs(argv) {
  const args = {
    mode: "dry-run",
    scope: "all-products",
    inputPath: defaultInputPath,
    outputPath: defaultOutputPath,
    handlesPath: defaultHandlesPath,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--apply") args.mode = "apply";
    else if (token === "--dry-run") args.mode = "dry-run";
    else if (token === "--scope" && next) {
      args.scope = next;
      index += 1;
    } else if (token === "--all-products") args.scope = "all-products";
    else if (token === "--new-products-only") args.scope = "new-products";
    else if (token === "--input" && next) {
      args.inputPath = resolve(rootDir, next);
      index += 1;
    } else if (token === "--output" && next) {
      args.outputPath = resolve(rootDir, next);
      index += 1;
    } else if (token === "--handles-output" && next) {
      args.handlesPath = resolve(rootDir, next);
      index += 1;
    }
  }

  if (!["all-products", "new-products"].includes(args.scope)) {
    throw new Error(`Invalid --scope ${args.scope}; expected all-products or new-products`);
  }

  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tokenise(value) {
  return normalizePlainText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function unique(array) {
  return [...new Set(array.filter(Boolean))];
}

async function concurrentExecutor(tasks, concurrency, interTaskDelay = 0) {
  const results = [];
  const total = tasks.length;
  let index = 0;

  async function worker() {
    while (index < total) {
      const current = index++;
      try {
        results[current] = { status: "fulfilled", value: await tasks[current]() };
      } catch (error) {
        results[current] = { status: "rejected", reason: error };
      }
      if (interTaskDelay > 0 && current < total - 1) {
        await sleep(interTaskDelay);
      }
      if (total > 10 && (current + 1) % Math.max(1, Math.floor(total / 20)) === 0) {
        const done = results.filter((r) => r !== undefined).length;
        process.stdout.write(`  Progress: ${done}/${total} (${Math.round((done / total) * 100)}%)\n`);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
  await Promise.all(workers);

  const failures = results.filter((r) => r && r.status === "rejected");
  if (failures.length) {
    const first = failures[0].reason;
    const rest = failures.length - 1;
    throw new Error(`${first.message || first}${rest ? ` (and ${rest} more failure(s))` : ""}`);
  }

  return results.filter((r) => r && r.status === "fulfilled").map((r) => r.value);
}

function scoreImageMatch(variant, image) {
  const variantText = normalizePlainText([
    variant?.title,
    variant?.sku,
    ...(Array.isArray(variant?.selectedOptions) ? variant.selectedOptions.map((option) => option?.value) : []),
  ]
    .filter(Boolean)
    .join(" "))
    .toLowerCase();
  const imageText = normalizePlainText([image?.altText, image?.url, image?.src, basename(image?.url || image?.src || "")].filter(Boolean).join(" ")).toLowerCase();
  const variantTokens = tokenise(variantText);
  const imageTokens = tokenise(imageText);
  let score = 0;

  if (!variantTokens.length || !imageTokens.length) return score;

  for (const token of variantTokens) {
    if (token.length < 3) continue;
    if (imageText.includes(token)) score += token.length >= 6 ? 8 : 4;
    if (variant?.sku && normalizePlainText(variant.sku).toLowerCase().includes(token)) score += 6;
  }

  if (variant?.sku && imageText.includes(normalizePlainText(variant.sku).toLowerCase())) {
    score += 12;
  }

  const optionValues = Array.isArray(variant?.selectedOptions) ? variant.selectedOptions.map((option) => normalizePlainText(option?.value).toLowerCase()).filter(Boolean) : [];
  for (const optionValue of optionValues) {
    if (optionValue.length >= 3 && imageText.includes(optionValue)) {
      score += 6;
    }
  }

  if (variant?.title && imageText.includes(normalizePlainText(variant.title).toLowerCase())) {
    score += 5;
  }

  return score;
}

function chooseVariantImage(variant, images, product) {
  if (!Array.isArray(images) || !images.length || !variant) return null;
  const existing = variant.image?.id ? String(variant.image.id) : "";
  const scored = images
    .map((image) => ({ image, score: scoreImageMatch(variant, image) }))
    .sort((left, right) => right.score - left.score);

  const best = scored[0];
  const oneImageOnly = images.length === 1;
  const oneVariantOnly = Array.isArray(product?.variants) ? product.variants.length === 1 : false;
  const strongMatch = best && best.score >= 10;
  const moderateMatch = best && best.score >= 16;

  if (existing && best?.image?.id && String(best.image.id) === existing) {
    return { mediaId: existing, score: best.score, reason: "already-aligned" };
  }

  if (strongMatch || (oneImageOnly && oneVariantOnly)) {
    return {
      mediaId: String(best.image.id || ""),
      score: best.score,
      reason: strongMatch ? "token-match" : "single-image-single-variant",
      confidence: moderateMatch ? "high" : "medium",
    };
  }

  return null;
}

async function executeGraphQl(query, variables = {}, { mutation = false, operation = "Shopify request" } = {}) {
  const cliArgs = [
    "store",
    "execute",
    "--store",
    storeDomain,
    "--version",
    apiVersion,
    "--query",
    query,
    "--variables",
    JSON.stringify(variables),
    "--json",
  ];
  if (mutation) cliArgs.push("--allow-mutations");

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const result = await execFileAsync(cliBinary, cliArgs, {
        cwd: rootDir,
        timeout: graphqlTimeoutMs,
        env: {
          ...process.env,
          SHOPIFY_CLI_AGENT_INFO: process.env.SHOPIFY_CLI_AGENT_INFO || "n:salt-shine-enhancer|v:1|p:openai",
          SHOPIFY_CLI_AGENT_IDS: process.env.SHOPIFY_CLI_AGENT_IDS || `s:${process.env.CONVERSATION_ID || "local"}|r:${process.pid}|i:variant-image-mapping`,
        },
        maxBuffer: 40 * 1024 * 1024,
      });
      const text = String(result.stdout || "").trim();
      const startIndex = text.indexOf("{");
      if (startIndex === -1) {
        throw new Error(`${operation} returned no JSON payload: ${text.slice(0, 500)}`);
      }
      const payload = JSON.parse(text.slice(startIndex));
      // Check for throttled/rate-limited errors first as they are transient
      if (payload.errors?.length) {
        const throttled = payload.errors.some(
          (e) => /throttled|rate limit|429/i.test(e?.message || e?.extensions?.code || "")
        );
        if (throttled) {
          throw new Error(`Throttled`);
        }
        throw new Error(payload.errors.map((error) => error.message).join(" | "));
      }
      return payload.data || payload;
    } catch (error) {
      const message = String(error?.stderr || error?.stdout || error?.message || error);
      const transient = /429|throttl|rate limit|timeout|5\d\d|network|socket|temporar|aborted|MAX_COST_EXCEEDED|Query cost/i.test(message);
      if (!transient || attempt === maxAttempts - 1) {
        throw new Error(`${operation} failed: ${message.trim()}`);
      }
      // Use a longer base delay for "Throttled" errors and add jitter to avoid thundering herd
      const baseDelay = /throttled|THROTTLED/i.test(message) ? 2000 * 2 ** attempt : 1000 * 2 ** attempt;
      const jitter = Math.floor(Math.random() * baseDelay * 0.3);
      const retryMs = Math.min(30_000, baseDelay + jitter);
      process.stdout.write(`${operation} throttled; retrying in ${(retryMs / 1000).toFixed(1)}s\n`);
      await sleep(retryMs);
    }
  }
  throw new Error(`${operation} failed`);
}

async function loadHandles(handlesPath) {
  try {
    const raw = await readFile(handlesPath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.map((handle) => normalizeHandleValue(handle)).filter(Boolean));
    if (Array.isArray(parsed?.handles)) return new Set(parsed.handles.map((handle) => normalizeHandleValue(handle)).filter(Boolean));
  } catch {
    return null;
  }
  return null;
}

async function loadSnapshot(inputPath) {
  if (basename(inputPath) === "products.json") {
    return readProductCatalogPayload(dirname(inputPath));
  }

  const raw = await readFile(inputPath, "utf8");
  return JSON.parse(raw);
}

async function fetchLiveProducts() {
  const products = [];
  let after = null;
  let pageSize = liveProductPageSize;
  let variantPageSize = liveVariantPageSize;
  let mediaPageSize = liveMediaPageSize;
  const minPageSize = 1;

  while (true) {
    try {
      process.stdout.write(`Fetching live Shopify product page ${products.length + 1} (size ${pageSize})...\n`);
      const data = await executeGraphQl(
        LIVE_PRODUCTS_QUERY,
        { first: pageSize, after, variantFirst: variantPageSize, mediaFirst: mediaPageSize },
        { operation: `product page ${products.length + 1} (size ${pageSize}, variants ${variantPageSize}, media ${mediaPageSize})` },
      );
      const connection = data.products;
      products.push(...(connection?.nodes || []));
      after = connection?.pageInfo?.hasNextPage ? connection.pageInfo.endCursor : null;
      if (!after) break;
      if (requestDelayMs) {
        await sleep(requestDelayMs);
      }
    } catch (error) {
      const message = String(error?.message || error);
      if (!/MAX_COST_EXCEEDED|exceeds the single query max cost limit|Query cost is/i.test(message)) {
        throw error;
      }
      const canShrinkPage = pageSize > minPageSize;
      const canShrinkVariants = variantPageSize > 1;
      const canShrinkMedia = mediaPageSize > 1;
      if (!canShrinkPage && !canShrinkVariants && !canShrinkMedia) {
        throw error;
      }
      pageSize = canShrinkPage
        ? Math.max(1, Math.ceil(pageSize * 0.75))
        : pageSize;
      variantPageSize = canShrinkVariants
        ? Math.max(5, Math.ceil(variantPageSize * 0.75))
        : variantPageSize;
      mediaPageSize = canShrinkMedia
        ? Math.max(5, Math.ceil(mediaPageSize * 0.75))
        : mediaPageSize;
      process.stdout.write(
        `Target query cost < ${TARGET_QUERY_COST}. Retrying with page=${pageSize}, variants=${variantPageSize}, media=${mediaPageSize}.\n`,
      );
    }
  }

  return products;
}

function buildProductImages(mediaNodes) {
  return (Array.isArray(mediaNodes) ? mediaNodes : [])
    .map((node) => ({
      id: String(node?.id || ""),
      url: normalizePlainText(node?.src || node?.url || node?.image?.url || ""),
      altText: normalizePlainText(node?.alt || node?.altText || node?.image?.altText || ""),
      variantIds: Array.isArray(node?.variant_ids) ? node.variant_ids.map((value) => String(value || "")).filter(Boolean) : [],
      tokens: tokenise([node?.alt || node?.altText || node?.image?.altText, node?.src || node?.url || node?.image?.url].filter(Boolean).join(" ")),
    }))
    .filter((image) => image.id && image.url);
}

function buildPlan(snapshotProducts, liveProducts, scopeHandles) {
  const snapshotByHandle = new Map(snapshotProducts.map((product) => [normalizeHandleValue(product?.handle), product]));
  const liveFiltered = liveProducts.filter((product) => {
    const handle = normalizeHandleValue(product?.handle);
    if (!handle) return false;
    if (!scopeHandles) return true;
    return scopeHandles.has(handle);
  });

  const plannedProducts = [];
  let mappedVariants = 0;
  let skippedVariants = 0;

  for (const liveProduct of liveFiltered) {
    const handle = normalizeHandleValue(liveProduct?.handle);
    const snapshotProduct = snapshotByHandle.get(handle) || liveProduct;
    const productImages = buildProductImages(liveProduct?.media?.nodes || []);
    const variants = Array.isArray(liveProduct?.variants?.nodes) ? liveProduct.variants.nodes : [];
    const updates = [];
    const skipped = [];

    for (const variant of variants) {
      const choice = chooseVariantImage(variant, productImages, snapshotProduct);
      const existingMediaId = variant?.image?.id ? String(variant.image.id) : "";
      if (!choice?.mediaId) {
        skippedVariants += 1;
        skipped.push({ variantId: String(variant?.id || ""), reason: "no-confident-image-match" });
        continue;
      }
      if (existingMediaId && existingMediaId === choice.mediaId) {
        skippedVariants += 1;
        skipped.push({ variantId: String(variant?.id || ""), reason: "already-aligned" });
        continue;
      }
      updates.push({
        id: String(variant?.id || ""),
        mediaId: choice.mediaId,
        reason: choice.reason,
        confidence: choice.confidence || "medium",
      });
      mappedVariants += 1;
    }

    if (updates.length) {
      plannedProducts.push({
        handle,
        productId: String(liveProduct?.id || ""),
        title: normalizePlainText(liveProduct?.title || ""),
        updates,
        skipped,
      });
    }
  }

  return {
    plannedProducts,
    summary: {
      productsConsidered: liveFiltered.length,
      productsWithUpdates: plannedProducts.length,
      mappedVariants,
      skippedVariants,
    },
  };
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}

async function applyBatches(plannedProducts) {
  const totalProducts = plannedProducts.length;
  const tasks = [];

  for (let index = 0; index < totalProducts; index += maxBatchProducts) {
    const batch = plannedProducts.slice(index, index + maxBatchProducts);
    const batchIndex = index;

    tasks.push(async () => {
      const declarations = [];
      const fields = [];
      const variables = {};

      batch.forEach((product, productIndex) => {
        declarations.push(`$p${productIndex}: ID!`, `$v${productIndex}: [ProductVariantsBulkInput!]!`);
        variables[`p${productIndex}`] = product.productId;
        variables[`v${productIndex}`] = product.updates.map((variant) => ({ id: variant.id, mediaId: variant.mediaId }));
        fields.push(
          `p${productIndex}: productVariantsBulkUpdate(productId: $p${productIndex}, variants: $v${productIndex}) { userErrors { field message } }`,
        );
      });

      const response = await executeGraphQl(
        `mutation VariantImageMappingBatch(${declarations.join(", ")}) { ${fields.join(" ")} }`,
        variables,
        { mutation: true, operation: `variant image batch ${batchIndex + 1}` },
      );

      const batchApplied = [];
      const batchFailures = [];

      batch.forEach((product, productIndex) => {
        const payload = response?.[`p${productIndex}`];
        const errors = Array.isArray(payload?.userErrors) ? payload.userErrors : [];
        if (errors.length) {
          batchFailures.push({ handle: product.handle, errors });
        } else {
          batchApplied.push(product.handle);
        }
      });

      return { applied: batchApplied, failures: batchFailures };
    });
  }

  process.stdout.write(`Applying ${tasks.length} batches with concurrency ${applyConcurrency}...\n`);
  const batchResults = await concurrentExecutor(tasks, applyConcurrency, interBatchDelayMs);

  const applied = [];
  const failures = [];
  for (const result of batchResults) {
    applied.push(...result.applied);
    failures.push(...result.failures);
  }

  return { applied, failures };
}

async function verifyProducts(plannedProducts) {
  process.stdout.write(`Verifying ${plannedProducts.length} products with concurrency ${verifyConcurrency}...\n`);

  const tasks = plannedProducts.map((product) => async () => {
    const live = await executeGraphQl(
      `
      query VariantImageMappingVerify($id: ID!) {
        node(id: $id) {
          ... on Product {
            id
            handle
            variants(first: 250) {
              nodes {
                id
                image { id url altText }
              }
            }
          }
        }
      }
      `,
      { id: product.productId },
      { operation: `variant image verification ${product.handle}` },
    );
    const nodes = live?.node?.variants?.nodes || [];
    const productFailures = [];
    for (const update of product.updates) {
      const actual = nodes.find((variant) => String(variant?.id || "") === update.id);
      if (!actual || String(actual?.image?.id || "") !== update.mediaId) {
        productFailures.push({ handle: product.handle, variantId: update.id, expected: update.mediaId, actual: String(actual?.image?.id || "") });
      }
    }
    return productFailures;
  });

  const nestedFailures = await concurrentExecutor(tasks, verifyConcurrency);
  return nestedFailures.flat();
}

async function main() {
  const args = parseArgs(process.argv);
  const [snapshot, liveProducts, scopeHandles] = await Promise.all([
    loadSnapshot(args.inputPath),
    fetchLiveProducts(),
    args.scope === "new-products" ? loadHandles(args.handlesPath) : Promise.resolve(null),
  ]);

  const { plannedProducts, summary } = buildPlan(snapshot.products || [], liveProducts, scopeHandles);
  const manifest = {
    startedAt: new Date().toISOString(),
    completedAt: "",
    mode: args.mode,
    scope: args.scope,
    summary,
    products: plannedProducts,
    failures: [],
  };

  if (args.mode === "dry-run") {
    await writeJsonAtomic(args.outputPath, manifest);
    process.stdout.write(
      `Variant image mapping dry-run complete: ${summary.productsWithUpdates} products, ${summary.mappedVariants} variant image association(s).\n`,
    );
    return;
  }

  const { applied, failures } = await applyBatches(plannedProducts);
  manifest.failures.push(...failures);
  const verificationFailures = failures.length ? [] : await verifyProducts(plannedProducts.filter((product) => applied.includes(product.handle)));
  manifest.failures.push(...verificationFailures);
  manifest.completedAt = new Date().toISOString();
  manifest.appliedHandles = applied;
  manifest.summary.appliedProducts = applied.length;
  manifest.summary.failedProducts = manifest.failures.length;
  await writeJsonAtomic(args.outputPath, manifest);

  if (manifest.failures.length) {
    throw new Error(`Variant image mapping failed for ${manifest.failures.length} product(s)`);
  }

  process.stdout.write(
    `Variant image mapping complete: ${summary.productsWithUpdates} products updated, ${summary.mappedVariants} variant image association(s).\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch(async (error) => {
    try {
      await rm(`${defaultOutputPath}.${process.pid}.tmp`, { force: true });
    } catch {}
    console.error(error.message || error);
    process.exit(1);
  });
}
