#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const nodeBin = process.execPath;

function run(label, command, args) {
  process.stdout.write(`\n${label}\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed; Shopify SEO apply was not started.`);
  }
}

run("1. Verify catalog taxonomy approval", nodeBin, ["scripts/catalog-taxonomy-approval.mjs"]);
run("2. Validate local catalog taxonomy", npmBin, ["run", "catalog:taxonomy:validate"]);
run("3. Build the visual taxonomy review queue", npmBin, ["run", "catalog:image-review:build"]);
run("4. Require image-backed evidence for every review-required product", npmBin, ["run", "catalog:image-review:validate"]);
run("5. Full local catalog SEO audit", npmBin, ["run", "shopify:seo:local-review"]);
run("6. Live taxonomy tags and metafields dry-run", npmBin, ["run", "shopify:taxonomy:dry-run"]);
run("7. Live full-catalog Shopify SEO dry-run with prices and tags preserved", nodeBin, ["scripts/shopify-seo-release.mjs", "--dry-run", "--full-catalog", "--preserve-prices", "--preserve-tags"]);
run("8. Guarded full-catalog Shopify SEO apply with prices and tags preserved", nodeBin, ["scripts/shopify-seo-release.mjs", "--apply", "--full-catalog", "--preserve-prices", "--preserve-tags"]);
run("9. Apply taxonomy tags and metafields with live readback", npmBin, ["run", "shopify:taxonomy:apply"]);
run("10. Auto-run variant image mapping", nodeBin, ["scripts/shopify-variant-image-mapping.mjs", "--apply", "--scope", "all-products"]);

process.stdout.write("\nGuarded Shopify SEO apply completed.\n");
