#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  buildManagedTagAdditions,
  isActiveShopifyProduct,
  isOnlineStorePublishedLiveProduct,
} from "../src/lib/catalog-taxonomy-release.js";
import { classifyProductKnowledge } from "../src/lib/product-knowledge-base.js";
import { createShopifyAdminGraphQLClient } from "./shopify-admin-graphql-client.mjs";
import { readProductCatalogPayload } from "./product-catalog-files.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const dataDir = resolve(rootDir, "public", "data");
const approvalPath = resolve(rootDir, "docs", "catalog-collection-merge-approval.json");
const outputPath = resolve(rootDir, "output", "catalog-collection-merge-manifest.json");
const dryRun = process.argv.includes("--dry-run");
const batchSize = Math.max(1, Math.min(50, Number(process.env.SALT_COLLECTION_MERGE_BATCH_SIZE || 25)));
const client = createShopifyAdminGraphQLClient({ rootDir, agentName: "collection-merges" });

const MERGE_PLAN = Object.freeze([
  { sourceHandle: "caregiver-essentials", targetHandle: "health-wellness", mode: "taxonomy", targetRuleTag: "salt:category:health-wellness" },
  { sourceHandle: "mobility-support", targetHandle: "health-wellness", mode: "taxonomy", targetRuleTag: "salt:category:health-wellness" },
  { sourceHandle: "posture-support", targetHandle: "health-wellness", mode: "taxonomy", targetRuleTag: "salt:category:health-wellness" },
  { sourceHandle: "camping-gear", targetHandle: "travel-outdoor", mode: "taxonomy", targetRuleTag: "salt:department:camping-travel" },
  { sourceHandle: "holiday-gifts", targetHandle: "gifts", mode: "source-union" },
  { sourceHandle: "viral-tiktok-products", targetHandle: "unique-products", mode: "source-union" },
]);

