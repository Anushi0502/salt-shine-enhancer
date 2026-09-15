#!/usr/bin/env node

import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildManagedTagAdditions,
  isActiveShopifyProduct,
  isOnlineStorePublishedLiveProduct,
} from "../src/lib/catalog-taxonomy-release.js";
import { createShopifyAdminGraphQLClient } from "./shopify-admin-graphql-client.mjs";
import {
  boundedInteger,
  mapWithConcurrency,
  recommendedConcurrency,
} from "./lib/performance-runtime.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const dataDir = resolve(rootDir, "public", "data");
const approvalPath = resolve(rootDir, "docs", "catalog-collection-merge-approval.json");
const outputPath = resolve(rootDir, "output", "catalog-collection-merge-manifest.json");
const dryRun = process.argv.includes("--dry-run");
const batchSize = Math.max(1, Math.min(50, Number(process.env.SALT_COLLECTION_MERGE_BATCH_SIZE || 25)));
const applyConcurrency = boundedInteger(
  process.env.SALT_COLLECTION_MERGE_APPLY_CONCURRENCY,
  recommendedConcurrency({ kind: "io", reserve: 2, max: 6, min: 2 }),
  { min: 1, max: 8 },
);
const verifyConcurrency = boundedInteger(
  process.env.SALT_COLLECTION_MERGE_VERIFY_CONCURRENCY,
  recommendedConcurrency({ kind: "io", reserve: 2, max: 8, min: 2 }),
  { min: 1, max: 8 },
);
const progressEvery = boundedInteger(
  process.env.SALT_COLLECTION_MERGE_PROGRESS_EVERY,
  25,
  { min: 1, max: 250 },
);
const client = createShopifyAdminGraphQLClient({ rootDir, agentName: "collection-merges" });

