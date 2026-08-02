#!/usr/bin/env node

import { classifyProductKnowledge } from "../src/lib/product-knowledge-base.js";

const requestedTotal = Number.parseInt(process.env.SALT_TAXONOMY_SCALE_PRODUCTS || "500000", 10);
const total = Number.isFinite(requestedTotal) && requestedTotal > 0 ? requestedTotal : 500000;
const knowledgeIds = new Set();
const specificTypeKeys = new Set();
const startedAt = performance.now();

// Stream records instead of allocating a synthetic catalog. This mirrors the
// release worker's page-by-page behavior for a large Shopify catalog.
for (let index = 1; index <= total; index += 1) {
  const knowledge = classifyProductKnowledge({
    id: index,
    handle: `long-tail-product-${index}`,
    title: `Long Tail Product Type ${index}`,
    // Use one repeated supplier product type to prove identity does not depend
    // on every record receiving a made-up unique type.
    product_type: "long tail product",
    tags: ["long tail"],
  });
  knowledgeIds.add(knowledge.productKnowledgeId);
  specificTypeKeys.add(knowledge.specificTypeKey);
}

if (knowledgeIds.size !== total || specificTypeKeys.size !== total) {
  throw new Error(`Scale check failed: expected ${total} separate knowledge records and type keys, received ${knowledgeIds.size}/${specificTypeKeys.size}.`);
}

const elapsedMs = performance.now() - startedAt;
const memoryMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
console.log(JSON.stringify({
  totalProducts: total,
  uniqueKnowledgeRecords: knowledgeIds.size,
  uniqueSpecificTypes: specificTypeKeys.size,
  elapsedMs: Math.round(elapsedMs),
  productsPerSecond: Math.round(total / (elapsedMs / 1000)),
  rssMb: memoryMb,
}, null, 2));
