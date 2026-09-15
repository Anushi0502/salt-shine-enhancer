#!/usr/bin/env node

import { execFile } from "node:child_process";
import { open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootDir = resolve(import.meta.dirname, "..");
const releaseStatePath = resolve(rootDir, "output", "release-run-state.json");
const watcherStatePath = resolve(rootDir, "output", "realtime-release-watcher-state.json");
const lockPath = resolve(tmpdir(), "salt-gsc-semantic-repair-apply.lock");
const pollMs = Math.max(10_000, Number(process.env.SALT_GSC_REPAIR_POLL_MS || 30_000));
const maxWaitMs = Math.max(pollMs, Number(process.env.SALT_GSC_REPAIR_MAX_WAIT_MS || 86_400_000));
const once = process.argv.includes("--once");

function log(message) {
  process.stdout.write(`[salt-gsc-repair-watch] ${new Date().toISOString()} ${message}\n`);
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function processAlive(pid) {
  const numericPid = Number(pid || 0);
  if (!Number.isInteger(numericPid) || numericPid <= 0) return false;
  try {
    await execFileAsync("ps", ["-p", String(numericPid), "-o", "command="], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

async function acquireLock() {
  try {
    const handle = await open(lockPath, "wx");
    await handle.writeFile(`${process.pid}\n`, "utf8");
    return handle;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existingPid = Number((await readFile(lockPath, "utf8").catch(() => "")).trim());
    if (await processAlive(existingPid)) {
      throw new Error(`another semantic-repair monitor is already running (pid ${existingPid})`);
    }
    await rm(lockPath, { force: true });
    return acquireLock();
  }
}

function activeReleaseStatus(release, watcher) {
  return release?.status === "running" || watcher?.releaseStatus === "running" || watcher?.releaseStageStatus === "running";
}

async function activeReleasePids(release, watcher) {
  const tracked = [release?.pid, watcher?.activeReleasePid, watcher?.releaseStageChildPid]
    .map(Number)
    .filter((pid, index, values) => Number.isInteger(pid) && pid > 0 && values.indexOf(pid) === index);
  const live = [];
  for (const pid of tracked) {
    if (await processAlive(pid)) live.push(pid);
  }
  return live;
}

async function waitForSuccessfulTerminalRelease() {
  const startedAt = Date.now();
  let lastState = "";

  while (Date.now() - startedAt <= maxWaitMs) {
    const release = await readJson(releaseStatePath);
    const watcher = await readJson(watcherStatePath);
    const livePids = await activeReleasePids(release, watcher);
    const state = {
      releaseStatus: release?.status || "missing",
      step: `${release?.stepIndex || 0}/${release?.totalSteps || 0}`,
      watcherStatus: watcher?.releaseStatus || "missing",
      stageStatus: watcher?.releaseStageStatus || release?.stageStatus || "",
      livePids,
    };
    const serialized = JSON.stringify(state);
    if (serialized !== lastState) {
      log(`state ${serialized}`);
      lastState = serialized;
    }

    if (release?.status === "failed" || watcher?.releaseStatus === "failed") {
      throw new Error(`full release failed; semantic repair remains unapplied: ${release?.error || watcher?.lastError || "unknown failure"}`);
    }

    if (
      release?.status === "completed" &&
      watcher?.releaseStatus !== "running" &&
      watcher?.releaseStageStatus !== "running" &&
      !activeReleaseStatus(release, watcher) &&
      livePids.length === 0
    ) {
      return;
    }

    if (once) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, pollMs));
  }

  throw new Error(`timed out after ${Math.round(maxWaitMs / 60_000)} minutes waiting for a successful terminal release`);
}

async function runNodeScript(script, args = []) {
  const env = {
    ...process.env,
    SHOPIFY_CLI_AGENT_INFO: "n:codex|v:gpt-5|p:openai",
    SHOPIFY_CLI_AGENT_IDS: "s:01a09f42-ae4b-79b2-b5ea-85bb6ec60ed0|r:salt-free-phase4-20260915|i:local-codex-20260915",
  };
  const result = await execFileAsync(process.execPath, [resolve(rootDir, script), ...args], {
    cwd: rootDir,
    env,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

async function main() {
  const lock = await acquireLock();
  try {
    await waitForSuccessfulTerminalRelease();
    const release = await readJson(releaseStatePath);
    if (once && release?.status !== "completed") {
      log("release is not terminal-success yet; no Shopify work started");
      return;
    }
    log("release terminal-success confirmed; refreshing the exact 12-product live snapshot");
    await runNodeScript("scripts/read-salt-gsc-semantic-repair-live.mjs");
    await runNodeScript("scripts/generate-salt-gsc-semantic-repair-plan.mjs");
    log("applying the freshly regenerated exact 12-product plan");
    await runNodeScript("scripts/apply-salt-gsc-semantic-repair-plan.mjs", ["--apply"]);
    await runNodeScript("scripts/read-salt-gsc-semantic-repair-storefront.mjs");
    log("semantic repair apply, Admin readback and public storefront readback completed");
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`[salt-gsc-repair-watch] ${error?.stack || error}\n`);
  process.exitCode = 1;
});
