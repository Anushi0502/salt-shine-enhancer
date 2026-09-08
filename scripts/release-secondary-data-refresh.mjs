#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const jobs = [
  ["recently ordered products", "sync-recently-ordered-products.mjs"],
  ["managed collection membership", "sync-managed-collection-membership.mjs"],
];

function runJob(label, scriptName, signal) {
  return new Promise((resolveJob, rejectJob) => {
    const child = spawn(process.execPath, [resolve(rootDir, "scripts", scriptName)], {
      cwd: rootDir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      signal,
    });

    child.stdout.on("data", (chunk) => {
      process.stdout.write(`[${label}] ${chunk}`);
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(`[${label}] ${chunk}`);
    });
    child.once("error", (error) => rejectJob(error));
    child.once("close", (code, closeSignal) => {
      if (code === 0) {
        resolveJob();
        return;
      }
      rejectJob(new Error(
        `${label} failed with ${closeSignal ? `signal ${closeSignal}` : `exit code ${code}`}`,
      ));
    });
  });
}

const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(signal, () => controller.abort());
}
try {
  process.stdout.write("Refreshing independent catalog feeds in parallel\n");
  await Promise.all(jobs.map(([label, scriptName]) => runJob(label, scriptName, controller.signal)));
  process.stdout.write("Independent catalog feeds refreshed\n");
} catch (error) {
  controller.abort();
  throw error;
}
