#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import {
  ALL_PRODUCTS_COLLECTION_POLICY,
  COLLECTION_GOVERNANCE_VERSION,
  DEFAULT_READ_ONLY_LIVE_COLLECTION_HANDLES,
  PRICE_COLLECTION_POLICIES,
  RETIRED_COLLECTION_HANDLE_MAP,
  SEMANTIC_COLLECTION_POLICIES,
  assertCompleteCollectionGovernance,
  buildPriceCollectionSource,
  buildProductCollectionTags,
  canonicalCollectionHandle,
  buildSemanticCollectionSource,
  collectionTagForHandle,
  normalizeCollectionHandle,
  productMatchesPricePolicy,
  resolveCollectionPolicyByLiveHandle,
  isManagedCollectionTag,
  semanticCollectionRuleTags,
} from "../src/lib/catalog-collection-governance.js";
import {
  isLegacySaltTag,
  isSimpleClassificationTag,
  simpleCatalogTag,
} from "../src/lib/catalog-simple-tags.js";
import {
  classifyCatalogTaxonomyByRuleId,
  classifyCatalogTaxonomy,
  classifyCatalogTaxonomyWithoutOverrides,
  CATALOG_TAXONOMY_VERSION,
  getCatalogTaxonomyDefinitions,
  normalizeCatalogText,
  tokenizeCatalogText,
} from "../src/lib/catalog-taxonomy.js";
import { resolveVisualTaxonomyHint } from "../src/lib/catalog-visual-taxonomy.js";
import {
  buildProductKnowledgeFromTaxonomy,
  classifyProductKnowledge,
} from "../src/lib/product-knowledge-base.js";
import { catalogVisualFingerprint } from "../src/lib/catalog-fingerprint.js";
import { assessVisionTaxonomyAlignment } from "../src/lib/catalog-vision-alignment.js";
import {
  SPECIAL_COLLECTION_MINIMUMS,
  assertSpecialCollectionMinimums,
  buildSpecialCollectionAssignments,
} from "./build-new-product-special-collection-tags-local.mjs";
import {
  asArray,
  createShopifyAdminGraphQLClient,
  normalizeText,
} from "./shopify-admin-graphql-client.mjs";
import { readProductCatalogPayload } from "./product-catalog-files-local.mjs";
import { readCatalogKnowledgeModel } from "./catalog-knowledge-model-local.mjs";
import { scoreCatalogKnowledgeModelBatch } from "./catalog-knowledge-model-accelerator.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const execFileAsync = promisify(execFile);
const defaultOutputPath = resolve(rootDir, "output", "shopify-catalog-integrity-manifest.json");
const defaultVisualReviewCheckpointPath = resolve(rootDir, "output", "catalog-integrity-visual-review-checkpoint.json");
const defaultVisualTaxonomyEvidencePath = resolve(rootDir, "output", "visual-taxonomy-evidence.json");
const defaultVisualTaxonomyModelPath = resolve(rootDir, "output", "visual-taxonomy-model.json");
const defaultCandidateVisualTaxonomyEvidencePath = resolve(rootDir, "output", "visual-taxonomy-candidate-evidence.json");
const liveInputCheckpointPath = process.env.SALT_CATALOG_INTEGRITY_LIVE_CHECKPOINT ||
  resolve(rootDir, "output", ".shopify-catalog-integrity-live-input.json");
const collectionApprovalPath = resolve(rootDir, "docs", "catalog-collection-approval.json");
const membershipPollAttempts = Math.max(1, Number(process.env.SALT_COLLECTION_MEMBERSHIP_POLL_ATTEMPTS || 12));
const membershipPollDelayMs = Math.max(1000, Number(process.env.SALT_COLLECTION_MEMBERSHIP_POLL_DELAY_MS || 10_000));
const membershipRefreshConcurrency = Math.max(1, Math.min(8, Number(process.env.SALT_COLLECTION_MEMBERSHIP_REFRESH_CONCURRENCY || 6)));
const membershipPulseConcurrency = Math.max(1, Math.min(3, Number(process.env.SALT_COLLECTION_MEMBERSHIP_PULSE_CONCURRENCY || 2)));
const membershipPulseProductLimit = Math.max(1, Math.min(100, Number(process.env.SALT_COLLECTION_MEMBERSHIP_PULSE_PRODUCT_LIMIT || 25)));
const membershipRetryMode = ["bulk", "targeted", "adaptive"].includes(
  String(process.env.SALT_COLLECTION_MEMBERSHIP_RETRY_MODE || "adaptive").trim().toLowerCase(),
)
  ? String(process.env.SALT_COLLECTION_MEMBERSHIP_RETRY_MODE || "adaptive").trim().toLowerCase()
  : "adaptive";
