#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  ALL_PRODUCTS_COLLECTION_POLICY,
  COLLECTION_GOVERNANCE_POLICIES,
  PRICE_COLLECTION_POLICIES,
  SEMANTIC_COLLECTION_POLICIES,
  buildPriceCollectionSource,
  canonicalCollectionHandle,
  normalizeCollectionHandle,
  productMatchesSemanticCollection,
  semanticCollectionRuleTags,
} from "../src/lib/catalog-collection-governance.js";
import { classifyCatalogTaxonomyWithoutOverrides } from "../src/lib/catalog-taxonomy.js";
import { asArray, createShopifyAdminGraphQLClient, normalizeText } from "./shopify-admin-graphql-client.mjs";
import { filterMembershipToActiveProducts } from "./shopify-catalog-integrity.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const outputPath = resolve(rootDir, "output", "shopify-collection-classification-audit.json");
const client = createShopifyAdminGraphQLClient({ rootDir, agentName: "collection-classification-audit" });

function parseArgs(argv) {
  const args = {
    strict: process.env.SALT_COLLECTION_AUDIT_STRICT === "1",
    manifestPath: process.env.SALT_COLLECTION_AUDIT_MANIFEST || "output/shopify-catalog-integrity-applied-generation.json",
  };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--strict") args.strict = true;
    else if (token === "--manifest") {
      if (!next) throw new Error("--manifest requires a path");
      args.manifestPath = next;
      index += 1;
    } else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

const COLLECTIONS_QUERY = /* GraphQL */ `
  query CollectionClassificationAuditCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after, query: "status:active") {
      nodes {
        id
        handle
        title
        productsCount { count }
        ruleSet { appliedDisjunctively rules { column relation condition } }
        sources {
          __typename
          ... on CollectionConditionsSource {
            targetType
            inclusion {
              matchType
              conditions {
                __typename
                ... on CollectionSourceInclusionConditionProductTag { relation values matchType }
                ... on CollectionSourceInclusionConditionVariantPrice { relation value { amount currencyCode } }
              }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const ACTIVE_TARGETED_COLLECTION_QUERY = /* GraphQL */ `
  query CollectionClassificationAuditActiveTarget($first: Int!, $after: String, $query: String!) {
    collections(first: $first, query: $query) {
      nodes {
        id
        handle
        title
        sources {
          __typename
          ... on CollectionConditionsSource {
            targetType
            inclusion {
              matchType
              conditions {
                __typename
                ... on CollectionSourceInclusionConditionProductTag { relation values matchType }
                ... on CollectionSourceInclusionConditionVariantPrice { relation value { amount currencyCode } }
              }
            }
          }
        }
        products(first: 250, after: $after) {
          nodes { id }
          pageInfo { hasNextPage endCursor }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const BULK_OPERATION_RUN_QUERY = /* GraphQL */ `
  mutation CollectionClassificationAuditMembership($query: String!) {
    bulkOperationRunQuery(query: $query) {
      bulkOperation { id status }
      userErrors { field message }
    }
  }
`;

const BULK_OPERATION_STATUS_QUERY = /* GraphQL */ `
  query CollectionClassificationAuditBulkStatus($id: ID!) {
    bulkOperation(id: $id) {
      id status errorCode objectCount url createdAt completedAt
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
          products { edges { node { id } } }
        }
      }
    }
  }
`;

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
const targetedReadAttempts = Math.max(2, Math.min(6, Number(process.env.SALT_COLLECTION_AUDIT_TARGETED_ATTEMPTS || 4)));
const targetedReadDelayMs = Math.max(500, Math.min(10_000, Number(process.env.SALT_COLLECTION_AUDIT_TARGETED_DELAY_MS || 1500)));

function numericId(value) {
  return String(value || "").match(/(\d+)$/)?.[1] || "";
}

function idKey(value) {
  return numericId(value) || String(value || "");
}

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function handle(value) {
  return canonicalCollectionHandle(normalizeCollectionHandle(value));
}

function productLabel(product) {
  return {
    id: product?.id || product?.legacyResourceId || null,
    handle: product?.handle || null,
    title: product?.title || null,
    productType: product?.productType || product?.product_type || null,
  };
}

async function fetchCollections() {
  const collections = [];
  let after = null;
  while (true) {
    const data = await client.run(COLLECTIONS_QUERY, { first: 250, after }, {
      operation: `collection classification audit page ${collections.length / 250 + 1}`,
    });
    const connection = data?.collections;
    if (!connection) throw new Error("Shopify returned no collections connection.");
    collections.push(...asArray(connection.nodes));
    if (!connection.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor;
    if (!after) throw new Error("Collection pagination returned no cursor.");
  }
  return collections;
}

async function waitForBulkOperation(operationId) {
  while (true) {
    const data = await client.run(BULK_OPERATION_STATUS_QUERY, { id: operationId }, {
      operation: "collection classification audit bulk status",
    });
    const operation = data?.bulkOperation;
    if (!operation) throw new Error(`Bulk operation not found: ${operationId}`);
    process.stdout.write(`Collection classification audit: ${operation.status}, ${operation.objectCount || 0} objects.\n`);
    if (operation.status === "COMPLETED") return operation;
    if (["FAILED", "CANCELED", "EXPIRED"].includes(operation.status)) {
      throw new Error(`Collection membership audit ended ${operation.status}: ${operation.errorCode || "unknown error"}`);
    }
    await sleep(5000);
  }
}

async function fetchMembership() {
  const started = await client.run(BULK_OPERATION_RUN_QUERY, { query: BULK_COLLECTION_MEMBERSHIP_QUERY }, {
    allowMutations: true,
    operation: "start collection classification membership audit",
  });
  const errors = asArray(started?.bulkOperationRunQuery?.userErrors);
  if (errors.length) throw new Error(errors.map((error) => normalizeText(error?.message)).join("; "));
  const operationId = started?.bulkOperationRunQuery?.bulkOperation?.id;
  if (!operationId) throw new Error("Shopify returned no collection membership audit id.");
  const operation = await waitForBulkOperation(operationId);
  if (!operation.url) throw new Error("Collection membership audit returned no result URL.");
  const response = await fetch(operation.url);
  if (!response.ok) throw new Error(`Collection membership audit download failed (${response.status}).`);

  const collections = [];
  const membersByCollectionId = new Map();
  const text = await response.text();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const node = JSON.parse(line);
    if (node.__parentId) {
      if (!membersByCollectionId.has(node.__parentId)) membersByCollectionId.set(node.__parentId, new Set());
      if (node.id) membersByCollectionId.get(node.__parentId).add(idKey(node.id));
      continue;
    }
    if (!node.id || !node.handle) continue;
    collections.push(node);
    if (!membersByCollectionId.has(node.id)) membersByCollectionId.set(node.id, new Set());
  }
  return { collections, membersByCollectionId, operation };
}

async function fetchTargetedCollection(collectionHandle) {
  const members = new Set();
  let collection = null;
  let after = null;
  while (true) {
    const data = await client.run(ACTIVE_TARGETED_COLLECTION_QUERY, {
      first: 10,
      after,
      query: `status:active handle:${collectionHandle}`,
    }, {
      operation: `targeted active collection audit ${collectionHandle}`,
    });
    collection = asArray(data?.collections?.nodes).find((entry) => handle(entry?.handle) === collectionHandle);
    if (!collection?.id) return null;
    const connection = collection.products;
    if (!connection) throw new Error(`Targeted collection membership audit returned no products for ${collectionHandle}.`);
    for (const product of asArray(connection.nodes)) {
      const id = idKey(product?.id);
      if (id) members.add(id);
    }
    if (!connection.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor;
    if (!after) throw new Error(`Targeted collection membership audit returned no cursor for ${collectionHandle}.`);
    // The handle query is intentionally repeated with the product cursor so
    // source and membership are read from the same active collection view.
  }
  return { collection, members };
}

async function fetchTargetedCollectionUntilExact(collectionHandle, expected) {
  let last = null;
  for (let attempt = 1; attempt <= targetedReadAttempts; attempt += 1) {
    const targeted = await fetchTargetedCollection(collectionHandle);
    if (!targeted) return null;
    const missing = [...expected].filter((id) => !targeted.members.has(id));
    const extra = [...targeted.members].filter((id) => !expected.has(id));
    const sourceExact = sourceMatchesPolicy(
      COLLECTION_GOVERNANCE_POLICIES.find((policy) => handle(policy.handle) === collectionHandle),
      targeted.collection,
    );
    last = { targeted, sourceExact, membershipExact: missing.length === 0 && extra.length === 0, attempt };
    if (sourceExact && last.membershipExact) return last;
    if (attempt < targetedReadAttempts) await sleep(targetedReadDelayMs * Math.min(4, attempt));
  }
  return last;
}

function loadJson(path) {
  return readFile(resolve(rootDir, path), "utf8").then((value) => JSON.parse(value));
}

async function loadLivePriceCheckpoint() {
  const path = resolve(
    rootDir,
    process.env.SALT_CATALOG_INTEGRITY_LIVE_CHECKPOINT || "output/.shopify-catalog-integrity-live-input.json",
  );
  try {
    const checkpoint = await loadJson(path);
    if (checkpoint?.complete && Array.isArray(checkpoint.liveProducts)) {
      return { path, products: checkpoint.liveProducts };
    }
  } catch {
    // Strict mode reports the missing live price source below. Non-strict mode
    // remains useful for local diagnostics and explicitly records its fallback.
  }
  return { path, products: null };
}

function manifestExpectedByProduct(manifest) {
  const expected = new Map();
  for (const classification of asArray(manifest?.classifications)) {
    expected.set(idKey(classification.productId) || classification.handle, new Set(
      asArray(classification.collectionHandles).map(handle).filter(Boolean),
    ));
  }
  return expected;
}

function appliedClassificationEvidence(classification) {
  if (!classification) return null;
  return {
    ...classification,
    // The applied manifest stores the release authority as collectionHandles
    // and ruleId. Normalize it to the governance evidence contract used by
    // productMatchesSemanticCollection without changing the manifest.
    collectionTargets: classification.collectionTargets || classification.collectionHandles || [],
    classificationRule: classification.classificationRule || classification.ruleId || null,
    proposedTags: classification.proposedTags || classification.managedTags || [],
  };
}

function appliedClassificationMatchesPolicy(policy, classification) {
  if (!classification) return false;
  const assigned = new Set([
    ...asArray(classification.collectionHandles),
    ...asArray(classification.collectionTargets),
  ].map(handle).filter(Boolean));
  return [policy.handle, ...asArray(policy.legacyHandles), ...semanticCollectionRuleTags(policy)]
    .map(handle)
    .some((candidate) => assigned.has(candidate));
}

function sourceMatchesPolicy(policy, collection) {
  const sources = asArray(collection?.sources);
  if (sources.length !== 1) return false;
  const source = sources[0];
  const inclusion = source?.inclusion;
  if (source?.__typename !== "CollectionConditionsSource" || source?.targetType !== "PRODUCTS" || !inclusion) return false;
  const conditions = asArray(inclusion.conditions);
  if (policy.kind === "semantic") {
    const expectedTags = new Set(semanticCollectionRuleTags(policy).map(normalizeCollectionHandle));
    const actualTags = new Set(conditions
      .filter((condition) => condition?.__typename === "CollectionSourceInclusionConditionProductTag")
      .filter((condition) => condition.relation === "TAGGED_WITH" && condition.matchType === "ANY")
      .flatMap((condition) => asArray(condition.values).map(normalizeCollectionHandle)));
    const expectedMatchType = expectedTags.size > 1 ? "ANY" : "ALL";
    return inclusion.matchType === expectedMatchType && actualTags.size === expectedTags.size &&
      [...expectedTags].every((tag) => actualTags.has(tag));
  }
  if (policy.kind === "price") {
    if (inclusion.matchType !== "ALL") return false;
    const expected = [];
    const sourceSpec = policy.maximumExclusive !== undefined || policy.minimumExclusive !== undefined
      ? buildPriceCollectionSource(policy)
      : null;
    for (const condition of asArray(sourceSpec?.inclusion?.conditions)) {
      const variantPrice = condition?.variantPrice;
      if (!variantPrice) continue;
      expected.push({
        relation: variantPrice.relation,
        amount: String(variantPrice.value?.amount || ""),
        currencyCode: variantPrice.value?.currencyCode || null,
      });
    }
    const actual = conditions
      .filter((condition) => condition?.__typename === "CollectionSourceInclusionConditionVariantPrice")
      .map((condition) => ({
        relation: condition.relation,
        amount: String(condition.value?.amount || ""),
        currencyCode: condition.value?.currencyCode || null,
      }));
    const sameAmount = (left, right) => {
      const leftNumber = Number(left);
      const rightNumber = Number(right);
      return Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
        ? leftNumber === rightNumber
        : left === right;
    };
    return actual.length === expected.length && expected.every((condition) => actual.some((candidate) =>
      candidate.relation === condition.relation && sameAmount(candidate.amount, condition.amount) && candidate.currencyCode === condition.currencyCode));
  }
  return false;
}

function buildTaxonomyExpected(products, livePriceProducts = null) {
  const expectedByProduct = new Map();
  const deterministic = new Map();
  const liveByKey = new Map();
  for (const product of asArray(livePriceProducts)) {
    const key = idKey(product?.id) || product?.handle;
    if (key) liveByKey.set(key, product);
    if (product?.handle) liveByKey.set(product.handle, product);
  }
  let livePriceProductsUsed = 0;
  const missingLivePriceProducts = new Set();
  for (const product of products) {
    const classification = classifyCatalogTaxonomyWithoutOverrides(product);
    deterministic.set(idKey(product.id || product.legacyResourceId) || product.handle, classification);
    const expected = new Set([ALL_PRODUCTS_COLLECTION_POLICY.handle]);
    for (const policy of SEMANTIC_COLLECTION_POLICIES) {
      if (policy.match?.dynamic) continue;
      if (productMatchesSemanticCollection(policy, product, classification)) expected.add(policy.handle);
    }
    const key = idKey(product.id || product.legacyResourceId) || product.handle;
    const liveProduct = liveByKey.get(key) || liveByKey.get(product.handle);
    if (livePriceProducts) {
      if (liveProduct) livePriceProductsUsed += 1;
      else missingLivePriceProducts.add(key);
    }
    for (const policy of PRICE_COLLECTION_POLICIES) {
      const variants = Array.isArray(liveProduct?.variants?.nodes)
        ? liveProduct.variants.nodes
        : Array.isArray(liveProduct?.variants)
          ? liveProduct.variants
          : Array.isArray(product.variants?.nodes)
            ? product.variants.nodes
            : Array.isArray(product.variants)
              ? product.variants
              : [];
      if (variants.some((variant) => {
        const price = Number(variant?.price);
        return Number.isFinite(price) &&
          (!Number.isFinite(policy.maximumExclusive) || price < policy.maximumExclusive) &&
          (!Number.isFinite(policy.minimumExclusive) || price > policy.minimumExclusive);
      })) expected.add(policy.handle);
    }
    expectedByProduct.set(idKey(product.id || product.legacyResourceId) || product.handle, expected);
  }
  return { expectedByProduct, deterministic, livePriceProductsUsed, missingLivePriceProducts: [...missingLivePriceProducts] };
}

function sortIssues(issues) {
  return [...issues].sort((left, right) => {
    const score = (entry) => (entry.missingCount || 0) + (entry.extraCount || 0) + (entry.conflictCount || 0);
    return score(right) - score(left) || String(left.handle).localeCompare(String(right.handle));
  });
}

async function run() {
  const args = parseArgs(process.argv);
  process.stdout.write("Loading local catalog and prior classification plan.\n");
  const [source, manifest] = await Promise.all([
    loadJson("output/release-catalog-source.json"),
    loadJson(args.manifestPath),
  ]);
  const products = asArray(source?.products).filter((product) => String(product?.status || "ACTIVE").toUpperCase() === "ACTIVE");
  if (!products.length) throw new Error("Local active catalog is empty.");

  process.stdout.write(`Auditing ${products.length} local active products against live Shopify memberships.\n`);
  const [liveCollections, membership, livePriceCheckpoint] = await Promise.all([
    fetchCollections(),
    fetchMembership(),
    loadLivePriceCheckpoint(),
  ]);
  const liveByHandle = new Map(liveCollections.map((collection) => [handle(collection.handle), collection]));

  const productById = new Map();
  for (const product of products) {
    const key = idKey(product.id || product.legacyResourceId) || product.handle;
    productById.set(key, product);
  }
  const activeProductIds = new Set(productById.keys());
  const liveMembersByHandle = new Map();
  const outOfScopeMemberships = [];
  for (const collection of membership.collections) {
    const rawMembers = membership.membersByCollectionId.get(collection.id) || new Set();
    const activeMembers = filterMembershipToActiveProducts(rawMembers, activeProductIds);
    const outOfScopeProductIds = [...rawMembers]
      .map(idKey)
      .filter((id) => id && !activeProductIds.has(id));
    if (outOfScopeProductIds.length) {
      outOfScopeMemberships.push({
        collectionHandle: handle(collection.handle),
        productIds: outOfScopeProductIds,
        count: outOfScopeProductIds.length,
      });
    }
    liveMembersByHandle.set(handle(collection.handle), activeMembers);
  }

  const manifestExpected = manifestExpectedByProduct(manifest);
  const {
    expectedByProduct: taxonomyExpected,
    deterministic,
    livePriceProductsUsed,
    missingLivePriceProducts,
  } = buildTaxonomyExpected(products, livePriceCheckpoint.products);
  const appliedClassifications = new Map(asArray(manifest?.classifications).map((classification) => [
    idKey(classification?.productId) || classification?.handle,
    classification,
  ]));
  const governed = COLLECTION_GOVERNANCE_POLICIES.filter((policy) => policy.kind !== "catalog-boundary");
  const collectionIssues = [];
  const evidenceConflicts = [];
  const mismatchProducts = new Set();
  const manifestProductKeys = new Set(manifestExpected.keys());
  const missingManifestProducts = products
    .map((product) => idKey(product.id || product.legacyResourceId) || product.handle)
    .filter((key) => !manifestProductKeys.has(key));

  for (const policy of governed) {
    const collectionHandle = handle(policy.handle);
    let liveCollection = liveByHandle.get(collectionHandle);
    let actual = liveMembersByHandle.get(collectionHandle) || new Set();
    const expectedFromPlan = new Set();
    for (const [key, handles] of manifestExpected) if (handles.has(collectionHandle)) expectedFromPlan.add(key);
    // The applied catalog-integrity manifest is the release authority for
    // semantic and merchandising memberships. The no-override classifier is
    // retained below as a diagnostic, not as a second competing write plan.
    const expected = policy.kind === "price"
      ? new Set([...taxonomyExpected].filter(([, handles]) => handles.has(collectionHandle)).map(([key]) => key))
      : expectedFromPlan;
    let missing = [...expected].filter((id) => !actual.has(id));
    let extra = [...actual].filter((id) => !expected.has(id));
    let ruleMatches = sourceMatchesPolicy(policy, liveCollection);
    let targetedReadback = null;
    if (liveCollection && (!ruleMatches || missing.length || extra.length)) {
      // Shopify's collection bulk export can lag the collection connection
      // after a smart-source replacement. Re-read only the affected governed
      // collection before failing; this remains a strict exact readback.
      const targetedResult = await fetchTargetedCollectionUntilExact(collectionHandle, expected);
      if (targetedResult) {
        const { targeted, sourceExact, membershipExact, attempt } = targetedResult;
        targetedReadback = {
          attempted: true,
          attempts: attempt,
          sourceExact,
          membershipExact,
        };
        liveCollection = targeted.collection;
        actual = filterMembershipToActiveProducts(targeted.members, activeProductIds);
        liveByHandle.set(collectionHandle, liveCollection);
        liveMembersByHandle.set(collectionHandle, actual);
        missing = [...expected].filter((id) => !actual.has(id));
        extra = [...actual].filter((id) => !expected.has(id));
        ruleMatches = sourceExact;
      }
    }
    if (!liveCollection || !ruleMatches || missing.length || extra.length) {
      collectionIssues.push({
        handle: collectionHandle,
        title: policy.title,
        kind: policy.kind,
        liveCount: actual.size,
        expectedCount: expected.size,
        missingCount: missing.length,
        extraCount: extra.length,
        ruleMatches,
        missing: missing.slice(0, 100).map((id) => productLabel(productById.get(id))),
        extra: extra.slice(0, 100).map((id) => productLabel(productById.get(id))),
        liveRuleSet: liveCollection?.ruleSet || null,
        liveSources: liveCollection?.sources || null,
        targetedReadback,
        status: !liveCollection ? "missing-collection" : !ruleMatches ? "rule-mismatch" : "membership-mismatch",
      });
      for (const id of [...missing, ...extra]) mismatchProducts.add(id);
    }

    if (policy.kind !== "semantic" || policy.match?.dynamic) continue;
    for (const id of actual) {
      const product = productById.get(id);
      if (!product) continue;
      const applied = appliedClassifications.get(id);
      const classification = appliedClassificationEvidence(applied) || deterministic.get(id);
      const matches = applied
        ? appliedClassificationMatchesPolicy(policy, applied)
        : productMatchesSemanticCollection(policy, product, classification);
      if (!classification || !matches) {
        evidenceConflicts.push({
          collectionHandle,
          collectionTitle: policy.title,
          product: productLabel(product),
          deterministic: classification ? {
            ruleId: classification.ruleId,
            departmentId: classification.departmentId,
            categoryId: classification.categoryId,
            subcategoryId: classification.subcategoryId,
            audience: classification.audience?.id || null,
            confidence: classification.confidence,
            reviewRequired: classification.reviewRequired,
          } : null,
          reason: "Live member does not satisfy the current deterministic collection policy.",
        });
      }
    }
  }

  const collectionless = [];
  const allProductsMembers = liveMembersByHandle.get(ALL_PRODUCTS_COLLECTION_POLICY.handle) || new Set();
  for (const product of products) {
    const key = idKey(product.id || product.legacyResourceId) || product.handle;
    if (!allProductsMembers.has(key)) collectionless.push(productLabel(product));
  }

  const named = new Map();
  for (const target of [
    "iphone-cases",
    "men-t-shirt",
    "home-decor",
    "home-safety",
    "staff-picks",
    "trending-finds",
    "gifts-for-seniors",
    "artificial-plants",
    "housewarming-gifts",
    "sleep-essentials",
    "pet-toys",
    "pet-grooming",
    "pet-feeding",
    "pet-travel",
    "cat-supplies",
    "dog-supplies",
    "hats",
    "gifts-for-dad",
    "gifts-for-mom",
    "daily-living-aids",
    "senior-living-solutions",
    "candles",
    "school-bags",
    "lunch-boxes",
    "water-bottles",
    "back-to-school",
    "stationery",
    "massage-tools",
    "relaxation-products",
    "medical-accessories",
    "pet-essentials",
    "garden-tools",
  ]) {
    const issue = collectionIssues.find((entry) => entry.handle === target);
    const evidence = evidenceConflicts.filter((entry) => entry.collectionHandle === target);
    const actual = liveMembersByHandle.get(target) || new Set();
    named.set(target, {
      liveCount: actual.size,
      expectedCount: issue?.expectedCount ?? [...manifestExpected.values()].filter((handles) => handles.has(target)).length,
      missingCount: issue?.missingCount || 0,
      extraCount: issue?.extraCount || 0,
      evidenceConflictCount: evidence.length,
      examples: evidence.slice(0, 25),
      membershipIssue: issue || null,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "read-only-live-membership-and-deterministic-taxonomy-audit",
    source: {
      activeProducts: products.length,
      manifestGeneratedAt: manifest.generatedAt || null,
      manifestSummary: manifest.summary || null,
      manifestPath: args.manifestPath,
    },
    live: {
      collections: liveCollections.length,
      membershipCollections: membership.collections.length,
      membershipObjects: membership.operation?.objectCount || null,
      outOfScopeMemberships,
      priceCheckpoint: {
        path: livePriceCheckpoint.path,
        complete: Array.isArray(livePriceCheckpoint.products),
        liveProducts: livePriceCheckpoint.products?.length || 0,
        matchedLocalProducts: livePriceProductsUsed,
        missingLocalProducts: missingLivePriceProducts.length,
      },
    },
    namedCollections: Object.fromEntries(named),
    summary: {
      governedCollectionsAudited: governed.length,
      collectionsWithMembershipIssues: collectionIssues.length,
      evidenceConflicts: evidenceConflicts.length,
      productsAffectedByMembershipDiff: mismatchProducts.size,
      collectionlessActiveProducts: collectionless.length,
      missingManifestProducts: missingManifestProducts.length,
      missingLivePriceProducts: missingLivePriceProducts.length,
      ruleMismatches: collectionIssues.filter((issue) => issue.status === "rule-mismatch").length,
      deterministicEvidenceConflicts: evidenceConflicts.length,
      liveCollectionsNotInGovernance: liveCollections
        .map((collection) => handle(collection.handle))
        .filter((collectionHandle) => collectionHandle && !governed.some((policy) => policy.handle === collectionHandle) && collectionHandle !== "all-products")
        .sort(),
    },
    collectionIssues: sortIssues(collectionIssues),
    evidenceConflicts: evidenceConflicts.slice(0, 2000),
    collectionless: collectionless.slice(0, 200),
    policy: {
      noWritesPerformed: true,
      liveMembershipComparedTo: "the applied catalog-integrity manifest for semantic and merchandising collections; deterministic live variant prices for price collections",
      strictMode: args.strict,
      deterministicEvidenceConflictsAreDiagnostic: false,
      dynamicCollections: governed.filter((policy) => policy.kind === "semantic" && policy.match?.dynamic).map((policy) => policy.handle),
      productNotFoundInLocalCatalog: "excluded from product-level examples but retained in collection counts",
      priceEvidence: livePriceCheckpoint.products
        ? "complete live variant checkpoint"
        : "local snapshot fallback (non-strict diagnostic only)",
    },
  };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  process.stdout.write(`Audit complete: ${collectionIssues.length} live collection issues, ${evidenceConflicts.length} deterministic evidence conflicts, ${collectionless.length} collectionless products.\n`);
  process.stdout.write(`Saved ${outputPath}\n`);
  for (const [collectionHandle, details] of named) {
    process.stdout.write(`${collectionHandle}: live=${details.liveCount}, expected=${details.expectedCount}, missing=${details.missingCount}, extra=${details.extraCount}, evidenceConflicts=${details.evidenceConflictCount}\n`);
  }

  if (args.strict) {
    const strictFailures = [
      ...(missingManifestProducts.length ? [`manifest missing ${missingManifestProducts.length} active products`] : []),
      ...(!livePriceCheckpoint.products ? ["complete live variant checkpoint is missing"] : []),
      ...(missingLivePriceProducts.length ? [`live price checkpoint missing ${missingLivePriceProducts.length} local products`] : []),
      ...(collectionIssues.length ? [`${collectionIssues.length} governed collection live drift issue(s)`] : []),
      ...(evidenceConflicts.length ? [`${evidenceConflicts.length} deterministic collection evidence conflict(s)`] : []),
      ...(collectionless.length ? [`${collectionless.length} collectionless active products`] : []),
    ];
    if (strictFailures.length) throw new Error(`Strict collection audit failed: ${strictFailures.join("; ")}. See ${outputPath}`);
    process.stdout.write("Strict collection audit passed: applied memberships, collection rules, and catalog coverage are exact.\n");
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
