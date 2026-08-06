#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const nodeBin = process.execPath;
const require = createRequire(import.meta.url);
const catalogBatchSize = Math.max(1, Math.min(1000, Number(process.env.SALT_CATALOG_BATCH_SIZE || 50)));

const catalogIntegrityArgs = [
  "--skip-vision",
  "--reclassify",
  "--batch-size",
  String(catalogBatchSize),
];

function formatCommand(command, args) {
  return [command, ...args].join(" ");
}

function runStage({ label, command, args, cwd, index, total }) {
  const commandLine = formatCommand(command, args);

  process.stdout.write(`\n[${index}/${total}] ${label}\n`);
  process.stdout.write(`$ ${commandLine}\n`);

  return new Promise((resolveStep, rejectStep) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: "inherit",
    });

    child.on("error", (error) => {
      rejectStep(
        new Error(
          `Release stopped at step ${index}/${total} (${label}).\nCommand: ${commandLine}\nWorking directory: ${cwd}\nReason: ${error.message}`,
        ),
      );
    });

    child.on("exit", (code, signal) => {
      if (code === 0) {
        process.stdout.write(`[ok] ${label}\n`);
        resolveStep();
        return;
      }

      const exitDetail = signal ? `signal ${signal}` : `exit code ${code}`;
      rejectStep(
        new Error(
          `Release stopped at step ${index}/${total} (${label}) with ${exitDetail}.\nCommand: ${commandLine}\nWorking directory: ${cwd}`,
        ),
      );
    });
  });
}

async function ensurePathExists(path, label) {
  try {
    await access(path);
  } catch {
    throw new Error(`${label} not found at ${path}`);
  }
}

function getReleasePaths(releaseRootDir) {
  return {
    iosDir: resolve(releaseRootDir, "salt-store-ios"),
    androidDir: resolve(releaseRootDir, "salt-store-android"),
    capacitorCliBin: resolve(releaseRootDir, "node_modules", "@capacitor", "cli", "bin", "capacitor"),
    shopifyThemeDir: resolve(releaseRootDir, "..", "salt-online-store-shopify"),
    productCohortCatalog: resolve(releaseRootDir, "output", "new-product-cohort-catalog.json"),
    productCohortHandles: resolve(releaseRootDir, "output", "new-product-cohort-handles.json"),
  };
}

