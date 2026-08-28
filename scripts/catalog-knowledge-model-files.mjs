#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const defaultModelPath = resolve(rootDir, "output", "catalog-knowledge-model.json");

export const catalogKnowledgeModelPath = process.env.SALT_CATALOG_KNOWLEDGE_MODEL_PATH || defaultModelPath;

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

export async function readCatalogKnowledgeModel({ required = false } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const raw = (await readFile(catalogKnowledgeModelPath, "utf8")).trim();
      if (!raw) throw new Error("knowledge model file is empty");
      const model = JSON.parse(raw);
      if (!model || typeof model !== "object") throw new Error("knowledge model is not an object");
      return model;
    } catch (error) {
      lastError = error;
      if (attempt < 4) await sleep(500 * 2 ** attempt);
    }
  }
  if (required) {
    throw new Error(`Catalog knowledge model is required but could not be read from ${catalogKnowledgeModelPath}: ${lastError?.message || "unknown error"}`);
  }
  return null;
}
