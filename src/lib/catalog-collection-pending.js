export function manifestPendingCreationHandles(manifest, expectedVersion) {
  if (String(manifest?.releaseVersion || "").trim() !== String(expectedVersion || "").trim()) {
    return new Set();
  }

  return new Set(
    (Array.isArray(manifest.collectionTargets) ? manifest.collectionTargets : [])
      .filter((target) => target?.action === "create" && !target?.existing)
      .map((target) => String(target?.entry?.handle || "").trim().toLowerCase())
      .filter(Boolean),
  );
}
