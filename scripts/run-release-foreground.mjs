#!/usr/bin/env node

import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

const rootDir = resolve(import.meta.dirname, "..");
const outputDir = resolve(rootDir, "output");
const watcherScript = resolve(rootDir, "scripts", "realtime-release-watcher.mjs");
const watcherLogPath = resolve(outputDir, "realtime-release-watcher.log");
const controlUiScript = resolve(rootDir, "scripts", "release-control-ui.mjs");
const controlUiLogPath = resolve(outputDir, "release-control-ui.log");
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const releaseArgs = process.argv.slice(2);
const releaseScript = String(process.env.SALT_FOREGROUND_RELEASE_SCRIPT || "release:core").trim() || "release:core";
const controlUiPort = Number.isInteger(Number(process.env.SALT_RELEASE_UI_PORT))
  ? Math.max(1024, Math.min(65535, Number(process.env.SALT_RELEASE_UI_PORT)))
  : 4177;
const watcherRestartLimit = Math.max(1, Number(process.env.SALT_FOREGROUND_WATCHER_RESTART_LIMIT || 8));
const watcherRestartDelayMs = Math.max(1_000, Number(process.env.SALT_FOREGROUND_WATCHER_RESTART_DELAY_MS || 5_000));
const watcherSettleMs = Math.max(1_000, Number(process.env.SALT_FOREGROUND_WATCHER_SETTLE_MS || 3_000));
const watcherBridgeIntervalMs = Math.max(500, Number(process.env.SALT_FOREGROUND_WATCHER_BRIDGE_MS || 2_000));
const execFileAsync = promisify(execFile);

export function prefixLines(chunk, prefix, carry = "") {
  const normalized = `${carry}${String(chunk || "")}`.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const lines = normalized.split("\n");
  const remainder = lines.pop() || "";
  return {
    output: lines.map((line) => `[${prefix}] ${line}\n`).join(""),
    remainder,
  };
}

export function buildReleaseCommand(script = "release", args = []) {
  return ["run", script, ...(args.length ? ["--", ...args] : [])];
}

export function buildControlUiCommand(port = 4177) {
  const normalizedPort = Number.isInteger(Number(port))
    ? Math.max(1024, Math.min(65535, Number(port)))
    : 4177;
  return [controlUiScript, "--ensure", "--open", "--port", String(normalizedPort)];
}

export function findRunningWatcherPids(output, selfPid = 0) {
  const self = Number(selfPid);
  const pids = [];
  for (const line of String(output || "").split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(.+)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    const command = match[2].trim();
    if (!Number.isInteger(pid) || pid <= 0 || pid === self) continue;
    if (!/scripts[\\/]realtime-release-watcher\.mjs(?:\s|$)/.test(command)) continue;
    if (/(?:^|\s)(?:rg|grep|ps)(?:\s|$)/.test(command)) continue;
    pids.push(pid);
  }
  return [...new Set(pids)];
}

function isAlive(child) {
  return Boolean(child && child.exitCode === null && !child.signalCode);
}

function killProcessGroup(child, signal = "SIGTERM") {
  if (!child?.pid || !isAlive(child)) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // The child may have exited between the liveness check and the signal.
    }
  }
}

let sharedLogWrite = Promise.resolve();

function appendSharedLog(value) {
  sharedLogWrite = sharedLogWrite
    .then(async () => {
      await mkdir(outputDir, { recursive: true });
      await appendFile(controlUiLogPath, String(value || ""), "utf8");
    })
    .catch((error) => {
      process.stderr.write(`[supervisor:error] control UI log write failed: ${error.message}\n`);
    });
  return sharedLogWrite;
}

function writeSupervisorOutput(value, target = process.stdout) {
  const output = String(value || "");
  if (output) target.write(output);
  void appendSharedLog(output);
}

function pipePrefixed(stream, prefix, target = process.stdout, onOutput = appendSharedLog) {
  let carry = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    const result = prefixLines(chunk, prefix, carry);
    carry = result.remainder;
    if (result.output) {
      target.write(result.output);
      void onOutput(result.output);
    }
  });
  stream.on("end", () => {
    if (carry) {
      const output = `[${prefix}] ${carry}\n`;
      target.write(output);
      void onOutput(output);
    }
  });
}

async function readReleaseState() {
  try {
    return JSON.parse(await readFile(resolve(rootDir, "output", "release-run-state.json"), "utf8"));
  } catch {
    return null;
  }
}

