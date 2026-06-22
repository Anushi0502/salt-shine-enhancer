import { readFileSync } from 'node:fs';
import { SITE_COLLECTIONS, SITE_HEADER_COLLECTION_LINKS } from '../src/lib/site-navigation.ts';

function loadJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8')) as any;
}

const collectionsPayload = loadJson('tmp/collections-admin.json');
const collectionMapPayload = loadJson('public/data/collection-products.json');
const liveCollections = collectionsPayload.collections.nodes as Array<{
  title: string;
  handle: string;
  updatedAt: string;
  sortOrder: string;
  templateSuffix: string | null;
  productsCount: { count: number; precision?: string };
  ruleSet: null | {
    appliedDisjunctively: boolean;
    rules: Array<{ column: string; relation: string; condition: string }>;
  };
}>;

const liveByHandle = new Map(liveCollections.map((collection) => [collection.handle, collection] as const));
const collectionProducts = collectionMapPayload.collections as Record<string, { title: string; productIds: number[] }>;

const menuLiveHandles = new Set<string>();
const menuRouteHandles = new Set<string>();

for (const collection of SITE_COLLECTIONS) {
  if (collection.shopifyHandle) {
    menuLiveHandles.add(collection.shopifyHandle);
  }
  menuRouteHandles.add(collection.handle);
  for (const subcollection of collection.subcollections) {
    if (subcollection.shopifyHandle) {
      menuLiveHandles.add(subcollection.shopifyHandle);
    }
    menuRouteHandles.add(subcollection.handle);
  }
}

for (const link of SITE_HEADER_COLLECTION_LINKS) {
  menuLiveHandles.add(link.routeHandle);
  menuRouteHandles.add(link.routeHandle);
  for (const activeHandle of link.activeCollectionHandles) {
    menuLiveHandles.add(activeHandle);
  }
}

const liveHandles = new Set(liveCollections.map((collection) => collection.handle));
const menuLiveMissing = [...menuLiveHandles].filter((handle) => !liveHandles.has(handle)).sort();
const extraLiveCollections = liveCollections
  .filter((collection) => !menuLiveHandles.has(collection.handle))
  .sort((a, b) => a.title.localeCompare(b.title));

const manualCollections = liveCollections.filter((collection) => !collection.ruleSet);
const automatedCollections = liveCollections.filter((collection) => Boolean(collection.ruleSet));
const zeroCountCollections = liveCollections.filter((collection) => collection.productsCount?.count === 0);

const handleEntries = Object.entries(collectionProducts).map(([handle, entry]) => [handle, new Set(entry.productIds)] as const);
const overlapPairs: Array<{
  a: string;
  b: string;
  inter: number;
  jaccard: number;
  aCount: number;
  bCount: number;
}> = [];

for (let i = 0; i < handleEntries.length; i += 1) {
  for (let j = i + 1; j < handleEntries.length; j += 1) {
    const [aHandle, aSet] = handleEntries[i];
    const [bHandle, bSet] = handleEntries[j];
    let inter = 0;
    for (const value of aSet) {
      if (bSet.has(value)) {
        inter += 1;
      }
    }
    if (inter === 0) {
      continue;
    }
    const union = aSet.size + bSet.size - inter;
    const jaccard = inter / union;
    overlapPairs.push({ a: aHandle, b: bHandle, inter, jaccard, aCount: aSet.size, bCount: bSet.size });
  }
}

overlapPairs.sort((left, right) => {
  if (right.inter !== left.inter) {
    return right.inter - left.inter;
  }
  return right.jaccard - left.jaccard;
});

const broadHandles = new Set([
  'all-products',
  'winter-wear',
  'deals-sale',
  'under-100',
  'under-50',
  'under-35',
  'under-25',
  'under-10',
  'appplaza-best-sellers',
  'new-arrivals',
  'unique-products',
]);
const focusedOverlapPairs = overlapPairs.filter((pair) => !broadHandles.has(pair.a) && !broadHandles.has(pair.b));

const exactDuplicatePairs = overlapPairs.filter((pair) => pair.inter === pair.aCount && pair.inter === pair.bCount);
const subsetPairs = overlapPairs.filter((pair) => (pair.inter === pair.aCount || pair.inter === pair.bCount) && pair.inter > 0 && pair.aCount !== pair.bCount);

const membershipCounts = new Map<number, string[]>();
for (const [handle, set] of handleEntries) {
  for (const productId of set) {
    const arr = membershipCounts.get(productId) || [];
    arr.push(handle);
    membershipCounts.set(productId, arr);
  }
}

const crossAssignedProducts = [...membershipCounts.entries()]
  .filter(([, handles]) => handles.length >= 4)
  .map(([productId, handles]) => ({ productId, handles: handles.slice().sort() }))
  .sort((left, right) => right.handles.length - left.handles.length || left.productId - right.productId)
  .slice(0, 30);

const menuTopLevelHandles = SITE_COLLECTIONS.map((collection) => collection.shopifyHandle).filter(Boolean) as string[];
const topLevelRuleSummaries = SITE_COLLECTIONS.map((collection) => {
  const live = liveByHandle.get(collection.shopifyHandle);
  return {
    menuTitle: collection.title,
    routeHandle: collection.handle,
    liveHandle: collection.shopifyHandle,
    liveTitle: live?.title || null,
    productsCount: live?.productsCount?.count ?? null,
    sortOrder: live?.sortOrder || null,
    ruleSet: live?.ruleSet || null,
  };
});

console.log(JSON.stringify({
  liveCollectionCount: liveCollections.length,
  menuLiveHandles: [...menuLiveHandles].sort(),
  menuLiveMissing,
  extraLiveCollectionCount: extraLiveCollections.length,
  extraLiveCollections: extraLiveCollections.map((collection) => ({
    title: collection.title,
    handle: collection.handle,
    count: collection.productsCount?.count ?? null,
    sortOrder: collection.sortOrder,
    hasRules: Boolean(collection.ruleSet),
    templateSuffix: collection.templateSuffix || null,
  })),
  manualCollectionCount: manualCollections.length,
  manualCollections: manualCollections.map((collection) => ({ title: collection.title, handle: collection.handle, count: collection.productsCount?.count ?? null })),
  automatedCollectionCount: automatedCollections.length,
  zeroCountCollections: zeroCountCollections.map((collection) => ({ title: collection.title, handle: collection.handle })),
  exactDuplicatePairs: exactDuplicatePairs.slice(0, 20).map((pair) => ({ a: pair.a, b: pair.b, count: pair.inter })),
  subsetPairs: subsetPairs.slice(0, 20).map((pair) => ({ a: pair.a, b: pair.b, inter: pair.inter, aCount: pair.aCount, bCount: pair.bCount })),
  topOverlaps: overlapPairs.slice(0, 20),
  focusedTopOverlaps: focusedOverlapPairs.slice(0, 20),
  crossAssignedProducts,
  topLevelRuleSummaries,
}, null, 2));