#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");
const iosDir = resolve(rootDir, "salt-store-ios");
const androidDir = resolve(rootDir, "salt-store-android");
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";
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

async function main() {
  const packageJson = JSON.parse(await readFile(resolve(rootDir, "package.json"), "utf8"));
  const viteVersion = require("vite/package.json").version;
  const capacitorCliVersion = require("@capacitor/cli/package.json").version;
  const npmVersion = execFileSync(npmBin, ["--version"], { encoding: "utf8" }).trim();

  process.stdout.write("SALT release workflow\n");
  process.stdout.write(`  app: ${packageJson.version}\n`);
  process.stdout.write(`  node: ${process.version}\n`);
  process.stdout.write(`  npm: ${npmVersion}\n`);
  process.stdout.write(`  vite: ${viteVersion}\n`);
  process.stdout.write(`  capacitor-cli: ${capacitorCliVersion}\n`);

  const steps = [
    {
      label: "Refresh Shopify data",
      command: npmBin,
      args: ["run", "sync:data"],
      cwd: rootDir,
    },
    {
      label: "Build web app",
      command: npmBin,
      args: ["run", "build:web"],
      cwd: rootDir,
    },
    {
      label: "Generate Shopify theme bundle",
      command: npmBin,
      args: ["run", "theme:bundle"],
      cwd: rootDir,
    },
    {
      label: "Sync iOS Capacitor shell",
      command: npxBin,
      args: ["cap", "sync", "ios"],
      cwd: iosDir,
    },
    {
      label: "Sync Android Capacitor shell",
      command: npxBin,
      args: ["cap", "sync", "android"],
      cwd: androidDir,
    },
  ];

  for (const [index, step] of steps.entries()) {
    await runStage({
      ...step,
      index: index + 1,
      total: steps.length,
    });

    if (index === 1) {
      await ensurePathExists(resolve(rootDir, "dist", "index.html"), "Vite build output");
    }
  }

  process.stdout.write("\nRelease complete.\n");
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