function buildCatalogReleaseSteps({
  releaseRootDir = rootDir,
  includeMobile = process.env.SALT_RELEASE_SKIP_MOBILE !== "1",
} = {}) {
  const { iosDir, androidDir, capacitorCliBin, shopifyThemeDir } = getReleasePaths(releaseRootDir);

  return [
    {
      label: "Verify approved catalog taxonomy release",
      command: nodeBin,
      args: ["scripts/catalog-taxonomy-approval.mjs"],
      cwd: releaseRootDir,
    },
    {
      label: "Refresh Shopify data",
      command: npmBin,
      args: ["run", "sync:data"],
      cwd: releaseRootDir,
    },
    {
      label: "Stress-test two million unique product classifications",
      command: npmBin,
      args: ["run", "catalog:taxonomy:scale:2m"],
      cwd: releaseRootDir,
    },
    {
      label: "Read live Shopify tag inventory",
      command: npmBin,
      args: ["run", "catalog:tags:fetch"],
      cwd: releaseRootDir,
    },
    {
      label: "Regenerate catalog taxonomy and preserved-tag audit",
      command: npmBin,
      args: ["run", "catalog:taxonomy:audit"],
      cwd: releaseRootDir,
    },
    {
      label: "Validate refreshed catalog taxonomy",
      command: npmBin,
      args: ["run", "catalog:taxonomy:validate"],
      cwd: releaseRootDir,
    },
    {
      label: "Build visual taxonomy review queue",
      command: npmBin,
      args: ["run", "catalog:image-review:build"],
      cwd: releaseRootDir,
    },
    {
      label: "Require image-backed taxonomy evidence",
      command: npmBin,
      args: ["run", "catalog:image-review:validate"],
      cwd: releaseRootDir,
    },
    {
      label: "Dry-run exact full-catalog collection reconciliation",
      command: npmBin,
      args: ["run", "shopify:catalog-integrity:dry-run", "--", ...catalogIntegrityArgs],
      cwd: releaseRootDir,
    },
    {
      label: "Apply exact full-catalog collection reconciliation",
      command: npmBin,
      args: ["run", "shopify:catalog-integrity:apply", "--", ...catalogIntegrityArgs],
      cwd: releaseRootDir,
    },
    {
      label: "Refresh Shopify data after collection reconciliation",
      command: npmBin,
      args: ["run", "sync:data"],
      cwd: releaseRootDir,
    },
    {
      label: "Ensure Shopify product metafield definitions",
      command: npmBin,
      args: ["run", "shopify:product-metafields:ensure"],
      cwd: releaseRootDir,
    },
    {
      label: "Reconcile and verify Shopify SEO/product fields",
      command: npmBin,
      args: ["run", "shopify:seo:release"],
      cwd: releaseRootDir,
    },
    {
      label: "Delete verified active zero-image products",
      command: npmBin,
      args: ["run", "shopify:products:zero-images:apply"],
      cwd: releaseRootDir,
    },
    {
      label: "Publish every active product to all sales channels",
      command: npmBin,
      args: ["run", "shopify:publications:all:apply"],
      cwd: releaseRootDir,
    },
    {
      label: "Refresh Shopify data after final product publication",
      command: npmBin,
      args: ["run", "sync:data"],
      cwd: releaseRootDir,
    },
    {
      label: "Apply Shopify merchandising metafield backfill after catalog boundary changes",
      command: npmBin,
      args: ["run", "shopify:product-metafields:backfill:apply"],
      cwd: releaseRootDir,
    },
    {
      label: "Refresh Shopify data after merchandising backfill",
      command: npmBin,
      args: ["run", "sync:data"],
      cwd: releaseRootDir,
    },
    {
      label: "Verify every active product has product-specific SEO and metafields",
      command: npmBin,
      args: ["run", "shopify:product-specificity:verify"],
      cwd: releaseRootDir,
    },
    {
      label: "Verify exact collection membership and price rules",
      command: npmBin,
      args: ["run", "shopify:catalog-integrity:verify", "--", ...catalogIntegrityArgs],
      cwd: releaseRootDir,
    },
    {
      label: "Verify Shopify merchandising backfill",
      command: npmBin,
      args: ["run", "shopify:merchandising:verify"],
      cwd: releaseRootDir,
    },
    {
      label: "Validate final catalog taxonomy snapshot",
      command: npmBin,
      args: ["run", "catalog:taxonomy:validate"],
      cwd: releaseRootDir,
    },
    {
      label: "Build web app",
      command: npmBin,
      args: ["run", "build:web"],
      cwd: releaseRootDir,
    },
    {
      label: "Generate Shopify theme bundle",
      command: npmBin,
      args: ["run", "theme:bundle", "--", "--out", shopifyThemeDir],
      cwd: releaseRootDir,
    },
    ...(includeMobile ? [
      {
        label: "Sync iOS Capacitor shell",
        command: nodeBin,
        args: [capacitorCliBin, "sync", "ios"],
        cwd: iosDir,
      },
      {
        label: "Sync Android Capacitor shell",
        command: nodeBin,
        args: [capacitorCliBin, "sync", "android"],
        cwd: androidDir,
      },
    ] : []),
  ];
}

function buildProductReleaseSteps({
  releaseRootDir = rootDir,
  includeMobile = process.env.SALT_RELEASE_SKIP_MOBILE !== "1",
} = {}) {
  const {
    iosDir,
    androidDir,
    capacitorCliBin,
    shopifyThemeDir,
  } = getReleasePaths(releaseRootDir);
  const cohortCatalogArg = "output/new-product-cohort-catalog.json";
  const cohortHandlesArg = "output/new-product-cohort-handles.json";

  return [
    {
      label: "Run frozen new-product SEO, metafield, and mapping pipeline",
      command: npmBin,
      args: [
        "run",
        "seo:new-products:apply",
        "--",
        "--frozen-catalog",
        cohortCatalogArg,
        "--product-handles-file",
        cohortHandlesArg,
      ],
      cwd: releaseRootDir,
    },
    {
      label: "Delete verified zero-image products in the new cohort",
      command: npmBin,
      args: ["run", "shopify:products:zero-images:apply", "--", "--product-handles-file", cohortHandlesArg],
      cwd: releaseRootDir,
    },
    {
      label: "Publish new-cohort products to all sales channels",
      command: npmBin,
      args: ["run", "shopify:publications:all:apply", "--", "--product-handles-file", cohortHandlesArg],
      cwd: releaseRootDir,
    },
    {
      label: "Build web app",
      command: npmBin,
      args: ["run", "build:web"],
      cwd: releaseRootDir,
    },
    {
      label: "Generate Shopify theme bundle",
      command: npmBin,
      args: ["run", "theme:bundle", "--", "--out", shopifyThemeDir],
      cwd: releaseRootDir,
    },
    ...(includeMobile ? [
      {
        label: "Sync iOS Capacitor shell",
        command: nodeBin,
        args: [capacitorCliBin, "sync", "ios"],
        cwd: iosDir,
      },
      {
        label: "Sync Android Capacitor shell",
        command: nodeBin,
        args: [capacitorCliBin, "sync", "android"],
        cwd: androidDir,
      },
    ] : []),
  ];
}

