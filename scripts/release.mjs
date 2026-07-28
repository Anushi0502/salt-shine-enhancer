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

export function buildReleaseSteps({ rootDir: releaseRootDir = rootDir } = {}) {
  const iosDir = resolve(releaseRootDir, "salt-store-ios");
  const androidDir = resolve(releaseRootDir, "salt-store-android");
  const capacitorCliBin = resolve(releaseRootDir, "node_modules", "@capacitor", "cli", "bin", "capacitor");
  const shopifyThemeDir = resolve(releaseRootDir, "..", "salt-online-store-shopify");

  return [
    {
      label: "Ensure Shopify product metafield definitions",
      command: npmBin,
      args: ["run", "shopify:product-metafields:ensure"],
      cwd: releaseRootDir,
    },
    {
      label: "Refresh Shopify data",
      command: npmBin,
      args: ["run", "sync:data"],
      cwd: releaseRootDir,
    },
    {
      label: "Reconcile and verify Shopify SEO/product fields",
      command: npmBin,
      args: ["run", "shopify:seo:release"],
      cwd: releaseRootDir,
    },
    {
      label: "Map Shopify variant images",
      command: npmBin,
      args: ["run", "shopify:variant-image-mapping:apply"],
      cwd: releaseRootDir,
    },
    {
      label: "Apply Shopify merchandising metafield backfill",
      command: npmBin,
      args: ["run", "shopify:product-metafields:backfill:apply"],
      cwd: releaseRootDir,
    },
    {
      label: "Refresh Shopify data after backfill",
      command: npmBin,
      args: ["run", "sync:data"],
      cwd: releaseRootDir,
    },
    {
      label: "Verify Shopify merchandising backfill",
      command: npmBin,
      args: ["run", "shopify:merchandising:verify"],
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
  ];
}

async function main() {
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

  const steps = buildReleaseSteps({ rootDir });

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