const tagReadbackRetryAttempts = Math.max(
  0,
  Math.min(4, Number(process.env.SALT_CATALOG_TAG_READBACK_RETRY_ATTEMPTS || 3)),
);
const tagReadbackRetryDelayMs = Math.max(
  1000,
  Number(process.env.SALT_CATALOG_TAG_READBACK_RETRY_DELAY_MS || 5000),
);
const tagBulkRepairAttempts = Math.max(
  1,
  Math.min(5, Number(process.env.SALT_CATALOG_TAG_BULK_REPAIR_ATTEMPTS || 3)),
);
const tagBulkRepairDelayMs = Math.max(
  1000,
  Number(process.env.SALT_CATALOG_TAG_BULK_REPAIR_DELAY_MS || 5000),
);
const tagBulkRepairConcurrency = Math.max(
  1,
  Math.min(4, Number(process.env.SALT_CATALOG_TAG_BULK_REPAIR_CONCURRENCY || 2)),
);
const defaultCatalogBatchSize = 50;
const visionModel = process.env.SALT_CATALOG_VISION_MODEL || "gemma3:4b";
const ollamaUrl = (process.env.SALT_OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
const visionImageAttempts = Math.max(1, Math.min(4, Number(process.env.SALT_CATALOG_VISION_IMAGE_ATTEMPTS || 1)));
const visionImageTimeoutMs = Math.max(3_000, Number(process.env.SALT_CATALOG_VISION_IMAGE_TIMEOUT_MS || 8_000));
const visionImageRetryDelayMs = Math.max(100, Number(process.env.SALT_CATALOG_VISION_IMAGE_RETRY_DELAY_MS || 750));
const visionOutputTokens = Math.max(160, Math.min(512, Number(process.env.SALT_CATALOG_VISION_OUTPUT_TOKENS || 256)));
const visionImageLimit = Math.max(1, Math.min(4, Number(process.env.SALT_CATALOG_VISION_IMAGE_LIMIT || 4)));
const visionRequestTimeoutMs = Math.max(20_000, Number(process.env.SALT_CATALOG_VISION_REQUEST_TIMEOUT_MS || 45_000));
const visionRequestAttempts = Math.max(1, Math.min(2, Number(process.env.SALT_CATALOG_VISION_REQUEST_ATTEMPTS || 1)));
const classificationConcurrency = Math.max(
  1,
  Math.min(16, Number(process.env.SALT_CATALOG_CLASSIFICATION_CONCURRENCY || 3)),
);
const collectionSourceApplyConcurrency = Math.max(
  1,
  Math.min(6, Number(process.env.SALT_COLLECTION_SOURCE_APPLY_CONCURRENCY || 3)),
);
const variantContinuationConcurrency = Math.max(
  1,
  Math.min(8, Number(process.env.SALT_CATALOG_VARIANT_CONTINUATION_CONCURRENCY || 6)),
);
const client = createShopifyAdminGraphQLClient({ rootDir, agentName: "catalog-integrity" });
const GOVERNED_COLLECTION_TAGS = new Set(
  SEMANTIC_COLLECTION_POLICIES.map((policy) => normalizeTag(policy.tag)),
);

async function readCurrentKnowledgeEvidence(products) {
  const evidencePath = process.env.SALT_CATALOG_KNOWLEDGE_EVIDENCE_PATH;
  if (!evidencePath) return null;
  const payload = JSON.parse(await readFile(evidencePath, "utf8"));
  const evidence = payload?.evidence;
  if (!evidence || typeof evidence !== "object") throw new Error(`Knowledge evidence cache has no evidence map: ${evidencePath}`);
  const byKey = new Map();
  let matched = 0;
  for (const product of products) {
    const id = String(product?.id || "");
    const numericId = id.split("/").pop();
    const value = evidence[id] || evidence[numericId];
    if (value) {
      matched += 1;
      byKey.set(id, value);
      if (product?.handle) byKey.set(String(product.handle), value);
    }
  }
  if (matched < products.length) {
    throw new Error(`Knowledge evidence cache covers ${matched}/${products.length} live products.`);
  }
  return byKey;
}

const MANAGED_TAG_PREFIXES = Object.freeze(["salt:"]);

const PRODUCTS_QUERY = /* GraphQL */ `
  query CatalogIntegrityProducts($first: Int!, $after: String, $query: String!) {
    products(first: $first, after: $after, query: $query, sortKey: ID) {
      nodes {
        id
        handle
        title
        descriptionHtml
        productType
        vendor
        status
        tags
        createdAt
        updatedAt
        variants(first: 250) {
          nodes { id title sku price compareAtPrice }
          pageInfo { hasNextPage endCursor }
        }
        media(first: 5) {
          nodes {
            __typename
            ... on MediaImage { id alt image { url } }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const PRODUCT_VARIANTS_QUERY = /* GraphQL */ `
  query CatalogIntegrityProductVariants($id: ID!, $first: Int!, $after: String) {
    node(id: $id) {
      ... on Product {
        variants(first: $first, after: $after) {
          nodes { id title sku price compareAtPrice }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

const COLLECTIONS_QUERY = /* GraphQL */ `
  query CatalogIntegrityCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after) {
      nodes {
        id
        handle
        title
        descriptionHtml
        productsCount { count }
        ruleSet { appliedDisjunctively rules { column relation condition } }
        sources {
          __typename
          ... on CollectionConditionsSource {
            id
            title
            shareable
            targetType
            inclusion {
              matchType
              conditions {
                __typename
                id
                ... on CollectionSourceInclusionConditionProductTag { relation values matchType }
                ... on CollectionSourceInclusionConditionVariantPrice { relation value { amount currencyCode } }
              }
            }
          }
        }
        resourcePublications(first: 100) {
          nodes { isPublished channel { id name } }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const PUBLICATIONS_QUERY = /* GraphQL */ `
  query CatalogIntegrityPublications($first: Int!, $after: String) {
    publications(first: $first, after: $after) {
      nodes { id name }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const ACTIVE_PRODUCT_TAGS_QUERY = /* GraphQL */ `
  query CatalogIntegrityActiveProductTags($first: Int!, $after: String, $query: String!) {
    products(first: $first, after: $after, query: $query, sortKey: ID) {
      nodes { id handle tags }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const PRODUCT_TAGS_QUERY = /* GraphQL */ `
  query CatalogIntegrityProductTags($id: ID!) {
    node(id: $id) {
      ... on Product { id handle tags }
    }
  }
`;

const COLLECTION_CREATE_MUTATION = /* GraphQL */ `
  mutation CatalogIntegrityCollectionCreate($collection: CollectionCreateInput!) {
    collectionCreate(collection: $collection) {
      collection { id handle title }
      userErrors { field message }
    }
  }
`;

const STAGED_UPLOAD_CREATE_MUTATION = /* GraphQL */ `
  mutation CatalogIntegrityTagUpload($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { field message }
    }
  }
`;

const BULK_OPERATION_RUN_MUTATION = /* GraphQL */ `
  mutation CatalogIntegrityRunTagBulk($mutation: String!, $stagedUploadPath: String!) {
    bulkOperationRunMutation(mutation: $mutation, stagedUploadPath: $stagedUploadPath) {
      bulkOperation { id status }
      userErrors { field message }
    }
  }
`;

const BULK_OPERATION_RUN_QUERY = /* GraphQL */ `
  mutation CatalogIntegrityRunMembershipExport($query: String!) {
    bulkOperationRunQuery(query: $query) {
      bulkOperation { id status }
      userErrors { field message }
    }
  }
`;

const BULK_OPERATION_STATUS_QUERY = /* GraphQL */ `
  query CatalogIntegrityTagBulkStatus($id: ID!) {
    bulkOperation(id: $id) {
      id status errorCode objectCount fileSize url partialDataUrl createdAt completedAt
    }
  }
`;

const BULK_PRODUCT_TAG_MUTATION = /* GraphQL */ `
  mutation CatalogIntegrityExactProductTags($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id }
      userErrors { field message }
    }
  }
`;

const BULK_COLLECTION_UPDATE_MUTATION = /* GraphQL */ `
  mutation CatalogIntegrityExactCollection($collection: CollectionUpdateInput!) {
    collectionUpdate(collection: $collection) {
      collection { id handle title }
      userErrors { field message }
    }
  }
`;

const BULK_COLLECTION_MEMBERSHIP_QUERY = /* GraphQL */ `
  {
    collections {
      edges {
        node {
          id
          handle
          title
          sources {
            __typename
            ... on CollectionConditionsSource {
              id
              title
              shareable
              targetType
              inclusion {
                matchType
                conditions {
                  __typename
                  id
                  ... on CollectionSourceInclusionConditionProductTag { relation values matchType }
                  ... on CollectionSourceInclusionConditionVariantPrice { relation value { amount currencyCode } }
                }
              }
            }
          }
          products {
            edges { node { id } }
          }
        }
      }
    }
  }
`;

const COLLECTION_MEMBERSHIP_REFRESH_QUERY = /* GraphQL */ `
  query CatalogIntegrityCollectionMembershipRefresh($id: ID!, $first: Int!, $after: String) {
    node(id: $id) {
      ... on Collection {
        id
        products(first: $first, after: $after) {
          nodes { id }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

const PUBLISH_MUTATION = /* GraphQL */ `
  mutation CatalogIntegrityCollectionPublish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      userErrors { field message }
    }
  }
`;

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function parseArgs(argv) {
  const args = {
    mode: "dry-run",
    output: defaultOutputPath,
    skipVision: false,
    useLiveCheckpoint: false,
    reclassify: false,
    deterministicOnly: false,
    supervisedVision: false,
    reviewOnly: false,
    reusePriorManifest: false,
    batchSize: defaultCatalogBatchSize,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--apply") args.mode = "apply";
    else if (token === "--dry-run") args.mode = "dry-run";
    else if (token === "--verify") args.mode = "verify";
    else if (token === "--skip-vision") args.skipVision = true;
    else if (token === "--use-live-checkpoint") args.useLiveCheckpoint = true;
    else if (token === "--reclassify") args.reclassify = true;
    else if (token === "--deterministic-only") args.deterministicOnly = true;
    else if (token === "--supervised-vision") args.supervisedVision = true;
    else if (token === "--review-only") args.reviewOnly = true;
    else if (token === "--reuse-prior-manifest") args.reusePriorManifest = true;
    else if (token === "--batch-size") {
      const batchSize = Number(next);
      if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
        throw new Error("--batch-size must be an integer between 1 and 1000");
      }
      args.batchSize = batchSize;
      index += 1;
    }
    else if (token === "--output") {
      if (!next) throw new Error("Missing value for --output");
      args.output = resolve(rootDir, next);
      index += 1;
    } else throw new Error(`Unknown argument: ${token}`);
  }
  if (args.useLiveCheckpoint && !["dry-run", "verify"].includes(args.mode)) {
    throw new Error("--use-live-checkpoint is allowed only for non-mutating dry runs and verifies");
  }
  return args;
}

function formatUserErrors(errors) {
  return asArray(errors).map((error) => {
    const field = asArray(error?.field).join(".");
    return `${field} ${normalizeText(error?.message || "Shopify user error")}`.trim();
  }).join("; ");
}

function numericId(value) {
  return String(value || "").match(/(\d+)$/)?.[1] || "";
}

function normalizeTag(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqueTags(values) {
  const byNormalized = new Map();
  for (const value of values) {
    const text = normalizeText(value);
    const normalized = normalizeTag(text);
    if (text && normalized && !byNormalized.has(normalized)) byNormalized.set(normalized, text);
  }
  return [...byNormalized.values()];
}

// Shopify can collapse tags that differ only by spaces, hyphens, or
// underscores. Preserve the merchant spelling and treat the managed spelling
// as an explicit alias instead of silently deleting merchant content.
function tagCollisionKey(value) {
  return normalizeTag(value).replace(/[\s_-]+/g, "");
}

function isManagedTag(tag, managedTagUniverse = new Set()) {
  const normalized = normalizeTag(tag);
  return MANAGED_TAG_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ||
    isLegacySaltTag(normalized) ||
    isSimpleClassificationTag(normalized) ||
    isManagedCollectionTag(normalized) ||
    managedTagUniverse.has(normalized);
}

function isOnlineStorePublished(collection) {
  return asArray(collection?.resourcePublications?.nodes).some((publication) =>
    publication?.isPublished === true && normalizeTag(publication?.channel?.name) === "online store",
  );
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function buildPriorIntegritySnapshot(manifest) {
  if (!manifest?.completedAt) return null;
  if (manifest?.version !== COLLECTION_GOVERNANCE_VERSION) return null;
  if (manifest?.taxonomyVersion && manifest.taxonomyVersion !== CATALOG_TAXONOMY_VERSION) return null;
  if (
    manifest?.collectionGovernanceVersion &&
    manifest.collectionGovernanceVersion !== COLLECTION_GOVERNANCE_VERSION
  ) return null;
  if (Number(manifest?.summary?.failures || 0) !== 0) return null;
  if (Number(manifest?.summary?.guessedAssignments || 0) !== 0) return null;

  const classifications = asArray(manifest?.classifications);
  const tagTasks = asArray(manifest?.tagTasks);
  if (!classifications.length || classifications.length !== tagTasks.length) return null;

  const tagTaskByHandle = new Map(tagTasks.map((task) => [
    normalizeCollectionHandle(task?.handle),
    task,
  ]));
  const byHandle = new Map();
  for (const classification of classifications) {
    const handle = normalizeCollectionHandle(classification?.handle);
    const tagTask = tagTaskByHandle.get(handle);
    if (
      !handle ||
      !classification?.ruleId ||
      !tagTask ||
      !Array.isArray(tagTask.desiredManagedTags) ||
      byHandle.has(handle)
    ) return null;
    byHandle.set(handle, { classification, tagTask });
  }

  return {
    completedAt: manifest.completedAt,
    byHandle,
    legacyVersionMetadata: !manifest.taxonomyVersion || !manifest.collectionGovernanceVersion,
  };
}

async function verifyCollectionApproval() {
  const approval = await readJson(collectionApprovalPath);
  const approvalId = normalizeText(approval?.approvalId);
  if (approval?.approved !== true || !approvalId) throw new Error("Full-catalog collection approval is missing or not approved.");
  if (approval.taxonomyVersion !== CATALOG_TAXONOMY_VERSION) throw new Error("Collection approval targets a different taxonomy version.");
  if (approval.governanceVersion !== COLLECTION_GOVERNANCE_VERSION) throw new Error("Collection approval targets a different governance version.");
  if (approval?.scope?.managedCollections !== "create or repair only canonical collections in the checked-in full-catalog governance registry") {
    throw new Error("Collection approval does not restrict writes to the checked-in governance registry.");
  }
  if (approval?.scope?.controlledRuleTags !== "exactly one canonical simple collection tag condition per semantic collection, except approved union rules for gifts and trending-finds") {
    throw new Error("Collection approval does not require exact semantic collection tag conditions.");
  }
  if (approval?.scope?.existingTags !== "preserve unmanaged tags exactly; exact-replace checked-in canonical managed tags") {
    throw new Error("Collection approval does not preserve unmanaged product tags.");
  }
  if (approval?.scope?.legacyMergesOrArchives !== "not approved") throw new Error("Collection merges or archives are not forbidden by approval.");
  if (approval?.scope?.collectionlessProducts !== "forbidden; every active product must be verified in at least one live collection") {
    throw new Error("Collection approval does not forbid collectionless active products.");
  }
  if (process.env.SALT_CATALOG_COLLECTIONS_APPROVED !== "1") {
    throw new Error("Set SALT_CATALOG_COLLECTIONS_APPROVED=1 only for the approved full-catalog collection run.");
  }
  if (normalizeText(process.env.SALT_CATALOG_COLLECTIONS_APPROVAL_ID) !== approvalId) {
    throw new Error("SALT_CATALOG_COLLECTIONS_APPROVAL_ID does not match the collection approval manifest.");
  }
  return approvalId;
}

async function writeManifest(path, manifest) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function readVisualReviewCheckpoint(path, fingerprint) {
  const checkpoint = await readJson(path, null);
  if (checkpoint?.catalogFingerprint !== fingerprint) return new Map();
  return new Map(
    asArray(checkpoint?.classifications)
      .filter((entry) => entry?.handle && entry?.visualEvidence)
      .map((entry) => [normalizeCollectionHandle(entry.handle), entry]),
  );
}

async function writeVisualReviewCheckpoint(path, fingerprint, entries) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    catalogFingerprint: fingerprint,
    taxonomyVersion: CATALOG_TAXONOMY_VERSION,
    governanceVersion: COLLECTION_GOVERNANCE_VERSION,
    classifications: [...entries.values()],
  }, null, 2)}\n`, "utf8");
}

export function visualEvidenceMatchesProduct(product, entry) {
  const currentImages = productImageUrls(product).slice(0, visionImageLimit);
  const savedImages = asArray(entry?.imageUrls).filter(Boolean);
  return currentImages.length > 0 && currentImages.length === savedImages.length &&
    currentImages.every((url, index) => url === savedImages[index]);
}

async function completeVariants(product, retryInfo) {
  const nodes = [...asArray(product?.variants?.nodes)];
  let after = product?.variants?.pageInfo?.endCursor || null;
  while (product?.variants?.pageInfo?.hasNextPage) {
    const data = await client.run(PRODUCT_VARIANTS_QUERY, { id: product.id, first: 250, after }, {
      operation: `variant continuation ${product.handle}`,
      retryInfo,
    });
    const connection = data?.node?.variants;
    if (!connection) throw new Error(`No variant continuation returned for ${product.handle}.`);
    nodes.push(...asArray(connection.nodes));
    product = { ...product, variants: connection };
    if (!connection.pageInfo?.hasNextPage) break;
    after = connection.pageInfo?.endCursor;
    if (!after) throw new Error(`Variant continuation for ${product.handle} has no cursor.`);
  }
  return { ...product, variants: { nodes, pageInfo: { hasNextPage: false, endCursor: after } } };
}

async function fetchActiveProducts(retryInfo) {
  const products = [];
  let after = null;
  let page = 0;
  while (true) {
    page += 1;
    const data = await client.run(PRODUCTS_QUERY, { first: 250, after, query: "status:active" }, {
      operation: `catalog integrity product page ${page}`,
      retryInfo,
    });
    const connection = data?.products;
    if (!connection) throw new Error("Shopify returned no active product connection.");
    const pageProducts = asArray(connection.nodes);
    const completedPageProducts = await mapWithConcurrency(
      pageProducts,
      variantContinuationConcurrency,
      (product) => product?.variants?.pageInfo?.hasNextPage
        ? completeVariants(product, retryInfo)
        : product,
      "Catalog integrity hydrated",
    );
    products.push(...completedPageProducts);
    process.stdout.write(`Catalog integrity fetched ${products.length} active products.\n`);
    if (!connection.pageInfo?.hasNextPage) break;
    after = connection.pageInfo?.endCursor;
    if (!after) throw new Error("Active product pagination has no cursor.");
  }
  return products;
}

async function fetchCollections(retryInfo) {
  const collections = [];
  let after = null;
  while (true) {
    const data = await client.run(COLLECTIONS_QUERY, { first: 250, after }, {
      operation: `catalog integrity collection page ${collections.length / 250 + 1}`,
      retryInfo,
    });
    const connection = data?.collections;
    if (!connection) throw new Error("Shopify returned no collection connection.");
    collections.push(...asArray(connection.nodes));
    if (!connection.pageInfo?.hasNextPage) break;
    after = connection.pageInfo?.endCursor;
    if (!after) throw new Error("Collection pagination has no cursor.");
  }
  return collections;
}

async function fetchPublications(retryInfo) {
  const publications = [];
  let after = null;
  while (true) {
    const data = await client.run(PUBLICATIONS_QUERY, { first: 250, after }, {
      operation: "catalog integrity publication page",
      retryInfo,
    });
    const connection = data?.publications;
    if (!connection) throw new Error("Shopify returned no publication connection.");
    publications.push(...asArray(connection.nodes));
    if (!connection.pageInfo?.hasNextPage) break;
    after = connection.pageInfo?.endCursor;
    if (!after) throw new Error("Publication pagination has no cursor.");
  }
  return publications;
}

function localProductByHandle(catalog) {
  return new Map(asArray(catalog?.products).map((product) => [normalizeCollectionHandle(product?.handle), product]));
}

function mergeProduct(localProduct, liveProduct) {
  const images = asArray(liveProduct?.media?.nodes)
    .filter((media) => media?.__typename === "MediaImage" && media?.image?.url)
    .map((media) => ({ id: numericId(media.id), src: media.image.url, alt: media.alt || "" }));
  return {
    ...localProduct,
    id: numericId(liveProduct.id),
    shopifyId: liveProduct.id,
    handle: liveProduct.handle,
    title: localProduct?.title || liveProduct.title,
    body_html: localProduct?.body_html || liveProduct.descriptionHtml || "",
    product_type: localProduct?.product_type || liveProduct.productType || "",
    vendor: localProduct?.vendor || liveProduct.vendor || "",
    status: liveProduct.status,
    // Managed canonical tags are outputs, not evidence. Excluding them avoids
    // a prior wrong collection tag forcing a model conflict on the next run;
    // unmanaged merchant tags remain available as supporting evidence.
    tags: uniqueTags([...asArray(localProduct?.tags), ...asArray(liveProduct.tags)])
      .filter((tag) => !isManagedTaxonomyEvidenceTag(tag)),
    liveTags: asArray(liveProduct.tags),
    created_at: localProduct?.created_at || liveProduct.createdAt,
    updated_at: liveProduct.updatedAt,
    images: images.length ? images : asArray(localProduct?.images),
    variants: asArray(liveProduct?.variants?.nodes),
  };
}

function taxonomyTokens(definition) {
  return new Set(tokenizeCatalogText([
    definition.canonicalType,
    ...asArray(definition.terms),
    ...asArray(definition.aliases),
  ].join(" ")));
}

const TAXONOMY_DEFINITIONS = getCatalogTaxonomyDefinitions();
const TAXONOMY_TOKEN_INDEX = TAXONOMY_DEFINITIONS.map((definition) => ({
  definition,
  tokens: taxonomyTokens(definition),
}));

// Canonical taxonomy tags are outputs, not evidence. Keep the full governed
// universe here so a stale type/category tag such as `toy` cannot force a
// product back into an obsolete classification on the next reconciliation.
const CANONICAL_TAXONOMY_TAGS = new Set();
function addCanonicalTaxonomyTag(namespace, value) {
  if (!value) return;
  try {
    CANONICAL_TAXONOMY_TAGS.add(normalizeTag(simpleCatalogTag(namespace, value)));
  } catch {
    // Ignore malformed optional taxonomy metadata; the checked-in taxonomy
    // remains the source of truth for valid managed tags.
  }
}
for (const definition of TAXONOMY_DEFINITIONS) {
  addCanonicalTaxonomyTag("department", definition.departmentId);
  addCanonicalTaxonomyTag("category", definition.categoryId);
  addCanonicalTaxonomyTag("type", definition.canonicalType);
  for (const related of asArray(definition.relatedCategories)) {
    addCanonicalTaxonomyTag("department", related?.departmentId);
    addCanonicalTaxonomyTag("category", related?.categoryId);
  }
  addCanonicalTaxonomyTag("classification-rule", definition.id);
}
for (const audience of ["women", "men", "kids", "baby", "pets"]) {
  addCanonicalTaxonomyTag("audience", audience);
}
for (const feature of ["wireless", "rechargeable", "portable", "waterproof", "foldable", "adjustable", "led", "smart", "bluetooth", "insulated"]) {
  addCanonicalTaxonomyTag("feature", feature);
}
for (const compatibility of ["iphone", "android", "airpods", "ipad", "laptop", "macbook", "samsung", "usb c", "type c"]) {
  addCanonicalTaxonomyTag("compatibility", compatibility);
}
for (const policy of [...PRICE_COLLECTION_POLICIES, ...SEMANTIC_COLLECTION_POLICIES]) {
  CANONICAL_TAXONOMY_TAGS.add(normalizeTag(policy.tag));
}
for (const handle of [
  "best-sellers", "staff-picks", "new-arrivals", "trending-finds", "gifts",
  "gifts-for-dad", "gifts-for-mom", "gifts-for-seniors", "housewarming-gifts",
  ...Object.keys(SPECIAL_COLLECTION_MINIMUMS),
]) {
  CANONICAL_TAXONOMY_TAGS.add(normalizeTag(handle));
}

function isManagedTaxonomyEvidenceTag(tag) {
  const normalized = normalizeTag(tag);
  return isManagedTag(normalized) || CANONICAL_TAXONOMY_TAGS.has(normalized);
}

function lexicalBestRule(product, visualText = "") {
  const direct = normalizeCatalogText([
    visualText,
    product?.title,
    product?.handle,
    product?.product_type,
  ].filter(Boolean).join(" "));
  const tokens = new Set(tokenizeCatalogText(direct));
  const ranked = TAXONOMY_TOKEN_INDEX.map(({ definition, tokens: ruleTokens }) => {
    let score = 0;
    for (const token of tokens) if (ruleTokens.has(token)) score += token.length >= 8 ? 4 : token.length >= 5 ? 2 : 1;
    if (asArray(definition.terms).some((term) => direct.includes(normalizeCatalogText(term)))) score += 20;
    if (direct.includes(normalizeCatalogText(definition.canonicalType))) score += 15;
    if (definition.generic) score -= 3;
    return { ruleId: definition.id, score };
  }).sort((left, right) => right.score - left.score || left.ruleId.localeCompare(right.ruleId));
  return ranked[0]?.score > 0 ? ranked[0] : { ruleId: "fashion-general", score: 0 };
}

function firstImageUrl(product) {
  return asArray(product?.images).map((image) => image?.src || image?.url || "").find(Boolean) || "";
}

function productImageUrls(product) {
  return [...new Set(asArray(product?.images)
    .map((image) => typeof image === "string" ? image : image?.src || image?.url || "")
    .map(normalizeText)
    .filter(Boolean))];
}

function resizeImageUrl(url) {
  try {
    const parsed = new URL(url);
    if (/cdn\.shopify\.com$/i.test(parsed.hostname) || /shopifycdn\.net$/i.test(parsed.hostname)) {
      parsed.searchParams.set("width", "384");
      return parsed.toString();
    }
  } catch {
    // imageAsBase64 reports malformed source URLs with the product context.
  }
  return url;
}

function visionImageCandidates(url) {
  const resized = resizeImageUrl(url);
  const candidates = [resized];
  if (process.env.SALT_CATALOG_VISION_TRY_ORIGINAL === "1") candidates.push(url);
  return [...new Set(candidates.filter(Boolean))];
}

function parseVisionJson(rawContent) {
  const raw = String(rawContent || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

const inFlightImageFetches = new Map();
const configuredVisionImageCacheEntries = Number(
  process.env.SALT_CATALOG_VISION_IMAGE_CACHE_ENTRIES || 256,
);
const visionImageCacheMaxEntries = Math.max(
  0,
  Math.min(
    512,
    Number.isFinite(configuredVisionImageCacheEntries)
      ? configuredVisionImageCacheEntries
      : 256,
  ),
);
const configuredVisionImageCacheMb = Number(
  process.env.SALT_CATALOG_VISION_IMAGE_CACHE_MB || 64,
);
const visionImageCacheMaxBytes = Math.max(
  0,
  Number.isFinite(configuredVisionImageCacheMb) ? configuredVisionImageCacheMb : 64,
) * 1024 * 1024;
const visionImageCache = new Map();
let visionImageCacheBytes = 0;
let visionSerialFallback = false;
let activeVisionRequests = 0;
const visionRequestWaiters = [];

async function acquireVisionRequestSlot() {
  while (activeVisionRequests >= (visionSerialFallback ? 1 : classificationConcurrency)) {
    await new Promise((resolvePromise) => visionRequestWaiters.push(resolvePromise));
  }
  activeVisionRequests += 1;
}

function releaseVisionRequestSlot() {
  activeVisionRequests = Math.max(0, activeVisionRequests - 1);
  visionRequestWaiters.shift()?.();
}

function isVisionTimeout(error) {
  return /abort|timeout|timed out/i.test(String(error?.message || error || ""));
}

function readVisionImageCache(cacheKey) {
  const cached = visionImageCache.get(cacheKey);
  if (!cached) return null;
  // Refresh LRU order so repeated supplier images remain hot during a batch.
  visionImageCache.delete(cacheKey);
  visionImageCache.set(cacheKey, cached);
  return cached.data;
}

function writeVisionImageCache(cacheKey, data) {
  if (!cacheKey || !data || visionImageCacheMaxEntries === 0 || visionImageCacheMaxBytes === 0) return;
  const bytes = Buffer.byteLength(data, "base64");
  if (bytes > visionImageCacheMaxBytes) return;
  while (
    visionImageCache.size >= visionImageCacheMaxEntries ||
    visionImageCacheBytes + bytes > visionImageCacheMaxBytes
  ) {
    const oldestKey = visionImageCache.keys().next().value;
    if (!oldestKey) break;
    const oldest = visionImageCache.get(oldestKey);
    visionImageCache.delete(oldestKey);
    visionImageCacheBytes -= oldest?.bytes || 0;
  }
  visionImageCache.set(cacheKey, { data, bytes });
  visionImageCacheBytes += bytes;
}

async function imageAsBase64(url) {
  const cacheKey = resizeImageUrl(url);
  const cached = readVisionImageCache(cacheKey);
  if (cached) return cached;
  if (inFlightImageFetches.has(cacheKey)) return inFlightImageFetches.get(cacheKey);
  const promise = (async () => {
    let lastError = null;
    for (let attempt = 1; attempt <= visionImageAttempts; attempt += 1) {
      for (const candidate of visionImageCandidates(url)) {
        try {
          const response = await fetch(candidate, {
            headers: {
              Accept: "image/avif,image/webp,image/jpeg,image/png,*/*",
              "User-Agent": "SALT-catalog-supervised-vision/1.0",
            },
            signal: AbortSignal.timeout(visionImageTimeoutMs),
          });
          if (!response.ok) throw new Error(`image HTTP ${response.status}`);
          const bytes = await response.arrayBuffer();
          if (!bytes.byteLength) throw new Error("image response was empty");
          const encoded = Buffer.from(bytes).toString("base64");
          writeVisionImageCache(cacheKey, encoded);
          return encoded;
        } catch (error) {
          lastError = error;
        }
      }
      if (attempt < visionImageAttempts) await sleep(visionImageRetryDelayMs * attempt);
    }
    throw lastError || new Error("image fetch failed");
  })();
  inFlightImageFetches.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    inFlightImageFetches.delete(cacheKey);
  }
}

function classifyVisionEvidence(product, content, imageUrl = null, imageUrls = []) {
  const evidenceConfidence = Number(content?.evidenceConfidence);
  const imageAgreement = Number(content?.imageAgreement);
  const ambiguity = normalizeText(content?.ambiguity);
  const lowAmbiguity = /^(?:none|no ambiguity|no apparent ambiguity|not applicable|n\/a|low|minimal|minor|negligible)(?:\s|[-:]|$)/i.test(ambiguity) ||
    /^(?:the\s+)?ambiguity\s+(?:is|appears|seems)\s+(?:low|minimal|minor|negligible)\b/i.test(ambiguity) ||
    /\b(?:clear(?:ly)?|unambiguous|high degree of certainty|consistently depicted|standard (?:set|product|device|retro handheld)|primary function|simple cable management|designed for|based on (?:the )?(?:visible )?features|clear and unambiguous|no specific branding|standard set of)\b/i.test(ambiguity);
  const materialUncertainty = /\b(?:not explicitly (?:stated|visible)|not specified|difficult to ascertain|difficult to determine|unclear|uncertain|unknown|approx(?:imately|\.)?|suggests|likely)\b/i.test(ambiguity);
  const taxonomyUncertainty = /\b(?:could be|might be|may be|either .* or|multiple possible|cannot (?:identify|determine)|unable to (?:identify|determine)|intended use .*\b(?:unclear|ambiguous)|ambiguous between)\b/i.test(ambiguity);
  // Hold ambiguity only when it can change the product family/category. A
  // missing material, size, or color detail should not discard otherwise
  // consistent multi-image evidence.
  const hasAmbiguity = Boolean(ambiguity && !lowAmbiguity && taxonomyUncertainty && !(
    materialUncertainty && /\b(?:size|dimension|capacity|storage|material|fabric|shade|color|game (?:title|library)|branding|specific .*detail)\b/i.test(ambiguity)
  ));
  const visualText = [content?.productName, content?.productCategory, ...asArray(content?.visibleAttributes)]
    .map(normalizeText).filter(Boolean).join(" ");
  if (!visualText || !Number.isFinite(evidenceConfidence) || !Number.isFinite(imageAgreement)) {
    return { error: "Supervised vision returned incomplete confidence evidence.", imageUrl, imageUrls, visualEvidence: content };
  }
  if (evidenceConfidence < 78 || imageAgreement < 78 || hasAmbiguity) {
    return {
      error: `Supervised vision evidence held for review (confidence ${evidenceConfidence}, agreement ${imageAgreement}, ambiguity ${ambiguity || "none reported"}).`,
      imageUrl,
      imageUrls,
      visualEvidence: content,
    };
  }
  const visualProduct = {
    ...product,
    title: visualText,
    handle: "",
    body_html: "",
    product_type: content?.productCategory || "",
    tags: [],
  };
  const visualClassification = classifyCatalogTaxonomyWithoutOverrides(visualProduct);
  const visualHintRuleId = resolveVisualTaxonomyHint(content, product);
  const hintedVisualClassification = visualHintRuleId
    ? classifyCatalogTaxonomyByRuleId(visualProduct, visualHintRuleId, {
      source: "visual-category-hint",
      reason: `Supervised visual evidence matched the governed retail label ${visualHintRuleId}.`,
    })
    : null;
  const resolvedVisualClassification = hintedVisualClassification || visualClassification;
  if (resolvedVisualClassification.ruleId === "unclassified") {
    return {
      error: "Visual evidence did not satisfy a checked-in taxonomy rule (unclassified)",
      imageUrl,
      imageUrls,
      visualEvidence: content,
      suggestedRuleId: lexicalBestRule(product, visualText).ruleId,
    };
  }
  const bestRule = resolvedVisualClassification.ruleId;
  const visionAlignment = assessVisionTaxonomyAlignment(product, bestRule);
  if (!visionAlignment.accepted) {
    process.stdout.write(`Vision enrichment rejected for ${product.handle}: ${visionAlignment.reason}\n`);
    return {
      error: visionAlignment.reason,
      imageUrl,
      imageUrls,
      visualEvidence: content,
      visionAlignment,
      rejectedRuleId: bestRule,
      suggestedRuleId: lexicalBestRule(product).ruleId,
    };
  }
  const taxonomy = classifyCatalogTaxonomyByRuleId(product, bestRule, {
    source: "local-vision",
    reason: `Local ${visionModel} image evidence: ${normalizeText(content?.rationale)}`,
  });
  process.stdout.write(`Supervised vision enrichment completed for ${product.handle}: ${bestRule}.\n`);
  return {
    knowledge: buildProductKnowledgeFromTaxonomy(product, taxonomy),
    source: "vision",
    imageUrl,
    imageUrls,
    visualEvidence: { ...content, evidenceConfidence, imageAgreement },
    visionAlignment,
  };
}

async function classifyWithVision(product) {
  const imageUrls = productImageUrls(product).slice(0, visionImageLimit);
  const imageUrl = imageUrls[0] || "";
  if (!imageUrls.length) return null;
  try {
    process.stdout.write(`Supervised vision enrichment started for ${product.handle} (${imageUrls.length} image(s)).\n`);
    const imageResults = await Promise.all(imageUrls.map(async (url) => {
      try {
        return await imageAsBase64(resizeImageUrl(url));
      } catch {
        // One unavailable CDN asset must not discard the other product images.
        return null;
      }
    }));
    const images = imageResults.filter(Boolean);
    if (!images.length) throw new Error("no product images could be fetched");
    const requestBody = JSON.stringify({
        model: visionModel,
        stream: false,
        format: {
          type: "object",
          properties: {
            productName: { type: "string" },
            productCategory: { type: "string" },
            visibleAttributes: { type: "array", items: { type: "string" } },
            rationale: { type: "string" },
            evidenceConfidence: { type: "integer", minimum: 0, maximum: 100 },
            imageAgreement: { type: "integer", minimum: 0, maximum: 100 },
            ambiguity: { type: "string" },
          },
          required: ["productName", "productCategory", "visibleAttributes", "rationale", "evidenceConfidence", "imageAgreement", "ambiguity"],
        },
        messages: [{
          role: "user",
          content: `Identify the exact retail product shown across all supplied images. Use only visible evidence and do not infer hidden properties. Supplier title: ${product.title}. Return a concrete product noun, retail category, up to four visible attributes, a short rationale, an evidence confidence from 0 to 100, an image-agreement score from 0 to 100, and a short ambiguity description.`,
          images,
        }],
        options: { temperature: 0, num_predict: visionOutputTokens },
        keep_alive: "10m",
      });
    let response = null;
    let requestError = null;
    await acquireVisionRequestSlot();
    try {
      for (let attempt = 1; attempt <= visionRequestAttempts; attempt += 1) {
        try {
          response = await fetch(`${ollamaUrl}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(visionRequestTimeoutMs),
            body: requestBody,
          });
          if (response.ok) break;
          requestError = new Error(`Ollama HTTP ${response.status}`);
        } catch (error) {
          requestError = error;
        }
        if (isVisionTimeout(requestError)) {
          // A timeout is a capacity signal, not a transient HTTP failure.
          // Hold this product for the guarded review lane and serialize the
          // remaining requests so the local model can recover.
          visionSerialFallback = true;
          break;
        }
        if (attempt < visionRequestAttempts) await sleep(visionImageRetryDelayMs * attempt);
      }
    } finally {
      releaseVisionRequestSlot();
    }
    if (!response?.ok) throw requestError || new Error("Ollama vision request failed");
    const payload = await response.json();
    const content = parseVisionJson(payload?.message?.content) || {};
    return classifyVisionEvidence(product, content, imageUrl, imageUrls);
  } catch (error) {
    process.stdout.write(`Vision enrichment failed for ${product.handle}: ${normalizeText(error?.message || error)}.\n`);
    return { error: normalizeText(error?.message || error), imageUrl, imageUrls };
  }
}

