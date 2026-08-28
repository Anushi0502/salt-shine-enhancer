#!/usr/bin/env node

import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { once } from "node:events";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { readProductCatalogPayload } from "./product-catalog-files.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const dataDir = resolve(rootDir, "public", "data");
const outputPath = resolve(rootDir, process.env.SALT_RELEASE_CATALOG_SNAPSHOT_PATH || "output/release-catalog-snapshot.json");

async function readOptional(name, fallback) {
  try {
    return JSON.parse(await readFile(resolve(dataDir, name), "utf8"));
  } catch {
    return fallback;
  }
}

// A final live-enrichment pass must replace the shared release snapshot with
// the refreshed public catalog rather than reading the older snapshot again.
// Normal release stages continue to reuse the shared snapshot unchanged.
const snapshotPathFromEnv = process.env.SALT_RELEASE_CATALOG_SNAPSHOT_PATH;
if (process.env.SALT_RELEASE_CATALOG_SNAPSHOT_REFRESH === "1") {
  delete process.env.SALT_RELEASE_CATALOG_SNAPSHOT_PATH;
}
const catalog = await readProductCatalogPayload(dataDir);
if (snapshotPathFromEnv && process.env.SALT_RELEASE_CATALOG_SNAPSHOT_REFRESH === "1") {
  process.env.SALT_RELEASE_CATALOG_SNAPSHOT_PATH = snapshotPathFromEnv;
}
const collections = await readOptional("collections.json", { collections: [] });
const collectionProducts = await readOptional("collection-products.json", { collections: {} });
const products = Array.isArray(catalog?.products) ? catalog.products : [];
const fingerprint = createHash("sha256")
  .update(products.map((product) => `${product?.id || ""}:${product?.handle || ""}:${product?.updated_at || product?.updatedAt || ""}`).sort().join("\n"))
  .digest("hex");

await mkdir(resolve(rootDir, "output"), { recursive: true });

async function writeChunk(stream, chunk) {
  if (stream.write(chunk)) return;
  await once(stream, "drain");
}

async function closeStream(stream) {
  await new Promise((resolvePromise, rejectPromise) => {
    stream.once("error", rejectPromise);
    stream.end(resolvePromise);
  });
}

// Keep the complete catalog in the shared snapshot, but never build one
// 400+ MB JavaScript string. Node's string-length ceiling is lower than the
// catalog payload even when the process has enough heap for the objects.
const stream = createWriteStream(outputPath, { encoding: "utf8" });
try {
  await writeChunk(stream, `{"generatedAt":${JSON.stringify(new Date().toISOString())},"fingerprint":${JSON.stringify(fingerprint)},"products":[`);
  for (const [index, product] of products.entries()) {
    if (index) await writeChunk(stream, ",");
    await writeChunk(stream, JSON.stringify(product));
  }
  await writeChunk(stream, `],"collections":${JSON.stringify(Array.isArray(collections?.collections) ? collections.collections : collections)},"collectionProducts":${JSON.stringify(collectionProducts)}}\n`);
  await closeStream(stream);
} catch (error) {
  stream.destroy();
  throw error;
}

process.stdout.write(`Shared release catalog snapshot: ${products.length} products, ${fingerprint.slice(0, 12)}\n`);
process.stdout.write(`Snapshot path: ${outputPath}\n`);
