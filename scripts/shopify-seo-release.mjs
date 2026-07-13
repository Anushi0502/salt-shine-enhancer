#!/usr/bin/env node

import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import {
  buildEligibilityScopedReleasePlan,
  buildDesiredFingerprint,
  buildLiveFingerprint,
  buildShopifySeoReleasePlan,
  compareLiveProductToPlan,
  isHandleContentMismatch,
  mergeCatalogSnapshotWithLiveProducts,
  normalizeComparableHtml,
} from "../src/lib/shopify-seo-release.js";
import { normalizeHandleValue, normalizePlainText } from "../src/lib/shopify-seo-batch.js";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");
const inputDir = resolve(rootDir, "public", "data");
const outputPath = resolve(rootDir, "output", "shopify-seo-release-manifest.json");
const liveCatalogPath = process.env.SALT_SHOPIFY_SEO_LIVE_CATALOG || resolve(rootDir, "output", ".shopify-seo-live-catalog.json");
const defaultShopBase = "https://0309d3-72.myshopify.com";
const shopBase = process.env.SALT_SHOP_URL || defaultShopBase;
const storeDomain = new URL(shopBase).hostname;
const apiVersion = process.env.SHOPIFY_ADMIN_API_VERSION || "2026-07";
const cliBinary = process.env.SHOPIFY_CLI_BINARY || "shopify";
const cliAgentInfo = process.env.SHOPIFY_CLI_AGENT_INFO || "n:salt-shine-enhancer|v:1|p:openai";
const cliAgentIds =
  process.env.SHOPIFY_CLI_AGENT_IDS || `s:${process.env.CONVERSATION_ID || "local"}|r:${process.pid}|i:salt-seo-release`;
const requestDelayMs = Math.max(0, Number(process.env.SALT_SHOPIFY_REQUEST_DELAY_MS || 300));
const maxAttempts = Math.max(1, Number(process.env.SALT_SHOPIFY_MAX_REQUEST_ATTEMPTS || 5));
const maxRetryDelayMs = Math.max(1000, Number(process.env.SALT_SHOPIFY_MAX_RETRY_DELAY_MS || 30_000));
const seoApplyBatchSize = Math.max(1, Math.min(25, Number(process.env.SALT_SHOPIFY_SEO_BATCH_SIZE || 25)));

const PRODUCT_SELECTION = /* GraphQL */ `
  id
  handle
  title
  descriptionHtml
  productType
  status
  tags
  category {
    id
  }
  resourcePublications(first: 250) {
    nodes {
      isPublished
      publishDate
      channel {
        id
        name
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
  seo {
    title
    description
  }
  variants(first: 250) {
    nodes {
      id
      title
      sku
      price
      compareAtPrice
      selectedOptions {
        name
        value
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
  media(first: 250) {
    nodes {
      __typename
      ... on MediaImage {
        id
        alt
        image {
          url
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
`;

const ALL_PRODUCTS_QUERY = /* GraphQL */ `
  query ShopifySeoReleaseProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
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

const PRODUCT_BY_HANDLE_QUERY = /* GraphQL */ `
  query ShopifySeoReleaseProductByHandle($identifier: ProductIdentifierInput!) {
    productByIdentifier(identifier: $identifier) {
      ${PRODUCT_SELECTION}
    }
  }
