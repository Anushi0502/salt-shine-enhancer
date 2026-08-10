#!/usr/bin/env node

import { resolve } from "node:path";
import { buildProductSearchPayload } from "./product-search-index.mjs";
import { readProductCatalogPayload } from "./product-catalog-files.mjs";
import { writeProductSearchPayload } from "./product-search-files.mjs";
import { readCatalogKnowledgeModel } from "./catalog-knowledge-model-files.mjs";

const dataDir = resolve(process.cwd(), "public", "data");

async function main() {
  const productsPayload = await readProductCatalogPayload(dataDir);
  const knowledgeModel = await readCatalogKnowledgeModel({
    required: process.env.SALT_REQUIRE_KNOWLEDGE_MODEL === "1",
  });
  const searchPayload = buildProductSearchPayload(productsPayload, { knowledgeModel });

  const manifest = await writeProductSearchPayload(dataDir, searchPayload);
  process.stdout.write(
    `Saved ${searchPayload.total} compact search products to public/data/product-search.json across ${manifest.shardCount} shards (max ${manifest.shardMaxBytes} bytes each)\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
