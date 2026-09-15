#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { promisify } from 'node:util';

import { asArray, createShopifyAdminGraphQLClient } from './shopify-admin-graphql-client.mjs';

const rootDir = resolve(import.meta.dirname, '..');
const bannerScope = process.env.SALT_BANNER_SCOPE || 'expanded';
const bannerRatio = process.env.SALT_BANNER_RATIO || '2x1';
const isSixByFive = bannerRatio === '6x5';
const isRemainingScope = bannerScope === 'remaining';
const outputDir = resolve(
  rootDir,
  isSixByFive
    ? 'output/imagegen/salt-collection-banners-6x5'
    : isRemainingScope
      ? 'output/imagegen/salt-collection-banners-all'
      : 'output/imagegen/salt-collection-banners-expanded',
);
const renderManifestPath = resolve(outputDir, 'clean-render-manifest.json');
const uploadManifestPath = resolve(outputDir, 'clean-upload-manifest.json');
const execFileAsync = promisify(execFile);
const client = createShopifyAdminGraphQLClient({
  rootDir,
  agentName: isSixByFive
    ? 'shopapp-6x5-collection-banners'
    : isRemainingScope
      ? 'all-clean-collection-banners'
      : 'expanded-clean-collection-banners',
});

const COLLECTIONS_QUERY = /* GraphQL */ `
  query ExpandedCollectionBannerInventory($first: Int!, $after: String) {
    collections(first: $first, after: $after) {
      nodes { id handle title image { url altText } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const STAGED_UPLOAD_MUTATION = /* GraphQL */ `
  mutation ExpandedCollectionBannerStagedUpload($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { field message }
    }
  }
`;

const COLLECTION_UPDATE_MUTATION = /* GraphQL */ `
  mutation ExpandedCollectionBannerUpdate($collection: CollectionUpdateInput!) {
    collectionUpdate(collection: $collection) {
      collection { id handle title image { url altText } }
      userErrors { field message }
    }
  }
