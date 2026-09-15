#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { asArray, createShopifyAdminGraphQLClient } from './shopify-admin-graphql-client.mjs';

const rootDir = resolve(import.meta.dirname, '..');
const bannerRatio = process.env.SALT_BANNER_RATIO || '2x1';
const isSixByFive = bannerRatio === '6x5';
const expectedCount = isSixByFive ? 114 : 35;
const manifestPath = resolve(
  rootDir,
  isSixByFive
    ? 'output/imagegen/salt-collection-banners-6x5/clean-upload-manifest.json'
    : 'output/imagegen/salt-collection-banners-all/clean-upload-manifest.json',
);
const cachePath = resolve(rootDir, 'public/data/collections.json');
const client = createShopifyAdminGraphQLClient({
  rootDir,
  agentName: isSixByFive ? 'shopapp-6x5-collection-banner-cache-sync' : 'all-clean-collection-banner-cache-sync',
});

const COLLECTIONS_QUERY = /* GraphQL */ `
  query AllCollectionBannerCacheSync($first: Int!, $after: String) {
    collections(first: $first, after: $after) {
      nodes { id handle title image { url altText } }
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
      { operation: 'read all collection banner cache targets' },
    );
    result.push(...asArray(data?.collections?.nodes));
    if (!data?.collections?.pageInfo?.hasNextPage) return result;
    after = data.collections.pageInfo.endCursor;
  }
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const targets = asArray(manifest.targets);
if (targets.length !== expectedCount) throw new Error(`Expected ${expectedCount} banner targets, found ${targets.length}`);

const liveByHandle = new Map((await fetchCollections()).map((collection) => [collection.handle, collection]));
const targetHandles = new Set(targets.map((target) => target.handle));
const cache = JSON.parse(await readFile(cachePath, 'utf8'));
let updated = 0;

cache.collections = asArray(cache.collections).map((collection) => {
  if (!targetHandles.has(collection.handle)) return collection;
  const live = liveByHandle.get(collection.handle);
  if (!live?.image?.url) throw new Error(`Live banner image missing for ${collection.handle}`);
  updated += 1;
  return {
    ...collection,
    title: live.title || collection.title,
    image: {
      ...(collection.image || {}),
      src: live.image.url,
      alt: live.image.altText || `${live.title || collection.title} collection banner`,
    },
  };
});

if (updated !== targets.length) throw new Error(`Updated ${updated} cache collections; expected ${targets.length}`);
await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ updated, expected: targets.length, cachePath }));
