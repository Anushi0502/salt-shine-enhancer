#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildProductKnowledgePayload } from "../src/lib/product-knowledge-base.js";
import { readProductCatalogPayload } from "./product-catalog-files.mjs";

const dataDir = resolve(process.cwd(), "public", "data");
const outputDir = resolve(process.cwd(), "output");
const knowledgePath = resolve(outputDir, "product-knowledge.json");

async function main() {
  const productsPayload = await readProductCatalogPayload(dataDir);
  const knowledgePayload = buildProductKnowledgePayload(productsPayload);

  await mkdir(outputDir, { recursive: true });
  await writeFile(knowledgePath, JSON.stringify(knowledgePayload));
  process.stdout.write(
    `Saved knowledge base for ${knowledgePayload.totalProducts} products and ${knowledgePayload.uniqueProductTypes} unique product types to output/product-knowledge.json\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
