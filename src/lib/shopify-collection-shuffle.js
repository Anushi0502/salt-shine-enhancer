function hashSeed(value) {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function shuffleCollectionProductIds(productIds, seed) {
  const values = [...new Set((Array.isArray(productIds) ? productIds : []).map((value) => String(value || "")).filter(Boolean))];
  if (values.length < 2) return values;
  // A small seeded rotation produces a different daily storefront order while
  // changing only a bounded prefix. Full Fisher-Yates permutations force
  // hundreds of Shopify reorder jobs for large collections and are not worth
  // the extra API churn when the collection is already manually curated.
  const offset = 1 + (hashSeed(seed) % Math.min(values.length - 1, 24));
  return [...values.slice(-offset), ...values.slice(0, -offset)];
}

export function buildLiveMembershipTarget(currentIds, plannedIds) {
  const current = [...new Set((Array.isArray(currentIds) ? currentIds : []).map((id) => String(id || "")).filter(Boolean))];
  const planned = [...new Set((Array.isArray(plannedIds) ? plannedIds : []).map((id) => String(id || "")).filter(Boolean))];
  const currentSet = new Set(current);
  const plannedSet = new Set(planned);
  return [
    ...planned.filter((id) => currentSet.has(id)),
    ...current.filter((id) => !plannedSet.has(id)),
  ];
}

export function buildCollectionReorderMoves(currentIds, desiredIds, maxMoves = 250) {
  const current = [...currentIds];
  const desired = [...desiredIds];
  const moves = [];
  for (let index = 0; index < desired.length && moves.length < maxMoves; index += 1) {
    if (current[index] === desired[index]) continue;
    const sourceIndex = current.indexOf(desired[index], index + 1);
    if (sourceIndex < 0) continue;
    const [id] = current.splice(sourceIndex, 1);
    current.splice(index, 0, id);
    moves.push({ id, newPosition: index });
  }
  return moves;
}

export function applyCollectionReorderMoves(currentIds, moves) {
  const current = [...currentIds];
  for (const move of Array.isArray(moves) ? moves : []) {
    const sourceIndex = current.indexOf(String(move?.id || ""));
    if (sourceIndex < 0) continue;
    const [id] = current.splice(sourceIndex, 1);
    const targetIndex = Math.max(0, Math.min(Number(move.newPosition) || 0, current.length));
    current.splice(targetIndex, 0, id);
  }
  return current;
}