async function mapWithConcurrency(items, concurrency, mapper, progressLabel = "Processed") {
  const results = new Array(items.length);
  let nextIndex = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
      completed += 1;
      if (completed % 25 === 0 || completed === items.length) {
        process.stdout.write(`${progressLabel} ${completed}/${items.length} products.\n`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

export function resolveDeterministicKnowledge(product, knowledgeModel = null, modelEvidence = undefined) {
  const regularKnowledge = classifyProductKnowledge(product, { knowledgeModel, modelEvidence });
  if (!regularKnowledge.reviewRequired) {
    return {
      knowledge: regularKnowledge,
      source: regularKnowledge.override ? "approved-override" : "taxonomy",
    };
  }

  // Some supplier records contain an exact product-family noun in the title
  // or handle but no matching legacy taxonomy term. Use only the checked-in
  // label map above; this is evidence-backed classification, not a release
  // guess, and it never overrides a reliable trained-model conflict.
  const regularReasons = new Set(regularKnowledge.reviewReasons || []);
  const hasReliableModelConflict = [...regularReasons].some((reason) =>
    String(reason).startsWith("Trained knowledge model disagrees"));
  const directHintRuleId = resolveVisualTaxonomyHint(null, product);
  const imageCount = productImageUrls(product).length;
  if (directHintRuleId && (!hasReliableModelConflict || imageCount === 0)) {
    const hintedTaxonomy = classifyCatalogTaxonomyByRuleId(product, directHintRuleId, {
      source: "deterministic-direct-hint",
      reason: `Exact product-family wording in the title or handle matched the governed rule ${directHintRuleId}.`,
    });
    const completePath = Boolean(
      hintedTaxonomy?.departmentId &&
      hintedTaxonomy?.categoryId &&
      hintedTaxonomy?.subcategoryId &&
      hintedTaxonomy?.canonicalTypeId &&
      hintedTaxonomy?.shopifyCategory,
    );
    if (completePath && !hintedTaxonomy.reviewRequired) {
      return {
        knowledge: buildProductKnowledgeFromTaxonomy(product, hintedTaxonomy, { knowledgeModel, modelEvidence }),
        source: "evidence-fallback",
        evidenceFallback: true,
        reason: "Strong direct title/handle product-family evidence resolved a missing legacy taxonomy term.",
      };
    }
  }

  // A complete direct taxonomy path with only the single-evidence warning is
  // safe to retain. This prevents obvious image-less products from entering
  // the review queue solely because a supplier feed omitted a second signal.
  const taxonomy = classifyCatalogTaxonomy(product);
  const taxonomyReasons = new Set(taxonomy?.reviewReasons || []);
  const directFields = new Set(taxonomy?.evidence?.directFields || []);
  const directEvidence = directFields.has("title") || directFields.has("handle");
  const onlySingleLane = [...taxonomyReasons].every((reason) => reason === "single-evidence-lane");
  const completePath = Boolean(
    taxonomy?.departmentId &&
    taxonomy?.categoryId &&
    taxonomy?.subcategoryId &&
    taxonomy?.canonicalTypeId &&
    taxonomy?.shopifyCategory,
  );
  if (
    !hasReliableModelConflict &&
    directEvidence &&
    completePath &&
    Number(taxonomy?.confidence || 0) >= 72 &&
    onlySingleLane
  ) {
    const evidenceBackedTaxonomy = {
      ...taxonomy,
      reviewRequired: false,
      seoEligible: true,
      reviewReasons: [],
      evidence: {
        ...taxonomy.evidence,
        lanes: [...new Set([...(taxonomy.evidence?.lanes || []), "deterministic-direct-text"])],
      },
    };
    return {
      knowledge: buildProductKnowledgeFromTaxonomy(product, evidenceBackedTaxonomy, { knowledgeModel, modelEvidence }),
      source: "evidence-fallback",
      evidenceFallback: true,
      reason: "Strong direct title/handle evidence resolved the only remaining single-evidence-lane hold.",
    };
  }
  return null;
}

function resolveExistingVisionKnowledge(product, knowledgeModel = null) {
  const tags = asArray(product?.tags).map((tag) => normalizeTag(tag));
  const source = tags.find((tag) => tag === "classification-source-vision" || tag === "salt:classification-source:vision");
  if (!source) return null;
  const ruleTag = tags.find((tag) => tag.startsWith("classification-rule-") || tag.startsWith("salt:classification-rule:"));
  const ruleId = ruleTag?.startsWith("classification-rule-")
    ? ruleTag.slice("classification-rule-".length)
    : ruleTag?.slice("salt:classification-rule:".length) || "";
  if (!ruleId || !TAXONOMY_DEFINITIONS.some((definition) => definition.id === ruleId)) return null;

  // A handful of legacy listings contain only an anime franchise name in the
  // title and handle. Preserve their already verified vision classification
  // instead of replacing it with a lexical guess when no text classifier can
  // identify the physical product.
  const taxonomy = classifyCatalogTaxonomyByRuleId(product, ruleId, {
    source: "existing-vision",
    reason: "Preserved an existing verified vision classification because the current title and handle contain no physical product noun.",
  });
  return {
    knowledge: buildProductKnowledgeFromTaxonomy(product, taxonomy, { knowledgeModel }),
    source: "existing-vision",
    existingVision: true,
  };
}

function resolveTrainedVisualKnowledge(product, visualModelEvidence, knowledgeModel) {
  if (!visualModelEvidence || visualModelEvidence.source !== "trained-visual-taxonomy-model" || visualModelEvidence.accepted !== true) return null;
  const confidence = Number(visualModelEvidence.confidence);
  const margin = Number(visualModelEvidence.margin);
  const ruleId = String(visualModelEvidence.ruleId || "");
  if (!ruleId || !Number.isFinite(confidence) || !Number.isFinite(margin) || confidence < 0.78 || margin < 0.18) return null;
  const visionAlignment = assessVisionTaxonomyAlignment(product, ruleId);
  if (!visionAlignment.accepted) return null;
  const taxonomy = classifyCatalogTaxonomyByRuleId(product, ruleId, {
    source: "trained-visual-taxonomy-model",
    reason: `${normalizeText(visualModelEvidence.reason)} Model confidence ${Math.round(confidence * 100)}%, margin ${Math.round(margin * 100)}%.`,
  });
  return {
    knowledge: buildProductKnowledgeFromTaxonomy(product, taxonomy, { knowledgeModel }),
    source: "vision-model",
    visualEvidence: visualModelEvidence,
    visionAlignment,
  };
}

function resolveCandidateVisualKnowledge(product, visualModelEvidence, knowledgeModel) {
  if (process.env.SALT_RELEASE_ALLOW_CANDIDATE_VISUAL_EVIDENCE !== "1") return null;
  if (!visualModelEvidence || visualModelEvidence.source !== "candidate-visual-taxonomy-model" || visualModelEvidence.candidateOnly !== true || visualModelEvidence.accepted !== true) return null;
  const confidence = Number(visualModelEvidence.confidence);
  const margin = Number(visualModelEvidence.margin);
  const modelConfidence = Number(visualModelEvidence.modelConfidence);
  const imageCount = Number(visualModelEvidence.imageCount);
  const ruleId = String(visualModelEvidence.ruleId || "");
  if (!ruleId || !Number.isFinite(confidence) || !Number.isFinite(margin) || !Number.isFinite(modelConfidence) || imageCount < 2) return null;
  if (confidence < 0.75 || margin < 0.25 || modelConfidence < 0.03) return null;
  const visionAlignment = assessVisionTaxonomyAlignment(product, ruleId);
  if (!visionAlignment.accepted) return null;
  const taxonomy = classifyCatalogTaxonomyByRuleId(product, ruleId, {
    source: "candidate-visual-taxonomy-model",
    reason: `${normalizeText(visualModelEvidence.reason)} Candidate model confidence ${Math.round(modelConfidence * 100)}%, image agreement ${Math.round(confidence * 100)}%.`,
  });
  return {
    knowledge: buildProductKnowledgeFromTaxonomy(product, taxonomy, { knowledgeModel }),
    source: "vision-model-candidate",
    visualEvidence: visualModelEvidence,
    visionAlignment,
  };
}

export function canUseVisualTaxonomyEvidence({ deterministicOnly = false, supervisedVision = false } = {}) {
  return supervisedVision && !deterministicOnly;
}

async function resolveKnowledge(product, { skipVision, deterministicOnly, supervisedVision, knowledgeModel = null, modelEvidence = undefined, priorVisualEvidence = null, visualModelEvidence = null }) {
  const directTaxonomy = classifyCatalogTaxonomyWithoutOverrides(product);
  const deterministic = resolveDeterministicKnowledge(product, knowledgeModel, modelEvidence);
  if (deterministic) return deterministic;

  const existingVision = resolveExistingVisionKnowledge(product, knowledgeModel);
  if (existingVision) return existingVision;

  const allowVisualEvidence = canUseVisualTaxonomyEvidence({ deterministicOnly, supervisedVision });
  const trainedVisual = allowVisualEvidence
    ? resolveTrainedVisualKnowledge(product, visualModelEvidence, knowledgeModel)
    : null;
  if (trainedVisual) return trainedVisual;

  const candidateVisual = allowVisualEvidence
    ? resolveCandidateVisualKnowledge(product, visualModelEvidence, knowledgeModel)
    : null;
  if (candidateVisual) return candidateVisual;

  if (deterministicOnly && !supervisedVision) {
    return {
      knowledge: classifyProductKnowledge(product, { knowledgeModel, modelEvidence }),
      source: "fallback",
      reviewReasons: ["Deterministic taxonomy did not reach a safe classification."],
    };
  }

  let vision = null;
  if (supervisedVision && (priorVisualEvidence || !skipVision)) {
    vision = priorVisualEvidence
      ? classifyVisionEvidence(product, priorVisualEvidence.visualEvidence, priorVisualEvidence.imageUrl, priorVisualEvidence.imageUrls)
      : await classifyWithVision(product);
    if (vision?.knowledge) return vision;
  }

  if (supervisedVision) {
    return {
      knowledge: classifyProductKnowledge(product, { knowledgeModel, modelEvidence }),
      source: "fallback",
      reviewReasons: [vision?.error || "Supervised vision did not meet the confidence and alignment gates."],
      imageUrl: vision?.imageUrl || null,
      imageUrls: vision?.imageUrls || [],
      visualEvidence: vision?.visualEvidence || null,
      visionAlignment: vision?.visionAlignment || null,
    };
  }

  const bestRule = directTaxonomy.ruleId !== "unclassified"
    ? directTaxonomy.ruleId
    : vision?.suggestedRuleId || lexicalBestRule(product).ruleId;
  const taxonomy = classifyCatalogTaxonomyByRuleId(product, bestRule, {
    source: "release-guess",
    reason: "Highest-scoring taxonomy rule published only because unresolved classification would otherwise block the release.",
  });
  return {
    knowledge: buildProductKnowledgeFromTaxonomy(product, taxonomy, { knowledgeModel, modelEvidence }),
    source: "guess",
    guessedRuleId: bestRule,
    imageUrl: vision?.imageUrl || null,
    visualEvidence: vision?.visualEvidence || null,
    visionAlignment: vision?.visionAlignment || null,
    visionError: vision?.error || null,
  };
}

function textIncludesAny(product, phrases) {
  const text = normalizeCatalogText([product?.title, product?.handle, product?.product_type].filter(Boolean).join(" "));
  return phrases.some((phrase) => ` ${text} `.includes(` ${normalizeCatalogText(phrase)} `));
}

async function buildDynamicAssignments(products) {
  const assignments = new Map(products.map((product) => [normalizeCollectionHandle(product.handle), new Set()]));
  const merchandisingProducts = products.map((product) => ({
    ...product,
    // Special/dynamic collections may intentionally use current canonical
    // tags; taxonomy evidence must not. Keep that concern isolated here.
    tags: product.liveTags || product.tags,
  }));
  for (const assignment of buildSpecialCollectionAssignments(merchandisingProducts)) {
    const set = assignments.get(normalizeCollectionHandle(assignment.handle));
    for (const handle of assignment.matchedCollections) set?.add(handle);
  }

  const recentOrders = await readJson(resolve(rootDir, "public", "data", "recently-ordered-products.json"), { products: [] });
  const bestSellerHandles = new Set(asArray(recentOrders?.products).map((product) => normalizeCollectionHandle(product?.handle)));
  const homeCollections = await readJson(resolve(rootDir, "public", "data", "home-collection-products.json"), { sections: {} });
  const staffHandles = new Set(asArray(homeCollections?.sections?.everydayEssentials?.products).map((product) => normalizeCollectionHandle(product?.handle)));
  const newestHandles = new Set([...products]
    .sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0))
    .slice(0, 250)
    .map((product) => normalizeCollectionHandle(product.handle)));
  const newCutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;

  for (const product of products) {
    const handle = normalizeCollectionHandle(product.handle);
    const set = assignments.get(handle);
    if (!set) continue;
    if (bestSellerHandles.has(handle)) set.add("best-sellers");
    if (staffHandles.has(handle)) set.add("staff-picks");
    if (new Date(product.created_at || 0).getTime() >= newCutoff) set.add("new-arrivals");
    if (bestSellerHandles.has(handle) || staffHandles.has(handle) || newestHandles.has(handle) || textIncludesAny(product, ["viral", "trending", "tiktok"])) set.add("trending-finds");
    const normalizedTags = new Set(asArray(product.liveTags || product.tags).map((tag) => normalizeCollectionHandle(tag)));
    if (normalizedTags.has("holiday-gifts")) set.add("gifts");
    if (normalizedTags.has("viral-tiktok-products")) set.add("trending-finds");
    if (textIncludesAny(product, ["gift for dad", "fathers day", "father gift"])) set.add("gifts-for-dad");
    if (textIncludesAny(product, ["gift for mom", "mothers day", "mother gift"])) set.add("gifts-for-mom");
    if (textIncludesAny(product, ["gift for senior", "elderly gift", "senior gift"])) set.add("gifts-for-seniors");
    if (textIncludesAny(product, ["housewarming gift", "new home gift"])) set.add("housewarming-gifts");
    if (textIncludesAny(product, ["holiday gift", "christmas gift", "festive gift"])) set.add("gifts");
  }
  return assignments;
}

function exactTagTask(
  liveProduct,
  desiredManagedTags,
  managedTagUniverse = new Set(),
  requiredManagedTags = [],
) {
  const existing = uniqueTags(asArray(liveProduct.tags));
  const unmanaged = existing.filter((tag) => !isManagedTag(tag, managedTagUniverse));
  const requiredTagSet = new Set(requiredManagedTags.map(normalizeTag));
  const unmanagedCollisionKeys = new Map();
  for (const tag of unmanaged) {
    const key = tagCollisionKey(tag);
    if (key) unmanagedCollisionKeys.set(key, tag);
  }
  const managedTagAliases = [];
  const effectiveManagedTags = uniqueTags(desiredManagedTags).filter((tag) => {
    const alias = unmanagedCollisionKeys.get(tagCollisionKey(tag));
    if (alias && normalizeTag(alias) !== normalizeTag(tag)) {
      // Shopify treats punctuation-only tag variants as the same tag in some
      // live writes. Keep the merchant spelling for taxonomy-only aliases,
      // but never suppress a tag that is required to drive a collection.
      const required = requiredTagSet.has(normalizeTag(tag));
      managedTagAliases.push({
        canonical: tag,
        preserved: alias,
        required,
        reason: required ? "required-unmanaged-collision" : "preserved-unmanaged-collision",
      });
      return required;
    }
    return true;
  });
  const desired = uniqueTags([...unmanaged, ...effectiveManagedTags]);
  const existingSet = new Set(existing.map(normalizeTag));
  const desiredSet = new Set(desired.map(normalizeTag));
  const tagsToAdd = desired.filter((tag) => !existingSet.has(normalizeTag(tag)));
  const tagsToRemove = existing.filter((tag) => !desiredSet.has(normalizeTag(tag)));
  return {
    productId: liveProduct.id,
    handle: liveProduct.handle,
    desiredTags: desired,
    desiredManagedTags: effectiveManagedTags,
    requiredManagedTags: uniqueTags(requiredManagedTags),
    managedTagAliases,
    tagsToAdd,
    tagsToRemove,
    status: tagsToAdd.length || tagsToRemove.length ? "would-update" : "exact-match",
  };
}

async function uploadBulkInput(inputPath, retryInfo, label) {
  const data = await client.run(STAGED_UPLOAD_CREATE_MUTATION, {
    input: [{
      resource: "BULK_MUTATION_VARIABLES",
      filename: basename(inputPath),
      mimeType: "text/jsonl",
      httpMethod: "POST",
    }],
  }, { allowMutations: true, operation: `${label} staged upload reservation`, retryInfo });
  const errors = asArray(data?.stagedUploadsCreate?.userErrors);
  if (errors.length) throw new Error(`${label} staged upload failed: ${formatUserErrors(errors)}`);
  const target = data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target?.url) throw new Error(`Shopify returned no ${label} staged upload target.`);
  const curlArgs = ["-sS", "-X", "POST", target.url];
  for (const parameter of asArray(target.parameters)) curlArgs.push("-F", `${parameter.name}=${parameter.value}`);
  curlArgs.push("-F", `file=@${inputPath};type=text/jsonl`);
  await execFileAsync("curl", curlArgs, { cwd: rootDir, maxBuffer: 20 * 1024 * 1024 });
  const stagedUploadPath = asArray(target.parameters).find((parameter) => parameter.name === "key")?.value;
  if (!stagedUploadPath) throw new Error(`Shopify ${label} staged upload target did not include a key.`);
  return stagedUploadPath;
}

