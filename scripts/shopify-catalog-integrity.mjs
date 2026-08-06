#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { promisify } from "node:util";

import {
  ALL_PRODUCTS_COLLECTION_POLICY,
  COLLECTION_GOVERNANCE_VERSION,
  COLLECTION_TAG_PREFIX,
  PRICE_COLLECTION_POLICIES,
  SEMANTIC_COLLECTION_POLICIES,
  assertCompleteCollectionGovernance,
  buildPriceCollectionSource,
  buildProductCollectionTags,
  buildSemanticCollectionSource,
  collectionTagForHandle,
  normalizeCollectionHandle,
  productMatchesPricePolicy,
  resolveCollectionPolicyByLiveHandle,
} from "../src/lib/catalog-collection-governance.js";
import {
  classifyCatalogTaxonomyByRuleId,
  classifyCatalogTaxonomyWithoutOverrides,
  CATALOG_TAXONOMY_VERSION,
  getCatalogTaxonomyDefinitions,
  normalizeCatalogText,
  tokenizeCatalogText,
} from "../src/lib/catalog-taxonomy.js";
import {
  buildProductKnowledgeFromTaxonomy,
  classifyProductKnowledge,
} from "../src/lib/product-knowledge-base.js";
import { assessVisionTaxonomyAlignment } from "../src/lib/catalog-vision-alignment.js";
import {
  SPECIAL_COLLECTION_MINIMUMS,
  assertSpecialCollectionMinimums,
  buildSpecialCollectionAssignments,
} from "./build-new-product-special-collection-tags.mjs";
import {
  asArray,
  createShopifyAdminGraphQLClient,
  normalizeText,
} from "./shopify-admin-graphql-client.mjs";
import { readProductCatalogPayload } from "./product-catalog-files.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const execFileAsync = promisify(execFile);
const defaultOutputPath = resolve(rootDir, "output", "shopify-catalog-integrity-manifest.json");
const liveInputCheckpointPath = resolve(rootDir, "output", ".shopify-catalog-integrity-live-input.json");
const collectionApprovalPath = resolve(rootDir, "docs", "catalog-collection-approval.json");
const membershipPollAttempts = Math.max(1, Number(process.env.SALT_COLLECTION_MEMBERSHIP_POLL_ATTEMPTS || 12));
const membershipPollDelayMs = Math.max(1000, Number(process.env.SALT_COLLECTION_MEMBERSHIP_POLL_DELAY_MS || 10_000));
const visionModel = process.env.SALT_CATALOG_VISION_MODEL || "gemma3:4b";
const ollamaUrl = (process.env.SALT_OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
const classificationConcurrency = Math.max(
  1,
  Math.min(8, Number(process.env.SALT_CATALOG_CLASSIFICATION_CONCURRENCY || 3)),
);
const client = createShopifyAdminGraphQLClient({ rootDir, agentName: "catalog-integrity" });

const MANAGED_TAG_PREFIXES = Object.freeze([
  "salt:department:",
  "salt:category:",
  "salt:type:",
  "salt:audience:",
  "salt:feature:",
  "salt:compatibility:",
  COLLECTION_TAG_PREFIX,
  "salt:classification-rule:",
  "salt:classification-source:",
]);

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
  const args = { mode: "dry-run", output: defaultOutputPath, skipVision: false, useLiveCheckpoint: false, reclassify: false };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--apply") args.mode = "apply";
    else if (token === "--dry-run") args.mode = "dry-run";
    else if (token === "--verify") args.mode = "verify";
    else if (token === "--skip-vision") args.skipVision = true;
    else if (token === "--use-live-checkpoint") args.useLiveCheckpoint = true;
    else if (token === "--reclassify") args.reclassify = true;
    else if (token === "--output") {
      if (!next) throw new Error("Missing value for --output");
      args.output = resolve(rootDir, next);
      index += 1;
    } else throw new Error(`Unknown argument: ${token}`);
  }
  if (args.useLiveCheckpoint && args.mode !== "dry-run") {
    throw new Error("--use-live-checkpoint is allowed only for non-mutating dry runs");
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

function isManagedTag(tag) {
  const normalized = normalizeTag(tag);
  return MANAGED_TAG_PREFIXES.some((prefix) => normalized.startsWith(prefix));
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
  if (approval?.scope?.controlledRuleTags !== "exactly one salt:collection:<handle> tag condition per semantic collection") {
    throw new Error("Collection approval does not require exact semantic collection tag conditions.");
  }
  if (approval?.scope?.existingTags !== "preserve unmanaged tags exactly; exact-replace checked-in salt managed namespaces") {
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
    for (const product of asArray(connection.nodes)) {
      products.push(product?.variants?.pageInfo?.hasNextPage ? await completeVariants(product, retryInfo) : product);
    }
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
    title: liveProduct.title,
    body_html: liveProduct.descriptionHtml || localProduct?.body_html || "",
    product_type: liveProduct.productType || localProduct?.product_type || "",
    vendor: liveProduct.vendor || localProduct?.vendor || "",
    status: liveProduct.status,
    tags: asArray(liveProduct.tags),
    created_at: liveProduct.createdAt,
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

async function imageAsBase64(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`image HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer()).toString("base64");
}

async function classifyWithVision(product) {
  const imageUrl = firstImageUrl(product);
  if (!imageUrl) return null;
  try {
    process.stdout.write(`Vision enrichment started for ${product.handle}.\n`);
    const image = await imageAsBase64(resizeImageUrl(imageUrl));
    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(75_000),
      body: JSON.stringify({
        model: visionModel,
        stream: false,
        format: {
          type: "object",
          properties: {
            productName: { type: "string" },
            productCategory: { type: "string" },
            visibleAttributes: { type: "array", items: { type: "string" } },
            rationale: { type: "string" },
          },
          required: ["productName", "productCategory", "visibleAttributes", "rationale"],
        },
        messages: [{
          role: "user",
          content: `Identify the exact retail product shown. Use only visible evidence. Supplier title: ${product.title}. Return a concrete product noun, retail category, up to four visible attributes, and one short rationale.`,
          images: [image],
        }],
        options: { temperature: 0, num_predict: 140 },
        keep_alive: "10m",
      }),
    });
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
    const payload = await response.json();
    const content = JSON.parse(payload?.message?.content || "{}");
    const visualText = [content.productName, content.productCategory, ...asArray(content.visibleAttributes)]
      .map(normalizeText).filter(Boolean).join(" ");
    if (!visualText) return null;
    const visualProduct = {
      ...product,
      title: visualText,
      handle: "",
      body_html: "",
      product_type: content.productCategory || "",
      tags: [],
    };
    const visualClassification = classifyCatalogTaxonomyWithoutOverrides(visualProduct);
    if (visualClassification.ruleId === "unclassified" || visualClassification.reviewRequired) {
      return {
        error: `Visual evidence did not satisfy a checked-in taxonomy rule (${visualClassification.reviewReasons.join(", ") || "unclassified"})`,
        imageUrl,
        visualEvidence: content,
        suggestedRuleId: lexicalBestRule(product, visualText).ruleId,
      };
    }
    const bestRule = visualClassification.ruleId;
    const visionAlignment = assessVisionTaxonomyAlignment(product, bestRule);
    if (!visionAlignment.accepted) {
      process.stdout.write(`Vision enrichment rejected for ${product.handle}: ${visionAlignment.reason}\n`);
      return {
        error: visionAlignment.reason,
        imageUrl,
        visualEvidence: content,
        visionAlignment,
        rejectedRuleId: bestRule,
        suggestedRuleId: lexicalBestRule(product).ruleId,
      };
    }
    const taxonomy = classifyCatalogTaxonomyByRuleId(product, bestRule, {
      source: "local-vision",
      reason: `Local ${visionModel} image evidence: ${normalizeText(content.rationale)}`,
    });
    process.stdout.write(`Vision enrichment completed for ${product.handle}: ${bestRule}.\n`);
    return {
      knowledge: buildProductKnowledgeFromTaxonomy(product, taxonomy),
      source: "vision",
      imageUrl,
      visualEvidence: content,
      visionAlignment,
    };
  } catch (error) {
    process.stdout.write(`Vision enrichment failed for ${product.handle}: ${normalizeText(error?.message || error)}.\n`);
    return { error: normalizeText(error?.message || error), imageUrl };
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

function resolveDeterministicKnowledge(product) {
  const regularKnowledge = classifyProductKnowledge(product);
  if (!regularKnowledge.reviewRequired) {
    return {
      knowledge: regularKnowledge,
      source: regularKnowledge.override ? "approved-override" : "taxonomy",
    };
  }
  return null;
}

function resolveExistingVisionKnowledge(product) {
  const tags = asArray(product?.tags).map((tag) => normalizeTag(tag));
  const source = tags.find((tag) => tag.startsWith("salt:classification-source:"));
  if (source !== "salt:classification-source:vision") return null;
  const ruleTag = tags.find((tag) => tag.startsWith("salt:classification-rule:"));
  const ruleId = ruleTag?.slice("salt:classification-rule:".length) || "";
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
    knowledge: buildProductKnowledgeFromTaxonomy(product, taxonomy),
    source: "existing-vision",
    existingVision: true,
  };
}

async function resolveKnowledge(product, { skipVision }) {
  const directTaxonomy = classifyCatalogTaxonomyWithoutOverrides(product);
  const deterministic = resolveDeterministicKnowledge(product);
  if (deterministic) return deterministic;

  const existingVision = resolveExistingVisionKnowledge(product);
  if (existingVision) return existingVision;

  let vision = null;
  if (!skipVision) {
    vision = await classifyWithVision(product);
    if (vision?.knowledge) return vision;
  }

  const bestRule = directTaxonomy.ruleId !== "unclassified"
    ? directTaxonomy.ruleId
    : vision?.suggestedRuleId || lexicalBestRule(product).ruleId;
  const taxonomy = classifyCatalogTaxonomyByRuleId(product, bestRule, {
    source: "release-guess",
    reason: "Highest-scoring taxonomy rule published only because unresolved classification would otherwise block the release.",
  });
  return {
    knowledge: buildProductKnowledgeFromTaxonomy(product, taxonomy),
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
  for (const assignment of buildSpecialCollectionAssignments(products)) {
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
    if (textIncludesAny(product, ["gift for dad", "fathers day", "father gift"])) set.add("gifts-for-dad");
    if (textIncludesAny(product, ["gift for mom", "mothers day", "mother gift"])) set.add("gifts-for-mom");
    if (textIncludesAny(product, ["gift for senior", "elderly gift", "senior gift"])) set.add("gifts-for-seniors");
    if (textIncludesAny(product, ["housewarming gift", "new home gift"])) set.add("housewarming-gifts");
    if (textIncludesAny(product, ["holiday gift", "christmas gift", "festive gift"])) set.add("holiday-gifts");
  }
  return assignments;
}

function exactTagTask(liveProduct, desiredManagedTags) {
  const existing = uniqueTags(asArray(liveProduct.tags));
  const unmanaged = existing.filter((tag) => !isManagedTag(tag));
  const desired = uniqueTags([...unmanaged, ...desiredManagedTags]);
  const existingSet = new Set(existing.map(normalizeTag));
  const desiredSet = new Set(desired.map(normalizeTag));
  const tagsToAdd = desired.filter((tag) => !existingSet.has(normalizeTag(tag)));
  const tagsToRemove = existing.filter((tag) => !desiredSet.has(normalizeTag(tag)));
  return {
    productId: liveProduct.id,
    handle: liveProduct.handle,
    desiredTags: desired,
    desiredManagedTags: uniqueTags(desiredManagedTags),
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

async function verifyTagBulkResult(resultPath, actionable) {
  const lines = (await readFile(resultPath, "utf8")).split(/\r?\n/).filter(Boolean);
  const completedLines = new Set();
  for (const [fallbackIndex, line] of lines.entries()) {
    const payload = JSON.parse(line);
    const lineNumber = Number.isInteger(Number(payload.__lineNumber)) ? Number(payload.__lineNumber) : fallbackIndex;
    const task = actionable[lineNumber];
    if (!task) throw new Error(`Catalog tag bulk result returned unknown input line ${lineNumber}.`);
    if (asArray(payload?.errors).length) {
      throw new Error(`${task.handle}: ${asArray(payload.errors).map((error) => normalizeText(error?.message)).join(" | ")}`);
    }
    const response = payload?.data?.productUpdate;
    const errors = asArray(response?.userErrors);
    if (errors.length) throw new Error(`${task.handle}: ${formatUserErrors(errors)}`);
    if (!response?.product?.id) throw new Error(`${task.handle}: catalog tag bulk result returned no product id.`);
    task.status = "updated";
    completedLines.add(lineNumber);
  }
  if (completedLines.size !== actionable.length) {
    throw new Error(`Catalog tag bulk result covered ${completedLines.size}/${actionable.length} product inputs.`);
  }
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
  await verifyTagBulkResult(resultPath, actionable);
  manifest.tagBulkOperation = {
    id: operation.id,
    status: operation.status,
    objectCount: Number(operation.objectCount || 0),
    completedAt: operation.completedAt || new Date().toISOString(),
    inputPath,
    resultPath,
  };
  await writeManifest(output, manifest);
  process.stdout.write(`Exact tags applied through Shopify bulk mutation to ${actionable.length} products.\n`);
}

async function verifyExactTags(tasks, retryInfo) {
  const failures = [];
  const taskById = new Map(tasks.map((task) => [task.productId, task]));
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
      const actual = new Set(asArray(product.tags).map(normalizeTag).filter((tag) => MANAGED_TAG_PREFIXES.some((prefix) => tag.startsWith(prefix))));
      const desired = new Set(task.desiredManagedTags.map(normalizeTag));
      const missing = [...desired].filter((tag) => !actual.has(tag));
      const extra = [...actual].filter((tag) => !desired.has(tag));
      if (missing.length || extra.length) failures.push({ handle: task.handle, missing, extra });
      else task.status = task.status === "exact-match" ? "exact-match-verified" : "updated-verified";
    }
    process.stdout.write(`Exact managed tags read back for ${seen.size}/${tasks.length} active products.\n`);
    if (!connection.pageInfo?.hasNextPage) break;
    after = connection.pageInfo?.endCursor;
    if (!after) throw new Error("Exact tag readback pagination has no cursor.");
  }
  for (const task of tasks) if (!seen.has(task.productId)) failures.push({ handle: task.handle, missingActiveProduct: true });
  if (failures.length) throw new Error(`${failures.length} products failed exact managed-tag readback.`);
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

function collectionSourceMatches(policy, collection) {
  const source = asArray(collection?.sources).length === 1 ? collection.sources[0] : null;
  if (!source || source.__typename !== "CollectionConditionsSource" || source.targetType !== "PRODUCTS" || source.inclusion?.matchType !== "ALL") return false;
  const summary = sourceConditionSummary(source);
  if (policy.kind === "semantic") {
    return summary.conditions.length === 1 && summary.conditions[0].type === "tag" &&
      summary.conditions[0].relation === "TAGGED_WITH" && summary.conditions[0].matchType === "ANY" &&
      summary.conditions[0].values.length === 1 && summary.conditions[0].values[0] === normalizeTag(policy.tag);
  }
  if (policy.kind === "price") {
    const desired = [];
    if (Number.isFinite(policy.maximumExclusive)) desired.push({ relation: "LESS_THAN", amount: policy.maximumExclusive });
    if (Number.isFinite(policy.minimumExclusive)) desired.push({ relation: "GREATER_THAN", amount: policy.minimumExclusive });
    return summary.conditions.length === desired.length && desired.every((condition) =>
      summary.conditions.some((actual) => actual.type === "price" && actual.relation === condition.relation && actual.amount === condition.amount && actual.currencyCode === policy.currencyCode),
    );
  }
  return false;
}

function resolveCollectionTargets(collections) {
  const byHandle = new Map(collections.map((collection) => [normalizeCollectionHandle(collection.handle), collection]));
  return [...PRICE_COLLECTION_POLICIES, ...SEMANTIC_COLLECTION_POLICIES].map((policy) => {
    const canonical = byHandle.get(policy.handle);
    const legacy = canonical ? null : policy.legacyHandles.map((handle) => byHandle.get(handle)).find(Boolean) || null;
    const existing = canonical || legacy;
    const metadataNeedsUpdate = Boolean(existing && (normalizeCollectionHandle(existing.handle) !== policy.handle || normalizeText(existing.title) !== policy.title));
    const sourceNeedsUpdate = Boolean(existing && !collectionSourceMatches(policy, existing));
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

function buildCollectionUpdateInput(target) {
  const source = target.policy.kind === "price"
    ? buildPriceCollectionSource(target.policy)
    : buildSemanticCollectionSource(target.policy);
  const input = { id: target.existing.id };
  if (normalizeText(target.existing.title) !== target.policy.title) input.title = target.policy.title;
  if (normalizeCollectionHandle(target.existing.handle) !== target.policy.handle) {
    input.handle = target.policy.handle;
    input.redirectNewHandle = true;
  }
  if (target.sourceNeedsUpdate) {
    input.sourcesToDelete = asArray(target.existing.sources).map((existingSource) => existingSource.id).filter(Boolean);
    input.sourcesToCreate = [{ source }];
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
    const inputPath = output.replace(/\.json$/i, "-collection-bulk-input.jsonl");
    const resultPath = output.replace(/\.json$/i, "-collection-bulk-result.jsonl");
    await writeFile(inputPath, `${updateTargets.map((target) => JSON.stringify({
      collection: buildCollectionUpdateInput(target),
    })).join("\n")}\n`, "utf8");
    const stagedUploadPath = await uploadBulkInput(inputPath, retryInfo, "catalog collection");
    const data = await client.run(BULK_OPERATION_RUN_MUTATION, {
      mutation: BULK_COLLECTION_UPDATE_MUTATION,
      stagedUploadPath,
    }, { allowMutations: true, operation: "start catalog collection bulk operation", retryInfo });
    const errors = asArray(data?.bulkOperationRunMutation?.userErrors);
    if (errors.length) throw new Error(`Catalog collection bulk operation failed to start: ${formatUserErrors(errors)}`);
    const operationId = data?.bulkOperationRunMutation?.bulkOperation?.id;
    if (!operationId) throw new Error("Shopify returned no catalog collection bulk operation id.");
    const operation = await waitForBulkOperation(operationId, retryInfo, "catalog collection");
    if (!operation.url) throw new Error("Completed catalog collection bulk operation returned no result URL.");
    await execFileAsync("curl", ["-sS", "-L", operation.url, "-o", resultPath], {
      cwd: rootDir,
      maxBuffer: 20 * 1024 * 1024,
    });
    await verifyCollectionBulkResult(resultPath, updateTargets);
    manifest.collectionBulkOperation = {
      id: operation.id,
      status: operation.status,
      objectCount: Number(operation.objectCount || 0),
      completedAt: operation.completedAt || new Date().toISOString(),
      inputPath,
      resultPath,
    };
    await writeManifest(output, manifest);
    process.stdout.write(`Canonical collection repairs applied through Shopify bulk mutation to ${updateTargets.length} collections.\n`);
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

async function verifyCollectionMembership({ targets, products, tagTasks, retryInfo }) {
  const membership = await fetchCollectionMembershipBulk(retryInfo);
  const liveCollections = membership.collections;
  const byHandle = new Map(liveCollections.map((collection) => [normalizeCollectionHandle(collection.handle), collection]));
  const expectedByTag = new Map(SEMANTIC_COLLECTION_POLICIES.map((policy) => [normalizeTag(policy.tag), new Set()]));
  const taskByProductId = new Map(tagTasks.map((task) => [task.productId, task]));
  for (const product of products) {
    const task = taskByProductId.get(product.id);
    for (const tag of task?.desiredManagedTags || []) expectedByTag.get(normalizeTag(tag))?.add(product.id);
  }

  const failures = [];
  const actualMembershipByProduct = new Map(products.map((product) => [product.id, new Set()]));
  for (const target of targets) {
    const collection = byHandle.get(target.policy.handle);
    const issues = [];
    if (!collection) issues.push("canonical collection missing");
    else if (!collectionSourceMatches(target.policy, collection)) issues.push("source mismatch");
    let expected = new Set();
    let actual = new Set();
    if (collection) {
      actual = membership.membersByCollectionId.get(collection.id) || new Set();
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
    if (issues.length) failures.push(`${target.policy.handle}: ${issues.join(", ")}`);
  }

  const allProductsCollection = byHandle.get(ALL_PRODUCTS_COLLECTION_POLICY.handle);
  if (!allProductsCollection) failures.push("all-products: collection missing");
  else {
    const members = membership.membersByCollectionId.get(allProductsCollection.id) || new Set();
    for (const id of members) actualMembershipByProduct.get(id)?.add(ALL_PRODUCTS_COLLECTION_POLICY.handle);
  }
  const collectionless = [...actualMembershipByProduct.entries()].filter(([, handles]) => handles.size === 0).map(([id]) => id);
  if (collectionless.length) failures.push(`${collectionless.length} active products are collectionless`);
  return { failures, collectionless, liveCollections, bulkOperation: membership.operation };
}

async function run(args) {
  if (args.mode === "apply") await verifyCollectionApproval();
  const retryInfo = [];
  const priorManifestPath = args.output === defaultOutputPath ? args.output : defaultOutputPath;
  const priorManifest = await readJson(priorManifestPath);
  const priorSnapshot = buildPriorIntegritySnapshot(priorManifest);
  const catalog = await readProductCatalogPayload(resolve(rootDir, "public", "data"));
  let liveProducts;
  let collections;
  let publications;
  if (args.useLiveCheckpoint) {
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
  const dynamicAssignments = await buildDynamicAssignments(products);
  const tagTasks = [];
  const classifications = [];
  const resolvedProducts = new Array(products.length);
  const unresolvedProducts = [];
  for (const [index, product] of products.entries()) {
    const prior = args.reclassify ? null : priorSnapshot?.byHandle.get(normalizeCollectionHandle(product.handle));
    let deterministic = null;
    if (prior) {
      const taxonomy = classifyCatalogTaxonomyByRuleId(product, prior.classification.ruleId, {
        source: `prior-catalog-integrity-${prior.classification.source || "verified"}`,
        reason: "Reused the last completed collection-integrity classification for an unchanged handle.",
      });
      deterministic = {
        knowledge: buildProductKnowledgeFromTaxonomy(product, taxonomy),
        source: prior.classification.source,
        frozenDesiredManagedTags: prior.tagTask.desiredManagedTags,
        priorClassification: prior.classification,
        reused: true,
      };
    } else {
      deterministic = resolveDeterministicKnowledge(product);
    }
    if (deterministic) resolvedProducts[index] = deterministic;
    else unresolvedProducts.push({ index, product });
    if ((index + 1) % 250 === 0 || index + 1 === products.length) {
      process.stdout.write(`Deterministic taxonomy evaluated ${index + 1}/${products.length} products.\n`);
    }
  }
  process.stdout.write(`${unresolvedProducts.length} products require visual enrichment or release-boundary fallback.\n`);
  const unresolvedResolutions = await mapWithConcurrency(
    unresolvedProducts,
    classificationConcurrency,
    (entry) => resolveKnowledge(entry.product, args),
    "Visual resolution processed",
  );
  for (const [index, entry] of unresolvedProducts.entries()) {
    resolvedProducts[entry.index] = unresolvedResolutions[index];
  }

  for (const [index, product] of products.entries()) {
    const resolved = resolvedProducts[index];
    const collectionTags = buildProductCollectionTags(
      product,
      resolved.knowledge,
      dynamicAssignments.get(normalizeCollectionHandle(product.handle)) || new Set(),
    );
    if (!collectionTags.length) {
      throw new Error(`${product.handle} has no semantic collection assignment after classification ${resolved.knowledge.classificationRule}.`);
    }
    const classificationTags = ["vision", "guess", "existing-vision"].includes(resolved.source)
      ? [`salt:classification-rule:${resolved.knowledge.classificationRule}`, `salt:classification-source:${resolved.source === "existing-vision" ? "vision" : resolved.source}`]
      : [];
    const desiredManagedTags = Array.isArray(resolved.frozenDesiredManagedTags)
      ? uniqueTags(resolved.frozenDesiredManagedTags)
      : uniqueTags([
        ...asArray(resolved.knowledge.proposedTags),
        ...collectionTags,
        ...classificationTags,
      ]);
    tagTasks.push(exactTagTask(liveProducts[index], desiredManagedTags));
    classifications.push({
      productId: product.shopifyId,
      handle: product.handle,
      ruleId: resolved.knowledge.classificationRule,
      source: resolved.source,
      confidence: resolved.knowledge.confidence,
      collectionHandles: collectionTags.map((tag) => tag.slice(COLLECTION_TAG_PREFIX.length)),
      reused: Boolean(resolved.reused),
      imageUrl: resolved.imageUrl || resolved.priorClassification?.imageUrl || null,
      visualEvidence: resolved.visualEvidence || resolved.priorClassification?.visualEvidence || null,
      visionAlignment: resolved.visionAlignment || resolved.priorClassification?.visionAlignment || null,
      guessedRuleId: resolved.guessedRuleId || resolved.priorClassification?.guessedRuleId || null,
      visionError: resolved.visionError || resolved.priorClassification?.visionError || null,
    });
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
      uncertainProducts: "local image enrichment first; auditable highest-scoring guess only at the release boundary",
      semanticCollectionRule: "one salt:collection:<handle> tag condition per collection",
      priceCollections: "exact variant-price source plus exact live membership verification",
      collectionlessProducts: "forbidden",
      stableClassification: "reuse the last completed same-version rule and exact managed tag set for unchanged handles",
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
      visionClassified: classifications.filter((entry) => entry.source === "vision").length,
      guessedAssignments: classifications.filter((entry) => entry.source === "guess").length,
      reusedClassifications: classifications.filter((entry) => entry.reused).length,
      collectionlessProducts: null,
      failures: null,
      specialCollectionCounts,
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

  let verification;
  for (let attempt = 1; attempt <= membershipPollAttempts; attempt += 1) {
    verification = await verifyCollectionMembership({ targets, products: liveProducts, tagTasks, retryInfo });
    if (!verification.failures.length) break;
    if (attempt < membershipPollAttempts) {
      process.stdout.write(`Collection propagation incomplete (${verification.failures.length} issues); retrying ${attempt}/${membershipPollAttempts}.\n`);
      await sleep(membershipPollDelayMs);
    }
  }
  manifest.summary.collectionlessProducts = verification.collectionless.length;
  manifest.summary.failures = verification.failures.length;
  manifest.verification = {
    completedAt: new Date().toISOString(),
    failures: verification.failures,
    collectionlessProductIds: verification.collectionless,
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

const args = parseArgs(process.argv);
run(args).catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
