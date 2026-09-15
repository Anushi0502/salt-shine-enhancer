#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createShopifyAdminGraphQLClient } from "./shopify-admin-graphql-client.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const handlePath = resolve(rootDir, "docs", "salt-gsc-semantic-repair-handles.txt");
const tempPath = "/tmp/salt-gsc-semantic-repair-fresh-live.json";
const durablePath = resolve(rootDir, "output", "salt-gsc-semantic-repair-fresh-live-2026-09-14.json");
const client = createShopifyAdminGraphQLClient({ rootDir, agentName: "gsc-semantic-repair-fresh-live-read" });

const PRODUCT_SELECTION = /* GraphQL */ `
  id
  legacyResourceId
  handle
  title
  descriptionHtml
  vendor
  productType
  tags
  status
  createdAt
  updatedAt
  publishedAt
  category { id }
  seo { title description }
  resourcePublications(first: 50) {
    nodes { isPublished publishDate channel { id name } }
  }
  variants(first: 250) {
    nodes { id title sku price compareAtPrice }
    pageInfo { hasNextPage endCursor }
  }
  media(first: 250) {
    nodes {
      __typename
      ... on MediaImage { id alt image { url } }
    }
    pageInfo { hasNextPage endCursor }
  }
`;

const PRODUCT_QUERY = /* GraphQL */ `
  query GscSemanticRepairFreshRead($identifier: ProductIdentifierInput!) {
    productByIdentifier(identifier: $identifier) { ${PRODUCT_SELECTION} }
  }
`;

const handles = (await readFile(handlePath, "utf8"))
  .split(/\r?\n/)
  .map((value) => value.trim())
  .filter(Boolean);
if (handles.length !== 12 || new Set(handles).size !== 12) {
  throw new Error(`Expected 12 unique GSC semantic-repair handles; found ${handles.length}.`);
}

const products = await Promise.all(handles.map(async (handle) => {
  const data = await client.run(
    PRODUCT_QUERY,
    { identifier: { handle } },
    { operation: `fresh GSC semantic repair read ${handle}`, maxAttempts: 3 },
  );
  const product = data?.productByIdentifier;
  if (!product?.id || product.handle !== handle) throw new Error(`Live product read failed for ${handle}.`);
  return product;
}));

const payload = {
  generatedAt: new Date().toISOString(),
  source: "Shopify Admin GraphQL fresh read; exact GSC semantic-repair handles; read-only",
  scope: "12 GSC semantic-repair products",
  total: products.length,
  products,
};

await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
await writeFile(durablePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  generatedAt: payload.generatedAt,
  handles: handles.length,
  products: products.length,
  productTypes: products.map(({ handle, productType, updatedAt }) => ({ handle, productType, updatedAt })),
  tempPath,
  durablePath,
}, null, 2));
