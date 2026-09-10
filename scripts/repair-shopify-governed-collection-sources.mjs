#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  COLLECTION_GOVERNANCE_VERSION,
  COLLECTION_GOVERNANCE_POLICIES,
  PRICE_COLLECTION_POLICIES,
  SEMANTIC_COLLECTION_POLICIES,
  buildPriceCollectionSource,
  buildSemanticCollectionSource,
  normalizeCollectionHandle,
  productMatchesPricePolicy,
} from "../src/lib/catalog-collection-governance.js";
import { asArray, createShopifyAdminGraphQLClient, normalizeText } from "./shopify-admin-graphql-client.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const approvalPath = resolve(rootDir, "docs", "catalog-collection-approval.json");
const outputPath = resolve(rootDir, "output", "shopify-governed-collection-source-repair.json");
const liveInputCheckpointPath = process.env.SALT_CATALOG_INTEGRITY_LIVE_CHECKPOINT ||
  resolve(rootDir, "output", ".shopify-catalog-integrity-live-input.json");
const sourcePollAttempts = Math.max(2, Math.min(8, Number(process.env.SALT_FINAL_COLLECTION_SOURCE_POLL_ATTEMPTS || 5)));
const sourcePollDelayMs = Math.max(500, Math.min(10_000, Number(process.env.SALT_FINAL_COLLECTION_SOURCE_POLL_DELAY_MS || 1500)));
const applyConcurrency = Math.max(1, Math.min(4, Number(process.env.SALT_FINAL_COLLECTION_SOURCE_APPLY_CONCURRENCY || 3)));
const client = createShopifyAdminGraphQLClient({ rootDir, agentName: "final-governed-collection-source-repair" });

const COLLECTIONS_QUERY = /* GraphQL */ `
  query FinalGovernedCollectionSources($first: Int!, $after: String) {
    collections(first: $first, after: $after, query: "status:active") {
      nodes {
        id
        handle
        title
        sources {
          __typename
          ... on CollectionConditionsSource {
            id
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

const COLLECTION_UPDATE_MUTATION = /* GraphQL */ `
  mutation FinalGovernedCollectionSourceRepair($collection: CollectionUpdateInput!) {
    collectionUpdate(collection: $collection) {
      collection { id handle title }
      userErrors { field message }
    }
  }