`;

const PRODUCT_VERIFY_SELECTION = /* GraphQL */ `
  id
  handle
  title
  descriptionHtml
  productType
  category {
    id
  }
  seo {
    title
    description
  }
  variants(first: 250) {
    nodes {
      id
      title
      sku
      price
      compareAtPrice
      selectedOptions {
        name
        value
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
  media(first: 250) {
    nodes {
      __typename
      ... on MediaImage {
        id
        alt
        image {
          url
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
`;

const PRODUCTS_BY_ID_QUERY = /* GraphQL */ `
  query ShopifySeoReleaseProductsById($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        ${PRODUCT_VERIFY_SELECTION}
      }
    }
  }
`;

const PRODUCT_VARIANTS_PAGE_QUERY = /* GraphQL */ `
  query ShopifySeoReleaseVariantPage($id: ID!, $after: String) {
    node(id: $id) {
      ... on Product {
        variants(first: 250, after: $after) {
          nodes {
            id
            title
            sku
            price
            compareAtPrice
            selectedOptions {
              name
              value
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  }
`;

const PRODUCT_MEDIA_PAGE_QUERY = /* GraphQL */ `
  query ShopifySeoReleaseMediaPage($id: ID!, $after: String) {
    node(id: $id) {
      ... on Product {
        media(first: 250, after: $after) {
          nodes {
            __typename
            ... on MediaImage {
              id
              alt
              image {
                url
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  }
`;

const PRODUCT_PUBLICATIONS_PAGE_QUERY = /* GraphQL */ `
  query ShopifySeoReleasePublicationPage($id: ID!, $after: String) {
    node(id: $id) {
      ... on Product {
        resourcePublications(first: 250, after: $after) {
          nodes {
            isPublished
            publishDate
            channel {
              id
              name
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  }
`;

const PRODUCT_UPDATE_MUTATION = /* GraphQL */ `
  mutation ShopifySeoReleaseProductUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product {
        id
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const VARIANT_UPDATE_MUTATION = /* GraphQL */ `
  mutation ShopifySeoReleaseVariantUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
        price
        compareAtPrice
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const MEDIA_UPDATE_MUTATION = /* GraphQL */ `
  mutation ShopifySeoReleaseMediaUpdate($productId: ID!, $media: [UpdateMediaInput!]!) {
    productUpdateMedia(productId: $productId, media: $media) {
      media {
        id
        alt
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function parseArgs(argv) {
  const args = {
    mode: "dry-run",
    output: outputPath,
    sample: 0,
    preservePrices: false,
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
      continue;
    }
    if (token === "--preserve-prices") {
      args.preservePrices = true;
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

function parseGraphQlPayload(raw) {
  const text = String(raw || "").trim();
  const jsonStart = text.indexOf("{");
  if (jsonStart < 0) {
    throw new Error(text || "Shopify CLI returned no JSON payload");
  }

  const payload = JSON.parse(text.slice(jsonStart));
  if (Array.isArray(payload?.errors) && payload.errors.length) {
    throw new Error(payload.errors.map((entry) => entry.message || "GraphQL error").join(" | "));
  }

  if (Array.isArray(payload?.data?.errors) && payload.data.errors.length) {
    throw new Error(payload.data.errors.map((entry) => entry.message || "GraphQL error").join(" | "));
  }

  return payload?.data || payload;
}

let lastRequestFinishedAt = 0;

async function runShopifyCliGraphQL(query, variables, { allowMutations = false, operation, retryInfo } = {}) {
  const now = Date.now();
  const waitFor = requestDelayMs - (now - lastRequestFinishedAt);
  if (waitFor > 0) {
    await sleep(waitFor);
  }

  const tempDir = await mkdtemp(join(tmpdir(), "salt-shopify-seo-release-"));
  const queryFile = join(tempDir, "operation.graphql");
  const variablesFile = join(tempDir, "variables.json");
  const outputFile = join(tempDir, "result.json");

  try {
    await writeFile(queryFile, query, "utf8");
    await writeFile(variablesFile, JSON.stringify(variables || {}, null, 2), "utf8");

    const cliArgs = [
      "store",
      "execute",
      "--store",
      storeDomain,
      "--version",
      apiVersion,
      "--query-file",
      queryFile,
      "--variable-file",
      variablesFile,
      "--output-file",
      outputFile,
      "--json",
    ];
    if (allowMutations) {
      cliArgs.push("--allow-mutations");
    }

    let attempt = 0;
    while (true) {
      try {
        const result = await execFileAsync(cliBinary, cliArgs, {
          cwd: rootDir,
          env: getCliEnv(),
          maxBuffer: 20 * 1024 * 1024,
        });
        lastRequestFinishedAt = Date.now();
        let rawOutput = "";
        try {
          rawOutput = await readFile(outputFile, "utf8");
        } catch {
          rawOutput = result.stdout || "";
        }
        return parseGraphQlPayload(rawOutput);
      } catch (error) {
        lastRequestFinishedAt = Date.now();
        const message = String(error?.stderr || error?.stdout || error?.message || error);
        const transient = /429|rate limit|throttl|timeout|timed out|5\d\d|network|socket|temporar|aborted/i.test(message);
        if (!transient || attempt >= maxAttempts - 1) {
          throw new Error(`${operation || "Shopify CLI request"} failed: ${message.trim()}`);
        }

        const delayMs = Math.min(maxRetryDelayMs, Math.max(requestDelayMs, 1000 * 2 ** attempt));
        retryInfo?.push({
          operation: operation || "Shopify CLI request",
          attempt: attempt + 1,
          delayMs,
          message: message.trim().slice(0, 500),
          at: new Date().toISOString(),
        });
        process.stdout.write(
          `Shopify CLI request failed for ${operation || "operation"}; retrying in ${Math.ceil(delayMs / 1000)}s\n`,
        );
        await sleep(delayMs);
        attempt += 1;
      }
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function readJson(relativePath, { required = false } = {}) {
  const filePath = resolve(inputDir, relativePath);
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (!required && error?.code === "ENOENT") {
      return {};
    }
    throw new Error(`Could not read ${filePath}: ${error.message}`);
  }
}

async function loadCatalogSnapshot() {
  const [products, collections, collectionProducts] = await Promise.all([
    readJson("products.json", { required: true }),
    readJson("collections.json"),
    readJson("collection-products.json"),
  ]);

  return { products, collections, collectionProducts };
}

async function fetchAllProducts(retryInfo) {
  const products = [];
  let after = null;
  let page = 0;

  while (true) {
    page += 1;
    const data = await runShopifyCliGraphQL(
      ALL_PRODUCTS_QUERY,
      { first: 250, after },
      { operation: `product catalog page ${page}`, retryInfo },
    );
    const connection = data?.products;
    if (!connection) {
      throw new Error("Shopify product catalog query returned no products connection");
    }

    products.push(...(Array.isArray(connection.nodes) ? connection.nodes : []));
    if (!connection.pageInfo?.hasNextPage) {
      break;
    }
    if (!connection.pageInfo.endCursor) {
      throw new Error(`Shopify product catalog page ${page} hasNextPage without an end cursor`);
    }
    after = connection.pageInfo.endCursor;
  }

  for (let index = 0; index < products.length; index += 1) {
    if (!hasNestedPaginationGap(products[index])) {
      continue;
    }

    process.stdout.write(`Hydrating nested Shopify connections for ${products[index].handle}\n`);
    products[index] = await hydrateNestedProductConnections(products[index], retryInfo);
  }

  return products;
}

async function fetchProductByHandle(handle, retryInfo, operation = `read ${handle}`) {
  const data = await runShopifyCliGraphQL(
    PRODUCT_BY_HANDLE_QUERY,
    { identifier: { handle } },
    { operation, retryInfo },
  );
  return data?.productByIdentifier || null;
}

async function fetchProductsById(ids, retryInfo, operation = "read product batch") {
  const uniqueIds = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean))];
  if (!uniqueIds.length) {
    return new Map();
  }

  const data = await runShopifyCliGraphQL(
    PRODUCTS_BY_ID_QUERY,
    { ids: uniqueIds },
    { operation, retryInfo },
  );
  const products = Array.isArray(data?.nodes) ? data.nodes.filter((node) => node?.id) : [];
  const hydratedProducts = [];
  for (const product of products) {
    hydratedProducts.push(hasNestedPaginationGap(product) ? await hydrateNestedProductConnections(product, retryInfo) : product);
  }
  return new Map(hydratedProducts.map((product) => [product.id, product]));
}

async function hydrateNestedProductConnections(product, retryInfo) {
  if (!product?.id) {
    return product;
  }

  const hydrated = {
    ...product,
    variants: {
      ...(product.variants || {}),
      nodes: [...(product.variants?.nodes || [])],
    },
    media: {
      ...(product.media || {}),
      nodes: [...(product.media?.nodes || [])],
    },
    resourcePublications: {
      ...(product.resourcePublications || {}),
      nodes: [...(product.resourcePublications?.nodes || [])],
    },
  };

  const pendingConnections = [
    {
      key: "variants",
      query: PRODUCT_VARIANTS_PAGE_QUERY,
      operation: "variant pagination",
    },
    {
      key: "media",
      query: PRODUCT_MEDIA_PAGE_QUERY,
      operation: "media pagination",
    },
    {
      key: "resourcePublications",
      query: PRODUCT_PUBLICATIONS_PAGE_QUERY,
      operation: "publication pagination",
    },
  ];

  for (const connection of pendingConnections) {
    let pageInfo = hydrated[connection.key]?.pageInfo || {};
    let after = pageInfo.endCursor || null;
    while (pageInfo.hasNextPage) {
      const data = await runShopifyCliGraphQL(
        connection.query,
        { id: product.id, after },
        { operation: `${connection.operation} ${product.handle}`, retryInfo },
      );
      const nextConnection = data?.node?.[connection.key];
      if (!nextConnection) {
        throw new Error(`Missing ${connection.key} pagination response for ${product.handle}`);
      }

      hydrated[connection.key].nodes.push(...(nextConnection.nodes || []));
      pageInfo = nextConnection.pageInfo || {};
      hydrated[connection.key].pageInfo = pageInfo;
      if (pageInfo.hasNextPage && !pageInfo.endCursor) {
        throw new Error(`Missing ${connection.key} pagination cursor for ${product.handle}`);
      }
      after = pageInfo.endCursor || null;
    }
  }

  return hydrated;
}

async function fetchLiveProductsForPlan(plan, retryInfo, sample) {
  if (!sample) {
    return fetchAllProducts(retryInfo);
  }

  const products = [];
  for (const productPlan of plan.products) {
    let product = await fetchProductByHandle(productPlan.handle, retryInfo, `sample read ${productPlan.handle}`);
    if (hasNestedPaginationGap(product)) {
      product = await hydrateNestedProductConnections(product, retryInfo);
    }
    if (product) {
      products.push(product);
    }
  }
  return products;
}

function hasNestedPaginationGap(product) {
  return Boolean(
    product?.variants?.pageInfo?.hasNextPage ||
      product?.media?.pageInfo?.hasNextPage ||
      product?.resourcePublications?.pageInfo?.hasNextPage,
  );
}

function getPublishedSalesChannelCount(product) {
  const publications = product?.resourcePublications?.nodes;
  if (!Array.isArray(publications)) {
    return null;
  }

  return publications.filter((publication) => publication?.isPublished === true).length;
}

function getKnownPriorHandles(priorManifest) {
  if (!priorManifest?.policy?.initialFullCatalogPassComplete) {
    return new Set();
  }

  return new Set(
    (priorManifest.products || [])
      .filter((entry) => entry.status === "updated-verified" || entry.status === "skipped-exact-match")
      .map((entry) => normalizeHandleValue(entry.handle))
      .filter(Boolean),
  );
}

function buildScopedPlanForLiveCatalog(plan, liveProducts, priorManifest) {
  const initialFullCatalogPass = !priorManifest?.policy?.initialFullCatalogPassComplete;
  const knownHandles = getKnownPriorHandles(priorManifest);
  const liveByHandle = new Map(
    liveProducts
      .map((product) => [normalizeHandleValue(product?.handle), product])
      .filter(([handle]) => Boolean(handle)),
  );

  return {
    ...plan,
    products: plan.products.map((productPlan) => {
      const liveProduct = liveByHandle.get(productPlan.handle);
      const isNewProduct = !initialFullCatalogPass && !knownHandles.has(productPlan.handle);
      return buildEligibilityScopedReleasePlan(productPlan, {
        status: liveProduct?.status || "",
        publishedSalesChannels: getPublishedSalesChannelCount(liveProduct),
        isNewProduct,
        handleMismatch: isHandleContentMismatch(productPlan),
        initialFullCatalogPass,
      });
    }),
  };
}

function formatUserErrors(errors) {
  return (Array.isArray(errors) ? errors : [])
    .map((error) => `${Array.isArray(error?.field) ? error.field.join(".") : ""} ${error?.message || "Shopify user error"}`.trim())
    .join("; ");
}

function productMutationFields(input) {
  return Object.keys(input || {}).filter((key) => key !== "id");
}

function buildBatchMutation(tasks) {
  const declarations = [];
  const fields = [];
  const variables = {};
  const aliases = [];

  tasks.forEach((task, index) => {
    const productAlias = `p${index}`;
    const variantAlias = `v${index}`;
    const mediaAlias = `m${index}`;
    const diff = task.diff;
    const operationAliases = { product: "", variants: "", media: "" };

    if (productMutationFields(diff.productInput).length) {
      declarations.push(`$${productAlias}: ProductUpdateInput!`);
      variables[productAlias] = diff.productInput;
      fields.push(`${productAlias}: productUpdate(product: $${productAlias}) { userErrors { field message } }`);
      operationAliases.product = productAlias;
    }

    if (diff.variantInputs.length) {
      const productIdVariable = `${variantAlias}ProductId`;
      const variantsVariable = `${variantAlias}Variants`;
      declarations.push(`$${productIdVariable}: ID!`, `$${variantsVariable}: [ProductVariantsBulkInput!]!`);
      variables[productIdVariable] = task.liveProduct.id;
      variables[variantsVariable] = diff.variantInputs;
      fields.push(
        `${variantAlias}: productVariantsBulkUpdate(productId: $${productIdVariable}, variants: $${variantsVariable}) { userErrors { field message } }`,
      );
      operationAliases.variants = variantAlias;
    }

    if (diff.mediaInputs.length) {
      const productIdVariable = `${mediaAlias}ProductId`;
      const mediaVariable = `${mediaAlias}Media`;
      declarations.push(`$${productIdVariable}: ID!`, `$${mediaVariable}: [UpdateMediaInput!]!`);
      variables[productIdVariable] = task.liveProduct.id;
      variables[mediaVariable] = diff.mediaInputs;
      fields.push(
        `${mediaAlias}: productUpdateMedia(productId: $${productIdVariable}, media: $${mediaVariable}) { userErrors { field message } }`,
      );
      operationAliases.media = mediaAlias;
    }

    aliases.push(operationAliases);
  });

  return {
    query: `mutation ShopifySeoReleaseBatch(${declarations.join(", ")}) { ${fields.join(" ")} }`,
    variables,
    aliases,
  };
}

function getMutationUserErrors(response, alias) {
  if (!alias) {
    return [];
  }
  const payload = response?.[alias];
  if (!payload) {
    return [{ field: [], message: `Shopify omitted mutation response ${alias}` }];
  }
  return Array.isArray(payload.userErrors) ? payload.userErrors : [];
}

function findLiveVariantById(product, id) {
  const target = normalizePlainText(id).toLowerCase();
  const variants = Array.isArray(product?.variants?.nodes) ? product.variants.nodes : [];
  return variants.find((variant) => normalizePlainText(variant?.id).toLowerCase() === target) || null;
}

function findLiveMediaById(product, id) {
  const target = normalizePlainText(id).toLowerCase();
  const media = Array.isArray(product?.media?.nodes) ? product.media.nodes : [];
  return media.find((entry) => normalizePlainText(entry?.id).toLowerCase() === target) || null;
}

function assertMutationReadback(product, operation, input) {
  if (!product?.id) {
    throw new Error(`${operation} readback returned no product`);
  }

  if (operation === "product") {
    const mismatches = [];
    for (const field of productMutationFields(input)) {
      if (field === "seo") {
        for (const seoField of Object.keys(input.seo || {})) {
          const expected = normalizePlainText(input.seo[seoField]);
          const actual = normalizePlainText(product.seo?.[seoField]);
          const usesProductTitleDefault =
            seoField === "title" && !actual && expected === normalizePlainText(product.title);
          if (!usesProductTitleDefault && actual !== expected) {
            mismatches.push(`seo.${seoField}`);
          }
        }
        continue;
      }
      const normalizer = field === "descriptionHtml" ? normalizeComparableHtml : normalizePlainText;
      const expected = normalizer(input[field]);
      const actual = normalizer(product[field]);
      if (expected !== actual) {
        mismatches.push(field);
      }
    }
    if (mismatches.length) {
      throw new Error(`Product readback mismatch: ${mismatches.join(", ")}`);
    }
    return;
  }

  if (operation === "variants") {
    const mismatches = [];
    for (const expected of input) {
      const actual = findLiveVariantById(product, expected.id);
      if (!actual) {
        mismatches.push(`${expected.id}:missing`);
        continue;
      }
      if (expected.price !== undefined && normalizePlainText(actual.price) !== normalizePlainText(expected.price)) {
        mismatches.push(`${expected.id}:price`);
      }
      if (
        expected.compareAtPrice !== undefined &&
        normalizePlainText(actual.compareAtPrice || "") !== normalizePlainText(expected.compareAtPrice || "")
      ) {
        mismatches.push(`${expected.id}:compareAtPrice`);
      }
    }
    if (mismatches.length) {
      throw new Error(`Variant readback mismatch: ${mismatches.join(", ")}`);
    }
    return;
  }

  if (operation === "media") {
    const mismatches = [];
    for (const expected of input) {
      const actual = findLiveMediaById(product, expected.id);
      if (!actual) {
        mismatches.push(`${expected.id}:missing`);
      } else if (normalizePlainText(actual.alt || "") !== normalizePlainText(expected.alt || "")) {
        mismatches.push(`${expected.id}:alt`);
      }
    }
    if (mismatches.length) {
      throw new Error(`Media readback mismatch: ${mismatches.join(", ")}`);
    }
  }
}

async function applyMutationAndVerify({ handle, operation, mutation, variables, retryInfo, mutationInput }) {
  const response = await runShopifyCliGraphQL(mutation, variables, {
    allowMutations: true,
    operation: `${operation} update ${handle}`,
    retryInfo,
  });
  const payload = response?.productUpdate || response?.productVariantsBulkUpdate || response?.productUpdateMedia;
  const errors = payload?.userErrors || [];
  if (errors.length) {
    throw new Error(`${operation} mutation failed for ${handle}: ${formatUserErrors(errors)}`);
  }

  const liveProduct = await fetchProductByHandle(handle, retryInfo, `${operation} readback ${handle}`);
  assertMutationReadback(liveProduct, operation, mutationInput);
  return liveProduct;
}

function createManifest({ mode, output, plan, priorManifest }) {
  const priorByHandle = new Map((priorManifest?.products || []).map((entry) => [entry.handle, entry]));
  const products = plan.products.map((productPlan) => ({
    handle: productPlan.handle,
    productId: productPlan.productId || "",
    confidence: productPlan.confidence,
    rewriteLevel: productPlan.rewriteLevel,
    desiredFingerprint: buildDesiredFingerprint(productPlan),
    liveFingerprint: "",
    status: "pending-live-read",
    eligibility: null,
    changedFields: [],
    skippedFields: [],
    writeCount: 0,
    writeCounts: { product: 0, variants: 0, media: 0, total: 0 },
    priorStatus: priorByHandle.get(productPlan.handle)?.status || "",
    verifiedAt: "",
    failures: [],
    retryInfo: [],
  }));

  return {
    schemaVersion: 1,
    runId: `${Date.now()}-${process.pid}`,
    startedAt: new Date().toISOString(),
    completedAt: "",
    mode,
    source: {
      catalog: resolve(inputDir, "products.json"),
      collections: resolve(inputDir, "collections.json"),
      collectionProducts: resolve(inputDir, "collection-products.json"),
      liveCatalog: liveCatalogPath,
      store: storeDomain,
      apiVersion,
    },
    policy: {
      identity: "canonical handle",
      fillMissingOnly: false,
      liveReadRequired: true,
      failOnMissingHandle: true,
      failOnUnresolvedIdentity: true,
      failOnReadbackMismatch: true,
      tags: "preserve and never send tag updates",
      category: "authoritative source only",
      saltJson: "untouched",
      initialFullCatalogPassComplete: Boolean(priorManifest?.policy?.initialFullCatalogPassComplete),
      metaDescriptionBackfillComplete: Boolean(priorManifest?.policy?.metaDescriptionBackfillComplete),
      merchandisingMetafields: "fill missing values for the full catalog, then preserve existing values",
      subsequentSeoScope: "draft, zero published channels, new handles, or handle/content mismatch",
    },
    output,
    summary: {
      sourceRows: plan.summary.sourceRows || plan.rows.length,
      sourceProducts: plan.summary.sourceProducts || 0,
      localCatalogProducts: plan.summary.sourceProducts || 0,
      catalogAugmentedProducts: 0,
      liveProducts: 0,
      plannedProducts: plan.products.length,
      initialFullCatalogPass: !priorManifest?.policy?.initialFullCatalogPassComplete,
      exactMatches: 0,
      wouldUpdate: 0,
      updatedVerified: 0,
      failed: 0,
      missingHandles: 0,
      unresolved: 0,
      fullSeoEligible: 0,
      metaDescriptionOnly: 0,
      policyPreserved: 0,
      newProducts: 0,
      handleMismatches: 0,
      draftProducts: 0,
      zeroSalesChannelProducts: 0,
      liveOnlyProducts: 0,
      sourceOnlyProducts: 0,
      productWrites: 0,
      variantWrites: 0,
      mediaWrites: 0,
      totalWrites: 0,
    },
    failures: [],
    retryInfo: [],
    products,
  };
}

async function writeManifest(filePath, manifest) {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

async function writeJsonFile(filePath, payload) {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(payload)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

async function readPriorManifest(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    process.stdout.write(`Ignoring unreadable prior SEO release manifest: ${error.message}\n`);
    return null;
  }
}

function refreshSummary(manifest) {
  const products = manifest.products || [];
  manifest.summary.exactMatches = products.filter((entry) => entry.status === "skipped-exact-match").length;
  manifest.summary.wouldUpdate = products.filter((entry) => entry.status === "would-update").length;
  manifest.summary.updatedVerified = products.filter((entry) => entry.status === "updated-verified").length;
  manifest.summary.failed = products.filter((entry) => entry.status === "failed").length;
  manifest.summary.missingHandles = products.filter((entry) => entry.status === "failed-missing-handle").length;
  manifest.summary.unresolved = products.filter((entry) => entry.status === "failed-unresolved").length;
  manifest.summary.fullSeoEligible = products.filter((entry) => entry.eligibility?.fullSeoEligible).length;
  manifest.summary.metaDescriptionOnly = products.filter((entry) => entry.eligibility?.metaDescriptionOnly).length;
  manifest.summary.policyPreserved = products.filter(
    (entry) => entry.eligibility?.reason === "existing eligible content preserved",
  ).length;
  manifest.summary.newProducts = products.filter((entry) => entry.eligibility?.isNewProduct).length;
  manifest.summary.handleMismatches = products.filter((entry) => entry.eligibility?.handleMismatch).length;
  manifest.summary.draftProducts = products.filter((entry) => entry.eligibility?.isDraft).length;
  manifest.summary.zeroSalesChannelProducts = products.filter(
    (entry) => entry.eligibility?.hasZeroPublishedChannels,
  ).length;
  manifest.summary.productWrites = products.reduce((total, entry) => total + (entry.writeCounts?.product || 0), 0);
  manifest.summary.variantWrites = products.reduce((total, entry) => total + (entry.writeCounts?.variants || 0), 0);
  manifest.summary.mediaWrites = products.reduce((total, entry) => total + (entry.writeCounts?.media || 0), 0);
  manifest.summary.totalWrites = products.reduce((total, entry) => total + (entry.writeCounts?.total || 0), 0);
}

function markFailure(manifest, entry, status, error) {
  const failure = {
    handle: entry?.handle || "",
    status,
    message: String(error?.message || error),
    at: new Date().toISOString(),
  };
  if (entry) {
    entry.status = status;
    entry.failures = [...(entry.failures || []), failure];
  }
  manifest.failures.push(failure);
}

function assertNoUnverifiedFailures(manifest) {
  if (!manifest.failures.length) {
    return;
  }

  const preview = manifest.failures
    .slice(0, 8)
    .map((failure) => `${failure.handle || "catalog"}: ${failure.message}`)
    .join(" | ");
  throw new Error(`Shopify SEO release failed with ${manifest.failures.length} failure(s). ${preview}`);
}

function auditLiveSeoPlan(plan, manifest) {
  const allowedTags = new Set(["h2", "h3", "p", "ul", "li", "strong", "ol"]);
  const genericTitle = /beauty product|personal care item|portable false eyelashes|lines water light/i;
  let passed = 0;
  for (const product of plan.products) {
    const desired = product.desiredProductInput || {};
    const proposesSeoContent = Boolean(
      desired.title || desired.descriptionHtml || desired.seo?.title || desired.seo?.description,
    );
    if (Object.prototype.hasOwnProperty.call(desired, "tags")) {
      markFailure(manifest, manifest.products.find((entry) => entry.handle === product.handle), "failed-quality-audit", new Error("tags-mutation-prohibited"));
      continue;
    }
    if (!proposesSeoContent) {
      passed += 1;
      continue;
    }
    const title = String(desired.title || product.sourceTitle || "").trim();
    const body = String(desired.descriptionHtml || product.sourceBodyHtml || "");
    const seoTitle = String(desired.seo?.title || title).trim();
    const seoDescription = String(desired.seo?.description || "").trim();
    const issues = [];
    if (!title || title.length > 75 || genericTitle.test(title)) issues.push("invalid-title");
    if (!seoTitle || seoTitle.length > 70 || genericTitle.test(seoTitle)) issues.push("invalid-seo-title");
    if (!seoDescription || seoDescription.length < 120 || seoDescription.length > 170) issues.push("invalid-seo-description");
    if (!body || !/Product Overview/i.test(body) || !/Key Features/i.test(body) || !/FAQs/i.test(body)) issues.push("invalid-description-structure");
    for (const match of body.matchAll(/<\/?([a-z0-9]+)(?:\s[^>]*)?>/gi)) {
      if (!allowedTags.has(match[1].toLowerCase())) issues.push(`unsupported-html:${match[1].toLowerCase()}`);
    }
    if (issues.length) {
      markFailure(manifest, manifest.products.find((entry) => entry.handle === product.handle), "failed-quality-audit", new Error(issues.join(", ")));
    } else {
      passed += 1;
    }
  }
  manifest.qualityAudit = { products: plan.products.length, passed, failed: plan.products.length - passed };
  assertNoUnverifiedFailures(manifest);
}

async function preflight({ plan, manifest, liveProducts, output }) {
  auditLiveSeoPlan(plan, manifest);
  manifest.summary.liveProducts = liveProducts.length;
  const liveByHandle = new Map();
  const duplicateHandles = new Set();
  for (const product of liveProducts) {
    const handle = normalizeHandleValue(product?.handle);
    if (!handle) {
      continue;
    }
    if (liveByHandle.has(handle)) {
      duplicateHandles.add(handle);
    }
    liveByHandle.set(handle, product);
  }

  const plannedHandles = new Set(plan.products.map((entry) => entry.handle));
  const liveOnlyHandles = [...liveByHandle.keys()].filter((handle) => !plannedHandles.has(handle));
  manifest.summary.liveOnlyProducts = liveOnlyHandles.length;
  manifest.summary.sourceOnlyProducts = plan.products.filter((entry) => !liveByHandle.has(entry.handle)).length;
  if (liveOnlyHandles.length) {
    markFailure(
      manifest,
      null,
      "failed-source-catalog-incomplete",
      new Error(
        `Local catalog is missing ${liveOnlyHandles.length} live Shopify handle(s): ${liveOnlyHandles
          .slice(0, 12)
          .join(", ")}${liveOnlyHandles.length > 12 ? ", ..." : ""}`,
      ),
    );
  }

  const planByHandle = new Map(plan.products.map((entry) => [entry.handle, entry]));
  for (const entry of manifest.products) {
    const productPlan = planByHandle.get(entry.handle);
    const liveProduct = liveByHandle.get(entry.handle);
    if (productPlan) {
      entry.desiredFingerprint = buildDesiredFingerprint(productPlan);
      entry.eligibility = productPlan.eligibility || null;
    }
    if (!liveProduct) {
      markFailure(manifest, entry, "failed-missing-handle", new Error(`Product handle not found in Shopify: ${entry.handle}`));
      continue;
    }
    if (duplicateHandles.has(entry.handle)) {
      markFailure(manifest, entry, "failed-unresolved", new Error(`Duplicate live Shopify handle: ${entry.handle}`));
      continue;
    }
    if (hasNestedPaginationGap(liveProduct)) {
      markFailure(
        manifest,
        entry,
        "failed-unresolved",
        new Error(`Nested variant or media connection is incomplete for ${entry.handle}`),
      );
      continue;
    }

    entry.liveFingerprint = buildLiveFingerprint(liveProduct);
    entry.liveStatus = liveProduct.status || "";
    entry.publishedSalesChannels = getPublishedSalesChannelCount(liveProduct);
    const diff = compareLiveProductToPlan(liveProduct, productPlan);
    entry.changedFields = diff.changedFields;
    entry.skippedFields = diff.skippedFields;
    entry.writeCount = diff.writeCount;
    entry.writeCounts = {
      product: productMutationFields(diff.productInput).length ? 1 : 0,
      variants: diff.variantInputs.length,
      media: diff.mediaInputs.length,
      total: diff.writeCount,
    };
    entry.liveProductId = liveProduct.id || "";
    if (diff.unresolved.length) {
      markFailure(
        manifest,
        entry,
        "failed-unresolved",
        new Error(`${entry.handle}: ${diff.unresolved.map((item) => `${item.kind}:${item.reason}`).join(", ")}`),
      );
      continue;
    }

    entry.status = diff.hasMutations ? (output.mode === "dry-run" ? "would-update" : "ready-to-update") : "skipped-exact-match";
  }

  refreshSummary(manifest);
  await writeManifest(output.path, manifest);
  assertNoUnverifiedFailures(manifest);
}

async function applyPlan({ plan, manifest, output }) {
  const planByHandle = new Map(plan.products.map((entry) => [entry.handle, entry]));

  const pendingEntries = manifest.products.filter(
    (entry) => entry.status !== "skipped-exact-match" && !entry.status.startsWith("failed"),
  );

  for (let start = 0; start < pendingEntries.length; start += seoApplyBatchSize) {
    const batchEntries = pendingEntries.slice(start, start + seoApplyBatchSize);
    const retryInfo = [];
    let batchPersisted = false;
    const persistBatch = async () => {
      if (batchPersisted) {
        return;
      }
      manifest.retryInfo.push(...retryInfo);
      refreshSummary(manifest);
      await writeManifest(output.path, manifest);
      batchPersisted = true;
    };

    try {
      const ids = batchEntries.map((entry) => entry.liveProductId).filter(Boolean);
      if (ids.length !== batchEntries.length) {
        throw new Error(`Live product identity missing for batch starting at ${start + 1}`);
      }

      const liveById = await fetchProductsById(ids, retryInfo, `live apply read batch ${start + 1}`);
      const tasks = [];
      const failuresBeforeBatch = manifest.failures.length;

      for (const entry of batchEntries) {
        const productPlan = planByHandle.get(entry.handle);
        const liveProduct = liveById.get(entry.liveProductId);
        if (!liveProduct) {
          markFailure(manifest, entry, "failed-missing-handle", new Error(`Product id not found in Shopify: ${entry.liveProductId}`));
          continue;
        }
        if (!productPlan) {
          markFailure(manifest, entry, "failed-unresolved", new Error(`No release plan found for ${entry.handle}`));
          continue;
        }

        const diff = compareLiveProductToPlan(liveProduct, productPlan);
        entry.changedFields = diff.changedFields;
        entry.skippedFields = diff.skippedFields;
        entry.writeCounts = {
          product: productMutationFields(diff.productInput).length ? 1 : 0,
          variants: diff.variantInputs.length,
          media: diff.mediaInputs.length,
          total: diff.writeCount,
        };
        entry.writeCount = diff.writeCount;
        entry.liveFingerprint = buildLiveFingerprint(liveProduct);
        if (diff.unresolved.length) {
          markFailure(
            manifest,
            entry,
            "failed-unresolved",
            new Error(`Live identity became unresolved: ${diff.unresolved.map((item) => `${item.kind}:${item.reason}`).join(", ")}`),
          );
          continue;
        }
        if (!diff.hasMutations) {
          entry.status = "skipped-exact-match";
          entry.verifiedAt = new Date().toISOString();
          continue;
        }
        tasks.push({ entry, productPlan, liveProduct, diff });
      }

      if (manifest.failures.length > failuresBeforeBatch) {
        throw new Error(`Live identity validation failed for batch starting at ${start + 1}`);
      }
      if (!tasks.length) {
        await persistBatch();
        continue;
      }

      const batchMutation = buildBatchMutation(tasks);
      let response;
      try {
        response = await runShopifyCliGraphQL(batchMutation.query, batchMutation.variables, {
          allowMutations: true,
          operation: `SEO mutation batch ${start + 1}-${start + tasks.length}`,
          retryInfo,
        });
      } catch (error) {
        for (const task of tasks) {
          markFailure(manifest, task.entry, "failed", error);
        }
        throw error;
      }

      const mutationErrors = tasks.map((task, index) => {
        const aliases = batchMutation.aliases[index];
        return Object.entries(aliases)
          .flatMap(([operation, alias]) =>
            getMutationUserErrors(response, alias).map((error) => `${operation}: ${formatUserErrors([error])}`),
          )
          .filter(Boolean);
      });

      let finalById;
      try {
        finalById = await fetchProductsById(
          tasks.map((task) => task.liveProduct.id),
          retryInfo,
          `SEO verification batch ${start + 1}-${start + tasks.length}`,
        );
      } catch (error) {
        for (const task of tasks) {
          markFailure(manifest, task.entry, "failed", error);
        }
        throw error;
      }

      const verificationFailures = [];
      tasks.forEach((task, index) => {
        const { entry, productPlan, liveProduct, diff } = task;
        try {
          const finalLive = finalById.get(liveProduct.id);
          if (!finalLive) {
            throw new Error(`Final verification product missing: ${entry.handle}`);
          }
          if (mutationErrors[index].length) {
            throw new Error(`Shopify mutation errors: ${mutationErrors[index].join("; ")}`);
          }

          const aliases = batchMutation.aliases[index];
          if (aliases.product) {
            assertMutationReadback(finalLive, "product", diff.productInput);
          }
          if (aliases.variants) {
            assertMutationReadback(finalLive, "variants", diff.variantInputs);
          }
          if (aliases.media) {
            assertMutationReadback(finalLive, "media", diff.mediaInputs);
          }

          const finalDiff = compareLiveProductToPlan(finalLive, productPlan);
          if (finalDiff.unresolved.length) {
            throw new Error(
              `Final verification identity failure: ${finalDiff.unresolved
                .map((item) => `${item.kind}:${item.reason}`)
                .join(", ")}`,
            );
          }
          if (finalDiff.hasMutations) {
            throw new Error(`Final verification still has differences: ${finalDiff.changedFields.join(", ")}`);
          }

          entry.liveFingerprint = buildLiveFingerprint(finalLive);
          entry.skippedFields = finalDiff.skippedFields;
          entry.writeCounts.total = entry.writeCounts.product + entry.writeCounts.variants + entry.writeCounts.media;
          entry.writeCount = entry.writeCounts.total;
          entry.status = entry.writeCount ? "updated-verified" : "skipped-exact-match";
          entry.verifiedAt = new Date().toISOString();
          process.stdout.write(`${entry.status}: ${entry.handle}\n`);
        } catch (error) {
          verificationFailures.push(`${entry.handle}: ${error.message}`);
          markFailure(manifest, entry, "failed", error);
        }
      });

      if (verificationFailures.length) {
        throw new Error(`SEO verification failed for ${verificationFailures.length} product(s): ${verificationFailures.join(" | ")}`);
      }

      await persistBatch();
    } catch (error) {
      await persistBatch();
      throw error;
    }
  }
}

export async function runShopifySeoRelease({ mode = "dry-run", output = outputPath, sample = 0, preservePrices = false } = {}) {
  const priorManifest = await readPriorManifest(output);
  const snapshot = await loadCatalogSnapshot();
  const localPlan = await buildShopifySeoReleasePlan(snapshot);
  const localPlanSelection = sample > 0 ? { ...localPlan, products: localPlan.products.slice(0, sample) } : localPlan;
  let manifest = createManifest({ mode, output, plan: localPlanSelection, priorManifest });
  manifest.policy.sample = sample || null;
  manifest.summary.sourceProducts = localPlan.summary.sourceProducts;
  manifest.summary.localCatalogProducts = localPlan.summary.sourceProducts;
  await writeManifest(output, manifest);

  const retryInfo = manifest.retryInfo;
  process.stdout.write(
    `Shopify SEO release ${mode}: ${localPlanSelection.products.length} local product(s), API ${apiVersion}\n`,
  );
  let liveProducts;
  try {
    liveProducts = await fetchLiveProductsForPlan(localPlanSelection, retryInfo, sample);
  } catch (error) {
    markFailure(manifest, null, "failed-live-read", error);
    refreshSummary(manifest);
    await writeManifest(output, manifest);
    throw error;
  }
  const mergedSnapshot = mergeCatalogSnapshotWithLiveProducts(snapshot, liveProducts);
  await writeJsonFile(liveCatalogPath, {
    generatedAt: new Date().toISOString(),
    source: `Shopify CLI ${storeDomain}`,
    total: mergedSnapshot.products.length,
    products: mergedSnapshot.products,
  });
  const mergedPlan = await buildShopifySeoReleasePlan(mergedSnapshot);
  const selectedHandles = new Set(localPlanSelection.products.map((entry) => entry.handle));
  const plan =
    sample > 0
      ? { ...mergedPlan, products: mergedPlan.products.filter((entry) => selectedHandles.has(entry.handle)) }
      : mergedPlan;
  manifest = createManifest({ mode, output, plan, priorManifest });
  manifest.policy.sample = sample || null;
  manifest.policy.catalogAugmentedFromLive = true;
  manifest.retryInfo = retryInfo;
  manifest.summary.sourceProducts = plan.summary.sourceProducts;
  manifest.summary.localCatalogProducts = localPlan.summary.sourceProducts;
  manifest.summary.catalogAugmentedProducts = mergedSnapshot.liveOnlyProducts?.length || 0;
  await writeManifest(output, manifest);

  const eligibilityPlan = buildScopedPlanForLiveCatalog(plan, liveProducts, priorManifest);
  const scopedPlan = preservePrices
    ? {
        ...eligibilityPlan,
        products: eligibilityPlan.products.map((product) => ({ ...product, desiredVariantUpdates: [] })),
      }
    : eligibilityPlan;
  manifest.policy.pricing = preservePrices ? "preserved; no variant price or compare-at mutations" : "planner-controlled";
  await preflight({ plan: scopedPlan, manifest, liveProducts, output: { mode, path: output } });

  if (mode === "dry-run") {
    manifest.completedAt = new Date().toISOString();
    refreshSummary(manifest);
    await writeManifest(output, manifest);
    process.stdout.write(
      `Dry run complete: ${manifest.summary.exactMatches} exact, ${manifest.summary.wouldUpdate} would update, ${manifest.summary.totalWrites} field operation(s).\n`,
    );
    return manifest;
  }

  await applyPlan({ plan: scopedPlan, manifest, output: { mode, path: output } });
  if (sample === 0) {
    manifest.policy.initialFullCatalogPassComplete = true;
    manifest.policy.metaDescriptionBackfillComplete = true;
  }
  manifest.completedAt = new Date().toISOString();
  refreshSummary(manifest);
  await writeManifest(output, manifest);
  assertNoUnverifiedFailures(manifest);
  process.stdout.write(
    `SEO release complete: ${manifest.summary.updatedVerified} updated and verified, ${manifest.summary.exactMatches} exact, ${manifest.summary.totalWrites} write operation(s).\n`,
  );
  return manifest;
}

async function main() {
  const args = parseArgs(process.argv);
  await access(rootDir);
  await runShopifySeoRelease(args);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
