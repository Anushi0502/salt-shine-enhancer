#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { CATALOG_COLLECTION_PLAN } from "../src/lib/catalog-collection-plan.js";
import { createShopifyAdminGraphQLClient } from "./shopify-admin-graphql-client.mjs";
import { readProductCatalogPayload } from "./product-catalog-files.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const dataDir = resolve(rootDir, "public", "data");
const collectionsPath = resolve(dataDir, "collections.json");
const collectionProductsPath = resolve(dataDir, "collection-products.json");
const dryRun = process.argv.includes("--dry-run");
const pageSize = Math.max(1, Math.min(250, Number(process.env.SALT_COLLECTION_MEMBERSHIP_PAGE_SIZE || 250)));
const client = createShopifyAdminGraphQLClient({ rootDir, agentName: "managed-collection-membership" });

const COLLECTION_PRODUCTS_QUERY = /* GraphQL */ `
  query ManagedCollectionProducts($query: String!, $first: Int!, $after: String) {
    collections(first: 1, query: $query) {
      nodes {
        handle
        title
        products(first: $first, after: $after) {
          nodes {
            id
            legacyResourceId
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

function legacyProductId(product) {
  const legacyResourceId = String(product?.legacyResourceId || "").trim();
  if (/^\d+$/.test(legacyResourceId)) {
    return Number(legacyResourceId);
  }

  const gidMatch = String(product?.id || "").match(/\/(\d+)$/);
  return gidMatch ? Number(gidMatch[1]) : null;
}

function isShopifyAuthFailure(error) {
  return /Admin GraphQL HTTP (401|403)|invalid api key|access token|unauthori[sz]ed|access denied|No stored app authentication found|shopify store auth/i.test(
    String(error?.message || error),
  );
}

async function fetchLiveCollectionProducts(handle) {
  const productIds = [];
  const seen = new Set();
  let after = null;
  let title = "";

  while (true) {
    const payload = await client.run(
      COLLECTION_PRODUCTS_QUERY,
      { query: `handle:${handle}`, first: pageSize, after },
      { operation: `read live collection membership for ${handle}` },
    );
    const nodes = Array.isArray(payload?.collections?.nodes) ? payload.collections.nodes : [];
    const collection = nodes.find((entry) => String(entry?.handle || "") === handle);
    if (!collection) {
      throw new Error(`Live Shopify collection not found for canonical handle "${handle}"`);
    }

    title = String(collection.title || "").trim();
    const products = collection.products || {};
    for (const product of Array.isArray(products.nodes) ? products.nodes : []) {
      const productId = legacyProductId(product);
      if (Number.isFinite(productId) && productId > 0 && !seen.has(productId)) {
        seen.add(productId);
        productIds.push(productId);
      }
    }

    if (!products.pageInfo?.hasNextPage) {
      break;
    }

    after = products.pageInfo.endCursor || null;
    if (!after) {
      throw new Error(`Live Shopify collection "${handle}" returned a next page without a cursor`);
    }
  }

  return { title, productIds };
}

async function main() {
  const [productPayload, collectionsPayload, collectionProductsPayload] = await Promise.all([
    readProductCatalogPayload(dataDir),
    readFile(collectionsPath, "utf8").then(JSON.parse),
    readFile(collectionProductsPath, "utf8").then(JSON.parse),
  ]);
  const catalogProductIds = new Set(
    (Array.isArray(productPayload.products) ? productPayload.products : [])
      .map((product) => Number(product?.id))
      .filter((id) => Number.isFinite(id) && id > 0),
  );
  const nextCollections = Array.isArray(collectionsPayload.collections)
    ? collectionsPayload.collections.map((collection) => ({ ...collection }))
    : [];
  const nextCollectionProducts = {
    ...collectionProductsPayload,
    collections: { ...(collectionProductsPayload.collections || {}) },
  };
  const summaries = [];
  let liveMembershipAvailable = true;
  let authFallbackLogged = false;

  for (const entry of CATALOG_COLLECTION_PLAN) {
    const collectionIndex = nextCollections.findIndex((collection) => collection.handle === entry.handle);
    if (collectionIndex < 0) {
      throw new Error(`Local collections payload is missing canonical handle "${entry.handle}"`);
    }

    const currentMapping = nextCollectionProducts.collections[entry.handle] || {};
    let live = null;
    let source = "live";

    if (liveMembershipAvailable) {
      try {
        live = await fetchLiveCollectionProducts(entry.handle);
      } catch (error) {
        if (!isShopifyAuthFailure(error)) throw error;
        liveMembershipAvailable = false;
        source = "cached";
        if (!authFallbackLogged) {
          process.stdout.write(
            "Shopify Admin authentication is unavailable; retaining committed canonical collection memberships.\n",
          );
          authFallbackLogged = true;
        }
      }
    } else {
      source = "cached";
    }

    if (!live) {
      live = {
        title: String(currentMapping.title || entry.title).trim(),
        productIds: Array.isArray(currentMapping.productIds) ? currentMapping.productIds : [],
      };
    }

    const visibleProductIds = live.productIds.filter((id) => catalogProductIds.has(id));
    nextCollectionProducts.collections[entry.handle] = {
      ...currentMapping,
      title: live.title || currentMapping.title || entry.title,
      productIds: visibleProductIds,
    };
    nextCollections[collectionIndex] = {
      ...nextCollections[collectionIndex],
      products_count: visibleProductIds.length,
    };

    summaries.push({
      handle: entry.handle,
      source,
      liveProductCount: live.productIds.length,
      onlineStoreProductCount: visibleProductIds.length,
      filteredOutOfCatalog: live.productIds.length - visibleProductIds.length,
    });
  }

  const generatedAt = new Date().toISOString();
  const nextCollectionsPayload = {
    ...collectionsPayload,
    generatedAt,
    collections: nextCollections,
  };
  const nextCollectionProductsPayload = {
    ...nextCollectionProducts,
    generatedAt,
    totalCollections: nextCollections.length,
  };

  process.stdout.write(
    `${dryRun ? "Dry run" : "Refreshing"} ${summaries.length} canonical collection memberships against ${catalogProductIds.size} Online Store products\n`,
  );
  process.stdout.write(`${JSON.stringify(summaries, null, 2)}\n`);

  if (dryRun) {
    return;
  }

  await writeFile(collectionsPath, JSON.stringify(nextCollectionsPayload));
  await writeFile(collectionProductsPath, JSON.stringify(nextCollectionProductsPayload));
  process.stdout.write("Saved canonical collection counts and product mappings\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
