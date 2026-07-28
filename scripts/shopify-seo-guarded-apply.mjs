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

run("1. Full local catalog SEO audit", npmBin, ["run", "shopify:seo:local-review"]);
run("2. Live Shopify SEO and $12 pricing dry-run", nodeBin, ["scripts/shopify-seo-release.mjs", "--dry-run"]);
run("3. Guarded Shopify SEO and pricing apply", nodeBin, ["scripts/shopify-seo-release.mjs", "--apply", "--full-catalog", "--preserve-tags"]);
run("4. Auto-run variant image mapping", nodeBin, ["scripts/shopify-variant-image-mapping.mjs", "--apply", "--scope", "all-products"]);

process.stdout.write("\nGuarded Shopify SEO apply completed.\n");
