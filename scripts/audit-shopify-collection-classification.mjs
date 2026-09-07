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
    collections(first: $first, after: $after) {
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

function loadJson(path) {
  return readFile(resolve(rootDir, path), "utf8").then((value) => JSON.parse(value));
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

function buildTaxonomyExpected(products) {
  const expectedByProduct = new Map();
  const deterministic = new Map();
  for (const product of products) {
    const classification = classifyCatalogTaxonomyWithoutOverrides(product);
    deterministic.set(idKey(product.id || product.legacyResourceId) || product.handle, classification);
    const expected = new Set([ALL_PRODUCTS_COLLECTION_POLICY.handle]);
    for (const policy of SEMANTIC_COLLECTION_POLICIES) {
      if (policy.match?.dynamic) continue;
      if (productMatchesSemanticCollection(policy, product, classification)) expected.add(policy.handle);
    }
    for (const policy of PRICE_COLLECTION_POLICIES) {
      const variants = Array.isArray(product.variants?.nodes) ? product.variants.nodes : Array.isArray(product.variants) ? product.variants : [];
      if (variants.some((variant) => {
        const price = Number(variant?.price);
        return Number.isFinite(price) &&
          (!Number.isFinite(policy.maximumExclusive) || price < policy.maximumExclusive) &&
          (!Number.isFinite(policy.minimumExclusive) || price > policy.minimumExclusive);
      })) expected.add(policy.handle);
    }
    expectedByProduct.set(idKey(product.id || product.legacyResourceId) || product.handle, expected);
  }
  return { expectedByProduct, deterministic };
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
  const [liveCollections, membership] = await Promise.all([fetchCollections(), fetchMembership()]);
  const liveByHandle = new Map(liveCollections.map((collection) => [handle(collection.handle), collection]));
  const liveMembersByHandle = new Map();
  for (const collection of membership.collections) {
    liveMembersByHandle.set(handle(collection.handle), membership.membersByCollectionId.get(collection.id) || new Set());
  }

  const productById = new Map();
  for (const product of products) {
    const key = idKey(product.id || product.legacyResourceId) || product.handle;
    productById.set(key, product);
  }

  const manifestExpected = manifestExpectedByProduct(manifest);
  const { expectedByProduct: taxonomyExpected, deterministic } = buildTaxonomyExpected(products);
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
    const liveCollection = liveByHandle.get(collectionHandle);
    const actual = liveMembersByHandle.get(collectionHandle) || new Set();
    const expectedFromPlan = new Set();
    for (const [key, handles] of manifestExpected) if (handles.has(collectionHandle)) expectedFromPlan.add(key);
    // The applied catalog-integrity manifest is the release authority for
    // semantic and merchandising memberships. The no-override classifier is
    // retained below as a diagnostic, not as a second competing write plan.
    const expected = policy.kind === "price"
      ? new Set([...taxonomyExpected].filter(([, handles]) => handles.has(collectionHandle)).map(([key]) => key))
      : expectedFromPlan;
    const missing = [...expected].filter((id) => !actual.has(id));
    const extra = [...actual].filter((id) => !expected.has(id));
    const ruleMatches = sourceMatchesPolicy(policy, liveCollection);
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
        status: !liveCollection ? "missing-collection" : !ruleMatches ? "rule-mismatch" : "membership-mismatch",
      });
      for (const id of [...missing, ...extra]) mismatchProducts.add(id);
    }

    if (policy.kind !== "semantic" || policy.match?.dynamic) continue;
    for (const id of actual) {
      const product = productById.get(id);
      if (!product) continue;
      const classification = deterministic.get(id);
      if (!classification || !productMatchesSemanticCollection(policy, product, classification)) {
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
  for (const target of ["iphone-cases", "men-t-shirt", "home-decor"]) {
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
    },
    namedCollections: Object.fromEntries(named),
    summary: {
      governedCollectionsAudited: governed.length,
      collectionsWithMembershipIssues: collectionIssues.length,
      evidenceConflicts: evidenceConflicts.length,
      productsAffectedByMembershipDiff: mismatchProducts.size,
      collectionlessActiveProducts: collectionless.length,
      missingManifestProducts: missingManifestProducts.length,
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
      deterministicEvidenceConflictsAreDiagnostic: true,
      dynamicCollections: governed.filter((policy) => policy.kind === "semantic" && policy.match?.dynamic).map((policy) => policy.handle),
      productNotFoundInLocalCatalog: "excluded from product-level examples but retained in collection counts",
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
      ...(collectionIssues.length ? [`${collectionIssues.length} governed collection live drift issue(s)`] : []),
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
