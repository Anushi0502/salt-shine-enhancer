#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildProductSearchPayload } from "./product-search-index.mjs";

const dataDir = resolve(process.cwd(), "public", "data");
const productsPath = resolve(dataDir, "products.json");
const searchIndexPath = resolve(dataDir, "product-search.json");

async function main() {
  const productsPayload = JSON.parse(await readFile(productsPath, "utf8"));
  const searchPayload = buildProductSearchPayload(productsPayload);

  await writeFile(searchIndexPath, JSON.stringify(searchPayload));
  process.stdout.write(`Saved ${searchPayload.total} compact search products to public/data/product-search.json\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
