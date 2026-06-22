import { readFileSync } from 'node:fs';
import { HOME_COLLECTION_GROUPS, HOME_FEATURED_SHORTCUTS } from '../src/lib/collection-hierarchy.ts';

const live = JSON.parse(readFileSync('tmp/collections-admin.json', 'utf8')) as {
  collections: { nodes: Array<{ handle: string; title: string }> };
};
const liveHandles = new Set(live.collections.nodes.map((collection) => collection.handle.toLowerCase()));

const groupHandles = HOME_COLLECTION_GROUPS.map((group) => group.handle);
const childHandles = HOME_COLLECTION_GROUPS.flatMap((group) => group.childHandles);
const featuredHandles = HOME_FEATURED_SHORTCUTS.flatMap((shortcut) => shortcut.preferredHandles);

const missingGroupHandles = groupHandles.filter((handle) => !liveHandles.has(handle));
const missingChildHandles = childHandles.filter((handle) => !liveHandles.has(handle));
const missingFeaturedHandles = featuredHandles.filter((handle) => !liveHandles.has(handle));

console.log(JSON.stringify({
  groupHandles,
  childHandles,
  featuredHandles,
  missingGroupHandles,
  missingChildHandles,
  missingFeaturedHandles,
}, null, 2));