const COLLECTIONS_QUERY = /* GraphQL */ `
  query MergeCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after) {
      nodes {
        id
        handle
        title
        productsCount { count }
        sources {
          __typename
          ... on CollectionConditionsSource {
            id
            title
            description
            shareable
            targetType
            inclusion {
              matchType
              conditions {
                __typename
                id
                ... on CollectionSourceInclusionConditionProductTag {
                  relation
                  values
                  matchType
                }
                ... on CollectionSourceInclusionConditionProductTitle {
                  relation
                  values
                  matchType
                }
                ... on CollectionSourceInclusionConditionProductCategory {
                  relation
                  values {
                    category { id }
                    includeDescendants
                  }
                  matchType
                }
              }
            }
          }
        }
        resourcePublications(first: 250) {
          nodes {
            isPublished
            channel { name }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const COLLECTION_PRODUCTS_QUERY = /* GraphQL */ `
  query MergeCollectionProducts($query: String!, $first: Int!, $after: String) {
    collections(first: 1, query: $query) {
      nodes {
        handle
        products(first: $first, after: $after) {
          nodes {
            id
            legacyResourceId
            tags
            status
            resourcePublications(first: 100) {
              nodes { isPublished channel { name } }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

const PUBLICATIONS_QUERY = /* GraphQL */ `
  query MergePublications {
    publications(first: 250) {
      nodes { id name }
    }
  }
`;

const PRODUCT_TAGS_QUERY = /* GraphQL */ `
  query MergeProductTags($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product { id tags }
    }
  }
`;

const TAGS_ADD_MUTATION = /* GraphQL */ `
  mutation MergeTagsAdd($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) {
      userErrors { field message }
    }
  }
`;

const COLLECTION_UPDATE_MUTATION = /* GraphQL */ `
  mutation MergeCollectionUpdate($collection: CollectionUpdateInput!) {
    collectionUpdate(collection: $collection) {
      collection { id handle title }
      userErrors { field message }
    }
  }
`;

const UNPUBLISH_COLLECTION_MUTATION = /* GraphQL */ `
  mutation MergeCollectionUnpublish($id: ID!, $input: [PublicationInput!]!) {
    publishableUnpublish(id: $id, input: $input) {
      publishable { ... on Collection { id } }
      userErrors { field message }
    }
  }
`;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function formatUserErrors(errors) {
  return asArray(errors)
    .map((entry) => `${asArray(entry?.field).join(".") || "collection"}: ${entry?.message || "Unknown Shopify error"}`)
    .join(" | ");
}

function isOnlineStoreCollection(collection) {
  return asArray(collection?.resourcePublications?.nodes).some(
    (publication) => publication?.isPublished === true && normalize(publication?.channel?.name) === "online store",
  );
}

function productId(product) {
  const legacy = Number(product?.legacyResourceId);
  if (Number.isFinite(legacy) && legacy > 0) return legacy;
  const match = String(product?.id || "").match(/\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

function categoryConditionValue(value) {
  const categoryId = value?.category?.id || value?.categoryId;
  if (!categoryId) return null;
  return {
    categoryId,
    includeDescendants: value?.includeDescendants === true,
  };
}

function conditionValueKeys(condition) {
  if (condition?.__typename === "CollectionSourceInclusionConditionProductCategory") {
    return asArray(condition.values)
      .map(categoryConditionValue)
      .filter(Boolean)
      .map((value) => `${value.categoryId}:${value.includeDescendants ? "descendants" : "self"}`);
  }
  return asArray(condition?.values).map(normalize);
}

function conditionKey(condition) {
  return [
    condition?.__typename || "",
    condition?.relation || "",
    condition?.matchType || "",
    ...conditionValueKeys(condition).sort(),
  ].join("|");
}

function conditionInput(condition) {
  const value = {
    relation: condition.relation,
    values: condition.__typename === "CollectionSourceInclusionConditionProductCategory"
      ? asArray(condition.values).map(categoryConditionValue).filter(Boolean)
      : asArray(condition.values),
    matchType: condition.matchType,
  };
  if (!value.values.length) throw new Error(`Collection merge condition has no usable values: ${condition.__typename}`);
  if (condition.__typename === "CollectionSourceInclusionConditionProductTag") return { productTag: value };
  if (condition.__typename === "CollectionSourceInclusionConditionProductTitle") return { productTitle: value };
  if (condition.__typename === "CollectionSourceInclusionConditionProductCategory") return { productCategory: value };
  throw new Error(`Unsupported collection merge condition: ${condition.__typename || "unknown"}`);
}

function sourceConditions(source) {
  return asArray(source?.inclusion?.conditions);
}

function buildUnionSource(target, source) {
  const conditions = [];
  const seen = new Set();
  for (const condition of [...sourceConditions(target), ...sourceConditions(source)]) {
    const key = conditionKey(condition);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    conditions.push(conditionInput(condition));
  }
  if (!conditions.length) throw new Error("Cannot merge collections without source conditions.");
  return {
    title: `SALT merged collection rules`,
    description: "Existing merchandising conditions preserved and merged with the approved legacy collection rule.",
    targetType: "PRODUCTS",
    inclusion: { matchType: "ANY", conditions },
  };
}

function sourceMatchesUnion(source, expectedSource) {
  const actual = new Set(sourceConditions(source).map(conditionKey));
  const expected = new Set(
    expectedSource.inclusion.conditions.flatMap((condition) => {
      const key = conditionKey({
        __typename: Object.keys(condition)[0] === "productTag"
          ? "CollectionSourceInclusionConditionProductTag"
          : Object.keys(condition)[0] === "productTitle"
            ? "CollectionSourceInclusionConditionProductTitle"
            : "CollectionSourceInclusionConditionProductCategory",
        ...condition[Object.keys(condition)[0]],
      });
      return key ? [key] : [];
    }),
  );
  return source?.__typename === "CollectionConditionsSource" &&
    source?.inclusion?.matchType === "ANY" &&
    expected.size === actual.size &&
    [...expected].every((key) => actual.has(key));
}

async function readApproval() {
  const approval = JSON.parse(await readFile(approvalPath, "utf8"));
  const expectedId = process.env.SALT_CATALOG_COLLECTION_MERGE_APPROVAL_ID || approval.approvalId;
  if (!approval.approved || approval.approvalId !== expectedId) {
    throw new Error(`Collection merge approval is missing or does not match ${expectedId}.`);
  }
  if (!dryRun && process.env.SALT_CATALOG_COLLECTION_MERGES_APPROVED !== "1") {
    throw new Error("Set SALT_CATALOG_COLLECTION_MERGES_APPROVED=1 for the live collection merge.");
  }
  return approval;
}

async function fetchCollections() {
  const result = [];
  let after = null;
  while (true) {
    const data = await client.run(COLLECTIONS_QUERY, { first: 250, after }, { operation: "read collection merge targets" });
    result.push(...asArray(data?.collections?.nodes));
    if (!data?.collections?.pageInfo?.hasNextPage) break;
    after = data.collections.pageInfo.endCursor;
  }
  return result;
}

async function fetchCollectionProducts(handle) {
  const result = [];
  let after = null;
  while (true) {
    const data = await client.run(
      COLLECTION_PRODUCTS_QUERY,
      { query: `handle:${handle}`, first: 250, after },
      { operation: `read merge products ${handle}` },
    );
    const collection = asArray(data?.collections?.nodes).find((entry) => entry.handle === handle);
    if (!collection) throw new Error(`Collection ${handle} was not found while reading products.`);
    result.push(...asArray(collection.products?.nodes));
    if (!collection.products?.pageInfo?.hasNextPage) break;
    after = collection.products.pageInfo.endCursor;
  }
  return result;
}

async function fetchPublications() {
  const data = await client.run(PUBLICATIONS_QUERY, {}, { operation: "read collection merge publications" });
  return asArray(data?.publications?.nodes);
}

async function addTags(tasks) {
  for (let index = 0; index < tasks.length; index += batchSize) {
    for (const task of tasks.slice(index, index + batchSize)) {
      const data = await client.run(TAGS_ADD_MUTATION, { id: task.productId, tags: task.tagsToAdd }, {
        allowMutations: true,
        operation: `add merge taxonomy tag ${task.handle}`,
      });
      const errors = asArray(data?.tagsAdd?.userErrors);
      if (errors.length) throw new Error(`${task.handle}: ${formatUserErrors(errors)}`);
    }
  }
}

async function verifyAddedTags(tasks) {
  for (let index = 0; index < tasks.length; index += batchSize) {
    const ids = tasks.slice(index, index + batchSize).map((task) => task.productId);
    const data = await client.run(PRODUCT_TAGS_QUERY, { ids }, { operation: "verify merge taxonomy tags" });
    const byId = new Map(asArray(data?.nodes).map((product) => [product?.id, product]));
    for (const task of tasks.slice(index, index + batchSize)) {
      const tags = new Set(asArray(byId.get(task.productId)?.tags).map(normalize));
      const missing = task.tagsToAdd.filter((tag) => !tags.has(normalize(tag)));
      if (missing.length) throw new Error(`${task.handle}: missing merge tag ${missing.join(", ")}`);
    }
  }
}

async function unionTargetSource(target, expectedSource) {
  const currentSource = target.sources?.length === 1 ? target.sources[0] : null;
  if (!currentSource || currentSource.__typename !== "CollectionConditionsSource") {
    throw new Error(`${target.handle}: target must have one conditions source before merge.`);
  }
  if (sourceMatchesUnion(currentSource, expectedSource)) return false;
  const data = await client.run(COLLECTION_UPDATE_MUTATION, {
    collection: {
      id: target.id,
      sourcesToDelete: [currentSource.id],
      sourcesToCreate: [{ source: expectedSource }],
    },
  }, { allowMutations: true, operation: `union collection ${target.handle}` });
  const errors = asArray(data?.collectionUpdate?.userErrors);
  if (errors.length) throw new Error(`${target.handle}: ${formatUserErrors(errors)}`);
  return true;
}

async function unpublishCollection(collectionId, publicationId, handle) {
  const data = await client.run(UNPUBLISH_COLLECTION_MUTATION, {
    id: collectionId,
    input: [{ publicationId }],
  }, { allowMutations: true, operation: `remove merged collection ${handle} from Online Store` });
  const errors = asArray(data?.publishableUnpublish?.userErrors);
  if (errors.length) throw new Error(`${handle}: ${formatUserErrors(errors)}`);
}

async function writeManifest(manifest) {
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function main() {
  const approval = await readApproval();
  const [catalog, collections, publications] = await Promise.all([
    readProductCatalogPayload(dataDir),
    fetchCollections(),
    fetchPublications(),
  ]);
  const byHandle = new Map(collections.map((collection) => [collection.handle, collection]));
  const onlineStorePublication = publications.find((publication) => normalize(publication.name) === "online store");
  if (!onlineStorePublication) throw new Error("Online Store publication was not found.");
  const localById = new Map(asArray(catalog.products).map((product) => [Number(product.id), product]));
  const productCache = new Map();
  const targetProductsCache = new Map();
  const rows = [];
  const tagTasks = [];
  const unionActions = [];

  for (const plan of MERGE_PLAN) {
    const source = byHandle.get(plan.sourceHandle);
    const target = byHandle.get(plan.targetHandle);
    if (!source || !target) throw new Error(`Missing merge collection ${plan.sourceHandle} or ${plan.targetHandle}.`);
    const sourceProducts = await fetchCollectionProducts(plan.sourceHandle);
    if (!targetProductsCache.has(plan.targetHandle)) {
      targetProductsCache.set(plan.targetHandle, await fetchCollectionProducts(plan.targetHandle));
    }
    const targetProducts = targetProductsCache.get(plan.targetHandle);
    const targetIds = new Set(targetProducts.map((product) => String(product.id)));
    const expectedTargetIds = new Set();
    let eligibleForTarget = 0;
    let onlineSourceProducts = 0;

    for (const product of sourceProducts) {
      const id = productId(product);
      if (!Number.isFinite(id)) continue;
      if (isOnlineStorePublishedLiveProduct(product)) onlineSourceProducts += 1;
      if (targetIds.has(product.id)) expectedTargetIds.add(product.id);
      const localProduct = localById.get(id);
      if (plan.mode !== "taxonomy" || !localProduct || !isOnlineStorePublishedLiveProduct(product)) continue;
      const knowledge = classifyProductKnowledge(localProduct);
      const matchesTarget = plan.targetHandle === "health-wellness"
        ? knowledge.departmentId === "health-wellness" || knowledge.categoryId === "health-wellness"
        : knowledge.departmentId === "camping-travel";
      if (!matchesTarget || knowledge.reviewRequired) continue;
      eligibleForTarget += 1;
      expectedTargetIds.add(product.id);
      const tagsToAdd = buildManagedTagAdditions(product.tags, [plan.targetRuleTag]);
      if (tagsToAdd.length) {
        tagTasks.push({
          productId: product.id,
          handle: localProduct.handle || String(id),
          sourceHandle: plan.sourceHandle,
          targetHandle: plan.targetHandle,
          tagsToAdd,
          knowledge: {
            classificationRule: knowledge.classificationRule,
            confidence: knowledge.confidence,
            departmentId: knowledge.departmentId,
            categoryId: knowledge.categoryId,
          },
        });
      }
    }

    if (plan.mode === "source-union") {
      const sourceRule = source.sources?.length === 1 ? source.sources[0] : null;
      const targetRule = target.sources?.length === 1 ? target.sources[0] : null;
      if (!sourceRule || !targetRule) throw new Error(`${plan.sourceHandle}: source and target must have conditions sources.`);
      const expectedSource = buildUnionSource(targetRule, sourceRule);
      unionActions.push({ plan, target, expectedSource });
    }

    rows.push({
      sourceHandle: plan.sourceHandle,
      targetHandle: plan.targetHandle,
      mode: plan.mode,
      sourceProductCount: sourceProducts.length,
      onlineSourceProducts,
      targetProductCountBefore: targetProducts.length,
      sourceProductsAlreadyInTarget: sourceProducts.filter((product) => targetIds.has(product.id)).length,
      eligibleForTarget,
      targetRuleTag: plan.targetRuleTag || null,
      sourcePublishedToOnlineStore: isOnlineStoreCollection(source),
      expectedTargetProductIds: [...expectedTargetIds],
      sourceId: source.id,
      targetId: target.id,
      sourceTitle: source.title,
      targetTitle: target.title,
    });
  }

  const manifest = {
    releaseVersion: "2026-08-04.39-collection-merges.1",
    mode: dryRun ? "dry-run" : "apply",
    generatedAt: new Date().toISOString(),
    approvalId: approval.approvalId,
    policy: {
      existingProductTags: "preserve-exactly",
      taxonomyMerge: "add-only controlled target tags for evidence-aligned products",
      merchandisingMerge: "union existing source conditions with target conditions",
      productPublications: "read-only",
      sourceHandling: "unpublish six source collections from Online Store; preserve Admin records",
      redirects: "not attempted; connected credential cannot read URL redirects",
    },
    onlineStorePublication: onlineStorePublication,
    sourceCollections: rows,
    tagTasks: tagTasks,
    summary: {
      sourceCollections: MERGE_PLAN.length,
      sourceProducts: rows.reduce((sum, row) => sum + row.sourceProductCount, 0),
      eligibleTaxonomyTargetProducts: rows.reduce((sum, row) => sum + row.eligibleForTarget, 0),
      tagsToAdd: tagTasks.reduce((sum, task) => sum + task.tagsToAdd.length, 0),
      merchandisingRulesToUnion: unionActions.length,
      sourceCollectionsPublishedBefore: rows.filter((row) => row.sourcePublishedToOnlineStore).length,
      failures: 0,
    },
  };
  await writeManifest(manifest);

  process.stdout.write(`${dryRun ? "Dry run" : "Applying"} six approved collection merges\n`);
  process.stdout.write(`${JSON.stringify(manifest.summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(rows.map(({ expectedTargetProductIds, ...row }) => row), null, 2)}\n`);

  if (dryRun) return;

  await addTags(tagTasks);
  await verifyAddedTags(tagTasks);
  for (const action of unionActions) {
    action.changed = await unionTargetSource(action.target, action.expectedSource);
  }

  const afterTargetCollections = await fetchCollections();
  const afterByHandle = new Map(afterTargetCollections.map((collection) => [collection.handle, collection]));
  for (const row of rows) {
    const target = afterByHandle.get(row.targetHandle);
    const targetProducts = await fetchCollectionProducts(row.targetHandle);
    const targetIds = new Set(targetProducts.map((product) => product.id));
    const missing = row.expectedTargetProductIds.filter((id) => !targetIds.has(id));
    const sourceRule = target?.sources?.length === 1 ? target.sources[0] : null;
    const unionAction = unionActions.find((action) => action.plan.sourceHandle === row.sourceHandle);
    const sourceOkay = row.mode === "source-union"
      ? sourceMatchesUnion(sourceRule, unionAction.expectedSource)
      : sourceRule?.inclusion?.conditions?.some((condition) => normalize(condition.values?.[0]) === normalize(row.targetRuleTag));
    if (missing.length || !sourceOkay) {
      throw new Error(`${row.sourceHandle}: target readback failed; missing ${missing.length} products or rule mismatch.`);
    }
    row.targetProductCountAfter = targetProducts.length;
    row.targetRuleVerified = true;
  }

  for (const plan of MERGE_PLAN) {
    const source = afterByHandle.get(plan.sourceHandle);
    if (source && isOnlineStoreCollection(source)) {
      await unpublishCollection(source.id, onlineStorePublication.id, plan.sourceHandle);
    }
  }

  const finalCollections = await fetchCollections();
  const finalByHandle = new Map(finalCollections.map((collection) => [collection.handle, collection]));
  const sourceStillPublished = MERGE_PLAN
    .map((plan) => finalByHandle.get(plan.sourceHandle))
    .filter(Boolean)
    .filter(isOnlineStoreCollection)
    .map((collection) => collection.handle);
  if (sourceStillPublished.length) {
    throw new Error(`Merged source collections remain published to Online Store: ${sourceStillPublished.join(", ")}`);
  }
  manifest.completedAt = new Date().toISOString();
  manifest.summary.failures = 0;
  await writeManifest(manifest);
  process.stdout.write("Six collection merges verified; source collections are preserved in Admin and removed from Online Store publication\n");
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