async function waitForBulkOperation(operationId, retryInfo, label) {
  while (true) {
    const data = await client.run(BULK_OPERATION_STATUS_QUERY, { id: operationId }, {
      operation: `${label} bulk operation status`,
      retryInfo,
    });
    const operation = data?.bulkOperation;
    if (!operation) throw new Error(`${label} bulk operation not found: ${operationId}`);
    process.stdout.write(`${label} bulk operation: ${operation.status}, ${operation.objectCount || 0} object(s).\n`);
    if (operation.status === "COMPLETED") return operation;
    if (["FAILED", "CANCELED", "EXPIRED"].includes(operation.status)) {
      throw new Error(`${label} bulk operation ended ${operation.status}: ${operation.errorCode || "unknown error"}`);
    }
    await sleep(5000);
  }
}

export function isRetryableTagBulkMessage(message) {
  return /internal error|something went wrong|temporar|timeout|timed out|rate limit|too many requests|throttl|service unavailable|gateway|network|socket|aborted|\b5\d{2}\b/i.test(
    normalizeText(message),
  );
}

async function verifyTagBulkResult(resultPath, actionable) {
  const lines = (await readFile(resultPath, "utf8")).split(/\r?\n/).filter(Boolean);
  const completedLines = new Set();
  const retryableFailures = [];
  for (const [fallbackIndex, line] of lines.entries()) {
    const payload = JSON.parse(line);
    const lineNumber = Number.isInteger(Number(payload.__lineNumber)) ? Number(payload.__lineNumber) : fallbackIndex;
    const task = actionable[lineNumber];
    if (!task) throw new Error(`Catalog tag bulk result returned unknown input line ${lineNumber}.`);
    if (completedLines.has(lineNumber)) {
      throw new Error(`Catalog tag bulk result returned duplicate input line ${lineNumber}.`);
    }
    if (asArray(payload?.errors).length) {
      const detail = asArray(payload.errors).map((error) => normalizeText(error?.message)).join(" | ");
      if (!isRetryableTagBulkMessage(detail)) throw new Error(`${task.handle}: ${detail}`);
      retryableFailures.push({ task, detail });
      completedLines.add(lineNumber);
      continue;
    }
    const response = payload?.data?.productUpdate;
    const errors = asArray(response?.userErrors);
    if (errors.length) {
      const detail = formatUserErrors(errors);
      if (!isRetryableTagBulkMessage(detail)) throw new Error(`${task.handle}: ${detail}`);
      retryableFailures.push({ task, detail });
      completedLines.add(lineNumber);
      continue;
    }
    if (!response?.product?.id) throw new Error(`${task.handle}: catalog tag bulk result returned no product id.`);
    task.status = "updated";
    completedLines.add(lineNumber);
  }
  if (completedLines.size !== actionable.length) {
    throw new Error(`Catalog tag bulk result covered ${completedLines.size}/${actionable.length} product inputs.`);
  }
  return retryableFailures;
}

async function repairTagBulkFailures(failures, retryInfo) {
  if (!failures.length) return;
  await mapWithConcurrency(
    failures,
    tagBulkRepairConcurrency,
    async ({ task, detail }) => {
      for (let attempt = 1; attempt <= tagBulkRepairAttempts; attempt += 1) {
        try {
          process.stdout.write(
            `Retrying transient catalog tag failure for ${task.handle} (${attempt}/${tagBulkRepairAttempts}).\n`,
          );
          await updateProductTags(
            task.productId,
            task.desiredTags,
            retryInfo,
            `targeted catalog tag repair for ${task.handle}`,
          );
          task.status = "updated";
          return;
        } catch (error) {
          if (attempt >= tagBulkRepairAttempts) {
            throw new Error(
              `${task.handle}: bulk result reported ${detail}; targeted repair failed after ${tagBulkRepairAttempts} attempt(s): ${normalizeText(error?.message || error)}`,
            );
          }
          const delayMs = tagBulkRepairDelayMs * attempt;
          process.stdout.write(`Targeted catalog tag repair retrying in ${delayMs}ms for ${task.handle}.\n`);
          await sleep(delayMs);
        }
      }
    },
    "Targeted catalog tag repairs completed",
  );
}

async function applyExactTags(tasks, retryInfo, output, manifest) {
  const actionable = tasks.filter((task) => task.status === "would-update");
  if (!actionable.length) return;
  const inputPath = output.replace(/\.json$/i, "-tag-bulk-input.jsonl");
  const resultPath = output.replace(/\.json$/i, "-tag-bulk-result.jsonl");
  const lines = actionable.map((task) => JSON.stringify({
    product: { id: task.productId, tags: task.desiredTags },
  }));
  await writeFile(inputPath, `${lines.join("\n")}\n`, "utf8");
  process.stdout.write(`Prepared ${actionable.length} exact product tag updates for Shopify bulk mutation.\n`);
  const stagedUploadPath = await uploadBulkInput(inputPath, retryInfo, "catalog tag");
  const data = await client.run(BULK_OPERATION_RUN_MUTATION, {
    mutation: BULK_PRODUCT_TAG_MUTATION,
    stagedUploadPath,
  }, { allowMutations: true, operation: "start catalog tag bulk operation", retryInfo });
  const errors = asArray(data?.bulkOperationRunMutation?.userErrors);
  if (errors.length) throw new Error(`Catalog tag bulk operation failed to start: ${formatUserErrors(errors)}`);
  const operationId = data?.bulkOperationRunMutation?.bulkOperation?.id;
  if (!operationId) throw new Error("Shopify returned no catalog tag bulk operation id.");
  const operation = await waitForBulkOperation(operationId, retryInfo, "catalog tag");
  if (!operation.url) throw new Error("Completed catalog tag bulk operation returned no result URL.");
  await execFileAsync("curl", ["-sS", "-L", operation.url, "-o", resultPath], {
    cwd: rootDir,
    maxBuffer: 20 * 1024 * 1024,
  });
  manifest.tagBulkOperation = {
    id: operation.id,
    status: operation.status,
    objectCount: Number(operation.objectCount || 0),
    completedAt: operation.completedAt || new Date().toISOString(),
    inputPath,
    resultPath,
  };
  await writeManifest(output, manifest);
  const retryableFailures = await verifyTagBulkResult(resultPath, actionable);
  if (retryableFailures.length) {
    process.stdout.write(
      `Shopify bulk tag result contains ${retryableFailures.length} transient failure(s); applying bounded targeted repairs.\n`,
    );
    await repairTagBulkFailures(retryableFailures, retryInfo);
    manifest.tagBulkOperation.targetedRepairCount = retryableFailures.length;
    manifest.tagBulkOperation.targetedRepairCompletedAt = new Date().toISOString();
    await writeManifest(output, manifest);
  }
  process.stdout.write(`Exact tags applied through Shopify bulk mutation to ${actionable.length} products.\n`);
}

function describeTagReadbackFailure(failure) {
  if (failure?.missingActiveProduct) return `${failure.handle || failure.productId}: missing from active Shopify readback`;
  if (failure?.unexpectedActiveProduct) return `${failure.handle || failure.productId || "unknown product"}: unexpected active Shopify product in readback`;
  const missing = asArray(failure?.missing).join(", ") || "none";
  const extra = asArray(failure?.extra).join(", ") || "none";
  return `${failure?.handle || failure?.productId || "unknown product"}: missing [${missing}], extra [${extra}]`;
}

