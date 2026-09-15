#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..");
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const nodeBin = process.execPath;

function run(label, command, args, env = process.env) {
  process.stdout.write(`\n${label}\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    const detail = result.signal
      ? `signal ${result.signal}`
      : `exit code ${result.status ?? "unknown"}`;
    throw new Error(`${label} failed with ${detail}; the next guarded stage was not started.`);
  }
}

async function readCurrentCatalogBoundary() {
  const candidates = [
    process.env.SALT_RELEASE_CATALOG_SOURCE_PATH,
    process.env.SALT_RELEASE_CATALOG_SNAPSHOT_PATH,
    resolve(root, "output", "release-catalog-source.json"),
    resolve(root, "public", "data", "products.json"),
  ].filter(Boolean);
  for (const filePath of candidates) {
    try {
      const payload = JSON.parse(await readFile(filePath, "utf8"));
      const products = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.products)
          ? payload.products
          : [];
      const handles = products
        .map((product) => String(product?.handle || "").trim().toLowerCase())
        .filter(Boolean)
        .sort();
      if (!handles.length) continue;
      return {
        count: handles.length,
        hash: `sha256-${createHash("sha256").update(handles.join("\n")).digest("hex")}`,
      };
    } catch {
      // Try the next release/source boundary candidate.
    }
  }
  return null;
}

async function hasReusableSeoDryRun(manifestPath, { mode = "deterministic", scope = "all-products" } = {}) {
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const current = await readCurrentCatalogBoundary();
    const summary = manifest.summary || {};
    const products = Array.isArray(manifest.products) ? manifest.products : [];
    const audited = Number(summary.exactMatches || 0) + Number(summary.wouldUpdate || 0);
    const gptExpected = mode === "gpt";
    const gptPolicy = manifest.policy?.gptSeo || {};
    const manifestScope = gptPolicy.scope || (manifest.policy?.newProductsOnly ? "new-products" : "all-products");
    return manifest.mode === "dry-run"
      && Boolean(manifest.completedAt)
      && Array.isArray(manifest.failures)
      && manifest.failures.length === 0
      && current
      && Number(summary.sourceProducts || 0) === current.count
      && manifest.policy?.catalogBoundary === current.hash
      && products.length === current.count
      && audited === current.count
      && manifestScope === scope
      && Boolean(gptPolicy.enabled) === gptExpected
      && (!gptExpected || gptPolicy.scope === scope)
      && products.every((entry) => !String(entry.status || "").startsWith("failed"));
  } catch {
    return false;
  }
}

async function hasCompletedVariantSeoManifest() {
  try {
    const manifest = JSON.parse(await readFile(resolve(root, "output", "shopify-variant-google-metafield-manifest.json"), "utf8"));
    return manifest.mode === "apply"
      && manifest.status === "applied-and-verified"
      && Boolean(manifest.completedAt)
      && Number(manifest.summary?.selectedVariants || 0) > 0
      && Number(manifest.summary?.totalWrites || 0) > 0
      && Number(manifest.verifiedWrites || 0) === Number(manifest.summary?.totalWrites || 0);
  } catch {
    return false;
  }
}

async function hasCompletedProductSeoManifest() {
  try {
    const manifest = JSON.parse(await readFile(resolve(root, "output", "shopify-seo-release-manifest.json"), "utf8"));
    const summary = manifest.summary || {};
    const planned = Number(summary.plannedProducts || 0);
    return manifest.mode === "apply"
      && Boolean(manifest.completedAt)
      && Number(summary.failed || 0) === 0
      && Number(summary.unresolved || 0) === 0
      && planned > 0
      && Number(summary.exactMatches || 0) + Number(summary.updatedVerified || 0) === planned;
  } catch {
    return false;
  }
}

const resumeAtVariantImage = process.env.SALT_SEO_GUARDED_RESUME_FROM_VARIANT_IMAGE === "1";
const resumeAfterProductSeo = process.env.SALT_SEO_GUARDED_RESUME_AFTER_PRODUCT_SEO === "1"
  && await hasCompletedProductSeoManifest();
const seoDryRunManifestPath = process.env.SALT_SHOPIFY_SEO_DRY_RUN_MANIFEST_PATH
  || resolve(root, "output", "shopify-seo-release-dry-run-manifest.json");
const releaseSeoMode = String(process.env.SALT_RELEASE_SEO_MODE || "deterministic").trim().toLowerCase();
const releaseSeoScope = String(process.env.SALT_RELEASE_SEO_SCOPE || "all-products").trim().toLowerCase();
if (!["deterministic", "gpt"].includes(releaseSeoMode)) {
  throw new Error(`Unsupported guarded SEO mode: ${releaseSeoMode}`);
}
if (!["all-products", "new-products"].includes(releaseSeoScope)) {
  throw new Error(`Unsupported guarded SEO scope: ${releaseSeoScope}`);
}
const gptEnrichmentPath = resolve(
  root,
  process.env.SALT_GPT_SEO_ENRICHMENT_PATH || "output/gpt-seo-enrichment.json",
);
const gptSelectedHandlesPath = resolve(
  root,
  process.env.SALT_GPT_SEO_NEW_PRODUCTS_HANDLES_PATH || "output/gpt-seo-selected-handles.json",
);
const seoScopeArgs = releaseSeoScope === "new-products"
  ? ["--new-products-only", ...(releaseSeoMode === "gpt" ? ["--product-handles-file", gptSelectedHandlesPath] : [])]
  : ["--full-catalog"];
const guardedSeoEnv = {
  ...process.env,
  SALT_GPT_SEO_ENRICHMENT_PATH: gptEnrichmentPath,
  ...(releaseSeoScope === "new-products"
    ? { SALT_GPT_SEO_NEW_PRODUCTS_HANDLES_PATH: gptSelectedHandlesPath }
    : {}),
};
if (releaseSeoMode === "gpt") {
  let enrichment;
  try {
    enrichment = JSON.parse(await readFile(gptEnrichmentPath, "utf8"));
  } catch (error) {
    throw new Error(`GPT SEO mode requires a readable completed enrichment manifest at ${gptEnrichmentPath}: ${error.message}`);
  }
  if (enrichment?.status !== "completed" || enrichment?.scope !== releaseSeoScope) {
    throw new Error(`GPT SEO enrichment is not complete for ${releaseSeoScope}; no Shopify SEO dry-run or apply was started.`);
  }
  if (releaseSeoScope === "new-products") {
    try {
      const handles = JSON.parse(await readFile(gptSelectedHandlesPath, "utf8"));
      if (!Array.isArray(handles?.handles) || handles.handles.length !== Number(enrichment.summary?.selected || 0)) {
        throw new Error("selected handle count does not match the enrichment manifest");
      }
    } catch (error) {
      throw new Error(`GPT SEO new-product scope requires a matching handle manifest at ${gptSelectedHandlesPath}: ${error.message}`);
    }
  }
}
const variantImageCachePath = process.env.SALT_VARIANT_IMAGE_MEDIA_CACHE_PATH
  || resolve(tmpdir(), "salt-variant-image-live-media-cache.json");
const variantImageCheckpointPath = process.env.SALT_VARIANT_IMAGE_CHECKPOINT_PATH
  || resolve(tmpdir(), "salt-variant-image-mapping-checkpoint.json");
const variantImageEnv = {
  ...process.env,
  SALT_VARIANT_IMAGE_MEDIA_CACHE_PATH: variantImageCachePath,
  SALT_VARIANT_IMAGE_CHECKPOINT_PATH: variantImageCheckpointPath,
  // A single live-media reader avoids Shopify throttle herds during a full
  // catalog resume; local planning and verification remain parallel.
  SALT_VARIANT_IMAGE_FETCH_CONCURRENCY:
    process.env.SALT_VARIANT_IMAGE_FETCH_CONCURRENCY || "1",
  SALT_VARIANT_IMAGE_INTER_BATCH_DELAY_MS:
    process.env.SALT_VARIANT_IMAGE_INTER_BATCH_DELAY_MS || "1000",
  SALT_SHOPIFY_REQUEST_DELAY_MS:
    process.env.SALT_SHOPIFY_REQUEST_DELAY_MS || "750",
  SALT_VARIANT_IMAGE_ALLOW_SOURCE_ONLY_EXCLUSIONS:
    process.env.SALT_VARIANT_IMAGE_ALLOW_SOURCE_ONLY_EXCLUSIONS || "1",
};

if (!resumeAtVariantImage && !resumeAfterProductSeo) {
  run("1. Verify trained 128M-record catalog knowledge model", npmBin, ["run", "catalog:knowledge:model:verify"]);
  run("2. Verify catalog taxonomy approval", nodeBin, ["scripts/catalog-taxonomy-approval.mjs"]);
  run("3. Validate local catalog taxonomy", npmBin, ["run", "catalog:taxonomy:validate"]);
  run("4. Build the visual taxonomy review queue", npmBin, ["run", "catalog:image-review:build"]);
  run("5. Require image-backed evidence for every review-required product", npmBin, ["run", "catalog:image-review:validate"]);
  run("6. Full local catalog SEO audit", npmBin, ["run", "shopify:seo:local-review"]);
  run("7. Live taxonomy tags and metafields dry-run", npmBin, ["run", "shopify:taxonomy:dry-run"]);
  if (await hasReusableSeoDryRun(seoDryRunManifestPath, { mode: releaseSeoMode, scope: releaseSeoScope })) {
    process.stdout.write(`8. Reusing verified full-catalog SEO dry-run: ${seoDryRunManifestPath}\n`);
  } else {
    run(
      "8. Live full-catalog Shopify SEO dry-run with prices and tags preserved",
      nodeBin,
      [
        "scripts/shopify-seo-release.mjs",
        "--dry-run",
        ...seoScopeArgs,
        "--preserve-prices",
        "--preserve-tags",
        "--output",
        seoDryRunManifestPath,
      ],
      guardedSeoEnv,
    );
  }
  run(
    `9. Guarded ${releaseSeoScope} Shopify SEO apply (${releaseSeoMode}) with prices and tags preserved`,
    nodeBin,
    ["scripts/shopify-seo-release.mjs", "--apply", ...seoScopeArgs, "--preserve-prices", "--preserve-tags"],
    guardedSeoEnv,
  );
  run("10. Apply taxonomy tags and metafields with live readback", npmBin, ["run", "shopify:taxonomy:apply"]);
} else if (resumeAtVariantImage) {
  process.stdout.write("Reusing completed guarded SEO and taxonomy stages; resuming at variant image mapping.\n");
} else {
  process.stdout.write("Reusing completed guarded product SEO and taxonomy stages; resuming at variant-specific SEO.\n");
}

if (resumeAfterProductSeo || await hasCompletedVariantSeoManifest()) {
  process.stdout.write("11. Reusing completed variant-specific SEO metafield live readback.\n");
} else {
  run(
    "11. Apply variant-specific SEO metafields with live readback",
    nodeBin,
    ["scripts/shopify-variant-google-metafields.mjs", "--apply", "--scope", "all-products"],
  );
}

run(
  "12. Auto-run variant image mapping",
  nodeBin,
  [
    "scripts/shopify-variant-image-mapping.mjs",
    "--apply",
    "--scope",
    "all-products",
    ...(process.env.SALT_VARIANT_IMAGE_NO_VISION === "1" ? ["--no-vision"] : []),
    ...(process.env.SALT_VARIANT_IMAGE_RESUME === "1" ? ["--resume"] : []),
  ],
  variantImageEnv,
);

process.stdout.write("\nGuarded Shopify SEO apply completed.\n");
