#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { readProductCatalogPayload } from "./product-catalog-files.mjs";
import { createShopifyAdminGraphQLClient } from "./shopify-admin-graphql-client.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const dataDir = resolve(rootDir, "public", "data");
const outputDir = resolve(rootDir, "output");
const outputPath = resolve(outputDir, "catalog-live-tag-inventory.json");
const baseUrl = process.env.SALT_SHOP_URL || "https://0309d3-72.myshopify.com";
const shopDomain = new URL(baseUrl).hostname;
const apiVersion = process.env.SHOPIFY_ADMIN_API_VERSION || "2026-07";
const adminAccessToken = (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SALT_SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
const allowSnapshotFallback = process.argv.includes("--allow-snapshot-fallback");
const shopifyAdminClient = createShopifyAdminGraphQLClient({
  rootDir,
  agentName: "tag-inventory",
});

const PRODUCT_TAGS_QUERY = /* GraphQL */ `
  query ProductTags($first: Int!, $after: String) {
    productTags(first: $first, after: $after) {
      nodes
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeTag(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function uniqueSortedTags(values) {
  return [...new Set(values.map(normalizeTag).filter(Boolean))].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

function fetchShopifyGraphql(query, variables, operation) {
  return shopifyAdminClient.run(query, variables, { operation });
}

async function fetchLiveProductTags() {
  const tags = [];
  let after = null;
  let page = 0;
  const method = adminAccessToken ? "admin-access-token" : "shopify-cli";

  do {
    const variables = { first: 250, after };
    const data = await fetchShopifyGraphql(
      PRODUCT_TAGS_QUERY,
      variables,
      `read Shopify tag inventory page ${page + 1}`,
    );
    const connection = data?.productTags;

    if (!connection) {
      throw new Error("Shopify returned no productTags connection.");
    }

    tags.push(...asArray(connection.nodes));
    after = connection?.pageInfo?.hasNextPage ? connection?.pageInfo?.endCursor || null : null;
    page += 1;
  } while (after);

  return {
    method,
    pages: page,
    tags: uniqueSortedTags(tags),
  };
}

async function readSnapshotTags() {
  const payload = await readProductCatalogPayload(dataDir);
  const products = asArray(payload?.products);
  const assignments = new Map();

  for (const product of products) {
    for (const tag of asArray(product?.tags)) {
      const normalized = normalizeTag(tag);
      if (!normalized) continue;
      assignments.set(normalized, (assignments.get(normalized) || 0) + 1);
    }
  }

  return {
    productGeneratedAt: payload?.generatedAt || null,
    products: products.length,
    tags: uniqueSortedTags([...assignments.keys()]),
    assignments: [...assignments.entries()]
      .map(([tag, productCount]) => ({ tag, productCount }))
      .sort((left, right) => right.productCount - left.productCount || left.tag.localeCompare(right.tag)),
  };
}

async function main() {
  const generatedAt = new Date().toISOString();

  try {
    const live = await fetchLiveProductTags();
    const payload = {
      version: 1,
      generatedAt,
      verifiedLive: true,
      source: {
        kind: "shopify-admin-product-tags",
        method: live.method,
        shopDomain,
        apiVersion,
        pages: live.pages,
      },
      tags: live.tags,
    };

    await mkdir(outputDir, { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({ verifiedLive: true, tags: live.tags.length, outputPath }, null, 2)}\n`);
  } catch (error) {
    if (!allowSnapshotFallback) {
      throw new Error(
        `Could not fetch live Shopify tags: ${error.message}\n` +
          "No snapshot was written. Grant the credential read_products access, then rerun npm run catalog:tags:fetch.",
      );
    }

    const snapshot = await readSnapshotTags();
    const payload = {
      version: 1,
      generatedAt,
      verifiedLive: false,
      source: {
        kind: "catalog-sync-snapshot",
        reason: `Live Shopify tag read was unavailable: ${error.message}`,
        productGeneratedAt: snapshot.productGeneratedAt,
        products: snapshot.products,
      },
      tags: snapshot.tags,
      assignments: snapshot.assignments,
    };

    await mkdir(outputDir, { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    process.stdout.write(
      `${JSON.stringify({
        verifiedLive: false,
        tags: snapshot.tags.length,
        productTagAssignments: snapshot.assignments.reduce((total, entry) => total + entry.productCount, 0),
        outputPath,
      }, null, 2)}\n`,
    );
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