async function verifyExactTags(tasks, retryInfo) {
  let failures = [];
  const taskById = new Map(tasks.map((task) => [task.productId, task]));
  const managedTagUniverse = new Set(tasks.flatMap((task) => task.desiredManagedTags).map(normalizeTag));
  const seen = new Set();
  let after = null;
  while (true) {
    const data = await client.run(ACTIVE_PRODUCT_TAGS_QUERY, { first: 250, after, query: "status:active" }, {
      operation: `exact tag readback page ${Math.floor(seen.size / 250) + 1}`,
      retryInfo,
    });
    const connection = data?.products;
    if (!connection) throw new Error("Shopify returned no active product tags for exact readback.");
    for (const product of asArray(connection.nodes)) {
      const task = taskById.get(product?.id);
      if (!task) {
        failures.push({ handle: product?.handle, unexpectedActiveProduct: true });
        continue;
      }
      seen.add(product.id);
      const actual = new Set(asArray(product.tags).map(normalizeTag).filter((tag) => isManagedTag(tag, managedTagUniverse)));
      const desired = new Set(task.desiredManagedTags.map(normalizeTag));
      const missing = [...desired].filter((tag) => !actual.has(tag));
      const extra = [...actual].filter((tag) => !desired.has(tag));
      if (missing.length || extra.length) failures.push({ productId: task.productId, handle: task.handle, missing, extra });
      else task.status = task.status === "exact-match" ? "exact-match-verified" : "updated-verified";
    }
    process.stdout.write(`Exact managed tags read back for ${seen.size}/${tasks.length} active products.\n`);
    if (!connection.pageInfo?.hasNextPage) break;
    after = connection.pageInfo?.endCursor;
    if (!after) throw new Error("Exact tag readback pagination has no cursor.");
  }
  for (const task of tasks) if (!seen.has(task.productId)) failures.push({ handle: task.handle, missingActiveProduct: true });
  if (!failures.length) return;

  const retryable = failures.filter((failure) => failure?.productId && !failure.missingActiveProduct);
  for (let attempt = 1; attempt <= tagReadbackRetryAttempts && retryable.length; attempt += 1) {
    await sleep(tagReadbackRetryDelayMs * attempt);
    process.stdout.write(
      `Exact managed-tag readback found ${retryable.length} transient mismatch(es); targeted consistency retry ${attempt}/${tagReadbackRetryAttempts}.\n`,
    );
    const refreshed = await mapWithConcurrency(
      retryable,
      Math.max(1, Math.min(8, Number(process.env.SALT_CATALOG_TAG_READBACK_RETRY_CONCURRENCY || 4))),
      async (failure) => {
        const task = taskById.get(failure.productId);
        const live = await readProductTags(failure.productId, retryInfo);
        const actual = new Set(live.tags.map(normalizeTag).filter((tag) => managedTagUniverse.has(tag)));
        const desired = new Set(task.desiredManagedTags.map(normalizeTag));
        return {
          handle: task.handle,
          productId: task.productId,
          missing: [...desired].filter((tag) => !actual.has(tag)),
          extra: [...actual].filter((tag) => !desired.has(tag)),
        };
      },
      "Tag consistency retry",
    );
    const persistentRetryable = refreshed.filter((failure) => failure.missing.length || failure.extra.length);
    failures = failures.filter((failure) => failure.missingActiveProduct || !failure.productId).concat(persistentRetryable);
    if (!persistentRetryable.length && !failures.length) {
      process.stdout.write("Targeted tag consistency retry resolved the transient live readback mismatch(es).\n");
      return;
    }
  }

  const detail = failures.slice(0, 10).map(describeTagReadbackFailure).join("; ");
  throw new Error(`${failures.length} products failed exact managed-tag readback: ${detail}`);
}

function sourceConditionSummary(source) {
  const conditions = asArray(source?.inclusion?.conditions).map((condition) => {
    if (condition?.__typename === "CollectionSourceInclusionConditionProductTag") {
      return { type: "tag", relation: condition.relation, matchType: condition.matchType, values: asArray(condition.values).map(normalizeTag).sort() };
    }
    if (condition?.__typename === "CollectionSourceInclusionConditionVariantPrice") {
      return { type: "price", relation: condition.relation, amount: Number(condition?.value?.amount), currencyCode: condition?.value?.currencyCode };
    }
    return { type: condition?.__typename || "unknown" };
  });
  return { matchType: source?.inclusion?.matchType, targetType: source?.targetType, conditions };
}

export function collectionSourceMatches(policy, collection) {
  const source = asArray(collection?.sources).length === 1 ? collection.sources[0] : null;
  if (!source || source.__typename !== "CollectionConditionsSource" || source.targetType !== "PRODUCTS") return false;
  const summary = sourceConditionSummary(source);
  if (policy.kind === "semantic") {
    const expectedTags = new Set(semanticCollectionRuleTags(policy).map(normalizeTag));
    if (
      summary.conditions.length !== expectedTags.size ||
      summary.conditions.some((condition) =>
        condition.type !== "tag" ||
        condition.relation !== "TAGGED_WITH" ||
        condition.matchType !== "ANY")
    ) return false;
    const actualTags = new Set(summary.conditions.flatMap((condition) => condition.values));
    return summary.matchType === (expectedTags.size > 1 ? "ANY" : "ALL") &&
      actualTags.size === expectedTags.size && [...expectedTags].every((tag) => actualTags.has(tag));
  }
  if (policy.kind === "price") {
    if (summary.matchType !== "ALL") return false;
    const desired = [];
    if (Number.isFinite(policy.maximumExclusive)) desired.push({ relation: "LESS_THAN", amount: policy.maximumExclusive });
    if (Number.isFinite(policy.minimumExclusive)) desired.push({ relation: "GREATER_THAN", amount: policy.minimumExclusive });
    return summary.conditions.length === desired.length &&
      summary.conditions.every((actual) => actual.type === "price" && actual.currencyCode === policy.currencyCode) &&
      desired.every((condition) => summary.conditions.some((actual) =>
        actual.type === "price" &&
        actual.relation === condition.relation &&
        actual.amount === condition.amount &&
        actual.currencyCode === policy.currencyCode));
  }
  return false;
}

function resolveCollectionTargets(collections) {
  const byHandle = new Map(collections.map((collection) => [normalizeCollectionHandle(collection.handle), collection]));
  const forcePriceCollectionRefresh = process.env.SALT_CATALOG_FORCE_PRICE_COLLECTION_REFRESH === "1";
  const forceCollectionSourceRefresh = process.env.SALT_CATALOG_FORCE_COLLECTION_SOURCE_REFRESH === "1";
  return [...PRICE_COLLECTION_POLICIES, ...SEMANTIC_COLLECTION_POLICIES].map((policy) => {
    const canonical = byHandle.get(policy.handle);
    const legacy = canonical ? null : policy.legacyHandles.map((handle) => byHandle.get(handle)).find(Boolean) || null;
    const existing = canonical || legacy;
    const metadataNeedsUpdate = Boolean(existing && (normalizeCollectionHandle(existing.handle) !== policy.handle || normalizeText(existing.title) !== policy.title));
    const sourceNeedsUpdate = Boolean(existing && (
      !collectionSourceMatches(policy, existing) ||
      (forcePriceCollectionRefresh && policy.kind === "price") ||
      (forceCollectionSourceRefresh && existing.sources?.[0]?.shareable === false)
    ));
    return {
      policy,
      existing,
      migratedFrom: legacy?.handle || null,
      metadataNeedsUpdate,
      sourceNeedsUpdate,
      action: existing ? (metadataNeedsUpdate || sourceNeedsUpdate ? "update" : "exact-match") : "create",
      status: "planned",
    };
  });
}

async function applyCollectionTarget(target, onlineStorePublication, retryInfo) {
  const source = target.policy.kind === "price" ? buildPriceCollectionSource(target.policy) : buildSemanticCollectionSource(target.policy);
  if (!target.existing) {
    const data = await client.run(COLLECTION_CREATE_MUTATION, {
      collection: { title: target.policy.title, handle: target.policy.handle, sources: [{ source }] },
    }, { allowMutations: true, operation: `create collection ${target.policy.handle}`, retryInfo });
    const errors = asArray(data?.collectionCreate?.userErrors);
    if (errors.length) throw new Error(`${target.policy.handle}: ${formatUserErrors(errors)}`);
    const collection = data?.collectionCreate?.collection;
    if (!collection?.id) throw new Error(`${target.policy.handle}: no collection returned after create.`);
    target.collectionId = collection.id;
    target.status = "created";
    if (onlineStorePublication?.id) {
      const publishData = await client.run(PUBLISH_MUTATION, { id: collection.id, input: [{ publicationId: onlineStorePublication.id }] }, {
        allowMutations: true,
        operation: `publish new collection ${target.policy.handle}`,
        retryInfo,
      });
      const publishErrors = asArray(publishData?.publishablePublish?.userErrors);
      if (publishErrors.length) throw new Error(`${target.policy.handle}: ${formatUserErrors(publishErrors)}`);
      target.status = "created-published";
    }
    return;
  }

  if (target.action !== "exact-match") throw new Error(`${target.policy.handle}: expected a bulk collection update.`);
  target.collectionId = target.existing.id;
  target.status = "exact-match";
}

function buildCollectionUpdateInput(target, sourceOverride = null) {
  const source = sourceOverride || (target.policy.kind === "price"
    ? buildPriceCollectionSource(target.policy)
    : buildSemanticCollectionSource(target.policy));
  const input = { id: target.existing.id };
  if (normalizeText(target.existing.title) !== target.policy.title) input.title = target.policy.title;
  if (normalizeCollectionHandle(target.existing.handle) !== target.policy.handle) {
    input.handle = target.policy.handle;
    input.redirectNewHandle = true;
  }
  if (target.sourceNeedsUpdate) {
    const existingSources = asArray(target.existing.sources);
    const existingSource = existingSources.length === 1 ? existingSources[0] : null;
    const existingConditions = asArray(existingSource?.inclusion?.conditions);
    if (existingSource?.__typename === "CollectionConditionsSource" && existingSource.id) {
      if (existingSource.shareable === false) {
        // Non-shareable sources can retain stale automated memberships when updated in place.
        input.sourcesToDelete = [existingSource.id];
        input.sourcesToCreate = [{ source }];
      } else {
        input.sourcesToUpdate = [{
          condition: {
            id: existingSource.id,
            title: source.title,
            description: source.description,
            inclusion: {
              matchType: source.inclusion.matchType,
              conditionsToDelete: existingConditions.map((condition) => condition.id).filter(Boolean),
              conditionsToCreate: asArray(source.inclusion.conditions),
            },
          },
        }];
      }
    } else {
      input.sourcesToDelete = existingSources.map((existingSource) => existingSource.id).filter(Boolean);
      input.sourcesToCreate = [{ source }];
    }
  }
  return input;
}

async function verifyCollectionBulkResult(resultPath, updateTargets) {
  const lines = (await readFile(resultPath, "utf8")).split(/\r?\n/).filter(Boolean);
  const completedLines = new Set();
  for (const [fallbackIndex, line] of lines.entries()) {
    const payload = JSON.parse(line);
    const lineNumber = Number.isInteger(Number(payload.__lineNumber)) ? Number(payload.__lineNumber) : fallbackIndex;
    const target = updateTargets[lineNumber];
    if (!target) throw new Error(`Collection bulk result returned unknown input line ${lineNumber}.`);
    if (asArray(payload?.errors).length) {
      throw new Error(`${target.policy.handle}: ${asArray(payload.errors).map((error) => normalizeText(error?.message)).join(" | ")}`);
    }
    const response = payload?.data?.collectionUpdate;
    const errors = asArray(response?.userErrors);
    if (errors.length) throw new Error(`${target.policy.handle}: ${formatUserErrors(errors)}`);
    if (!response?.collection?.id) throw new Error(`${target.policy.handle}: collection bulk result returned no collection id.`);
    target.collectionId = response.collection.id;
    target.status = "updated";
    completedLines.add(lineNumber);
  }
  if (completedLines.size !== updateTargets.length) {
    throw new Error(`Collection bulk result covered ${completedLines.size}/${updateTargets.length} updates.`);
  }
}

async function applyCollectionTargets(targets, onlineStorePublication, retryInfo, output, manifest) {
  const updateTargets = targets.filter((target) => target.action === "update");
  const exactTargets = targets.filter((target) => target.action === "exact-match");
  const createTargets = targets.filter((target) => target.action === "create");
  for (const target of exactTargets) await applyCollectionTarget(target, onlineStorePublication, retryInfo);

  if (updateTargets.length) {
    const currentCollections = await fetchCollections(retryInfo);
    const currentByHandle = new Map(currentCollections.map((collection) => [
      normalizeCollectionHandle(collection.handle),
      collection,
    ]));
    const sourceRepairTargets = [];
    for (const target of updateTargets) {
      const current = currentByHandle.get(target.policy.handle) ||
        target.policy.legacyHandles.map((handle) => currentByHandle.get(handle)).find(Boolean);
      if (!current) throw new Error(`${target.policy.handle}: collection disappeared before source repair.`);
      target.existing = current;
      target.collectionId = current.id;
      const metadataExact = normalizeCollectionHandle(current.handle) === target.policy.handle &&
        normalizeText(current.title) === target.policy.title;
      if (metadataExact && collectionSourceMatches(target.policy, current)) {
        target.status = "exact-match";
        continue;
      }
      sourceRepairTargets.push(target);
    }

    // Shopify bulk mutation can acknowledge CollectionUpdateInput while
    // silently retaining non-shareable collection sources. Direct bounded
    // mutations are slower than a bulk job but make source replacement and
    // handle redirects observable and verifiable before membership readback.
    await mapWithConcurrency(
      sourceRepairTargets,
      collectionSourceApplyConcurrency,
      async (target) => {
        let data;
        let lastError;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            data = await client.run(BULK_COLLECTION_UPDATE_MUTATION, {
              collection: buildCollectionUpdateInput(target),
            }, {
              allowMutations: true,
              operation: `repair collection source ${target.policy.handle}`,
              retryInfo,
            });
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            if (!/source not found/i.test(String(error?.message || error)) || attempt === 2) throw error;
            const refreshed = (await fetchCollections(retryInfo)).find((collection) =>
              normalizeCollectionHandle(collection.handle) === target.policy.handle);
            if (!refreshed) throw error;
            target.existing = refreshed;
            target.collectionId = refreshed.id;
          }
        }
        if (lastError) throw lastError;
        const errors = asArray(data?.collectionUpdate?.userErrors);
        if (errors.length) throw new Error(`${target.policy.handle}: ${formatUserErrors(errors)}`);
        if (!data?.collectionUpdate?.collection?.id) {
          throw new Error(`${target.policy.handle}: Shopify returned no collection after source repair.`);
        }
        target.collectionId = data.collectionUpdate.collection.id;
        target.status = "updated";
        return target;
      },
      "Collection source repairs applied",
    );

    const refreshedCollections = await fetchCollections(retryInfo);
    const refreshedByHandle = new Map(refreshedCollections.map((collection) => [
      normalizeCollectionHandle(collection.handle),
      collection,
    ]));
    for (const target of updateTargets) {
      const refreshed = refreshedByHandle.get(target.policy.handle);
      if (!refreshed || !collectionSourceMatches(target.policy, refreshed)) {
        throw new Error(`${target.policy.handle}: collection source failed live readback after direct repair.`);
      }
      target.existing = refreshed;
      target.collectionId = refreshed.id;
    }
    manifest.collectionBulkOperation = {
      status: "DIRECT_MUTATIONS_COMPLETED",
      objectCount: sourceRepairTargets.length,
      completedAt: new Date().toISOString(),
    };
    await writeManifest(output, manifest);
    process.stdout.write(`Canonical collection repairs applied and source-read-back verified for ${updateTargets.length} collections.\n`);
  }

  for (const target of createTargets) {
    await applyCollectionTarget(target, onlineStorePublication, retryInfo);
    await writeManifest(output, manifest);
  }
}

function compareSets(expected, actual) {
  return {
    missing: [...expected].filter((id) => !actual.has(id)),
    extra: [...actual].filter((id) => !expected.has(id)),
  };
}

async function fetchCollectionMembershipBulk(retryInfo) {
  const started = await client.run(BULK_OPERATION_RUN_QUERY, { query: BULK_COLLECTION_MEMBERSHIP_QUERY }, {
    allowMutations: true,
    operation: "start exact collection membership export",
    retryInfo,
  });
  const errors = asArray(started?.bulkOperationRunQuery?.userErrors);
  if (errors.length) throw new Error(`Collection membership export failed to start: ${formatUserErrors(errors)}`);
  const operationId = started?.bulkOperationRunQuery?.bulkOperation?.id;
  if (!operationId) throw new Error("Shopify returned no collection membership export id.");
  const operation = await waitForBulkOperation(operationId, retryInfo, "collection membership export");
  if (!operation.url) throw new Error("Completed collection membership export returned no result URL.");
  const response = await fetch(operation.url);
  if (!response.ok) throw new Error(`Collection membership export download failed (${response.status}).`);
  const collections = [];
  const membersByCollectionId = new Map();
  for (const line of (await response.text()).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const node = JSON.parse(line);
    if (node.__parentId) {
      if (!membersByCollectionId.has(node.__parentId)) membersByCollectionId.set(node.__parentId, new Set());
      if (node.id) membersByCollectionId.get(node.__parentId).add(node.id);
      continue;
    }
    if (!node.id || !node.handle) continue;
    collections.push(node);
    if (!membersByCollectionId.has(node.id)) membersByCollectionId.set(node.id, new Set());
  }
  process.stdout.write(`Collection membership export read ${collections.length} collections and ${[...membersByCollectionId.values()].reduce((sum, members) => sum + members.size, 0)} memberships.\n`);
  return { collections, membersByCollectionId, operation };
}