export function buildReleaseSteps({
  rootDir: releaseRootDir = rootDir,
  includeMobile = process.env.SALT_RELEASE_SKIP_MOBILE !== "1",
  profile = "catalog",
} = {}) {
  if (profile === "products") {
    return buildProductReleaseSteps({ releaseRootDir, includeMobile });
  }

  if (!["catalog", "daily"].includes(profile)) {
    throw new Error(`Invalid release profile ${profile}; expected catalog, daily, or products`);
  }

  return buildCatalogReleaseSteps({ releaseRootDir, includeMobile });
}

function parseArgs(argv) {
  const args = {
    profile: process.env.SALT_RELEASE_PROFILE || "catalog",
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--profile") {
      if (!next) {
        throw new Error("Missing value for --profile");
      }
      args.profile = next;
      index += 1;
      continue;
    }

    if (token === "--product-release" || token === "--products-only") {
      args.profile = "products";
      continue;
    }

    if (token === "--catalog-release") {
      args.profile = "catalog";
    }
  }

  if (!["catalog", "daily", "products"].includes(args.profile)) {
    throw new Error(`Invalid release profile ${args.profile}; expected catalog, daily, or products`);
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const packageJson = JSON.parse(await readFile(resolve(rootDir, "package.json"), "utf8"));
  const shopifyThemeDir = resolve(rootDir, "..", "salt-online-store-shopify");
  const viteVersion = require("vite/package.json").version;
  const capacitorCliVersion = require("@capacitor/cli/package.json").version;
  const npmVersion = execFileSync(npmBin, ["--version"], { encoding: "utf8" }).trim();
  await ensurePathExists(shopifyThemeDir, "Shopify theme folder");

  process.stdout.write("SALT release workflow\n");
  process.stdout.write(`  app: ${packageJson.version}\n`);
  process.stdout.write(`  node: ${process.version}\n`);
  process.stdout.write(`  npm: ${npmVersion}\n`);
  process.stdout.write(`  vite: ${viteVersion}\n`);
  process.stdout.write(`  capacitor-cli: ${capacitorCliVersion}\n`);
  process.stdout.write(`  shopify-theme: ${shopifyThemeDir}\n`);
  process.stdout.write(`  mobile-sync: ${process.env.SALT_RELEASE_SKIP_MOBILE === "1" ? "skipped" : "included"}\n`);
  process.stdout.write(`  profile: ${args.profile}\n`);

  if (args.profile === "products") {
    const { productCohortCatalog, productCohortHandles } = getReleasePaths(rootDir);
    await ensurePathExists(productCohortCatalog, "new-product cohort catalog");
    await ensurePathExists(productCohortHandles, "new-product cohort handles");
    process.stdout.write(`  product-cohort: ${productCohortHandles}\n`);
  }

  const steps = buildReleaseSteps({ rootDir, profile: args.profile });

  for (const [index, step] of steps.entries()) {
    await runStage({
      ...step,
      index: index + 1,
      total: steps.length,
    });

    if (step.label === "Build web app") {
      await ensurePathExists(resolve(rootDir, "dist", "index.html"), "Vite build output");
    }
  }

  process.stdout.write("\nRelease complete.\n");
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(`\n${error.message}`);
    process.exit(1);
  });
}
