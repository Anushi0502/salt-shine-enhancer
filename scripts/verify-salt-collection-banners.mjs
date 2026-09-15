#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { asArray, createShopifyAdminGraphQLClient } from './shopify-admin-graphql-client.mjs';

const rootDir = resolve(import.meta.dirname, '..');
const client = createShopifyAdminGraphQLClient({
  rootDir,
  agentName: 'all-salt-collection-banner-readback',
});

const originalHandles = [
  'office-school-supplies',
  'mens-beauty-skincare',
  'kids-toys-games',
  'bedsheets-handlooms-towels',
  'creator-essentials',
  'massage-tools',
  'audio',
  'wigs',
  'robe',
  'candles',
  't-shirt',
];
const expandedManifestPath = resolve(rootDir, 'output/imagegen/salt-collection-banners-expanded/clean-upload-manifest.json');
const remainingManifestPath = resolve(rootDir, 'output/imagegen/salt-collection-banners-all/clean-upload-manifest.json');
const expandedManifest = JSON.parse(await readFile(expandedManifestPath, 'utf8'));
const remainingManifest = JSON.parse(await readFile(remainingManifestPath, 'utf8'));
const targetHandles = [...new Set([
  ...originalHandles,
  ...asArray(expandedManifest.targets).map((target) => target.handle),
  ...asArray(remainingManifest.targets).map((target) => target.handle),
])];
if (targetHandles.length !== 114) throw new Error(`Expected 114 customer-facing banner targets, found ${targetHandles.length}`);
if (!targetHandles.includes('test')) throw new Error('Salt Specials must be included as a banner target');

const COLLECTIONS_QUERY = /* GraphQL */ `
  query AllSaltCollectionBannerReadback($first: Int!, $after: String) {
    collections(first: $first, after: $after) {
      nodes { handle title image { url altText } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

async function fetchCollections() {
  const result = [];
  let after = null;
  while (true) {
    const data = await client.run(
      COLLECTIONS_QUERY,
      { first: 250, after },
      { operation: 'read all SALT collection banners' },
    );
    result.push(...asArray(data?.collections?.nodes));
    if (!data?.collections?.pageInfo?.hasNextPage) return result;
    after = data.collections.pageInfo.endCursor;
  }
}

const liveByHandle = new Map((await fetchCollections()).map((collection) => [collection.handle, collection]));
const failed = targetHandles.filter((handle) => {
  const collection = liveByHandle.get(handle);
  return !collection?.image?.url || collection.image.altText !== `${collection.title} collection banner`;
});
if (failed.length) throw new Error(`Banner readback failed for: ${failed.join(', ')}`);
const untargeted = [...liveByHandle.values()]
  .filter((collection) => collection.handle !== 'test' && !targetHandles.includes(collection.handle))
  .map((collection) => ({ handle: collection.handle, title: collection.title }));

console.log(JSON.stringify({
  liveCollections: liveByHandle.size,
  includedSaltSpecials: liveByHandle.get('test')?.title || 'test',
  targetCollections: targetHandles.length,
  verified: targetHandles.length,
  failed: 0,
  untargeted,
}));
