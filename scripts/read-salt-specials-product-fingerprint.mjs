#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { asArray, createShopifyAdminGraphQLClient } from './shopify-admin-graphql-client.mjs';

const rootDir = process.cwd();
const collectionId = 'gid://shopify/Collection/299785584739';
const client = createShopifyAdminGraphQLClient({
  rootDir,
  agentName: 'salt-specials-product-membership-readback',
});

const COLLECTION_PRODUCTS_QUERY = /* GraphQL */ `
  query SaltSpecialsProductMembership($id: ID!, $first: Int!, $after: String) {
    collection(id: $id) {
      handle
      title
      products(first: $first, after: $after) {
        nodes { id }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const productIds = [];
let after = null;
let collection = null;
while (true) {
  const data = await client.run(
    COLLECTION_PRODUCTS_QUERY,
    { id: collectionId, first: 250, after },
    { operation: 'read Salt Specials product membership' },
  );
  collection = data?.collection;
  if (!collection) throw new Error('Salt Specials collection was not found');
  productIds.push(...asArray(collection.products?.nodes).map((product) => product.id).filter(Boolean));
  if (!collection.products?.pageInfo?.hasNextPage) break;
  after = collection.products.pageInfo.endCursor;
}

const sortedIds = [...new Set(productIds)].sort();
const fingerprint = createHash('sha256').update(sortedIds.join('\n')).digest('hex');
console.log(JSON.stringify({
  handle: collection.handle,
  title: collection.title,
  count: sortedIds.length,
  fingerprint,
}));