`;

function formatErrors(errors) {
  return asArray(errors)
    .map((error) => `${asArray(error?.field).join('.') || 'collection'}: ${error?.message || 'Unknown Shopify error'}`)
    .join(' | ');
}

function normalizeShopifyId(value) {
  const text = String(value || '');
  return text.includes('/') ? text.slice(text.lastIndexOf('/') + 1) : text;
}

async function fetchCollections() {
  const result = [];
  let after = null;
  while (true) {
    const data = await client.run(COLLECTIONS_QUERY, { first: 250, after }, { operation: 'read expanded collection banner targets' });
    result.push(...asArray(data?.collections?.nodes));
    if (!data?.collections?.pageInfo?.hasNextPage) return result;
    after = data.collections.pageInfo.endCursor;
  }
}

async function stageImage(filePath, handle) {
  const file = await readFile(filePath);
  const data = await client.run(STAGED_UPLOAD_MUTATION, {
    input: [{
      resource: 'IMAGE',
      filename: basename(filePath),
      mimeType: 'image/png',
      httpMethod: 'POST',
      fileSize: String(file.byteLength),
    }],
  }, { allowMutations: true, operation: `stage expanded clean banner ${handle}` });

  const errors = asArray(data?.stagedUploadsCreate?.userErrors);
  if (errors.length) throw new Error(`${handle}: ${formatErrors(errors)}`);
  const target = data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target?.url || !target?.resourceUrl) throw new Error(`${handle}: Shopify did not return a staged upload target.`);

  const curlArgs = ['-sS', '-X', 'POST', target.url];
  for (const parameter of asArray(target.parameters)) curlArgs.push('-F', `${parameter.name}=${parameter.value}`);
  curlArgs.push('-F', `file=@${filePath};type=image/png`);
  await execFileAsync('curl', curlArgs, { cwd: rootDir, maxBuffer: 10 * 1024 * 1024 });
  return target.resourceUrl;
}

async function updateCollectionImage(collection, resourceUrl) {
  const altText = `${collection.title} collection banner`;
  const data = await client.run(COLLECTION_UPDATE_MUTATION, {
    collection: { id: collection.id, image: { src: resourceUrl, altText } },
  }, { allowMutations: true, operation: `set expanded clean banner ${collection.handle}` });

  const errors = asArray(data?.collectionUpdate?.userErrors);
  if (errors.length) throw new Error(`${collection.handle}: ${formatErrors(errors)}`);
  const updated = data?.collectionUpdate?.collection;
  if (!updated?.image?.url) throw new Error(`${collection.handle}: Shopify returned no image URL after update.`);
  return updated;
}

const renderManifest = JSON.parse(await readFile(renderManifestPath, 'utf8'));
const targets = asArray(renderManifest.collections);
const expectedCount = isSixByFive ? 114 : isRemainingScope ? 35 : 68;
if (targets.length !== expectedCount) throw new Error(`Expected ${expectedCount} rendered ${bannerScope} banners, found ${targets.length}`);

let previousRowsByHandle = new Map();
if (process.env.SALT_BANNER_RESUME === '1') {
  try {
    const previousManifest = JSON.parse(await readFile(uploadManifestPath, 'utf8'));
    previousRowsByHandle = new Map(
      asArray(previousManifest.targets)
        .filter((row) => row.status === 'applied')
        .map((row) => [row.handle, row]),
    );
  } catch {
    // A missing or incomplete prior manifest simply means there is nothing to resume.
  }
}

const liveCollections = await fetchCollections();
const liveByHandle = new Map(liveCollections.map((collection) => [collection.handle, collection]));
const rows = targets.map((target) => {
  const live = liveByHandle.get(target.handle);
  if (!live) throw new Error(`Expanded banner target not found in Shopify: ${target.handle}`);
  if (normalizeShopifyId(live.id) !== normalizeShopifyId(target.collectionId)) {
    throw new Error(`Collection ID mismatch for ${target.handle}: expected ${target.collectionId}, got ${live.id}`);
  }
  const previous = previousRowsByHandle.get(target.handle);
  const liveAlreadyHasDesignedBanner = Boolean(
    live.image?.url && live.image?.altText === `${live.title} collection banner`,
  );
  const reuseExisting = previous || (process.env.SALT_BANNER_SKIP_EXISTING === '1' && liveAlreadyHasDesignedBanner);
  return {
    ...target,
    filePath: resolve(outputDir, target.fileName),
    existingImageUrl: live.image?.url || null,
    existingAltText: live.image?.altText || null,
    ...(reuseExisting ? {
      resourceUrl: previous?.resourceUrl || null,
      shopifyImageUrl: previous?.shopifyImageUrl || live.image.url,
      altText: previous?.altText || live.image.altText,
    } : {}),
    status: reuseExisting ? 'applied' : 'pending',
  };
});

const manifest = {
  generatedAt: new Date().toISOString(),
  ratio: bannerRatio,
  width: renderManifest.width || null,
  height: renderManifest.height || null,
  scope: isSixByFive
    ? '114 customer-facing collections including Salt Specials; 6x5 Shop.app-safe artwork; classification collections excluded and product membership untouched'
    : isRemainingScope
      ? '35 remaining customer-facing collections including Salt Specials; classification collections excluded and product membership untouched'
      : '68 screenshot-expanded collections only; original 11 collection banners untouched',
  source: 'clean generated category scene plus deterministic SALT reference-style typography overlay',
  targets: rows,
  summary: { requested: rows.length, applied: rows.filter((row) => row.status === 'applied').length, failed: 0 },
};
await writeFile(uploadManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(
  isSixByFive
    ? `Applying ${rows.length} 6x5 Shop.app-safe customer-facing banners including Salt Specials; product membership untouched`
    : isRemainingScope
    ? `Applying ${rows.length} remaining customer-facing clean banners including Salt Specials; product membership untouched`
    : `Applying ${rows.length} expanded clean banners; original 11 excluded`,
);

for (const row of rows) {
  if (row.status === 'applied') {
    console.log(`Already applied ${rows.indexOf(row) + 1}/${rows.length} ${row.handle}; resuming without a new upload`);
    continue;
  }
  try {
    const resourceUrl = await stageImage(row.filePath, row.handle);
    const updated = await updateCollectionImage(liveByHandle.get(row.handle), resourceUrl);
    row.resourceUrl = resourceUrl;
    row.shopifyImageUrl = updated.image.url;
    row.altText = updated.image.altText;
    row.status = 'applied';
    manifest.summary.applied += 1;
    await writeFile(uploadManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`Applied ${rows.indexOf(row) + 1}/${rows.length} ${row.handle}: ${updated.image.url}`);
  } catch (error) {
    row.status = 'failed';
    row.error = error instanceof Error ? error.message : String(error);
    manifest.summary.failed += 1;
    await writeFile(uploadManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    throw error;
  }
}

const readback = await fetchCollections();
const readbackByHandle = new Map(readback.map((collection) => [collection.handle, collection]));
const failedReadback = rows.filter((row) => {
  const current = readbackByHandle.get(row.handle);
  const expectedAltText = `${current?.title || row.title} collection banner`;
  return current?.image?.altText !== expectedAltText || !current?.image?.url;
});
if (failedReadback.length) throw new Error(`Shopify readback failed for: ${failedReadback.map((row) => row.handle).join(', ')}`);

manifest.completedAt = new Date().toISOString();
manifest.readback = {
  verified: rows.length,
  allImagesPresent: true,
  allAltTextExact: true,
  collections: rows.map((row) => {
    const current = readbackByHandle.get(row.handle);
    return { handle: row.handle, imageUrl: current.image.url, altText: current.image.altText };
  }),
};
await writeFile(uploadManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...manifest.summary, readbackVerified: manifest.readback.verified }));
