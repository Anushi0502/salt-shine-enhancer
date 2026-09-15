#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { join } from "node:path";

export async function readProductCatalogPayload(dataDir) {
  const sharedCatalogPaths = [
    process.env.SALT_RELEASE_CATALOG_SOURCE_PATH,
    process.env.SALT_RELEASE_CATALOG_SNAPSHOT_PATH,
  ].filter((path, index, paths) => path && paths.indexOf(path) === index);
  for (const sharedCatalogPath of sharedCatalogPaths) {
    try {
      const shared = JSON.parse(await readFile(resolve(sharedCatalogPath), "utf8"));
      if (Array.isArray(shared?.products) && shared.products.length) return shared.products;
    } catch {
      // Try the next canonical release catalog before falling back to shards.
    }
  }
  const names = (await readdir(dataDir))
    .filter((name) => /^products(?:-\d+)?\.json$/.test(name))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const products = [];
  for (const name of names) {
    const payload = JSON.parse(await readFile(join(dataDir, name), "utf8"));
    if (Array.isArray(payload)) products.push(...payload);
    else if (Array.isArray(payload?.products)) products.push(...payload.products);
  }
  if (!products.length) throw new Error(`No product catalog shards found in ${dataDir}`);
  return products;
}
