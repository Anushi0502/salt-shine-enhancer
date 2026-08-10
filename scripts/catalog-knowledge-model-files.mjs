import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  assertCatalogKnowledgeModel,
  summarizeCatalogKnowledgeModel,
} from "../src/lib/catalog-knowledge-model.js";

const rootDir = resolve(import.meta.dirname, "..");
export const catalogKnowledgeModelPath = resolve(rootDir, "output", "catalog-knowledge-model.json");

export async function readCatalogKnowledgeModel({ required = false, path = catalogKnowledgeModelPath } = {}) {
  let model;
  try {
    model = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (!required && error?.code === "ENOENT") return null;
    throw new Error(`Catalog knowledge model could not be read at ${path}: ${error.message}`);
  }
  return assertCatalogKnowledgeModel(model);
}

export function describeCatalogKnowledgeModel(model) {
  return summarizeCatalogKnowledgeModel(model) || {
    modelVersion: "missing",
    trainingRecords: 0,
    representativeRules: 0,
  };
}