async function refreshCollectionMembership(membership, collectionIds, retryInfo) {
  const uniqueIds = [...new Set(collectionIds.filter(Boolean))];
  if (!uniqueIds.length) return;
  const updates = await mapWithConcurrency(
    uniqueIds,
    membershipRefreshConcurrency,
    async (collectionId) => {
      const members = new Set();
      let after = null;
      let page = 0;
      while (true) {
        page += 1;
        const data = await client.run(COLLECTION_MEMBERSHIP_REFRESH_QUERY, {
          id: collectionId,
          first: 250,
          after,
        }, {
          operation: `refresh collection membership ${collectionId} page ${page}`,
          retryInfo,
        });
        const collection = data?.node;
        const connection = collection?.products;
        if (!collection?.id || !connection) throw new Error(`Collection membership refresh returned no collection for ${collectionId}.`);
        for (const product of asArray(connection.nodes)) if (product?.id) members.add(product.id);
        if (!connection.pageInfo?.hasNextPage) break;
        after = connection.pageInfo.endCursor;
        if (!after) throw new Error(`Collection membership refresh for ${collectionId} has no continuation cursor.`);
      }
      return { collectionId, members };
    },
    "Refreshed collection membership",
  );
  for (const update of updates) membership.membersByCollectionId.set(update.collectionId, update.members);
}

function normalizedTagSet(values) {
  return new Set(asArray(values).map(normalizeTag).filter(Boolean));
}

export function filterMembershipToActiveProducts(members, activeProductIds) {
  const activeIds = activeProductIds instanceof Set
    ? activeProductIds
    : new Set(asArray(activeProductIds).map((id) => String(id || "")).filter(Boolean));
  return new Set([...((members instanceof Set) ? members : asArray(members))]
    .map((id) => String(id || ""))
    .filter((id) => activeIds.has(id)));
}

// Shopify can retain a stale smart-collection membership after a product tag
// is removed. Build a bounded repair plan only for the observable safe case:
// the product has an exact desired tag plan, but is an extra member of a
// semantic collection whose canonical tag is absent from that plan.
export function buildStaleMembershipPulsePlans({ verification, targets, tagTasks, maxProducts = membershipPulseProductLimit }) {
  const targetsByHandle = new Map(asArray(targets).map((target) => [normalizeCollectionHandle(target?.policy?.handle), target]));
  const tasksByProductId = new Map(asArray(tagTasks).map((task) => [String(task?.productId || ""), task]));
  const plans = [];
  const seen = new Set();
  for (const collectionHandle of asArray(verification?.failedCollectionHandles)) {
    const target = targetsByHandle.get(normalizeCollectionHandle(collectionHandle));
    if (!target || target.policy.kind !== "semantic") continue;
    const collectionTags = new Set(semanticCollectionRuleTags(target.policy).map(normalizeTag));
    for (const productId of asArray(target?.readback?.extraProductIds)) {
      const task = tasksByProductId.get(String(productId));
      const key = `${collectionHandle}:${productId}`;
      if (!task || !task.productId || !Array.isArray(task.desiredTags) || seen.has(key)) continue;
      if ([...collectionTags].some((tag) => normalizedTagSet(task.desiredTags).has(tag))) continue;
      seen.add(key);
      plans.push({
        collectionHandle: target.policy.handle,
        productId: task.productId,
        productHandle: task.handle,
        pulseTag: target.policy.tag,
        finalTags: uniqueTags(task.desiredTags),
      });
      if (plans.length >= maxProducts) return plans;
    }
  }
  return plans;
}

export function addApprovedSemanticAliasMembershipsToExpected({
  expectedByTag,
  expectedCollectionsByProduct,
  products,
} = {}) {
  const expectedTags = expectedByTag instanceof Map ? expectedByTag : new Map();
  const expectedCollections = expectedCollectionsByProduct instanceof Map
    ? expectedCollectionsByProduct
    : new Map();
  for (const policy of SEMANTIC_COLLECTION_POLICIES) {
    const aliases = new Set(semanticCollectionRuleTags(policy).map(normalizeTag).filter(Boolean));
    // Only an explicit governance merge may widen the applied classification
    // plan. A single live canonical tag remains subject to the exact tag plan.
    if (aliases.size < 2) continue;
    const members = expectedTags.get(normalizeTag(policy.tag)) || new Set();
    for (const product of asArray(products)) {
      const productId = String(product?.id || "");
      if (!productId || !asArray(product?.tags).some((tag) => aliases.has(normalizeTag(tag)))) continue;
      members.add(productId);
      expectedCollections.get(productId)?.add(policy.handle);
    }
    expectedTags.set(normalizeTag(policy.tag), members);
  }
  return { expectedByTag: expectedTags, expectedCollectionsByProduct: expectedCollections };
}

// A complete export is required for global membership failures, but repeating
// that export for a small set of collection-local propagation delays is the
// dominant avoidable cost in this gate. Keep the decision explicit and pure so
// it can be tested without Shopify access.
export function chooseMembershipRetryStrategy({
  mode = "adaptive",
  failedCollectionIds = [],
  collectionless = [],
  failures = [],
} = {}) {
  const normalizedMode = ["bulk", "targeted", "adaptive"].includes(String(mode).toLowerCase())
    ? String(mode).toLowerCase()
    : "adaptive";
  if (normalizedMode !== "adaptive") return normalizedMode;
  if (asArray(collectionless).length) return "bulk";
  const globalFailure = asArray(failures).some((failure) =>
    /outside canonical governance|all-products:|collectionless|active products are|source mismatch|canonical collection missing/i.test(
      String(failure || ""),
    ),
  );
  return !globalFailure && asArray(failedCollectionIds).filter(Boolean).length ? "targeted" : "bulk";
}

async function readProductTags(productId, retryInfo) {
  const data = await client.run(PRODUCT_TAGS_QUERY, { id: productId }, {
    operation: `read product tags ${productId} after membership repair`,
    retryInfo,
  });
  const product = data?.node;
  if (!product?.id) throw new Error(`Product tag readback returned no product for ${productId}.`);
  return { handle: product.handle, tags: asArray(product.tags) };
}

async function updateProductTags(productId, tags, retryInfo, operation) {
  const data = await client.run(BULK_PRODUCT_TAG_MUTATION, {
    product: { id: productId, tags },
  }, {
    allowMutations: true,
    operation,
    retryInfo,
  });
  const errors = asArray(data?.productUpdate?.userErrors);
  if (errors.length) throw new Error(`${operation}: ${formatUserErrors(errors)}`);
  if (!data?.productUpdate?.product?.id) throw new Error(`${operation}: Shopify returned no product.`);
}

async function pulseStaleMembershipTags(plans, retryInfo) {
  return mapWithConcurrency(
    plans,
    membershipPulseConcurrency,
    async (plan) => {
      const pulseTags = uniqueTags([...plan.finalTags, plan.pulseTag]);
      let primaryError = null;
      try {
        await updateProductTags(
          plan.productId,
          pulseTags,
          retryInfo,
          `pulse stale ${plan.collectionHandle} membership for ${plan.productHandle}`,
        );
      } catch (error) {
        primaryError = error;
      } finally {
        // Always restore the exact managed/unmanaged tag plan, including when
        // the first write fails after Shopify accepted it.
        try {
          await updateProductTags(
            plan.productId,
            plan.finalTags,
            retryInfo,
            `restore exact tags after ${plan.collectionHandle} membership pulse for ${plan.productHandle}`,
          );
        } catch (restoreError) {
          if (!primaryError) primaryError = restoreError;
          else primaryError = new Error(`${primaryError.message}; restore failed: ${restoreError.message}`);
        }
      }
      if (primaryError) throw primaryError;
      const readback = await readProductTags(plan.productId, retryInfo);
      const actual = normalizedTagSet(readback.tags);
      const expected = normalizedTagSet(plan.finalTags);
      const { missing, extra } = compareSets(expected, actual);
      if (missing.length || extra.length) {
        throw new Error(`${plan.productHandle}: exact tags changed during stale-membership repair (missing ${missing.length}, extra ${extra.length}).`);
      }
      return { ...plan, readback: { handle: readback.handle, tags: readback.tags } };
    },
    "Stale collection memberships pulsed",
  );
}

function sourceUsesOnlyProductTag(collection, tag) {
  const source = asArray(collection?.sources).length === 1 ? collection.sources[0] : null;
  const conditions = asArray(source?.inclusion?.conditions);
  if (!source || source.__typename !== "CollectionConditionsSource" || source.targetType !== "PRODUCTS") return false;
  if (source.inclusion?.matchType !== "ALL" || conditions.length !== 1) return false;
  const condition = conditions[0];
  return condition.__typename === "CollectionSourceInclusionConditionProductTag" &&
    condition.relation === "TAGGED_WITH" &&
    condition.matchType === "ANY" &&
    asArray(condition.values).length === 1 &&
    normalizeTag(condition.values[0]) === normalizeTag(tag);
}

async function replaceCollectionSource(target, source, retryInfo, operation) {
  const mutationTarget = { ...target, sourceNeedsUpdate: true };
  const data = await client.run(BULK_COLLECTION_UPDATE_MUTATION, {
    collection: buildCollectionUpdateInput(mutationTarget, source),
  }, {
    allowMutations: true,
    operation,
    retryInfo,
  });
  const errors = asArray(data?.collectionUpdate?.userErrors);
  if (errors.length) throw new Error(`${target.policy.handle}: ${formatUserErrors(errors)}`);
  if (!data?.collectionUpdate?.collection?.id) {
    throw new Error(`${target.policy.handle}: Shopify returned no collection after source reindex.`);
  }
  const refreshed = (await fetchCollections(retryInfo)).find((collection) =>
    normalizeCollectionHandle(collection.handle) === target.policy.handle,
  );
  if (!refreshed) throw new Error(`${target.policy.handle}: collection disappeared after source reindex.`);
  target.existing = refreshed;
  target.collectionId = refreshed.id;
  return refreshed;
}

async function waitForExactCollectionMembership({ membership, collectionId, expected, retryInfo, label }) {
  const attempts = Math.max(1, Math.min(8, Number(process.env.SALT_COLLECTION_SHADOW_REINDEX_ATTEMPTS || 6)));
  const delayMs = Math.max(1000, Number(process.env.SALT_COLLECTION_SHADOW_REINDEX_DELAY_MS || 5000));
  let difference = { missing: [...expected], extra: [] };
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await refreshCollectionMembership(membership, [collectionId], retryInfo);
    const actual = membership.membersByCollectionId.get(collectionId) || new Set();
    difference = compareSets(expected, actual);
    if (!difference.missing.length && !difference.extra.length) return actual;
    if (attempt < attempts) {
      process.stdout.write(`${label}: membership reindex pending (${difference.missing.length} missing, ${difference.extra.length} extra); retry ${attempt}/${attempts - 1}.\n`);
      await sleep(delayMs);
    }
  }
  throw new Error(`${label}: shadow source membership did not converge (missing ${difference.missing.length}, extra ${difference.extra.length}).`);
}

