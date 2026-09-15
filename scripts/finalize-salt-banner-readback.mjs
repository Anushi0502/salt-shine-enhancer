#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { asArray, createShopifyAdminGraphQLClient } from './shopify-admin-graphql-client.mjs';

const rootDir = resolve(import.meta.dirname, '..');
const manifestPath = resolve(rootDir, 'output/imagegen/salt-collection-banners-all/clean-upload-manifest.json');
const client = createShopifyAdminGraphQLClient({
  rootDir,
  agentName: 'all-clean-collection-banner-readback',
});

const COLLECTIONS_QUERY = /* GraphQL */ `
  query AllCollectionBannerReadback($first: Int!, $after: String) {
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
      { operation: 'read all customer-facing collection banner readback' },
    );
    result.push(...asArray(data?.collections?.nodes));
    if (!data?.collections?.pageInfo?.hasNextPage) return result;
    after = data.collections.pageInfo.endCursor;
  }
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const targets = asArray(manifest.targets);
if (targets.length !== 35) throw new Error(`Expected 35 remaining banner targets, found ${targets.length}`);

const liveByHandle = new Map((await fetchCollections()).map((collection) => [collection.handle, collection]));
const failed = targets.filter((target) => {
  const current = liveByHandle.get(target.handle);
  const expectedAltText = `${current?.title || target.title} collection banner`;
  return current?.image?.altText !== expectedAltText || !current?.image?.url;
});
if (failed.length) throw new Error(`Shopify readback failed for: ${failed.map((target) => target.handle).join(', ')}`);

manifest.completedAt = new Date().toISOString();
manifest.summary = { requested: targets.length, applied: targets.length, failed: 0 };
manifest.readback = {
  verified: targets.length,
  allImagesPresent: true,
  allAltTextExact: true,
  collections: targets.map((target) => {
    const current = liveByHandle.get(target.handle);
    return { handle: target.handle, imageUrl: current.image.url, altText: current.image.altText };
  }),
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ requested: targets.length, applied: targets.length, failed: 0, readbackVerified: targets.length }));
