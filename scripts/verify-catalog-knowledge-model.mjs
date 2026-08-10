#!/usr/bin/env node

import { describeCatalogKnowledgeModel, readCatalogKnowledgeModel } from "./catalog-knowledge-model-files.mjs";

async function main() {
  const model = await readCatalogKnowledgeModel({ required: true });
  process.stdout.write(`${JSON.stringify({
    status: "verified",
    ...describeCatalogKnowledgeModel(model),
    validation: model.validation,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
