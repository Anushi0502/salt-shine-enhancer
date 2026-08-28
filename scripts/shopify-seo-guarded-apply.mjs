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

async function hasReusableSeoDryRun(manifestPath) {
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const current = await readCurrentCatalogBoundary();
    const summary = manifest.summary || {};
    const products = Array.isArray(manifest.products) ? manifest.products : [];
    const audited = Number(summary.exactMatches || 0) + Number(summary.wouldUpdate || 0);
    return manifest.mode === "dry-run"
      && Boolean(manifest.completedAt)
      && Array.isArray(manifest.failures)
      && manifest.failures.length === 0
      && current
      && Number(summary.sourceProducts || 0) === current.count
      && manifest.policy?.catalogBoundary === current.hash
      && products.length === current.count
      && audited === current.count
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

const resumeAtVariantImage = process.env.SALT_SEO_GUARDED_RESUME_FROM_VARIANT_IMAGE === "1";
const seoDryRunManifestPath = process.env.SALT_SHOPIFY_SEO_DRY_RUN_MANIFEST_PATH
  || resolve(root, "output", "shopify-seo-release-dry-run-manifest.json");
const variantImageCachePath = process.env.SALT_VARIANT_IMAGE_MEDIA_CACHE_PATH
  || resolve(tmpdir(), "salt-variant-image-live-media-cache.json");
const variantImageCheckpointPath = process.env.SALT_VARIANT_IMAGE_CHECKPOINT_PATH
  || resolve(tmpdir(), "salt-variant-image-mapping-checkpoint.json");
const variantImageEnv = {
  ...process.env,
  SALT_VARIANT_IMAGE_MEDIA_CACHE_PATH: variantImageCachePath,
  SALT_VARIANT_IMAGE_CHECKPOINT_PATH: variantImageCheckpointPath,
  SALT_VARIANT_IMAGE_ALLOW_SOURCE_ONLY_EXCLUSIONS:
    process.env.SALT_VARIANT_IMAGE_ALLOW_SOURCE_ONLY_EXCLUSIONS || "1",
};

if (!resumeAtVariantImage) {
  run("1. Verify trained 128M-record catalog knowledge model", npmBin, ["run", "catalog:knowledge:model:verify"]);
  run("2. Verify catalog taxonomy approval", nodeBin, ["scripts/catalog-taxonomy-approval.mjs"]);
  run("3. Validate local catalog taxonomy", npmBin, ["run", "catalog:taxonomy:validate"]);
  run("4. Build the visual taxonomy review queue", npmBin, ["run", "catalog:image-review:build"]);
  run("5. Require image-backed evidence for every review-required product", npmBin, ["run", "catalog:image-review:validate"]);
  run("6. Full local catalog SEO audit", npmBin, ["run", "shopify:seo:local-review"]);
  run("7. Live taxonomy tags and metafields dry-run", npmBin, ["run", "shopify:taxonomy:dry-run"]);
  if (await hasReusableSeoDryRun(seoDryRunManifestPath)) {
    process.stdout.write(`8. Reusing verified full-catalog SEO dry-run: ${seoDryRunManifestPath}\n`);
  } else {
    run(
      "8. Live full-catalog Shopify SEO dry-run with prices and tags preserved",
      nodeBin,
      [
        "scripts/shopify-seo-release.mjs",
        "--dry-run",
        "--full-catalog",
        "--preserve-prices",
        "--preserve-tags",
        "--output",
        seoDryRunManifestPath,
      ],
    );
  }
  run("9. Guarded full-catalog Shopify SEO apply with prices and tags preserved", nodeBin, ["scripts/shopify-seo-release.mjs", "--apply", "--full-catalog", "--preserve-prices", "--preserve-tags"]);
  run("10. Apply taxonomy tags and metafields with live readback", npmBin, ["run", "shopify:taxonomy:apply"]);
} else {
  process.stdout.write("Reusing completed guarded SEO and taxonomy stages; resuming at variant image mapping.\n");
}

if (await hasCompletedVariantSeoManifest()) {
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