const MERGE_PLAN = Object.freeze([
  { sourceHandle: "caregiver-essentials", targetHandle: "health-wellness", mode: "taxonomy", targetRuleTag: "health-wellness" },
  { sourceHandle: "mobility-support", targetHandle: "health-wellness", mode: "taxonomy", targetRuleTag: "health-wellness" },
  { sourceHandle: "posture-support", targetHandle: "health-wellness", mode: "taxonomy", targetRuleTag: "health-wellness" },
  { sourceHandle: "camping-gear", targetHandle: "travel-outdoor", mode: "taxonomy", targetRuleTag: "travel-outdoor" },
  { sourceHandle: "holiday-gifts", targetHandle: "gifts", mode: "source-union", targetRuleTag: "gifts" },
  { sourceHandle: "viral-tiktok-products", targetHandle: "trending-finds", mode: "source-union", targetRuleTag: "trending-finds" },
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

export function buildTagsAddBatchMutation(tasks) {
  const entries = asArray(tasks);
  if (!entries.length) throw new Error("Cannot build an empty tagsAdd batch.");
  const declarations = entries
    .flatMap((_, index) => [`$id${index}: ID!`, `$tags${index}: [String!]!`])
    .join(", ");
  const fields = entries
    .map((_, index) => `p${index}: tagsAdd(id: $id${index}, tags: $tags${index}) { userErrors { field message } }`)
    .join("\n");
  const variables = {};
  entries.forEach((task, index) => {
    variables[`id${index}`] = task.productId;
    variables[`tags${index}`] = task.tagsToAdd;
  });
  return {
    query: `mutation MergeTagsAddBatch(${declarations}) {\n${fields}\n}`,
    variables,
  };
}

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

async function addTags(tasks, manifest, previousManifest) {
  return addTagsWithCheckpoint(tasks, manifest, previousManifest);
}

export function mergeProgressSnapshot({ phase, total, completedIds, concurrency, verified = 0 }) {
  const ids = [...completedIds].map(String).sort();
  return {
    phase,
    totalTasks: total,
    completedTasks: ids.length,
    pendingTasks: Math.max(0, total - ids.length),
    verifiedTasks: verified,
    concurrency,
    completedProductIds: ids,
    updatedAt: new Date().toISOString(),
  };
}

async function writeManifest(manifest) {
  const tempPath = `${outputPath}.tmp-${process.pid}`;
  await writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(tempPath, outputPath);
}

async function addTagsWithCheckpoint(tasks, manifest, previousManifest) {
  if (!tasks.length) return;
  const taskIds = new Set(tasks.map((task) => String(task.productId)));
  const completedIds = new Set(
    asArray(previousManifest?.applyProgress?.completedProductIds)
      .map(String)
      .filter((id) => taskIds.has(id)),
  );
  const pending = tasks.filter((task) => !completedIds.has(String(task.productId)));
  if (manifest) {
    manifest.applyProgress = mergeProgressSnapshot({
      phase: pending.length ? "adding-tags" : "tags-complete",
      total: tasks.length,
      completedIds,
      concurrency: applyConcurrency,
    });
    await writeManifest(manifest);
  }
  process.stdout.write(
    `Merge tag progress: ${completedIds.size}/${tasks.length} ready; ` +
    `${pending.length} pending with concurrency ${applyConcurrency}.\n`,
  );
  if (!pending.length) return;

  const mutationBatchSize = Math.max(
    1,
    Math.min(25, Number(process.env.SALT_COLLECTION_MERGE_MUTATION_BATCH_SIZE || batchSize)),
  );
  const pendingBatches = [];
  for (let index = 0; index < pending.length; index += mutationBatchSize) {
    pendingBatches.push(pending.slice(index, index + mutationBatchSize));
  }
  let nextIndex = 0;
  let firstError = null;
  let checkpointQueue = Promise.resolve();
  let checkpointError = null;
  const queueCheckpoint = () => {
    if (!manifest) return;
    const snapshot = mergeProgressSnapshot({
      phase: "adding-tags",
      total: tasks.length,
      completedIds,
      concurrency: applyConcurrency,
    });
    checkpointQueue = checkpointQueue
      .then(() => writeManifest({ ...manifest, applyProgress: snapshot }))
      .catch((error) => {
        checkpointError ||= error;
      });
  };
  const worker = async () => {
    while (!firstError) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= pendingBatches.length) return;
      const batch = pendingBatches[index];
      try {
        const mutation = buildTagsAddBatchMutation(batch);
        const data = await client.run(mutation.query, mutation.variables, {
          allowMutations: true,
          operation: `add merge taxonomy tags ${index + 1}/${pendingBatches.length}`,
        });
        const batchErrors = [];
        batch.forEach((task, taskIndex) => {
          const errors = asArray(data?.[`p${taskIndex}`]?.userErrors);
          if (errors.length) {
            batchErrors.push(`${task.handle}: ${formatUserErrors(errors)}`);
          } else {
            completedIds.add(String(task.productId));
          }
        });
        queueCheckpoint();
        if (batchErrors.length) throw new Error(batchErrors.join(" | "));
        if (completedIds.size === tasks.length || completedIds.size % progressEvery < batch.length) {
          process.stdout.write(
            `Merge tag progress: ${completedIds.size}/${tasks.length} ` +
            `(${Math.round((completedIds.size / tasks.length) * 100)}%).\n`,
          );
        }
      } catch (error) {
        firstError = error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(applyConcurrency, pendingBatches.length) }, worker));
  await checkpointQueue;
  if (checkpointError) throw checkpointError;
  if (firstError) throw firstError;
  if (manifest) {
    manifest.applyProgress = mergeProgressSnapshot({
      phase: "tags-complete",
      total: tasks.length,
      completedIds,
      concurrency: applyConcurrency,
    });
    await writeManifest(manifest);
  }
}

async function verifyAddedTags(tasks, manifest = null) {
  const batches = [];
  for (let index = 0; index < tasks.length; index += batchSize) {
    batches.push(tasks.slice(index, index + batchSize));
  }
  let verified = 0;
  await mapWithConcurrency(batches, verifyConcurrency, async (batch) => {
    const ids = batch.map((task) => task.productId);
    const data = await client.run(PRODUCT_TAGS_QUERY, { ids }, { operation: "verify merge taxonomy tags" });
    const byId = new Map(asArray(data?.nodes).map((product) => [product?.id, product]));
    for (const task of batch) {
      const tags = new Set(asArray(byId.get(task.productId)?.tags).map(normalize));
      const missing = task.tagsToAdd.filter((tag) => !tags.has(normalize(tag)));
      if (missing.length) throw new Error(`${task.handle}: missing merge tag ${missing.join(", ")}`);
    }
    verified += batch.length;
    if (verified === tasks.length || verified % (batchSize * 4) === 0) {
      process.stdout.write(`Merge tag readback: ${verified}/${tasks.length} products.\n`);
    }
  });
  if (manifest) {
    const completedIds = new Set(asArray(manifest.applyProgress?.completedProductIds).map(String));
    manifest.applyProgress = mergeProgressSnapshot({
      phase: "tags-verified",
      total: tasks.length,
      completedIds,
      concurrency: verifyConcurrency,
      verified,
    });
    await writeManifest(manifest);
  }
}

