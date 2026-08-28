#!/usr/bin/env node

import { scoreCatalogKnowledgeModel } from "../src/lib/catalog-knowledge-model.js";

// The release uses this module for bounded local scoring. It must remain able
// to score products added after the last MLX cache was written; otherwise a
// catalog boundary change turns a safe reclassification into a hard stop.
export async function scoreCatalogKnowledgeModelBatch(model, products) {
  if (!model?.trained || !Array.isArray(products) || !products.length) return null;
  return new Map(
    products.map((product) => [
      String(product?.id || product?.handle || ""),
      scoreCatalogKnowledgeModel(model, product),
    ]),
  );
}
