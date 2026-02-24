#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.env.SALT_SHOP_URL || "https://www.saltonlinestore.com";
const limit = Number(process.env.SALT_PAGE_LIMIT || 250);
const outDir = resolve(process.cwd(), "public", "data");

async function fetchPaged(key, endpoint) {
  const rows = [];
  let page = 1;

  while (true) {
    const url = `${baseUrl}${endpoint}?limit=${limit}&page=${page}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Request failed (${response.status}) for ${url}`);
    }

    const json = await response.json();
    const chunk = Array.isArray(json[key]) ? json[key] : [];

    rows.push(...chunk);
    process.stdout.write(`Fetched ${key} page ${page}: ${chunk.length}\n`);

    if (chunk.length < limit) {
      break;
    }

    page += 1;
  }

  return rows;
}

async function fetchCollectionProductIds(handle) {
  const ids = [];
  let page = 1;

  while (true) {
    const url = `${baseUrl}/collections/${handle}/products.json?limit=${limit}&page=${page}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Collection request failed (${response.status}) for ${url}`);
    }

    const payload = await response.json();
    const products = Array.isArray(payload.products) ? payload.products : [];

    ids.push(...products.map((product) => product.id));

    if (products.length < limit) {
      break;
    }

    page += 1;
  }

  return ids;
}

function sortByUpdatedAt(items) {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a.updated_at || a.published_at || "1970-01-01");
    const bTime = Date.parse(b.updated_at || b.published_at || "1970-01-01");
    return bTime - aTime;
  });
}

async function main() {
  const startedAt = new Date().toISOString();

  const [products, collections] = await Promise.all([
    fetchPaged("products", "/products.json"),
    fetchPaged("collections", "/collections.json"),
  ]);

  const productPayload = {
    generatedAt: startedAt,
    source: baseUrl,
    total: products.length,
    products: sortByUpdatedAt(products),
  };

  const collectionPayload = {
    generatedAt: startedAt,
    source: baseUrl,
    total: collections.length,
    collections: sortByUpdatedAt(collections),
  };

  const collectionProductMap = {
    generatedAt: startedAt,
    source: baseUrl,
    totalCollections: collections.length,
    collections: {},
  };

  for (const collection of collections) {
    const ids = await fetchCollectionProductIds(collection.handle);
    collectionProductMap.collections[collection.handle] = {
      title: collection.title,
      productIds: ids,
    };

    process.stdout.write(
      `Fetched collection mapping ${collection.handle}: ${ids.length} products\n`,
    );
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, "products.json"), JSON.stringify(productPayload));
  await writeFile(resolve(outDir, "collections.json"), JSON.stringify(collectionPayload));
  await writeFile(
    resolve(outDir, "collection-products.json"),
    JSON.stringify(collectionProductMap),
  );

  process.stdout.write(`Saved ${productPayload.total} products to public/data/products.json\n`);
  process.stdout.write(`Saved ${collectionPayload.total} collections to public/data/collections.json\n`);
  process.stdout.write(
    `Saved collection product mapping to public/data/collection-products.json\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
