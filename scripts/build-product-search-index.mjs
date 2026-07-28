#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildProductSearchPayload } from "./product-search-index.mjs";
import { readProductCatalogPayload } from "./product-catalog-files.mjs";

const dataDir = resolve(process.cwd(), "public", "data");
const searchIndexPath = resolve(dataDir, "product-search.json");

async function main() {
  const productsPayload = await readProductCatalogPayload(dataDir);
  const searchPayload = buildProductSearchPayload(productsPayload);

  await writeFile(searchIndexPath, JSON.stringify(searchPayload));
  process.stdout.write(`Saved ${searchPayload.total} compact search products to public/data/product-search.json\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