`;

const COLLECTION_PRODUCTS_QUERY = /* GraphQL */ `
  query FinalGovernedCollectionProducts($id: ID!, $first: Int!, $after: String) {
    node(id: $id) {
      ... on Collection {
        products(first: $first, after: $after) {
          nodes { id }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function normalizeTag(value) {
  return normalizeText(value).trim().toLowerCase();
}

function sourceSummary(source) {
  return {
    targetType: source?.targetType || null,
    matchType: source?.inclusion?.matchType || null,
    conditions: asArray(source?.inclusion?.conditions).map((condition) => {
      const productTag = condition?.productTag || (
        condition?.__typename === "CollectionSourceInclusionConditionProductTag" ? condition : null
      );
      if (productTag) {
        return {
          type: "tag",
          relation: productTag.relation,
          matchType: productTag.matchType,
          values: asArray(productTag.values).map(normalizeTag).sort(),
        };
      }
      const variantPrice = condition?.variantPrice || (
        condition?.__typename === "CollectionSourceInclusionConditionVariantPrice" ? condition : null
      );
      if (variantPrice) {
        return {
          type: "price",
          relation: variantPrice.relation,
          amount: Number(variantPrice?.value?.amount),
          currencyCode: variantPrice?.value?.currencyCode || null,
        };
      }
      return { type: condition?.__typename || "unknown" };
    }).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  };
}

function expectedSummary(policy) {
  const source = policy.kind === "price" ? buildPriceCollectionSource(policy) : buildSemanticCollectionSource(policy);
  return sourceSummary(source);
}

export function governedSourceMatches(policy, collection) {
  const sources = asArray(collection?.sources);
  if (sources.length !== 1 || sources[0]?.__typename !== "CollectionConditionsSource") return false;
  return JSON.stringify(sourceSummary(sources[0])) === JSON.stringify(expectedSummary(policy));
}

function buildSource(policy) {
  return policy.kind === "price" ? buildPriceCollectionSource(policy) : buildSemanticCollectionSource(policy);
}

async function fetchCollections() {
  const collections = [];
  let after = null;
  while (true) {
    const data = await client.run(COLLECTIONS_QUERY, { first: 250, after }, {
      operation: `final governed collection source page ${Math.floor(collections.length / 250) + 1}`,
    });
    const connection = data?.collections;
    if (!connection) throw new Error("Shopify returned no collection source connection.");
    collections.push(...asArray(connection.nodes));
    if (!connection.pageInfo?.hasNextPage) return collections;
    after = connection.pageInfo.endCursor;
    if (!after) throw new Error("Collection source pagination returned no cursor.");
  }
}

async function readExpectedMembership() {
  const liveCheckpoint = JSON.parse(await readFile(liveInputCheckpointPath, "utf8"));
  if (!liveCheckpoint?.complete || !Array.isArray(liveCheckpoint.liveProducts)) {
    throw new Error(`Complete live variant checkpoint is required for price collection readback: ${liveInputCheckpointPath}`);
  }
  const expectedByHandle = new Map();

  try {
    const manifest = JSON.parse(await readFile(resolve(rootDir, "output", "shopify-catalog-integrity-applied-generation.json"), "utf8"));
    const semanticHandles = new Set(SEMANTIC_COLLECTION_POLICIES.map((policy) => policy.handle));
    for (const classification of asArray(manifest?.classifications)) {
      const productId = normalizeText(classification?.productId).split("/").pop();
      if (!productId) continue;
      for (const rawHandle of asArray(classification?.collectionHandles)) {
        const handle = normalizeCollectionHandle(rawHandle);
        // Price memberships are rebuilt exclusively from the complete live
        // variant checkpoint below. The applied manifest must not widen or
        // narrow a price collection during final source readback.
        if (!semanticHandles.has(handle)) continue;
        if (!expectedByHandle.has(handle)) expectedByHandle.set(handle, new Set());
        expectedByHandle.get(handle).add(productId);
      }
    }
  } catch {
    // The live product checkpoint remains sufficient for the price policies;
    // semantic membership readback is omitted when no applied manifest exists.
  }

  for (const product of liveCheckpoint.liveProducts) {
    const productId = normalizeText(product?.id).split("/").pop();
    if (!productId) continue;
    for (const policy of PRICE_COLLECTION_POLICIES) {
      if (!productMatchesPricePolicy(product, policy)) continue;
      if (!expectedByHandle.has(policy.handle)) expectedByHandle.set(policy.handle, new Set());
      expectedByHandle.get(policy.handle).add(productId);
    }
  }
  return expectedByHandle;
}

async function fetchCollectionProductIds(collectionId, handle) {
  const ids = new Set();
  let after = null;
  while (true) {
    const data = await client.run(COLLECTION_PRODUCTS_QUERY, { id: collectionId, first: 250, after }, {
      operation: `final source repair membership ${handle}`,
    });
    const connection = data?.node?.products;
    if (!connection) throw new Error(`${handle}: Shopify returned no collection membership connection.`);
    for (const product of asArray(connection.nodes)) {
      const id = normalizeText(product?.id).split("/").pop();
      if (id) ids.add(id);
    }
    if (!connection.pageInfo?.hasNextPage) return ids;
    after = connection.pageInfo.endCursor;
    if (!after) throw new Error(`${handle}: collection membership pagination returned no cursor.`);
  }
}

async function mapWithConcurrency(items, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(applyConcurrency, items.length) }, () => worker()));
  return results;
}

async function readApproval() {
  const approval = JSON.parse(await readFile(approvalPath, "utf8"));
  if (approval?.approved !== true) throw new Error("Final collection source repair requires an approved collection governance manifest.");
  if (approval.governanceVersion !== COLLECTION_GOVERNANCE_VERSION) throw new Error("Collection approval targets a different governance version.");
  if (process.env.SALT_CATALOG_COLLECTIONS_APPROVED !== "1") throw new Error("Set SALT_CATALOG_COLLECTIONS_APPROVED=1 only for the approved full-catalog collection run.");
  const approvalId = normalizeText(approval.approvalId);
  if (!approvalId || normalizeText(process.env.SALT_CATALOG_COLLECTIONS_APPROVAL_ID) !== approvalId) throw new Error("SALT_CATALOG_COLLECTIONS_APPROVAL_ID does not match the collection approval manifest.");
  return { approvalId, governanceVersion: approval.governanceVersion };
}

async function applySourceRepair(target) {
  const data = await client.run(COLLECTION_UPDATE_MUTATION, {
    collection: {
      id: target.collection.id,
      sourcesToDelete: asArray(target.collection.sources).map((entry) => entry.id).filter(Boolean),
      sourcesToCreate: [{ source: buildSource(target.policy) }],
    },
  }, { allowMutations: true, operation: `final source repair ${target.policy.handle}` });
  const errors = asArray(data?.collectionUpdate?.userErrors);
  if (errors.length) throw new Error(`${target.policy.handle}: ${errors.map((error) => normalizeText(error.message)).join(" | ")}`);
  if (!data?.collectionUpdate?.collection?.id) throw new Error(`${target.policy.handle}: Shopify returned no collection after source repair.`);
}

async function readUntilExact(target) {
  for (let attempt = 1; attempt <= sourcePollAttempts; attempt += 1) {
    const collections = await fetchCollections();
    const current = collections.find((entry) => normalizeCollectionHandle(entry.handle) === target.policy.handle);
    if (current && governedSourceMatches(target.policy, current)) {
      const expected = target.expectedMembership;
      if (!expected) return current;
      const actual = await fetchCollectionProductIds(current.id, target.policy.handle);
      if (actual.size === expected.size && [...expected].every((id) => actual.has(id))) return current;
    }
    if (attempt < sourcePollAttempts) await sleep(sourcePollDelayMs * Math.min(4, attempt));
  }
  throw new Error(`${target.policy.handle}: governed source and membership did not remain exact after ${sourcePollAttempts} live readback attempts.`);
}

async function main() {
  const approval = await readApproval();
  const policies = [...PRICE_COLLECTION_POLICIES, ...SEMANTIC_COLLECTION_POLICIES];
  if (policies.length !== COLLECTION_GOVERNANCE_POLICIES.filter((policy) => policy.kind !== "catalog-boundary").length) throw new Error("Governed source repair policy registry is incomplete.");
  const collections = await fetchCollections();
  const expectedMembershipByHandle = await readExpectedMembership();
  const byHandle = new Map(collections.map((collection) => [normalizeCollectionHandle(collection.handle), collection]));
  const targets = policies.map((policy) => {
    const collection = byHandle.get(policy.handle);
    if (!collection) throw new Error(`${policy.handle}: governed collection is missing; source-only repair will not create collections.`);
    return {
      policy,
      collection,
      expectedMembership: expectedMembershipByHandle.get(policy.handle) || null,
      // A stale bulk audit must not cause a redundant source mutation. The
      // strict auditor performs its own targeted membership readback when the
      // bulk export disagrees; mutate only when the live source is noncanonical.
      needsRepair: !governedSourceMatches(policy, collection),
    };
  });
  const repairs = targets.filter((target) => target.needsRepair);
  process.stdout.write(`Final governed source check: ${targets.length} collections, ${repairs.length} source repair/reindex operation(s) required.\n`);
  await mapWithConcurrency(repairs, async (target) => {
    await applySourceRepair(target);
    await readUntilExact(target);
    process.stdout.write(`Final governed source readback passed: ${target.policy.handle}\n`);
  });
  const report = {
    generatedAt: new Date().toISOString(),
    status: "completed",
    approval,
    governanceVersion: COLLECTION_GOVERNANCE_VERSION,
    checkedCollections: targets.length,
    repairedCollections: repairs.map((target) => target.policy.handle),
    forcedFromPriorAudit: [],
    sourcePollAttempts,
    sourcePollDelayMs,
  };
  await mkdir(resolve(rootDir, "output"), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`Final governed source gate passed: ${targets.length} canonical collection sources exact.\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message || error}\n`);
    process.exitCode = 1;
  });
}