async function markInterruptedCheckpoint(reason) {
  const statePath = resolve(rootDir, "output", "release-run-state.json");
  const state = await readReleaseState();
  if (!state || !["running", "waiting_for_network"].includes(state.status)) return;
  const nextState = {
    ...state,
    status: "interrupted",
    interruptedAt: new Date().toISOString(),
    interruptedBy: "foreground-release-supervisor",
    interruptedReason: reason,
    activeReleasePid: 0,
    stageChildPid: 0,
    stageStatus: "interrupted",
  };
  await mkdir(resolve(rootDir, "output"), { recursive: true });
  const tempPath = `${statePath}.tmp-foreground-${process.pid}`;
  await writeFile(tempPath, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
  await rename(tempPath, statePath);
  const profile = String(state.profile || "").trim().toLowerCase();
  if (["catalog", "daily", "products"].includes(profile)) {
    const mirrorPath = resolve(rootDir, "output", `release-run-state.${profile}.json`);
    const mirrorTempPath = `${mirrorPath}.tmp-foreground-${process.pid}`;
    await writeFile(mirrorTempPath, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
    await rename(mirrorTempPath, mirrorPath);
  }
}

function foregroundEnvironment() {
  return {
    ...process.env,
    // release.mjs normally detaches its own watcher. The supervisor owns the
    // watcher here so every monitor event remains in this terminal.
    SALT_RELEASE_EMBEDDED_WATCHER: "0",
    SALT_RELEASE_WATCHER_PASSIVE: "1",
    SALT_RELEASE_WATCHER_DAILY_RUN: "0",
    SALT_RELEASE_WATCHER_RELEASE_SCRIPT: releaseScript,
    SALT_RELEASE_WATCHER_MONITOR_MS: process.env.SALT_RELEASE_WATCHER_MONITOR_MS || "10000",
    SALT_RELEASE_WATCHER_POLL_MS: process.env.SALT_RELEASE_WATCHER_POLL_MS || "60000",
    SALT_RELEASE_WATCHER_HEARTBEAT_MS: process.env.SALT_RELEASE_WATCHER_HEARTBEAT_MS || "10000",
    SALT_RELEASE_FOREGROUND_SUPERVISOR: "1",
  };
}

function spawnWatcher(env) {
  const child = spawn(process.execPath, [watcherScript], {
    cwd: rootDir,
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  pipePrefixed(child.stdout, "watcher");
  pipePrefixed(child.stderr, "watcher:error", process.stderr);
  child.once("error", (error) => {
    process.stderr.write(`[watcher:error] could not start watcher: ${error.message}\n`);
  });
  return child;
}

function spawnRelease(env) {
  const child = spawn(npmBin, buildReleaseCommand(releaseScript, releaseArgs), {
    cwd: rootDir,
    env,
    detached: true,
    stdio: ["inherit", "pipe", "pipe"],
  });
  pipePrefixed(child.stdout, "release");
  pipePrefixed(child.stderr, "release:error", process.stderr);
  return child;
}

function spawnControlUi(env) {
  const child = spawn(process.execPath, buildControlUiCommand(controlUiPort), {
    cwd: rootDir,
    env: {
      ...env,
      SALT_RELEASE_UI_DEFAULT: "1",
    },
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  child.once("error", (error) => {
    writeSupervisorOutput(`[supervisor:error] could not start default control UI: ${error.message}\n`, process.stderr);
  });
  return child;
}

async function sleep(ms) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function waitForActiveCheckpoint(child, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && isAlive(child)) {
    const state = await readReleaseState();
    const pid = Number(state?.pid || 0);
    if (["running", "waiting_for_network"].includes(state?.status) && pid > 0) {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        // The release may have written the checkpoint just before its PID was
        // fully observable. Keep waiting rather than handing stale telemetry
        // to the passive watcher.
      }
    }
    await sleep(250);
  }
  return false;
}

async function main() {
  const env = foregroundEnvironment();
  let stopping = false;
  let releaseChild = null;
  let watcherChild = null;
  let watcherRestarts = 0;
  let watcherRestartTimer = null;
  let watcherBridgeTimer = null;
  let attachedWatcherPid = 0;
  let watcherBridgeOffset = 0;
  let watcherBridgeCarry = "";
  let interruptionPromise = null;

  const stopAll = (signal = "SIGTERM") => {
    if (stopping) return;
    stopping = true;
    interruptionPromise = markInterruptedCheckpoint(`foreground supervisor received ${signal}`)
      .catch((error) => process.stderr.write(`[supervisor:error] could not persist interrupted checkpoint: ${error.message}\n`));
    if (watcherRestartTimer) clearTimeout(watcherRestartTimer);
    if (watcherBridgeTimer) clearInterval(watcherBridgeTimer);
    attachedWatcherPid = 0;
    killProcessGroup(watcherChild, signal);
    killProcessGroup(releaseChild, signal);
  };
  process.once("SIGINT", () => stopAll("SIGINT"));
  process.once("SIGTERM", () => stopAll("SIGTERM"));

  writeSupervisorOutput(`\n[supervisor] starting ${releaseScript}; all release and watcher output is multiplexed below\n`);
  writeSupervisorOutput(`[supervisor] command: npm run ${releaseScript}${releaseArgs.length ? ` -- ${releaseArgs.join(" ")}` : ""}\n`);
  spawnControlUi(env);
  writeSupervisorOutput(`[supervisor] default control UI: http://127.0.0.1:${controlUiPort} (opened automatically)\n`);
  releaseChild = spawnRelease(env);

  const watcherStarted = (async () => {
    const checkpointReady = await waitForActiveCheckpoint(releaseChild);
    if (stopping || !checkpointReady || !isAlive(releaseChild)) return false;
    await attachWatcher("attached");
    return true;
  })();

  const releaseExit = new Promise((resolvePromise, rejectPromise) => {
    releaseChild.once("error", rejectPromise);
    releaseChild.once("exit", (code, signal) => resolvePromise({ code, signal }));
  });

  async function readRunningWatcherPids() {
    try {
      const { stdout } = await execFileAsync("/bin/ps", ["-axo", "pid=,command="], { maxBuffer: 4 * 1024 * 1024 });
      return findRunningWatcherPids(stdout, process.pid);
    } catch {
      return [];
    }
  }

  async function pumpWatcherLog() {
    let contents;
    try {
      contents = await readFile(watcherLogPath, "utf8");
    } catch {
      return;
    }
    if (contents.length < watcherBridgeOffset) watcherBridgeOffset = 0;
    const next = contents.slice(watcherBridgeOffset);
    watcherBridgeOffset = contents.length;
    if (!next) return;
    const result = prefixLines(next, "watcher", watcherBridgeCarry);
    watcherBridgeCarry = result.remainder;
    if (result.output) writeSupervisorOutput(result.output);
  }

  async function attachExistingWatcher(pid, label) {
    try {
      watcherBridgeOffset = (await readFile(watcherLogPath, "utf8")).length;
    } catch {
      watcherBridgeOffset = 0;
    }
    attachedWatcherPid = pid;
    writeSupervisorOutput(`[supervisor] watcher daemon already active (pid ${pid}); ${label} uses its live log stream\n`);
    watcherBridgeTimer = setInterval(() => {
      void pumpWatcherLog();
      if (attachedWatcherPid && !isPidAlive(attachedWatcherPid) && isAlive(releaseChild) && !stopping) {
        attachedWatcherPid = 0;
        clearInterval(watcherBridgeTimer);
        watcherBridgeTimer = null;
        restartWatcher();
      }
    }, watcherBridgeIntervalMs);
    watcherBridgeTimer.unref?.();
  }

  function isPidAlive(pid) {
    const normalizedPid = Number(pid || 0);
    if (!Number.isInteger(normalizedPid) || normalizedPid <= 0) return false;
    try {
      process.kill(normalizedPid, 0);
      return true;
    } catch {
      return false;
    }
  }

  async function attachWatcher(label = "attached") {
    const existingPids = await readRunningWatcherPids();
    if (existingPids.length) {
      watcherChild = null;
      await attachExistingWatcher(existingPids[0], label);
      return;
    }
    attachedWatcherPid = 0;
    watcherChild = spawnWatcher(env);
    watcherRestarts += 1;
    writeSupervisorOutput(`[supervisor] watcher ${label} in foreground (pid ${watcherChild.pid || "unknown"}; attempt ${watcherRestarts})\n`);
    watcherChild.once("exit", () => restartWatcher());
  }

  function restartWatcher() {
    if (stopping || !isAlive(releaseChild) || watcherRestarts >= watcherRestartLimit) {
      if (!stopping && isAlive(releaseChild) && watcherRestarts >= watcherRestartLimit) {
        process.stderr.write(`[supervisor:error] watcher restart limit reached (${watcherRestartLimit}); release remains running\n`);
      }
      return;
    }
    const delay = watcherRestartDelayMs * Math.min(8, watcherRestarts);
    writeSupervisorOutput(`[supervisor] watcher exited while release is active; retrying watcher in ${delay}ms\n`);
    watcherRestartTimer = setTimeout(() => {
      watcherRestartTimer = null;
      if (stopping || !isAlive(releaseChild)) return;
      void attachWatcher("retry attached").catch((error) => {
        process.stderr.write(`[watcher:error] could not attach watcher: ${error.message}\n`);
      });
    }, delay);
    watcherRestartTimer.unref?.();
  }

  await watcherStarted;

  let releaseResult;
  try {
    releaseResult = await releaseExit;
  } catch (error) {
    stopAll("SIGTERM");
    throw error;
  }

  if (interruptionPromise) await interruptionPromise;
  stopping = true;
  if (watcherRestartTimer) clearTimeout(watcherRestartTimer);
  writeSupervisorOutput(`[supervisor] release exited with ${releaseResult.signal ? `signal ${releaseResult.signal}` : `code ${releaseResult.code}`}\n`);
  await sleep(watcherSettleMs);
  if (watcherBridgeTimer) clearInterval(watcherBridgeTimer);
  attachedWatcherPid = 0;
  killProcessGroup(watcherChild, "SIGTERM");
  const finalState = await readReleaseState();
  writeSupervisorOutput(`[supervisor] final checkpoint: status=${finalState?.status || "unknown"}; step=${finalState?.stepIndex ?? "unknown"}/${finalState?.totalSteps ?? "unknown"}; ${finalState?.stepLabel || "unknown"}\n`);
  await sharedLogWrite;
  if (releaseResult.code !== 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => {
    process.stderr.write(`[supervisor:error] ${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}