async function unionTargetSource(target, expectedSource) {
  const currentSource = target.sources?.length === 1 ? target.sources[0] : null;
  if (!currentSource || currentSource.__typename !== "CollectionConditionsSource") {
    throw new Error(`${target.handle}: target must have one conditions source before merge.`);
  }
  if (sourceMatchesUnion(currentSource, expectedSource)) return false;
  const currentConditions = sourceConditions(currentSource);
  const data = await client.run(COLLECTION_UPDATE_MUTATION, {
    collection: {
      id: target.id,
      sourcesToUpdate: [{
        condition: {
          id: currentSource.id,
          title: expectedSource.title,
          description: expectedSource.description,
          inclusion: {
            matchType: expectedSource.inclusion.matchType,
            conditionsToDelete: currentConditions.map((condition) => condition.id).filter(Boolean),
            conditionsToCreate: asArray(expectedSource.inclusion.conditions),
          },
        },
      }],
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

async function readPreviousManifest() {
  try {
    return JSON.parse(await readFile(outputPath, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const approval = await readApproval();
  const previousManifest = await readPreviousManifest();
  // Shopify CLI's stored device-auth session is process-safe but not
  // reliably request-safe when two child invocations start together.
  const collections = await fetchCollections();
  const publications = await fetchPublications();
  const byHandle = new Map(collections.map((collection) => [collection.handle, collection]));
  const onlineStorePublication = publications.find((publication) => normalize(publication.name) === "online store");
  if (!onlineStorePublication) throw new Error("Online Store publication was not found.");
  const priorMergeRows = new Map(
    asArray(previousManifest?.sourceCollections).map((row) => [row.sourceHandle, row]),
  );
  const mergeAlreadyVerified = previousManifest?.completedAt &&
    MERGE_PLAN.every((plan) => {
      const source = byHandle.get(plan.sourceHandle);
      const target = byHandle.get(plan.targetHandle);
      const priorRow = priorMergeRows.get(plan.sourceHandle);
      return Boolean(target && priorRow?.targetRuleVerified && (!source || !isOnlineStoreCollection(source)));
    });
  if (mergeAlreadyVerified) {
    const manifest = {
      ...previousManifest,
      mode: dryRun ? "dry-run" : "apply",
      generatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      sourceCollections: MERGE_PLAN.map((plan) => ({
        ...(priorMergeRows.get(plan.sourceHandle) || {}),
        sourceHandle: plan.sourceHandle,
        targetHandle: plan.targetHandle,
        status: "already-verified-retired",
      })),
      summary: {
        sourceCollections: MERGE_PLAN.length,
        sourceProducts: 0,
        eligibleTaxonomyTargetProducts: 0,
        tagsToAdd: 0,
        merchandisingRulesToUnion: 0,
        sourceCollectionsPublishedBefore: 0,
        failures: 0,
      },
    };
    await writeManifest(manifest);
    process.stdout.write(`${dryRun ? "Dry run" : "Apply"}: six collection merges already verified; no duplicate collection changes pending.\n`);
    return;
  }
  const { classifyProductKnowledge } = await import("../src/lib/product-knowledge-base.js");
  const { readCatalogKnowledgeModel } = await import("./catalog-knowledge-model-files.mjs");
  const { readProductCatalogPayload } = await import("./product-catalog-files.mjs");
  const knowledgeModel = await readCatalogKnowledgeModel({
    required: process.env.SALT_REQUIRE_KNOWLEDGE_MODEL === "1",
  });
  const catalog = await readProductCatalogPayload(dataDir);
  const localById = new Map(asArray(catalog.products).map((product) => [Number(product.id), product]));
  const productCache = new Map();
  const targetProductsCache = new Map();
  const rows = [];
  const tagTasks = [];
  const unionActions = [];

  const productHandlesToPrefetch = [...new Set(
    MERGE_PLAN
      .flatMap((plan) => [plan.sourceHandle, plan.targetHandle])
      .filter((handle) => byHandle.has(handle)),
  )];
  const prefetchedProducts = await mapWithConcurrency(
    productHandlesToPrefetch,
    verifyConcurrency,
    async (handle) => [handle, await fetchCollectionProducts(handle)],
  );
  for (const [handle, products] of prefetchedProducts) {
    targetProductsCache.set(handle, products);
  }

  for (const plan of MERGE_PLAN) {
    const source = byHandle.get(plan.sourceHandle);
    const target = byHandle.get(plan.targetHandle);
    if (!target) throw new Error(`Missing canonical merge target ${plan.targetHandle} for ${plan.sourceHandle}.`);
    if (!source) {
      if (target.sources?.length !== 1 || target.sources[0]?.__typename !== "CollectionConditionsSource") {
        throw new Error(`Missing source ${plan.sourceHandle} cannot be treated as retired because target ${plan.targetHandle} has no single conditions source.`);
      }
      const targetProducts = targetProductsCache.get(plan.targetHandle);
      rows.push({
        sourceHandle: plan.sourceHandle,
        targetHandle: plan.targetHandle,
        mode: plan.mode,
        status: "source-missing-no-op",
        sourceProductCount: 0,
        onlineSourceProducts: 0,
        targetProductCountBefore: targetProducts.length,
        sourceProductsAlreadyInTarget: 0,
        eligibleForTarget: 0,
        targetRuleTag: plan.targetRuleTag || null,
        sourcePublishedToOnlineStore: false,
        expectedTargetProductIds: [],
        sourceId: null,
        targetId: target.id,
        sourceTitle: null,
        targetTitle: target.title,
        sourceMissing: true,
      });
      continue;
    }
    const sourceProducts = targetProductsCache.get(plan.sourceHandle) || [];
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
      if (!localProduct || !isOnlineStorePublishedLiveProduct(product)) continue;
      const knowledge = plan.mode === "taxonomy"
        ? classifyProductKnowledge(localProduct, { knowledgeModel })
        : null;
      const matchesTarget = plan.mode === "source-union" || (plan.targetHandle === "health-wellness"
        ? knowledge.departmentId === "health-wellness" || knowledge.categoryId === "health-wellness"
        : knowledge.departmentId === "camping-travel");
      if (!matchesTarget || knowledge?.reviewRequired) continue;
      eligibleForTarget += 1;
      expectedTargetIds.add(product.id);
      const tagsToAdd = buildManagedTagAdditions(product.tags, plan.targetRuleTag ? [plan.targetRuleTag] : []);
      if (tagsToAdd.length) {
        tagTasks.push({
          productId: product.id,
          handle: localProduct.handle || String(id),
          sourceHandle: plan.sourceHandle,
          targetHandle: plan.targetHandle,
          tagsToAdd,
          knowledge: {
            classificationRule: knowledge?.classificationRule || null,
            confidence: knowledge?.confidence || null,
            departmentId: knowledge?.departmentId || null,
            categoryId: knowledge?.categoryId || null,
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

  await addTags(tagTasks, manifest, previousManifest);
  await verifyAddedTags(tagTasks, manifest);
  await mapWithConcurrency(unionActions, applyConcurrency, async (action) => {
    action.changed = await unionTargetSource(action.target, action.expectedSource);
  });

  const afterTargetCollections = await fetchCollections();
  const afterByHandle = new Map(afterTargetCollections.map((collection) => [collection.handle, collection]));
  const targetHandles = [...new Set(rows.map((row) => row.targetHandle))];
  const targetProductsByHandle = new Map(
    await mapWithConcurrency(targetHandles, verifyConcurrency, async (handle) => [
      handle,
      await fetchCollectionProducts(handle),
    ]),
  );
  for (const row of rows) {
    const target = afterByHandle.get(row.targetHandle);
    const targetProducts = targetProductsByHandle.get(row.targetHandle) || [];
    const targetIds = new Set(targetProducts.map((product) => product.id));
    if (row.sourceMissing) {
      if (!target?.sources?.length || target.sources.length !== 1 || target.sources[0]?.__typename !== "CollectionConditionsSource") {
        throw new Error(`${row.sourceHandle}: retired-source no-op target readback failed; canonical target source is missing.`);
      }
      row.targetProductCountAfter = targetProducts.length;
      row.targetRuleVerified = true;
      continue;
    }
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

  await mapWithConcurrency(MERGE_PLAN, applyConcurrency, async (plan) => {
    const source = afterByHandle.get(plan.sourceHandle);
    if (source && isOnlineStoreCollection(source)) {
      await unpublishCollection(source.id, onlineStorePublication.id, plan.sourceHandle);
    }
  });

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

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(async (error) => {
    console.error(error);
    process.exit(1);
  });
}
