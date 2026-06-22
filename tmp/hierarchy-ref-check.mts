import { readFileSync } from 'node:fs';

const hierarchyText = readFileSync('src/lib/collection-hierarchy.ts', 'utf8');
const live = JSON.parse(readFileSync('tmp/collections-admin.json', 'utf8')) as {
  collections: { nodes: Array<{ handle: string; title: string }> };
};
const liveHandles = new Set(live.collections.nodes.map((collection) => collection.handle.toLowerCase()));

const handleMatches = [...hierarchyText.matchAll(/handle:\s*"([^"]+)"/g)].map((match) => match[1]);
const childHandleMatches = [...hierarchyText.matchAll(/childHandles:\s*\[([\s\S]*?)\]/g)].flatMap((match) =>
  [...match[1].matchAll(/"([^"]+)"/g)].map((inner) => inner[1]),
);
const featuredHandleMatches = [...hierarchyText.matchAll(/preferredHandles:\s*\[([\s\S]*?)\]/g)].flatMap((match) =>
  [...match[1].matchAll(/"([^"]+)"/g)].map((inner) => inner[1]),
);

const referencedHandles = [...new Set([...handleMatches, ...childHandleMatches, ...featuredHandleMatches].map((value) => value.toLowerCase()))].sort();
const missingReferencedHandles = referencedHandles.filter((handle) => !liveHandles.has(handle));
const unreferencedLiveHandles = [...liveHandles].filter((handle) => !referencedHandles.includes(handle)).sort();

console.log(JSON.stringify({
  referencedHandles,
  missingReferencedHandles,
  unreferencedLiveHandles,
}, null, 2));