async function repairStaleSemanticCollectionIndex({ target, verification, tagTasks, retryInfo, output, manifest }) {
  const stalePlans = buildStaleMembershipPulsePlans({
    verification,
    targets: [target],
    tagTasks,
    maxProducts: membershipPulseProductLimit,
  });
  if (!stalePlans.length) return null;
  if (stalePlans.length !== asArray(target.readback?.extraProductIds).length) {
    throw new Error(`${target.policy.handle}: stale membership repair cohort exceeds the bounded limit of ${membershipPulseProductLimit}.`);
  }

  const targetTags = new Set(semanticCollectionRuleTags(target.policy).map(normalizeTag));
  const expectedTasks = tagTasks.filter((task) =>
    asArray(task.requiredManagedTags).some((tag) => targetTags.has(normalizeTag(tag))),
  );
  const expectedIds = new Set(expectedTasks.map((task) => task.productId));
  if (!expectedTasks.length) throw new Error(`${target.policy.handle}: cannot shadow-reindex without expected members.`);
  for (const plan of stalePlans) {
    if (expectedIds.has(plan.productId)) {
      throw new Error(`${target.policy.handle}: stale extra ${plan.productHandle} is also in the expected tag cohort.`);
    }
  }

  const shadowTag = `salt:repair:collection-membership:${target.policy.handle}:${Date.now()}`;
  const shadowTasks = tagTasks.map((task) => {
    if (!expectedIds.has(task.productId)) return { ...task, status: "exact-match" };
    return {
      ...task,
      desiredTags: uniqueTags([...task.desiredTags, shadowTag]),
      desiredManagedTags: uniqueTags([...task.desiredManagedTags, shadowTag]),
      tagsToAdd: [shadowTag],
      tagsToRemove: [],
      status: "would-update",
    };
  });
  const membership = verification.membership;
  const canonicalSource = target.policy.kind === "price"
    ? buildPriceCollectionSource(target.policy)
    : buildSemanticCollectionSource(target.policy);
  const shadowSource = {
    ...canonicalSource,
    inclusion: {
      ...canonicalSource.inclusion,
      matchType: "ALL",
      conditions: [{
        productTag: { relation: "TAGGED_WITH", values: [shadowTag], matchType: "ANY" },
      }],
    },
  };
  let shadowTagsApplied = false;
  let shadowSourceApplied = false;
  try {
    process.stdout.write(`Preparing lossless shadow reindex for ${target.policy.handle}: ${expectedTasks.length} expected members, ${stalePlans.length} stale extras.\n`);
    await applyExactTags(shadowTasks, retryInfo, output, manifest);
    await verifyExactTags(shadowTasks, retryInfo);
    shadowTagsApplied = true;

    const shadowCollection = await replaceCollectionSource(
      target,
      shadowSource,
      retryInfo,
      `switch ${target.policy.handle} to lossless shadow source`,
    );
    if (!sourceUsesOnlyProductTag(shadowCollection, shadowTag)) {
      throw new Error(`${target.policy.handle}: shadow source failed live readback.`);
    }
    shadowSourceApplied = true;
    await waitForExactCollectionMembership({
      membership,
      collectionId: target.collectionId,
      expected: expectedIds,
      retryInfo,
      label: `${target.policy.handle} shadow reindex`,
    });

    const canonicalCollection = await replaceCollectionSource(
      target,
      canonicalSource,
      retryInfo,
      `restore canonical source for ${target.policy.handle}`,
    );
    if (!collectionSourceMatches(target.policy, canonicalCollection)) {
      throw new Error(`${target.policy.handle}: canonical source failed live readback after shadow reindex.`);
    }
    shadowSourceApplied = false;

    const restoredTasks = tagTasks.map((task) => ({
      ...task,
      status: expectedIds.has(task.productId) ? "would-update" : "exact-match",
    }));
    await applyExactTags(restoredTasks, retryInfo, output, manifest);
    await verifyExactTags(tagTasks, retryInfo);
    shadowTagsApplied = false;
    await waitForExactCollectionMembership({
      membership,
      collectionId: target.collectionId,
      expected: expectedIds,
      retryInfo,
      label: `${target.policy.handle} canonical reindex`,
    });
    return {
      type: "lossless-shadow-source-reindex",
      collectionHandle: target.policy.handle,
      productIds: stalePlans.map((plan) => plan.productId),
      productHandles: stalePlans.map((plan) => plan.productHandle),
      expectedMemberCount: expectedIds.size,
      shadowTag,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    // Keep the collection populated while restoring the canonical source and
    // exact tags. If cleanup itself fails, expose both failures and fail the
    // release rather than leaving a transient repair tag behind silently.
    const cleanupErrors = [];
    if (shadowSourceApplied) {
      try {
        const restoredCollection = await replaceCollectionSource(
          target,
          canonicalSource,
          retryInfo,
          `cleanup canonical source for ${target.policy.handle}`,
        );
        if (!collectionSourceMatches(target.policy, restoredCollection)) {
          throw new Error("canonical source readback failed during cleanup");
        }
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (shadowTagsApplied) {
      try {
        const restoredTasks = tagTasks.map((task) => ({
          ...task,
          status: expectedIds.has(task.productId) ? "would-update" : "exact-match",
        }));
        await applyExactTags(restoredTasks, retryInfo, output, manifest);
        await verifyExactTags(tagTasks, retryInfo);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    const suffix = cleanupErrors.length
      ? `; cleanup failed: ${cleanupErrors.map((cleanupError) => cleanupError.message).join(" | ")}`
      : "";
    throw new Error(`${error.message}${suffix}`);
  }
}

async function verifyCollectionMembership({ targets, products, tagTasks, retryInfo, membership: providedMembership = null }) {
  const membership = providedMembership || await fetchCollectionMembershipBulk(retryInfo);
  const liveCollections = membership.collections;
  const byHandle = new Map(liveCollections.map((collection) => [normalizeCollectionHandle(collection.handle), collection]));
  const activeProductIds = new Set(products.map((product) => String(product?.id || "")).filter(Boolean));
  const expectedByTag = new Map(SEMANTIC_COLLECTION_POLICIES.map((policy) => [normalizeTag(policy.tag), new Set()]));
  const taskByProductId = new Map(tagTasks.map((task) => [task.productId, task]));
  const expectedCollectionsByProduct = new Map(products.map((product) => [product.id, new Set([ALL_PRODUCTS_COLLECTION_POLICY.handle])]));
  for (const product of products) {
    const task = taskByProductId.get(product.id);
    for (const tag of task?.requiredManagedTags || []) {
      expectedByTag.get(normalizeTag(tag))?.add(product.id);
      const handle = canonicalCollectionHandle(tag);
      if (handle) expectedCollectionsByProduct.get(product.id)?.add(handle);
    }
    for (const target of targets) {
      if (target.policy.kind === "price" && productMatchesPricePolicy(product, target.policy)) {
        expectedCollectionsByProduct.get(product.id)?.add(target.policy.handle);
      }
    }
  }
  addApprovedSemanticAliasMembershipsToExpected({
    expectedByTag,
    expectedCollectionsByProduct,
    products,
  });

  const failures = [];
  const failedCollectionHandles = new Set();
  const outOfScopeMemberships = [];
  const actualMembershipByProduct = new Map(products.map((product) => [product.id, new Set()]));
  for (const target of targets) {
    const collection = byHandle.get(target.policy.handle);
    const issues = [];
    if (!collection) issues.push("canonical collection missing");
    else if (!collectionSourceMatches(target.policy, collection)) issues.push("source mismatch");
    let expected = new Set();
    let actual = new Set();
    if (collection) {
      const rawActual = membership.membersByCollectionId.get(collection.id) || new Set();
      const outOfScopeProductIds = [...rawActual].filter((id) => !activeProductIds.has(String(id || "")));
      if (outOfScopeProductIds.length) {
        outOfScopeMemberships.push({
          collectionHandle: target.policy.handle,
          productIds: outOfScopeProductIds,
          count: outOfScopeProductIds.length,
        });
      }
      actual = filterMembershipToActiveProducts(rawActual, activeProductIds);
      if (target.policy.kind === "semantic") expected = expectedByTag.get(normalizeTag(target.policy.tag)) || new Set();
      else expected = new Set(products.filter((product) => productMatchesPricePolicy(product, target.policy)).map((product) => product.id));
      const difference = compareSets(expected, actual);
      if (difference.missing.length) issues.push(`${difference.missing.length} missing products`);
      if (difference.extra.length) issues.push(`${difference.extra.length} extra products`);
      for (const id of actual) actualMembershipByProduct.get(id)?.add(target.policy.handle);
      target.readback = {
        expectedCount: expected.size,
        actualCount: actual.size,
        missingProductIds: difference.missing.slice(0, 100),
        extraProductIds: difference.extra.slice(0, 100),
        source: sourceConditionSummary(collection.sources?.[0]),
        ok: issues.length === 0,
        issues,
      };
    }
    if (issues.length) {
      failedCollectionHandles.add(target.policy.handle);
      failures.push(`${target.policy.handle}: ${issues.join(", ")}`);
    }
  }

  const expectedLiveHandles = new Set([
    ALL_PRODUCTS_COLLECTION_POLICY.handle,
    ...targets.map((target) => target.policy.handle),
  ]);
  const readOnlyLiveHandles = new Set([
    ...DEFAULT_READ_ONLY_LIVE_COLLECTION_HANDLES,
    ...String(process.env.SALT_ALLOW_UNMANAGED_LIVE_COLLECTIONS || "")
      .split(",")
      .map(normalizeCollectionHandle)
      .filter(Boolean),
  ]);
  const unexpectedLiveCollections = [...byHandle.keys()].filter(
    (handle) => !expectedLiveHandles.has(handle) &&
      !readOnlyLiveHandles.has(handle) &&
      !Object.prototype.hasOwnProperty.call(RETIRED_COLLECTION_HANDLE_MAP, handle),
  );
  if (unexpectedLiveCollections.length) {
    failures.push(`live collections outside canonical governance: ${unexpectedLiveCollections.join(", ")}`);
  }

  const allProductsCollection = byHandle.get(ALL_PRODUCTS_COLLECTION_POLICY.handle);
  if (!allProductsCollection) failures.push("all-products: collection missing");
  else {
    const rawMembers = membership.membersByCollectionId.get(allProductsCollection.id) || new Set();
    const outOfScopeProductIds = [...rawMembers].filter((id) => !activeProductIds.has(String(id || "")));
    if (outOfScopeProductIds.length) {
      outOfScopeMemberships.push({
        collectionHandle: ALL_PRODUCTS_COLLECTION_POLICY.handle,
        productIds: outOfScopeProductIds,
        count: outOfScopeProductIds.length,
      });
    }
    const members = filterMembershipToActiveProducts(rawMembers, activeProductIds);
    const expectedMembers = new Set(products.map((product) => product.id));
    const difference = compareSets(expectedMembers, members);
    if (difference.missing.length) failures.push(`all-products: ${difference.missing.length} missing products`);
    if (difference.extra.length) failures.push(`all-products: ${difference.extra.length} extra products`);
    for (const id of members) actualMembershipByProduct.get(id)?.add(ALL_PRODUCTS_COLLECTION_POLICY.handle);
  }

  for (const product of products) {
    const expected = expectedCollectionsByProduct.get(product.id) || new Set();
    const actual = actualMembershipByProduct.get(product.id) || new Set();
    const difference = compareSets(expected, actual);
    if (difference.missing.length || difference.extra.length) {
      failures.push(`${product.handle}: wrong collection set (missing ${difference.missing.length}, extra ${difference.extra.length})`);
    }
  }

  const collectionless = [...actualMembershipByProduct.entries()].filter(([, handles]) => handles.size === 0).map(([id]) => id);
  if (collectionless.length) failures.push(`${collectionless.length} active products are collectionless`);
  return {
    failures,
    collectionless,
    outOfScopeMemberships,
    liveCollections,
    bulkOperation: membership.operation,
    membership,
    failedCollectionHandles: [...failedCollectionHandles],
  };
}

async function run(args) {
  if (args.supervisedVision && process.env.SALT_CATALOG_VISION_SUPERVISED !== "1") {
    throw new Error("--supervised-vision requires SALT_CATALOG_VISION_SUPERVISED=1; image evidence must be explicitly enabled by the release command.");
  }
  if (args.mode === "apply") await verifyCollectionApproval();
  const retryInfo = [];
  const priorManifestPath = process.env.SALT_CATALOG_REUSE_MANIFEST_PATH ||
    (args.output === defaultOutputPath ? args.output : defaultOutputPath);
  const priorManifest = await readJson(priorManifestPath);
  process.stdout.write("Catalog integrity: prior manifest loaded.\n");
  const knowledgeModel = await readCatalogKnowledgeModel({
    required: process.env.SALT_REQUIRE_KNOWLEDGE_MODEL === "1",
  });
  process.stdout.write("Catalog integrity: knowledge model/evidence loaded.\n");
  const priorSnapshot = buildPriorIntegritySnapshot(priorManifest);
  const catalog = await readProductCatalogPayload(resolve(rootDir, "public", "data"));
  process.stdout.write("Catalog integrity: local catalog loaded.\n");
  let liveProducts;
  let collections;
  let publications;
  if (args.useLiveCheckpoint) {
    process.stdout.write(`Catalog integrity: loading live checkpoint from ${liveInputCheckpointPath}.\n`);
    const checkpoint = await readJson(liveInputCheckpointPath);
    if (!checkpoint?.complete || !Array.isArray(checkpoint.liveProducts) || !Array.isArray(checkpoint.collections)) {
      throw new Error(`No complete catalog-integrity live checkpoint exists at ${liveInputCheckpointPath}`);
    }
    ({ liveProducts, collections, publications } = checkpoint);
    process.stdout.write(`Using dry-run live checkpoint with ${liveProducts.length} active products.\n`);
  } else {
    [liveProducts, collections, publications] = await Promise.all([
      fetchActiveProducts(retryInfo),
      fetchCollections(retryInfo),
      fetchPublications(retryInfo),
    ]);
    await writeManifest(liveInputCheckpointPath, {
      generatedAt: new Date().toISOString(),
      complete: true,
      liveProducts,
      collections,
      publications,
    });
  }
  assertCompleteCollectionGovernance(collections);
  const localByHandle = localProductByHandle(catalog);
  const products = liveProducts.map((liveProduct) => mergeProduct(localByHandle.get(normalizeCollectionHandle(liveProduct.handle)) || {}, liveProduct));
  const visualReviewCheckpointPath = resolve(
    rootDir,
    process.env.SALT_CATALOG_VISUAL_REVIEW_CHECKPOINT_PATH || defaultVisualReviewCheckpointPath,
  );
  const visualReviewCatalogFingerprint = catalogVisualFingerprint(products);
  const visualReviewCheckpoint = args.supervisedVision
    ? await readVisualReviewCheckpoint(visualReviewCheckpointPath, visualReviewCatalogFingerprint)
    : new Map();
  if (visualReviewCheckpoint.size) {
    process.stdout.write(`Reusing ${visualReviewCheckpoint.size} checkpointed supervised visual decisions for this catalog fingerprint.\n`);
  }
  const reviewHandles = new Set(
    priorSnapshot
      ? [...priorSnapshot.byHandle.entries()]
        .filter(([, entry]) => ["review", "fallback"].includes(entry.classification?.source))
        .map(([handle]) => handle)
      : [],
  );
  if (args.reviewOnly && !reviewHandles.size) {
    throw new Error("--review-only requires a completed prior manifest with review-held products.");
  }
  if (args.reviewOnly) {
    process.stdout.write(`Review-only retry cohort: ${reviewHandles.size} prior fallback products.\n`);
  }
  const visualEvidenceManifest = process.env.SALT_CATALOG_REUSE_VISUAL_EVIDENCE_MANIFEST
    ? await readJson(resolve(rootDir, process.env.SALT_CATALOG_REUSE_VISUAL_EVIDENCE_MANIFEST), null)
    : null;
  const visualEvidenceByHandle = new Map(visualReviewCheckpoint);
  for (const entry of asArray(visualEvidenceManifest?.classifications)
    .filter((candidate) => candidate?.handle && candidate?.visualEvidence)) {
    visualEvidenceByHandle.set(normalizeCollectionHandle(entry.handle), entry);
  }
  if (visualEvidenceByHandle.size) {
    process.stdout.write(`Reusing supervised visual evidence for ${visualEvidenceByHandle.size} products.\n`);
  }
  const visualTaxonomyEvidence = await readJson(
    process.env.SALT_VISUAL_TAXONOMY_EVIDENCE_PATH || defaultVisualTaxonomyEvidencePath,
    null,
  );
  const visualTaxonomyModel = await readJson(
    process.env.SALT_VISUAL_TAXONOMY_MODEL_PATH || defaultVisualTaxonomyModelPath,
    null,
  );
  const visualModelEvidenceByHandle = visualTaxonomyModel?.retention?.rawDataPurged === true &&
    visualTaxonomyEvidence?.modelVersion === visualTaxonomyModel?.modelVersion &&
    visualTaxonomyEvidence?.catalogFingerprint === catalogVisualFingerprint(products)
    ? new Map(Object.entries(visualTaxonomyEvidence?.products || {}).map(([handle, evidence]) => [normalizeCollectionHandle(handle), evidence]))
    : new Map();
  if (visualModelEvidenceByHandle.size) {
    process.stdout.write(`Using ${visualModelEvidenceByHandle.size} current-catalog trained visual taxonomy decisions with confidence gates.\n`);
  }
  const candidateVisualTaxonomyEvidence = await readJson(
    process.env.SALT_VISUAL_TAXONOMY_CANDIDATE_EVIDENCE_PATH || defaultCandidateVisualTaxonomyEvidencePath,
    null,
  );
  const candidateVisualModelEvidenceByHandle = process.env.SALT_RELEASE_ALLOW_CANDIDATE_VISUAL_EVIDENCE === "1" &&
    candidateVisualTaxonomyEvidence?.candidateOnly === true &&
    candidateVisualTaxonomyEvidence?.runtime?.device === "metal" &&
    candidateVisualTaxonomyEvidence?.catalogFingerprint === catalogVisualFingerprint(products)
    ? new Map(Object.entries(candidateVisualTaxonomyEvidence?.products || {}).map(([handle, evidence]) => [normalizeCollectionHandle(handle), evidence]))
    : new Map();
  if (candidateVisualModelEvidenceByHandle.size) {
    process.stdout.write(`Using ${candidateVisualModelEvidenceByHandle.size} current-catalog local SigLIP review decisions with confidence gates.\n`);
  }
  const canReusePriorManifest = args.mode === "verify" && Boolean(priorSnapshot) &&
    (!args.reclassify || args.reusePriorManifest);
  if (args.reusePriorManifest && (!args.reclassify || args.mode !== "verify")) {
    throw new Error("--reuse-prior-manifest is only allowed for a reclassifying verification.");
  }
  let modelEvidenceByKey = null;
  if (!canReusePriorManifest) {
    try {
      modelEvidenceByKey = await scoreCatalogKnowledgeModelBatch(knowledgeModel, products);
    } catch (error) {
      modelEvidenceByKey = await readCurrentKnowledgeEvidence(products);
      if (!modelEvidenceByKey) throw error;
      process.stdout.write(`Using current-catalog knowledge evidence cache after model artifact read failure: ${error.message}\n`);
    }
  }
  if (modelEvidenceByKey) {
    process.stdout.write(`MLX/Metal knowledge scoring completed for ${modelEvidenceByKey.size}/${products.length} products.\n`);
  }
  const dynamicAssignments = await buildDynamicAssignments(products);
  const tagTasks = [];
  const resolvedTagPlans = [];
  const classifications = [];
  const resolvedProducts = new Array(products.length);
  const unresolvedProducts = [];
  const taxonomyBatchCount = Math.ceil(products.length / args.batchSize);
  for (let batchStart = 0; batchStart < products.length; batchStart += args.batchSize) {
    const batchEnd = Math.min(batchStart + args.batchSize, products.length);
    for (let index = batchStart; index < batchEnd; index += 1) {
      const product = products[index];
      const modelEvidence = modelEvidenceByKey?.get(String(product?.id || product?.handle || ""));
      const handle = normalizeCollectionHandle(product.handle);
      const prior = args.reviewOnly && !reviewHandles.has(handle)
        ? priorSnapshot?.byHandle.get(handle)
        : args.reclassify && !args.reusePriorManifest
        ? null
        : priorSnapshot?.byHandle.get(normalizeCollectionHandle(product.handle));
      if (args.reviewOnly && !reviewHandles.has(handle)) {
        if (!prior?.tagTask || !prior.classification?.ruleId) {
          throw new Error(`Review-only retry cannot preserve ${product.handle}: prior classification is missing.`);
        }
        resolvedProducts[index] = {
          knowledge: null,
          source: prior.classification.source,
          priorClassification: prior.classification,
          // Review-only mode must not reconcile products outside the retry cohort.
          // Carry every current tag through so the exact-tag planner is a true no-op.
          priorManagedTags: uniqueTags(asArray(product.tags)),
          priorCollectionTags: uniqueTags(
            prior.classification.collectionHandles.map((collectionHandle) => collectionTagForHandle(collectionHandle)),
          ),
          reused: true,
        };
        continue;
      }
      const canReusePriorTagPlan = Boolean(
        canReusePriorManifest &&
        prior?.tagTask &&
        Array.isArray(prior.tagTask.desiredManagedTags) &&
        Array.isArray(prior.classification?.collectionHandles),
      );
      if (canReusePriorTagPlan) {
        resolvedProducts[index] = {
          knowledge: null,
          source: prior.classification.source,
          priorClassification: prior.classification,
          priorManagedTags: uniqueTags(prior.tagTask.desiredManagedTags),
          priorCollectionTags: uniqueTags(
            prior.classification.collectionHandles.map((handle) => collectionTagForHandle(handle)),
          ),
          reused: true,
        };
        continue;
      }
      let deterministic = null;
      const priorRuleId = prior?.classification?.ruleId || "";
      const canReusePriorClassification = Boolean(
        prior && TAXONOMY_DEFINITIONS.some((definition) => definition.id === priorRuleId),
      );
      if (canReusePriorClassification) {
        const taxonomy = classifyCatalogTaxonomyByRuleId(product, prior.classification.ruleId, {
          source: `prior-catalog-integrity-${prior.classification.source || "verified"}`,
          reason: "Reused the last completed collection-integrity classification for an unchanged handle.",
        });
        deterministic = {
          // A non-reclassifying verification must compare against the last
          // applied classification, not reopen model conflicts on readback.
          knowledge: buildProductKnowledgeFromTaxonomy(product, taxonomy),
          source: prior.classification.source,
          priorClassification: prior.classification,
          reused: true,
        };
      } else {
        deterministic = resolveDeterministicKnowledge(product, knowledgeModel, modelEvidence);
      }
      if (deterministic) resolvedProducts[index] = deterministic;
      else unresolvedProducts.push({ index, product });
    }
    const batchNumber = Math.floor(batchStart / args.batchSize) + 1;
    if (batchNumber % 10 === 0 || batchNumber === taxonomyBatchCount) {
      process.stdout.write(`Taxonomy batches checked ${batchNumber}/${taxonomyBatchCount} (${batchEnd}/${products.length} products).\n`);
    }
  }
  process.stdout.write(`${unresolvedProducts.length} products require review${args.deterministicOnly ? "; deterministic-only mode will use the fallback collection" : " or release-boundary fallback"}.\n`);
  const resolutionBatchCount = Math.ceil(unresolvedProducts.length / args.batchSize);
  for (let batchStart = 0; batchStart < unresolvedProducts.length; batchStart += args.batchSize) {
    const batch = unresolvedProducts.slice(batchStart, batchStart + args.batchSize);
      const resolutions = await mapWithConcurrency(
      batch,
      classificationConcurrency,
      (entry) => resolveKnowledge(entry.product, {
        ...args,
        knowledgeModel,
        modelEvidence: modelEvidenceByKey?.get(String(entry.product?.id || entry.product?.handle || "")),
        priorVisualEvidence: (() => {
          const saved = visualEvidenceByHandle.get(normalizeCollectionHandle(entry.product?.handle));
          return saved && visualEvidenceMatchesProduct(entry.product, saved) ? saved : null;
        })(),
        visualModelEvidence: visualModelEvidenceByHandle.get(normalizeCollectionHandle(entry.product?.handle)) ||
          candidateVisualModelEvidenceByHandle.get(normalizeCollectionHandle(entry.product?.handle)),
      }),
      args.deterministicOnly ? "Review resolution processed" : "Visual resolution processed",
    );
    for (const [index, entry] of batch.entries()) {
      resolvedProducts[entry.index] = resolutions[index];
      const resolution = resolutions[index];
      if (args.supervisedVision && resolution?.visualEvidence) {
        visualReviewCheckpoint.set(normalizeCollectionHandle(entry.product.handle), {
          handle: entry.product.handle,
          productId: String(entry.product?.id || ""),
          imageUrl: resolution.imageUrl || null,
          imageUrls: resolution.imageUrls || [],
          visualEvidence: resolution.visualEvidence,
          visionAlignment: resolution.visionAlignment || null,
          source: resolution.source || "review",
          updatedAt: new Date().toISOString(),
        });
      }
    }
    if (args.supervisedVision) {
      await writeVisualReviewCheckpoint(
        visualReviewCheckpointPath,
        visualReviewCatalogFingerprint,
        visualReviewCheckpoint,
      );
    }
    const batchNumber = Math.floor(batchStart / args.batchSize) + 1;
    if (batchNumber % 10 === 0 || batchNumber === resolutionBatchCount) {
      process.stdout.write(`Resolution batches checked ${batchNumber}/${resolutionBatchCount}.\n`);
    }
  }

  for (const [index, product] of products.entries()) {
    const resolved = resolvedProducts[index];
    const dynamicHandles = dynamicAssignments.get(normalizeCollectionHandle(product.handle)) || new Set();
    const approvedSpecialTags = [...dynamicHandles]
      .filter((handle) => Object.prototype.hasOwnProperty.call(SPECIAL_COLLECTION_MINIMUMS, handle))
      .map((handle) => collectionTagForHandle(handle));
    const collectionTags = resolved.priorCollectionTags || (["review", "fallback"].includes(resolved.source)
      ? uniqueTags([collectionTagForHandle("classification-fallback"), ...approvedSpecialTags])
      : buildProductCollectionTags(product, resolved.knowledge, dynamicHandles));
    if (!collectionTags.length) {
      throw new Error(`${product.handle} has no semantic collection assignment after classification ${resolved.knowledge?.classificationRule || resolved.priorClassification?.ruleId || "unknown"}.`);
    }
    const classificationTags = resolved.priorManagedTags ? [] : ["vision", "vision-model-candidate", "guess", "existing-vision"].includes(resolved.source)
      ? [
        simpleCatalogTag("classification-rule", resolved.knowledge.classificationRule),
        simpleCatalogTag("classification-source", resolved.source === "existing-vision" ? "vision" : resolved.source),
      ]
      : [];
    const taxonomyTags = resolved.priorManagedTags
      ? []
      : asArray(resolved.knowledge.proposedTags).filter((tag) => {
        // Simple taxonomy tags intentionally omit namespaces. Do not let a
        // department/category tag such as `home-decor` activate a collection
        // unless this product was explicitly assigned to that collection.
        const normalized = normalizeTag(tag);
        return !GOVERNED_COLLECTION_TAGS.has(normalized) || collectionTags.some((collectionTag) => normalizeTag(collectionTag) === normalized);
      });
    const desiredManagedTags = resolved.priorManagedTags || (["review", "fallback"].includes(resolved.source)
      ? collectionTags
      : uniqueTags([
        ...taxonomyTags,
        ...collectionTags,
        ...classificationTags,
      ]));
    const resolvedReviewReasons = Array.isArray(resolved.reviewReasons) ? resolved.reviewReasons.filter(Boolean) : [];
    const priorFallbackReasons = Array.isArray(resolved.priorClassification?.fallbackReason)
      ? resolved.priorClassification.fallbackReason.filter(Boolean)
      : [];
    resolvedTagPlans.push({ liveProduct: liveProducts[index], desiredManagedTags, requiredManagedTags: collectionTags });
    classifications.push({
      productId: product.shopifyId,
      handle: product.handle,
      ruleId: resolved.knowledge?.classificationRule || resolved.priorClassification?.ruleId || "unclassified",
      source: resolved.source,
      evidenceFallback: Boolean(resolved.evidenceFallback || resolved.priorClassification?.evidenceFallback),
      confidence: resolved.knowledge?.confidence ?? resolved.priorClassification?.confidence ?? 0,
      collectionHandles: collectionTags.map((tag) => normalizeCollectionHandle(tag)),
      reused: Boolean(resolved.reused),
      imageUrl: resolved.imageUrl || resolved.priorClassification?.imageUrl || null,
      imageUrls: resolved.imageUrls || resolved.priorClassification?.imageUrls || [],
      visualEvidence: resolved.visualEvidence || resolved.priorClassification?.visualEvidence || null,
      visionAlignment: resolved.visionAlignment || resolved.priorClassification?.visionAlignment || null,
      guessedRuleId: resolved.guessedRuleId || resolved.priorClassification?.guessedRuleId || null,
      fallbackReason: resolvedReviewReasons.length
        ? resolvedReviewReasons
        : resolved.reason
          ? [resolved.reason]
          : priorFallbackReasons,
      visionError: resolved.visionError || resolved.priorClassification?.visionError || null,
    });
  }

  const managedTagUniverse = new Set(resolvedTagPlans.flatMap((entry) => entry.desiredManagedTags).map(normalizeTag));
  for (const entry of resolvedTagPlans) {
    tagTasks.push(exactTagTask(
      entry.liveProduct,
      entry.desiredManagedTags,
      managedTagUniverse,
      entry.requiredManagedTags,
    ));
  }

  const specialCollectionCounts = Object.fromEntries(
    Object.keys(SPECIAL_COLLECTION_MINIMUMS).map((handle) => [
      handle,
      tagTasks.filter((task) => task.desiredManagedTags.includes(collectionTagForHandle(handle))).length,
    ]),
  );
  assertSpecialCollectionMinimums(specialCollectionCounts);

  const targets = resolveCollectionTargets(collections);
  const onlineStorePublication = publications.find((publication) => normalizeTag(publication?.name) === "online store") || null;
  const actionableTagTasks = tagTasks.filter((task) => task.status === "would-update");
  const manifest = {
    version: COLLECTION_GOVERNANCE_VERSION,
    taxonomyVersion: CATALOG_TAXONOMY_VERSION,
    collectionGovernanceVersion: COLLECTION_GOVERNANCE_VERSION,
    generatedAt: new Date().toISOString(),
    mode: args.mode,
    storeDomain: client.storeDomain,
    apiVersion: client.apiVersion,
    policy: {
      scope: "all active Shopify products and every live collection",
      managedTags: "exact-set replacement for taxonomy, collection, and classification namespaces",
      unmanagedTags: "preserved exactly",
      uncertainProducts: args.supervisedVision
        ? "supervised multi-image evidence only; confidence, agreement, taxonomy, and alignment gates; explicit non-semantic classification-fallback; no guesses"
        : args.deterministicOnly
          ? "deterministic taxonomy plus verified Metal visual-model evidence when available; confidence, margin, taxonomy, and alignment gates; explicit non-semantic classification-fallback; no guesses"
          : "legacy local image enrichment path; full release guesses remain disabled",
      trainedVisualModel: visualModelEvidenceByHandle.size
        ? "current-catalog verified Metal visual taxonomy evidence"
        : "not installed or not available for this catalog fingerprint",
      semanticCollectionRule: "one canonical simple collection tag condition per collection",
      priceCollections: "exact variant-price source plus exact live membership verification",
      collectionlessProducts: "forbidden",
      stableClassification: "reuse the last completed valid classification rule for unchanged handles and recompute managed tags from current governance",
      auditBatchSize: args.batchSize,
    },
    summary: {
      activeProducts: products.length,
      liveCollectionsBefore: collections.length,
      governedCollections: targets.length + 1,
      semanticCollections: SEMANTIC_COLLECTION_POLICIES.length,
      priceCollections: PRICE_COLLECTION_POLICIES.length,
      productsNeedingTagChanges: actionableTagTasks.length,
      tagsToAdd: tagTasks.reduce((sum, task) => sum + task.tagsToAdd.length, 0),
      tagsToRemove: tagTasks.reduce((sum, task) => sum + task.tagsToRemove.length, 0),
      taxonomyClassified: classifications.filter((entry) => entry.source === "taxonomy").length,
      approvedOverrides: classifications.filter((entry) => entry.source === "approved-override").length,
      visionClassified: classifications.filter((entry) => ["vision", "vision-model", "vision-model-candidate"].includes(entry.source)).length,
      supervisedVision: Boolean(args.supervisedVision),
      trainedVisualModelDecisions: visualModelEvidenceByHandle.size,
      trainedVisualModelAccepted: [...visualModelEvidenceByHandle.values()].filter((entry) => entry?.accepted === true).length,
      guessedAssignments: classifications.filter((entry) => entry.source === "guess").length,
      fallbackResolved: classifications.filter((entry) => entry.source === "fallback").length,
      reviewPending: 0,
      reusedClassifications: classifications.filter((entry) => entry.reused).length,
      collectionlessProducts: null,
      failures: null,
      specialCollectionCounts,
      auditBatchSize: args.batchSize,
      auditBatchCount: taxonomyBatchCount,
      visualReviewCheckpoint: args.supervisedVision ? visualReviewCheckpointPath : null,
      visualReviewCheckpointEntries: args.supervisedVision ? visualReviewCheckpoint.size : 0,
    },
    classifications,
    tagTasks,
    collectionTargets: targets,
    retryInfo,
    priorSnapshot: priorSnapshot ? {
      completedAt: priorSnapshot.completedAt,
      reusableHandles: priorSnapshot.byHandle.size,
      legacyVersionMetadata: priorSnapshot.legacyVersionMetadata,
    } : null,
  };
  await writeManifest(args.output, manifest);

  if (args.mode === "dry-run") {
    manifest.collectionTargets.forEach((target) => { target.status = `would-${target.action}`; });
    manifest.completedAt = new Date().toISOString();
    await writeManifest(args.output, manifest);
    process.stdout.write(`Catalog integrity dry run complete: ${products.length} products, ${actionableTagTasks.length} exact tag updates, ${targets.filter((target) => target.action !== "exact-match").length} collection repairs.\n`);
    return manifest;
  }

  if (args.mode === "apply") {
    await applyExactTags(tagTasks, retryInfo, args.output, manifest);
    await verifyExactTags(tagTasks, retryInfo);
    await applyCollectionTargets(targets, onlineStorePublication, retryInfo, args.output, manifest);
  }

  const membershipRepairLog = [];
  const pulsedMemberships = new Set();
  let verification = await verifyCollectionMembership({ targets, products: liveProducts, tagTasks, retryInfo });
  for (let attempt = 1; attempt < membershipPollAttempts && verification.failures.length; attempt += 1) {
    process.stdout.write(`Collection propagation incomplete (${verification.failures.length} issues); membership retry ${attempt}/${membershipPollAttempts - 1} (${membershipRetryMode}).\n`);
    const failedHandles = new Set(verification.failedCollectionHandles || []);
    const failedCollectionIds = targets
      .filter((target) => failedHandles.has(target.policy.handle))
      .map((target) => target.collectionId || target.existing?.id)
      .filter(Boolean);
    const retryStrategy = chooseMembershipRetryStrategy({
      mode: membershipRetryMode,
      failedCollectionIds,
      collectionless: verification.collectionless,
      failures: verification.failures,
    });
    const retryDelay = Math.min(
      membershipPollDelayMs * 2 ** Math.max(0, attempt - 1),
      Math.max(membershipPollDelayMs, Number(process.env.SALT_COLLECTION_MEMBERSHIP_POLL_MAX_DELAY_MS || 60_000)),
    );
    process.stdout.write(`Collection retry strategy: ${retryStrategy}; waiting ${Math.ceil(retryDelay / 1000)}s.\n`);
    await sleep(retryDelay);
    if (retryStrategy === "targeted" && failedCollectionIds.length) {
      process.stdout.write(`Refreshing ${failedCollectionIds.length} failed collection memberships with targeted pagination.\n`);
      await refreshCollectionMembership(verification.membership, failedCollectionIds, retryInfo);
      verification = await verifyCollectionMembership({
        targets,
        products: liveProducts,
        tagTasks,
        retryInfo,
        membership: verification.membership,
      });
    } else {
      // A fresh bulk export is faster than paginating every failed collection
      // and also covers governance/all-products failures. Targeted pagination
      // remains available for troubleshooting through an explicit env flag.
      process.stdout.write(`Refreshing complete collection membership export for retry ${attempt}.\n`);
      verification = await verifyCollectionMembership({ targets, products: liveProducts, tagTasks, retryInfo });
    }
    process.stdout.write(`Collection retry ${attempt} verification found ${verification.failures.length} remaining issues.\n`);

    const pulsePlans = buildStaleMembershipPulsePlans({
      verification,
      targets,
      tagTasks,
      maxProducts: membershipPulseProductLimit,
    }).filter((plan) => !pulsedMemberships.has(`${plan.collectionHandle}:${plan.productId}`));
    if (pulsePlans.length) {
      const staleCollectionHandles = [...new Set(pulsePlans.map((plan) => plan.collectionHandle))];
      process.stdout.write(`Detected ${pulsePlans.length} stale semantic collection memberships; applying lossless shadow reindex.\n`);
      for (const collectionHandle of staleCollectionHandles) {
        const target = targets.find((candidate) => candidate.policy.handle === collectionHandle);
        if (!target) throw new Error(`${collectionHandle}: stale membership target disappeared before repair.`);
        const repaired = await repairStaleSemanticCollectionIndex({
          target,
          verification,
          tagTasks,
          retryInfo,
          output: args.output,
          manifest,
        });
        if (repaired) {
          for (const productId of repaired.productIds) pulsedMemberships.add(`${collectionHandle}:${productId}`);
          membershipRepairLog.push(repaired);
        }
      }
      manifest.collectionMembershipRepairs = membershipRepairLog;
      await writeManifest(args.output, manifest);
      process.stdout.write(`Stale semantic collection memberships repaired with exact source/tag readback for ${pulsePlans.length} products.\n`);
    }
  }
  manifest.collectionMembershipRepairs = membershipRepairLog;
  manifest.summary.collectionlessProducts = verification.collectionless.length;
  manifest.summary.failures = verification.failures.length;
  manifest.verification = {
    completedAt: new Date().toISOString(),
    failures: verification.failures,
    collectionlessProductIds: verification.collectionless,
    outOfScopeMemberships: verification.outOfScopeMemberships,
    bulkOperation: verification.bulkOperation ? {
      id: verification.bulkOperation.id,
      status: verification.bulkOperation.status,
      objectCount: Number(verification.bulkOperation.objectCount || 0),
      completedAt: verification.bulkOperation.completedAt || null,
    } : null,
  };
  manifest.completedAt = new Date().toISOString();
  await writeManifest(args.output, manifest);
  if (verification.failures.length) throw new Error(`Catalog integrity verification failed: ${verification.failures.join("; ")}`);
  process.stdout.write(`Catalog integrity verified: ${products.length} active products, ${targets.length + 1} governed collections, zero collectionless products.\n`);
  return manifest;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const args = parseArgs(process.argv);
  run(args).catch((error) => {
    process.stderr.write(`${error.stack || error.message || error}\n`);
    process.exitCode = 1;
  });
}
