#!/usr/bin/env node

import { appendFile, mkdir, readFile, rename, rm, stat, statfs, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { COLLECTION_GOVERNANCE_POLICIES } from "../src/lib/catalog-collection-governance.js";
import { createShopifyAdminGraphQLClient } from "./shopify-admin-graphql-client.mjs";
import { readProductCatalogPayload } from "./product-catalog-files.mjs";
import { DEFAULT_MIN_FREE_BYTES, evaluateVisualTrainingAdmission } from "./visual-training-admission.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const outputDir = resolve(rootDir, "output");
const statePath = resolve(outputDir, "realtime-release-watcher-state.json");
const releaseRunStatePath = resolve(outputDir, "release-run-state.json");
const visualTrainingStatusPath = resolve(outputDir, "visual-taxonomy-training-status.json");
const visualShardTrainingStatePath = resolve(outputDir, "visual-taxonomy-shard-training-state.json");
const visualTrainingReadinessPath = resolve(outputDir, "visual-taxonomy-training-readiness.json");
const visualTrainingLockPath = resolve(outputDir, ".visual-taxonomy-model-training.lock");
const visualCandidateManifestPath = resolve(outputDir, "visual-taxonomy-catalog-candidate-manifest.jsonl");
const visualCandidateHydratedManifestPath = resolve(outputDir, "visual-taxonomy-catalog-candidate-hydrated-manifest.jsonl");
const visualCandidateHydrationStatePath = resolve(outputDir, "visual-taxonomy-catalog-candidate-hydration-state.json");
const visualSupplementalRoot = resolve(
  process.env.SALT_VISUAL_OPEN_IMAGES_ROOT || resolve(homedir(), ".cache", "salt-visual-taxonomy-open-images"),
);
const visualSupplementalManifestPath = resolve(
  process.env.SALT_OPEN_IMAGES_MANIFEST_OUTPUT || resolve(visualSupplementalRoot, "visual-taxonomy-open-images-candidate-manifest-500gb.jsonl"),
);
const visualSupplementalHydratedManifestPath = resolve(
  process.env.SALT_OPEN_IMAGES_HYDRATED_MANIFEST_OUTPUT || resolve(visualSupplementalRoot, "visual-taxonomy-open-images-candidate-hydrated-manifest-500gb.jsonl"),
);
const visualSupplementalHydrationStatePath = resolve(
  process.env.SALT_OPEN_IMAGES_HYDRATION_STATE ||
    resolve(visualSupplementalRoot, "visual-taxonomy-open-images-candidate-hydration-state-500gb.json"),
);
const visualCandidateSupervisorScript = resolve(rootDir, "scripts", "supervise-visual-taxonomy-candidate-training.mjs");
const visualTrainingConfigPath = resolve(process.env.SALT_VISUAL_TRAINING_CONFIG_PATH || resolve(outputDir, "visual-taxonomy-training-config.json"));
const visualTrainingModelPath = resolve(process.env.SALT_VISUAL_TAXONOMY_MODEL_PATH || resolve(outputDir, "visual-taxonomy-model.json"));
const logPath = resolve(outputDir, "realtime-release-watcher.log");
const lockPath = resolve(outputDir, "realtime-release.lock");
const pollIntervalMs = Math.max(60_000, Number(process.env.SALT_RELEASE_WATCHER_POLL_MS || 300_000));
const monitorIntervalMs = Math.max(10_000, Number(process.env.SALT_RELEASE_WATCHER_MONITOR_MS || 30_000));
const watcherHeartbeatMs = Math.max(10_000, Number(process.env.SALT_RELEASE_WATCHER_HEARTBEAT_MS || 30_000));
const maxRetryIntervalMs = Math.max(pollIntervalMs, Number(process.env.SALT_RELEASE_WATCHER_MAX_RETRY_MS || 3_600_000));
const releaseStateStaleMs = Math.max(
  pollIntervalMs * 2,
  Number(process.env.SALT_RELEASE_WATCHER_STALE_MS || 900_000),
);
const notificationCooldownMs = Math.max(
  60_000,
  Number(process.env.SALT_RELEASE_WATCHER_NOTIFICATION_COOLDOWN_MS || 900_000),
);
const scheduledReleaseHour = Math.min(23, Math.max(0, Number(process.env.SALT_RELEASE_WATCHER_DAILY_HOUR || 12)));
const scheduledReleaseMinute = Math.min(59, Math.max(0, Number(process.env.SALT_RELEASE_WATCHER_DAILY_MINUTE || 0)));
const passiveMode = process.env.SALT_RELEASE_WATCHER_PASSIVE === "1";
const visualTrainingAutoStart = process.env.SALT_RELEASE_WATCHER_TRAINING_AUTOSTART !== "0";
const visualTrainingMinFreeBytes = Math.max(
  DEFAULT_MIN_FREE_BYTES,
  Number(process.env.SALT_RELEASE_WATCHER_TRAINING_MIN_FREE_BYTES || DEFAULT_MIN_FREE_BYTES),
);
const visualTrainingRetryMs = Math.max(
  300_000,
  Number(process.env.SALT_RELEASE_WATCHER_TRAINING_RETRY_MS || 3_600_000),
);
const visualTrainingParallel = process.env.SALT_RELEASE_WATCHER_TRAINING_PARALLEL === "1";
const releaseScript = String(process.env.SALT_RELEASE_WATCHER_RELEASE_SCRIPT || "release:daily").trim();
if (!["release", "release:daily"].includes(releaseScript)) {
  throw new Error(`Unsupported watcher release script: ${releaseScript || "missing"}. Use release or release:daily.`);
}
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const execFileAsync = promisify(execFile);
const client = createShopifyAdminGraphQLClient({ rootDir, agentName: "realtime-release-watcher" });

const WATCH_QUERY = /* GraphQL */ `
  query RealtimeReleaseWatcher {
    products(first: 1, query: "status:active", sortKey: UPDATED_AT, reverse: true) {
      nodes { id handle updatedAt status }
    }
    collections(first: 250) {
      nodes { handle title productsCount { count } }
    }
  }
`;

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function timestamp(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function stageTelemetry(release) {
  const lastOutputAt = String(release?.stageLastOutputAt || release?.stageStartedAt || "");
  const lastOutputTimestamp = timestamp(lastOutputAt);
  return {
    releaseStageStatus: String(release?.stageStatus || ""),
    releaseStageChildPid: Number(release?.stageChildPid || 0),
    releaseStageStartedAt: String(release?.stageStartedAt || ""),
    releaseStageLastOutputAt: lastOutputAt,
    releaseStageOutputBytes: Number(release?.stageOutputBytes || 0),
    releaseStageIdleSeconds: lastOutputTimestamp > 0
      ? Math.max(0, Math.round((Date.now() - lastOutputTimestamp) / 1000))
      : 0,
  };
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function scheduledReleaseDue(state) {
  if (process.env.SALT_RELEASE_WATCHER_DAILY_RUN === "0") return null;
  const now = new Date();
  const dueAt = new Date(now);
  dueAt.setHours(scheduledReleaseHour, scheduledReleaseMinute, 0, 0);
  const dateKey = localDateKey(now);
  if (now < dueAt) return null;
  if (state?.lastScheduledReleaseDate === dateKey) return null;
  if (state?.scheduledReleaseInProgressDate === dateKey) return null;
  return { dateKey, dueAt: dueAt.toISOString() };
}

async function log(message) {
  await mkdir(outputDir, { recursive: true });
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await appendFile(logPath, line, "utf8");
  process.stdout.write(line);
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeState(state) {
  await mkdir(outputDir, { recursive: true });
  const tempPath = `${statePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(tempPath, statePath);
}

async function readVisualTrainingStatus() {
  return readJson(visualTrainingStatusPath, {
    status: "unknown",
    reason: "visual taxonomy training status has not been recorded",
  });
}

async function readVisualTrainingLock() {
  const lock = await readJson(visualTrainingLockPath, null);
  const pid = Number(lock?.pid || 0);
  return pid > 0 ? { pid, startedAt: String(lock?.startedAt || "") } : null;
}

async function readVisualShardTrainingState() {
  const state = await readJson(visualShardTrainingStatePath, {
    phase: "not-configured",
    reason: "sequential visual shard training has not started",
  });
  const progressPath = String(state?.currentProgressPath || "").trim();
  if (!progressPath) return state;
  return {
    ...state,
    currentProgress: await readJson(progressPath, {
      status: "unknown",
      reason: "current visual shard progress has not been written",
    }),
  };
}

async function readVisualTrainingReadiness() {
  return readJson(visualTrainingReadinessPath, {
    status: "unknown",
    reason: "visual taxonomy training readiness has not been audited",
  });
}

async function readVisualCandidateHydrationState() {
  return readJson(visualCandidateHydrationStatePath, {
    status: "not-started",
    completed: 0,
    totalBytes: 0,
    reason: "catalog candidate hydration has not started",
  });
}

async function readVisualCandidateCorpusState() {
  const [catalog, supplemental] = await Promise.all([
    readJson(visualCandidateHydrationStatePath, null),
    readJson(visualSupplementalHydrationStatePath, null),
  ]);
  const catalogBytes = Number(catalog?.totalBytes || 0);
  const supplementalBytes = Number(supplemental?.totalBytes || 0);
  const combinedBytes = catalogBytes + supplementalBytes;
  return {
    targetBytes: 50_000_000_000,
    combinedBytes,
    combinedGiB: Number((combinedBytes / 1_073_741_824).toFixed(2)),
    remainingBytes: Math.max(0, 50_000_000_000 - combinedBytes),
    catalog: catalog || { status: "not-started", completed: 0, totalBytes: 0 },
    supplemental: supplemental || { status: "not-started", completed: 0, totalBytes: 0 },
    updatedAt: [catalog?.updatedAt, supplemental?.updatedAt].filter(Boolean).sort().at(-1) || "",
  };
}

async function findCandidateHydrationPid() {
  try {
    const { stdout } = await execFileAsync("/bin/ps", ["-axo", "pid=,command="]);
    const line = String(stdout || "").split(/\r?\n/).find((candidate) =>
      /hydrate-visual-taxonomy-catalog-candidate-manifest\.mjs/.test(candidate) &&
      !candidate.includes("visual-taxonomy-open-images") &&
      !candidate.includes("/bin/ps") &&
      !candidate.includes("realtime-release-watcher.mjs"),
    );
    const pid = Number(String(line || "").trim().split(/\s+/, 1)[0]);
    return isProcessAlive(pid) ? pid : 0;
  } catch {
    return 0;
  }
}

async function findCandidateSupervisorPid() {
  try {
    const { stdout } = await execFileAsync("/bin/ps", ["-axo", "pid=,command="]);
    const line = String(stdout || "").split(/\r?\n/).find((candidate) =>
      candidate.includes("supervise-visual-taxonomy-candidate-training.mjs") &&
      !candidate.includes("/bin/ps") &&
      !candidate.includes("realtime-release-watcher.mjs"),
    );
    const pid = Number(String(line || "").trim().split(/\s+/, 1)[0]);
    return isProcessAlive(pid) ? pid : 0;
  } catch {
    return 0;
  }
}

async function lineCount(path) {
  try {
    return (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean).length;
  } catch (error) {
    if (error?.code === "ENOENT") return 0;
    throw error;
  }
}

async function pathExists(path) {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function availableBytes(path) {
  let probe = resolve(path);
  while (true) {
    try {
      const filesystem = await statfs(probe);
      return Number(filesystem.bavail) * Number(filesystem.bsize);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = resolve(probe, "..");
      if (parent === probe) throw error;
      probe = parent;
    }
  }
}

async function markInterruptedRelease(release, reason) {
  const current = await readJson(releaseRunStatePath, null);
  if (
    !current ||
    current.status !== "running" ||
    Number(current.pid || 0) !== Number(release?.pid || 0) ||
    String(current.heartbeatAt || "") !== String(release?.heartbeatAt || "")
  ) {
    return current || release;
  }

  const now = new Date().toISOString();
  const interrupted = {
    ...current,
    status: "failed",
    error: reason,
    failedAt: now,
    interruptedAt: now,
    interruptedByWatcher: true,
  };
  const tempPath = `${releaseRunStatePath}.tmp-watcher-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, `${JSON.stringify(interrupted, null, 2)}\n`, "utf8");
  await rename(tempPath, releaseRunStatePath);
  return interrupted;
}

async function restoreLostReleaseCheckpoint(release, watcherState) {
  if (
    release?.status !== "failed" ||
    Number(release?.stepIndex || 0) > 0 ||
    !/Cannot resume .* release from catalog run state|Cannot resume .* release from daily run state|Cannot resume daily release from catalog run state/i.test(
      String(release?.error || ""),
    )
  ) {
    return release;
  }

  const stepIndex = Number(watcherState?.releaseStepIndex || 0);
  const totalSteps = Number(watcherState?.releaseTotalSteps || 0);
  const stepLabel = String(watcherState?.releaseStepLabel || "");
  if (!Number.isInteger(stepIndex) || stepIndex < 1 || !Number.isInteger(totalSteps) || totalSteps < stepIndex || !stepLabel) {
    return release;
  }

  const restored = {
    ...release,
    profile: ["catalog", "daily"].includes(String(release.profile || "")) ? release.profile : "daily",
    stepIndex,
    completedStepIndex: Math.max(0, stepIndex - 1),
    totalSteps,
    stepLabel,
    heartbeatAt: String(watcherState?.releaseHeartbeatAt || release.failedAt || new Date().toISOString()),
    interruptedByWatcher: true,
    checkpointRecoveredByWatcher: true,
    checkpointRecoveredAt: new Date().toISOString(),
  };
  const tempPath = `${releaseRunStatePath}.tmp-watcher-recovery-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, `${JSON.stringify(restored, null, 2)}\n`, "utf8");
  await rename(tempPath, releaseRunStatePath);
  await log(`restored lost release checkpoint from watcher telemetry: step=${stepIndex}/${totalSteps} ${stepLabel}`);
  return restored;
}

function appleScriptString(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll(/\r?\n/g, " ")
    .slice(0, 500);
}

async function notifyUser(state, { key, title, message }) {
  const now = Date.now();
  const lastNotificationAt = timestamp(state?.lastNotificationAt);
  if (
    state?.lastNotificationKey === key &&
    lastNotificationAt > 0 &&
    now - lastNotificationAt < notificationCooldownMs
  ) {
    return state;
  }

  if (process.env.SALT_RELEASE_WATCHER_NOTIFICATIONS !== "0" && process.platform === "darwin") {
    try {
      await execFileAsync(
        "/usr/bin/osascript",
        [
          "-e",
          `display notification "${appleScriptString(message)}" with title "${appleScriptString(title)}"`,
        ],
        { timeout: 5_000 },
      );
    } catch (error) {
      await log(`macOS notification failed: ${String(error?.message || error).slice(0, 500)}`);
    }
  }

  return {
    ...state,
    lastNotificationKey: key,
    lastNotificationAt: new Date(now).toISOString(),
  };
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function stopStaleRelease(pid) {
  if (!isProcessAlive(pid) || pid === process.pid) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
  await sleep(5_000);
  if (isProcessAlive(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // The process may have exited between the liveness check and the kill.
    }
  }
}

async function inspectReleaseRun(state) {
  let release = await readJson(releaseRunStatePath, null);
  release = await restoreLostReleaseCheckpoint(release, state);
  if (!release?.status) return { active: false, reasons: [] };

  if (release.status === "running") {
    const pid = Number(release.pid || 0);
    const ageMs = Date.now() - timestamp(release.heartbeatAt || release.startedAt);
    if (isProcessAlive(pid) && ageMs <= releaseStateStaleMs) {
      return { active: true, release, reasons: [] };
    }

    const interruptionReason = isProcessAlive(pid)
      ? `release heartbeat stale for ${Math.round(ageMs / 1000)}s`
      : `release process ${pid || "unknown"} is no longer running`;
    if (isProcessAlive(pid) && ageMs > releaseStateStaleMs) {
      await log(`release heartbeat stale for ${Math.round(ageMs / 1000)}s; stopping pid ${pid}`);
      await stopStaleRelease(pid);
    }
    const interrupted = await markInterruptedRelease(release, interruptionReason);
    return {
      active: false,
      release: interrupted,
      reasons: [`previous release interrupted at step ${release.stepIndex || "unknown"}: ${release.stepLabel || "unknown"} (${interruptionReason})`],
    };
  }

  if (release.status === "failed") {
    const successfulAt = timestamp(state?.lastSuccessfulReleaseAt);
    if (timestamp(release.failedAt) > successfulAt) {
      return {
        active: false,
        release,
        reasons: [
          `${release.interruptedByWatcher ? "previous release was interrupted" : "previous release failed"} at step ${release.stepIndex || "unknown"}: ${release.error || "unknown error"}`,
        ],
      };
    }
  }

  return { active: false, release, reasons: [] };
}

function governedHandles() {
  return new Set(
    COLLECTION_GOVERNANCE_POLICIES
      .map((policy) => normalize(policy.handle))
      .filter(Boolean),
  );
}

async function readLocalBaseline() {
  const [catalog, collections, recentOrders] = await Promise.all([
    readProductCatalogPayload(resolve(rootDir, "public", "data")),
    readJson(resolve(rootDir, "public", "data", "collections.json"), { collections: [] }),
    readJson(resolve(rootDir, "public", "data", "recently-ordered-products.json"), { products: [] }),
  ]);
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const governed = governedHandles();
  const collectionCounts = Object.fromEntries(
    (Array.isArray(collections?.collections) ? collections.collections : [])
      .filter((collection) => governed.has(normalize(collection?.handle)))
      .map((collection) => [normalize(collection.handle), Number(collection.products_count || 0)]),
  );
  const bestsellerFeedCount = Array.isArray(recentOrders?.products) ? recentOrders.products.length : 0;
  if (bestsellerFeedCount > 0) collectionCounts["best-sellers"] = bestsellerFeedCount;
  const latestLocalUpdatedAt = products.reduce(
    (latest, product) => Math.max(latest, timestamp(product?.updated_at || product?.created_at)),
    0,
  );
  return {
    activeProducts: products.length,
    latestLocalUpdatedAt: latestLocalUpdatedAt ? new Date(latestLocalUpdatedAt).toISOString() : "",
    generatedAt: String(catalog?.generatedAt || ""),
    collectionCounts,
  };
}

async function readLiveFingerprint() {
  const payload = await client.run(WATCH_QUERY, {}, { operation: "read realtime release fingerprint" });
  const latestProduct = payload?.products?.nodes?.[0] || null;
  const governed = governedHandles();
  const collectionCounts = Object.fromEntries(
    (Array.isArray(payload?.collections?.nodes) ? payload.collections.nodes : [])
      .filter((collection) => governed.has(normalize(collection?.handle)))
      .map((collection) => [normalize(collection.handle), Number(collection.productsCount?.count || 0)]),
  );
  return {
    latestProductId: String(latestProduct?.id || ""),
    latestProductHandle: String(latestProduct?.handle || ""),
    latestProductUpdatedAt: String(latestProduct?.updatedAt || ""),
    collectionCounts,
    checkedAt: new Date().toISOString(),
  };
}

function detectDrift(baseline, live, state) {
  const reasons = [];
  const baselineUpdatedAt = Math.max(
    timestamp(baseline.latestLocalUpdatedAt),
    timestamp(state?.lastSuccessfulLiveUpdatedAt),
  );
  if (timestamp(live.latestProductUpdatedAt) > baselineUpdatedAt + 1000) {
    reasons.push(`active product changed after baseline (${live.latestProductHandle || live.latestProductId})`);
  }

  const expectedCounts = baseline.collectionCounts || {};
  for (const [handle, actualCount] of Object.entries(live.collectionCounts || {})) {
    if (Object.prototype.hasOwnProperty.call(expectedCounts, handle) && Number(expectedCounts[handle]) !== actualCount) {
      reasons.push(`collection count drift: ${handle} ${expectedCounts[handle]} -> ${actualCount}`);
    }
  }

  const bestsellerCount = live.collectionCounts?.["best-sellers"];
  if (!Number.isFinite(bestsellerCount)) {
    reasons.push("best-sellers collection is missing from live governance");
  } else if (bestsellerCount < 300) {
    reasons.push(`best-sellers below required floor: ${bestsellerCount} < 300`);
  }

  if (state?.lastSuccessfulFingerprint) {
    const previous = JSON.stringify(state.lastSuccessfulFingerprint.collectionCounts || {});
    const current = JSON.stringify(live.collectionCounts || {});
    if (previous !== current) reasons.push("governed collection fingerprint changed");
  }

  return [...new Set(reasons)];
}

async function acquireLock() {
  try {
    await mkdir(lockPath);
    await writeFile(resolve(lockPath, "owner.json"), `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`);
    return true;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const owner = await readJson(resolve(lockPath, "owner.json"), {});
    const pid = Number(owner?.pid || 0);
    let alive = false;
    if (pid > 0) {
      try {
        process.kill(pid, 0);
        alive = true;
      } catch {
        alive = false;
      }
    }
    if (alive) return false;
    await rm(lockPath, { recursive: true, force: true });
    await mkdir(lockPath);
    await writeFile(resolve(lockPath, "owner.json"), `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`);
    return true;
  }
}

async function releaseLock() {
  await rm(lockPath, { recursive: true, force: true });
}

async function runDailyRelease({ resume = false, state = {} } = {}) {
  const args = ["run", releaseScript];
  if (resume) args.push("--", "--resume");
  const child = spawn(npmBin, args, {
    cwd: rootDir,
    env: { ...process.env, SALT_RELEASE_WATCHER_CHILD: "1" },
    stdio: "inherit",
  });
  const exitPromise = new Promise((resolvePromise, rejectPromise) => {
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => resolvePromise({ code, signal }));
  });

  let monitorState = {
    ...state,
    watcherPid: process.pid,
    activeReleasePid: Number(child.pid || 0),
    releaseStatus: "running",
    lastError: "",
    lastCheckedAt: new Date().toISOString(),
    watcherHeartbeatAt: new Date().toISOString(),
  };
  await writeState(monitorState);
  await log(`guarded release child started; pid=${child.pid || "unknown"}; script=${releaseScript}; resume=${resume}`);

  let lastProgressKey = "";
  let childExited = false;
  while (!childExited) {
    const waitResult = await Promise.race([
      exitPromise.then((result) => ({ done: true, result })),
      sleep(monitorIntervalMs).then(() => ({ done: false })),
    ]);
    childExited = waitResult.done;

    const release = await readJson(releaseRunStatePath, null);
    if (release?.status === "running") {
      // Keep the parallel training owner visible while a network-heavy release
      // is running so a watcher reload can adopt the live training lock.
      monitorState = await reconcileParallelVisualTraining(monitorState);
      if (
        visualTrainingParallel &&
        !Number(monitorState.visualTrainingChildPid || 0) &&
        !Number(monitorState.visualCandidateTrainingSupervisorPid || 0)
      ) {
        monitorState = await maybeRunVisualTraining(monitorState, { releaseActive: true, detached: true });
      }
      const progressKey = `${release.stepIndex || "?"}/${release.totalSteps || "?"}:${release.stepLabel || "unknown"}`;
      if (progressKey !== lastProgressKey) {
        await log(`release progress; step=${progressKey}; heartbeat=${release.heartbeatAt || "unknown"}`);
        lastProgressKey = progressKey;
      }
      const heartbeatAgeMs = Date.now() - timestamp(release.heartbeatAt || release.startedAt);
      const now = new Date().toISOString();
      monitorState = {
        ...monitorState,
        ...stageTelemetry(release),
        visualTaxonomyTraining: await readVisualTrainingStatus(),
        visualTaxonomyShardTraining: await readVisualShardTrainingState(),
        visualTaxonomyTrainingReadiness: await readVisualTrainingReadiness(),
        watcherPid: process.pid,
        activeReleasePid: Number(child.pid || release.pid || 0),
        releaseStatus: "running",
        releaseStepIndex: Number(release.stepIndex || 0),
        releaseTotalSteps: Number(release.totalSteps || 0),
        releaseStepLabel: String(release.stepLabel || ""),
        releaseHeartbeatAt: String(release.heartbeatAt || ""),
        lastCheckedAt: now,
        watcherHeartbeatAt: now,
      };
      await writeState(monitorState);

      if (heartbeatAgeMs > releaseStateStaleMs) {
        const staleMessage = `Release heartbeat is stale at step ${release.stepIndex || "unknown"}/${release.totalSteps || "unknown"}. The watcher will resume it safely.`;
        await log(`${staleMessage} age=${Math.round(heartbeatAgeMs / 1000)}s`);
        monitorState = await notifyUser(monitorState, {
          key: `stale:${release.stepIndex || "unknown"}:${release.stepLabel || "unknown"}`,
          title: "SALT release needs repair",
          message: staleMessage,
        });
        await writeState(monitorState);
        await stopStaleRelease(Number(release.pid || child.pid || 0));
        throw new Error(`release heartbeat stale for ${Math.round(heartbeatAgeMs / 1000)}s`);
      }

      // Do not restart a live network stage based only on quiet stdout.
    } else if (release?.status === "failed") {
      monitorState = {
        ...monitorState,
        ...stageTelemetry(release),
        watcherPid: process.pid,
        activeReleasePid: 0,
        releaseStatus: "failed",
        lastCheckedAt: new Date().toISOString(),
        lastError: String(release.error || "release failed"),
      };
      await writeState(monitorState);
    } else if (release?.status === "completed") {
      monitorState = {
        ...monitorState,
        watcherPid: process.pid,
        activeReleasePid: 0,
        releaseStatus: "completed",
        lastCheckedAt: new Date().toISOString(),
      };
      await writeState(monitorState);
    }
  }

  const { code, signal } = await exitPromise;
  if (code !== 0) {
    throw new Error(`release exited with ${signal ? `signal ${signal}` : `code ${code}`}`);
  }
  const finalRelease = await readJson(releaseRunStatePath, null);
  if (finalRelease?.status !== "completed") {
    throw new Error(`release child exited successfully but checkpoint status is ${finalRelease?.status || "missing"}`);
  }
  return monitorState;
}

function spawnVisualTrainingChild() {
  return spawn(npmBin, ["run", "catalog:vision:model:ensure"], {
    cwd: rootDir,
    env: {
      ...process.env,
      SALT_RELEASE_WATCHER_TRAINING_CHILD: "1",
      SALT_REQUIRE_VISUAL_TAXONOMY_MODEL: "1",
      SALT_VISUAL_TRAINING_RETAIN_RAW: "0",
      SALT_VISUAL_STAGING_MAX_SHARD_BYTES: process.env.SALT_VISUAL_STAGING_MAX_SHARD_BYTES || "6000000000",
      SALT_VISUAL_STAGING_CONCURRENCY: process.env.SALT_VISUAL_STAGING_CONCURRENCY || "8",
      SALT_VISUAL_MLX_PYTHON: process.env.SALT_VISUAL_MLX_PYTHON || resolve(homedir(), ".cache", "salt-visual-taxonomy-training", "venv", "bin", "python"),
      SALT_VISUAL_ENCODER_BATCH_SIZE: process.env.SALT_VISUAL_ENCODER_BATCH_SIZE || "16",
    },
    stdio: "inherit",
  });
}

async function runVisualTraining(state, admission) {
  const startedAt = new Date().toISOString();
  let monitorState = {
    ...state,
    visualTrainingAdmission: { ...admission, checkedAt: startedAt },
    visualTrainingStatus: "starting",
    visualTrainingStartedAt: startedAt,
    visualTrainingChildPid: 0,
    lastCheckedAt: startedAt,
    watcherHeartbeatAt: startedAt,
  };
  await writeState(monitorState);
  monitorState = await notifyUser(monitorState, {
    key: "visual-training-started",
    title: "SALT visual training started",
    message: "The release is idle; the guarded Metal visual taxonomy training worker has started.",
  });

  const child = spawnVisualTrainingChild();
  monitorState = {
    ...monitorState,
    visualTrainingStatus: "running",
    visualTrainingChildPid: Number(child.pid || 0),
    lastCheckedAt: new Date().toISOString(),
    watcherHeartbeatAt: new Date().toISOString(),
  };
  await writeState(monitorState);
  await log(`guarded visual training child started; pid=${child.pid || "unknown"}`);

  const result = await new Promise((resolvePromise, rejectPromise) => {
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => resolvePromise({ code, signal }));
  }).catch((error) => ({ error }));

  if (result.error || result.code !== 0) {
    const detail = result.error
      ? String(result.error.message || result.error)
      : `visual training exited with ${result.signal ? `signal ${result.signal}` : `code ${result.code}`}`;
    const retryAt = new Date(Date.now() + visualTrainingRetryMs).toISOString();
    await log(`guarded visual training failed; retrying after ${retryAt}: ${detail}`);
    const failedState = await notifyUser(monitorState, {
      key: `visual-training-failure:${detail.slice(0, 500)}`,
      title: "SALT visual training failed",
      message: `${detail.split("\n")[0]}. The watcher will retry after the guarded backoff.`,
    });
    return {
      ...failedState,
      visualTrainingStatus: "failed",
      visualTrainingChildPid: 0,
      visualTrainingRetryAt: retryAt,
      visualTrainingError: detail,
      lastCheckedAt: new Date().toISOString(),
      watcherHeartbeatAt: new Date().toISOString(),
    };
  }

  const finalStatus = await readVisualTrainingStatus();
  if (finalStatus.status !== "verified") {
    const detail = `visual training exited successfully without a verified model (status=${finalStatus.status || "missing"})`;
    const retryAt = new Date(Date.now() + visualTrainingRetryMs).toISOString();
    await log(detail);
    return {
      ...monitorState,
      visualTrainingStatus: "failed",
      visualTrainingChildPid: 0,
      visualTrainingRetryAt: retryAt,
      visualTrainingError: detail,
      lastCheckedAt: new Date().toISOString(),
      watcherHeartbeatAt: new Date().toISOString(),
    };
  }

  const completedAt = new Date().toISOString();
  const completedState = await notifyUser({
    ...monitorState,
    visualTrainingStatus: "verified",
    visualTrainingChildPid: 0,
    visualTrainingCompletedAt: completedAt,
    visualTrainingRetryAt: "",
    visualTrainingError: "",
    lastCheckedAt: completedAt,
    watcherHeartbeatAt: completedAt,
  }, {
    key: `visual-training-complete:${completedAt}`,
    title: "SALT visual training complete",
    message: "The Metal visual taxonomy model passed its verification gates and is ready for the next release.",
  });
  await log("guarded visual training completed with a verified model");
  return completedState;
}

async function startParallelVisualTraining(state, admission) {
  const startedAt = new Date().toISOString();
  const child = spawnVisualTrainingChild();
  let runningState = {
    ...state,
    visualTrainingAdmission: { ...admission, checkedAt: startedAt },
    visualTrainingStatus: "running",
    visualTrainingStartedAt: startedAt,
    visualTrainingChildPid: Number(child.pid || 0),
    visualTrainingError: "",
    lastCheckedAt: startedAt,
    watcherHeartbeatAt: startedAt,
  };
  await writeState(runningState);
  runningState = await notifyUser(runningState, {
    key: "visual-training-started-parallel",
    title: "SALT visual training started",
    message: "The guarded Metal visual taxonomy training worker is running alongside the release with bounded resources.",
  });
  await writeState(runningState);
  await log(`parallel visual training child started; pid=${child.pid || "unknown"}`);

  let finalized = false;
  const finalize = async ({ code = null, signal = "", error = null } = {}) => {
    if (finalized) return;
    finalized = true;
    const current = await readJson(statePath, runningState);
    const finalStatus = await readVisualTrainingStatus();
    if (error || code !== 0 || finalStatus.status !== "verified") {
      const detail = error
        ? String(error.message || error)
        : code !== 0
          ? `visual training exited with ${signal ? `signal ${signal}` : `code ${code}`}`
          : `visual training exited successfully without a verified model (status=${finalStatus.status || "missing"})`;
      const retryAt = new Date(Date.now() + visualTrainingRetryMs).toISOString();
      const failed = await notifyUser({
        ...current,
        visualTrainingStatus: "failed",
        visualTrainingChildPid: 0,
        visualTrainingRetryAt: retryAt,
        visualTrainingError: detail,
        lastCheckedAt: new Date().toISOString(),
        watcherHeartbeatAt: new Date().toISOString(),
      }, {
        key: `visual-training-failure:${detail.slice(0, 500)}`,
        title: "SALT visual training failed",
        message: `${detail.split("\n")[0]}. The watcher will retry after the guarded backoff.`,
      });
      await writeState(failed);
      await log(`parallel visual training failed; retrying after ${retryAt}: ${detail}`);
      return;
    }
    const completedAt = new Date().toISOString();
    const completed = await notifyUser({
      ...current,
      visualTrainingStatus: "verified",
      visualTrainingChildPid: 0,
      visualTrainingCompletedAt: completedAt,
      visualTrainingRetryAt: "",
      visualTrainingError: "",
      lastCheckedAt: completedAt,
      watcherHeartbeatAt: completedAt,
    }, {
      key: `visual-training-complete:${completedAt}`,
      title: "SALT visual training complete",
      message: "The Metal visual taxonomy model passed its verification gates and is ready for the next release.",
    });
    await writeState(completed);
    await log("parallel visual training completed with a verified model");
  };
  child.once("error", (error) => void finalize({ error }).catch((finalizeError) => log(`parallel visual training finalization failed: ${finalizeError.message}`)));
  child.once("exit", (code, signal) => void finalize({ code, signal }).catch((finalizeError) => log(`parallel visual training finalization failed: ${finalizeError.message}`)));
  return runningState;
}

async function reconcileParallelVisualTraining(state) {
  const childPid = Number(state?.visualTrainingChildPid || 0);
  const lock = await readVisualTrainingLock();
  if (lock && isProcessAlive(lock.pid)) {
    if (childPid === lock.pid && isProcessAlive(childPid)) return state;
    await log(`adopting live visual training lock owner; pid=${lock.pid}`);
    return {
      ...state,
      visualTrainingStatus: "running",
      visualTrainingChildPid: lock.pid,
      visualTrainingStartedAt: state.visualTrainingStartedAt || lock.startedAt,
      visualTrainingError: "",
      visualTrainingRetryAt: "",
    };
  }
  if (!childPid) {
    const status = await readVisualTrainingStatus();
    if (status.status !== "training") return state;
    const detail = "visual training is marked training but has no live lock owner";
    const retryAt = new Date(Date.now() + visualTrainingRetryMs).toISOString();
    return {
      ...state,
      visualTrainingStatus: "failed",
      visualTrainingRetryAt: retryAt,
      visualTrainingError: detail,
    };
  }
  if (isProcessAlive(childPid)) return state;
  const status = await readVisualTrainingStatus();
  if (status.status === "verified") {
    return {
      ...state,
      visualTrainingStatus: "verified",
      visualTrainingChildPid: 0,
      visualTrainingCompletedAt: status.completedAt || new Date().toISOString(),
      visualTrainingRetryAt: "",
      visualTrainingError: "",
    };
  }
  return {
    ...state,
    visualTrainingStatus: "failed",
    visualTrainingChildPid: 0,
    visualTrainingRetryAt: state.visualTrainingRetryAt || new Date(Date.now() + visualTrainingRetryMs).toISOString(),
    visualTrainingError: state.visualTrainingError || status.error || "parallel visual training child is no longer running",
  };
}

async function maybeRunVisualTraining(state, { releaseActive = false, detached = false } = {}) {
  const [configExists, modelExists, available, trainingConfig] = await Promise.all([
    pathExists(visualTrainingConfigPath),
    pathExists(visualTrainingModelPath),
    availableBytes(rootDir),
    readJson(visualTrainingConfigPath, {}),
  ]);
  const trainingPid = Number(state?.visualTrainingChildPid || 0);
  const candidateSupervisorPid = Number(state?.visualCandidateTrainingSupervisorPid || 0);
  const admission = evaluateVisualTrainingAdmission({
    autoStart: visualTrainingAutoStart,
    releaseActive,
    allowDuringRelease: releaseActive && visualTrainingParallel,
    trainingActive: (trainingPid > 0 && isProcessAlive(trainingPid)) ||
      (candidateSupervisorPid > 0 && isProcessAlive(candidateSupervisorPid)),
    configExists,
    modelExists,
    availableBytes: available,
    minFreeBytes: visualTrainingMinFreeBytes,
    requiredFreeBytes: Number(trainingConfig?.minFreeBytes || 0),
    maxShardBytes: Number(trainingConfig?.maxShardBytes || 25_000_000_000),
    retryAt: state?.visualTrainingRetryAt,
  });
  const next = {
    ...state,
    visualTrainingAdmission: {
      ...admission,
      checkedAt: new Date().toISOString(),
      configPath: visualTrainingConfigPath,
      modelPath: visualTrainingModelPath,
    },
    visualTaxonomyTraining: await readVisualTrainingStatus(),
    visualTaxonomyTrainingReadiness: await readVisualTrainingReadiness(),
  };
  if (!admission.shouldStart) {
    if (admission.status === "blocked" && state?.visualTrainingAdmission?.reason !== admission.reason) {
      await log(`visual training not admitted: ${admission.reason}`);
    }
    return next;
  }
  return detached ? startParallelVisualTraining(next, admission) : runVisualTraining(next, admission);
}

async function maybePrepareCandidateTraining(state) {
  const candidateSupervisorPid = Number(state?.visualCandidateTrainingSupervisorPid || 0);
  if (candidateSupervisorPid > 0 && isProcessAlive(candidateSupervisorPid)) return state;
  if (await pathExists(visualTrainingConfigPath)) {
    return state;
  }
  const hydration = await readVisualCandidateHydrationState();
  if (hydration.status !== "ready" || Number(hydration.totalBytes || 0) < 50_000_000_000) {
    return {
      ...state,
      visualCandidateHydration: hydration,
    };
  }
  if (state?.visualTrainingPreparationStatus === "ready") return state;
  const startedAt = new Date().toISOString();
  await writeState({
    ...state,
    visualTrainingPreparationStatus: "running",
    visualTrainingPreparationStartedAt: startedAt,
    watcherHeartbeatAt: startedAt,
  });
  try {
    await execFileAsync(npmBin, ["run", "catalog:vision:catalog-candidates:prepare"], {
      cwd: rootDir,
      env: {
        ...process.env,
        SALT_VISUAL_ALLOW_CANDIDATE_LABELS: "1",
        SALT_VISUAL_TRAINING_RETAIN_RAW: "0",
        SALT_VISUAL_STAGING_MAX_SHARD_BYTES: process.env.SALT_VISUAL_STAGING_MAX_SHARD_BYTES || "6000000000",
      },
      maxBuffer: 64 * 1024 * 1024,
    });
    await log("prepared the signed candidate-only visual training shard plan and watcher config");
    return {
      ...state,
      visualCandidateHydration: hydration,
      visualTrainingPreparationStatus: "ready",
      visualTrainingPreparationCompletedAt: new Date().toISOString(),
      visualTrainingPreparationError: "",
    };
  } catch (error) {
    const detail = String(error?.message || error);
    await log(`candidate visual training preparation failed: ${detail}`);
    return {
      ...state,
      visualCandidateHydration: hydration,
      visualTrainingPreparationStatus: "failed",
      visualTrainingPreparationError: detail,
      lastError: detail,
    };
  }
}

async function maybeRunCandidateHydration(state) {
  if (!(await pathExists(visualCandidateManifestPath))) return state;
  const hydration = await readVisualCandidateHydrationState();
  if (hydration.status === "ready" && Number(hydration.totalBytes || 0) >= 50_000_000_000) {
    return { ...state, visualCandidateHydration: hydration, visualCandidateHydrationChildPid: 0 };
  }
  if (hydration.status === "source-exhausted" || hydration.sourceExhausted === true) {
    return {
      ...state,
      visualCandidateHydration: hydration,
      visualCandidateHydrationChildPid: 0,
      visualCandidateHydrationStatus: "source-exhausted",
    };
  }
  const currentPid = Number(state?.visualCandidateHydrationChildPid || 0);
  if (currentPid && isProcessAlive(currentPid)) {
    return { ...state, visualCandidateHydration: hydration };
  }
  const existingPid = await findCandidateHydrationPid();
  if (existingPid) {
    return {
      ...state,
      visualCandidateHydration: hydration,
      visualCandidateHydrationChildPid: existingPid,
      visualCandidateHydrationStatus: "running",
    };
  }
  try {
    const outputInfo = await stat(visualCandidateHydratedManifestPath);
    const outputAgeMs = Date.now() - outputInfo.mtimeMs;
    if (outputAgeMs < monitorIntervalMs * 4) {
      return { ...state, visualCandidateHydration: hydration, visualCandidateHydrationStatus: "checkpointing" };
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const child = spawn(npmBin, ["run", "catalog:vision:catalog-candidates:hydrate"], {
    cwd: rootDir,
    env: {
      ...process.env,
      SALT_VISUAL_CANDIDATE_FETCH_CONCURRENCY: process.env.SALT_VISUAL_CANDIDATE_FETCH_CONCURRENCY || "16",
      SALT_VISUAL_CANDIDATE_FETCH_ATTEMPTS: process.env.SALT_VISUAL_CANDIDATE_FETCH_ATTEMPTS || "3",
      SALT_RELEASE_WATCHER_TRAINING_CHILD: "1",
    },
    stdio: "inherit",
  });
  const startedAt = new Date().toISOString();
  await log(`candidate visual hydration child started; pid=${child.pid || "unknown"}`);
  return {
    ...state,
    visualCandidateHydration: hydration,
    visualCandidateHydrationChildPid: Number(child.pid || 0),
    visualCandidateHydrationStatus: "running",
    visualCandidateHydrationStartedAt: startedAt,
  };
}

async function maybeStartCandidateTrainingSupervisor(state) {
  let nextState = await reconcileCandidateTrainingSupervisor(state);
  if (await pathExists(visualTrainingModelPath)) {
    return {
      ...nextState,
      visualCandidateTrainingSupervisorPid: 0,
      visualCandidateTrainingSupervisorStatus: "completed",
      visualCandidateTrainingSupervisorRetryAt: "",
      visualCandidateTrainingSupervisorError: "",
    };
  }

  const activeTrainingPid = Number(nextState?.visualTrainingChildPid || 0);
  if (activeTrainingPid && isProcessAlive(activeTrainingPid)) return nextState;

  const existingSupervisorPid = await findCandidateSupervisorPid();
  if (existingSupervisorPid) {
    return {
      ...nextState,
      visualCandidateTrainingSupervisorPid: existingSupervisorPid,
      visualCandidateTrainingSupervisorStatus: "running",
      visualCandidateTrainingSupervisorRetryAt: "",
      visualCandidateTrainingSupervisorError: "",
    };
  }
  const retryAt = timestamp(nextState?.visualCandidateTrainingSupervisorRetryAt);
  if (retryAt > Date.now()) return nextState;

  const hydration = await readVisualCandidateHydrationState();
  const hydrationPid = await findCandidateHydrationPid();
  const sourceCount = Number(hydration.sourceCount || await lineCount(visualCandidateManifestPath));
  const completed = Number(hydration.completed || await lineCount(visualCandidateHydratedManifestPath));
  const sourceExhausted = hydration.status === "source-exhausted" || hydration.sourceExhausted === true || (!hydrationPid && sourceCount > 0 && completed >= sourceCount);
  if (!sourceExhausted) return nextState;
  const child = spawn(process.execPath, [visualCandidateSupervisorScript, "--start-now"], {
    cwd: rootDir,
    env: {
      ...process.env,
      SALT_VISUAL_ALLOW_CANDIDATE_LABELS: "1",
      SALT_VISUAL_TRAINING_RETAIN_RAW: "0",
      SALT_VISUAL_OPEN_IMAGES_ROOT: visualSupplementalRoot,
      SALT_OPEN_IMAGES_MANIFEST_OUTPUT: visualSupplementalManifestPath,
      SALT_OPEN_IMAGES_HYDRATED_MANIFEST_OUTPUT: visualSupplementalHydratedManifestPath,
      SALT_OPEN_IMAGES_HYDRATION_STATE: visualSupplementalHydrationStatePath,
      SALT_VISUAL_CANDIDATE_HYDRATION_TARGET_BYTES: process.env.SALT_VISUAL_CANDIDATE_HYDRATION_TARGET_BYTES || "60000000000",
      SALT_VISUAL_STAGING_MAX_SHARD_BYTES: process.env.SALT_VISUAL_STAGING_MAX_SHARD_BYTES || "6000000000",
      SALT_VISUAL_STAGING_CONCURRENCY: process.env.SALT_VISUAL_STAGING_CONCURRENCY || "8",
    },
    stdio: "inherit",
  });
  const startedAt = new Date().toISOString();
  await log(`candidate visual training supervisor started; pid=${child.pid || "unknown"}`);
  return {
    ...nextState,
    visualCandidateTrainingSupervisorPid: Number(child.pid || 0),
    visualCandidateTrainingSupervisorStatus: "running",
    visualCandidateTrainingSupervisorStartedAt: startedAt,
    visualCandidateTrainingSupervisorRetryAt: "",
    visualCandidateTrainingSupervisorError: "",
  };
}

async function reconcileCandidateTrainingSupervisor(state) {
  const pid = Number(state?.visualCandidateTrainingSupervisorPid || 0);
  if (!pid || isProcessAlive(pid)) return state;
  if (await pathExists(visualTrainingModelPath)) {
    return {
      ...state,
      visualCandidateTrainingSupervisorPid: 0,
      visualCandidateTrainingSupervisorStatus: "completed",
      visualCandidateTrainingSupervisorRetryAt: "",
      visualCandidateTrainingSupervisorError: "",
    };
  }

  const detail = `candidate visual training supervisor pid ${pid} is no longer running before model verification`;
  const retryAt = new Date(Date.now() + visualTrainingRetryMs).toISOString();
  const failed = await notifyUser({
    ...state,
    visualCandidateTrainingSupervisorPid: 0,
    visualCandidateTrainingSupervisorStatus: "failed",
    visualCandidateTrainingSupervisorRetryAt: retryAt,
    visualCandidateTrainingSupervisorError: detail,
    lastCheckedAt: new Date().toISOString(),
    watcherHeartbeatAt: new Date().toISOString(),
  }, {
    key: `candidate-training-supervisor-failure:${detail}`,
    title: "SALT visual training supervisor stopped",
    message: `${detail}. The watcher will retry from the checkpoint.`,
  });
  await log(`${detail}; retrying after ${retryAt}`);
  return failed;
}

async function checkOnce(state) {
  const releaseInspection = await inspectReleaseRun(state);
  if (releaseInspection.active) {
    await log(`release active; step=${releaseInspection.release.stepIndex || "unknown"}/${releaseInspection.release.totalSteps || "unknown"} ${releaseInspection.release.stepLabel || "unknown"}`);
    const now = new Date().toISOString();
    const persisted = await readJson(statePath, {});
    let activeState = await reconcileParallelVisualTraining({ ...state, ...persisted });
    activeState = await maybeRunCandidateHydration(activeState);
    activeState = await maybeStartCandidateTrainingSupervisor(activeState);
    activeState = await maybePrepareCandidateTraining(activeState);
    if (
      visualTrainingParallel &&
      !Number(activeState.visualTrainingChildPid || 0) &&
      !Number(activeState.visualCandidateTrainingSupervisorPid || 0)
    ) {
      activeState = await maybeRunVisualTraining(activeState, { releaseActive: true, detached: true });
    }
    return {
      ...activeState,
      ...stageTelemetry(releaseInspection.release),
      watcherPid: process.pid,
      lastCheckedAt: now,
      activeReleasePid: Number(releaseInspection.release.pid || 0),
      releaseStatus: "running",
      visualTaxonomyTraining: await readVisualTrainingStatus(),
      visualTaxonomyShardTraining: await readVisualShardTrainingState(),
      visualTaxonomyTrainingReadiness: await readVisualTrainingReadiness(),
      visualCandidateHydration: await readVisualCandidateHydrationState(),
      visualCandidateCorpus: await readVisualCandidateCorpusState(),
      releaseStepIndex: Number(releaseInspection.release.stepIndex || 0),
      releaseTotalSteps: Number(releaseInspection.release.totalSteps || 0),
      releaseStepLabel: String(releaseInspection.release.stepLabel || ""),
      releaseHeartbeatAt: String(releaseInspection.release.heartbeatAt || ""),
      watcherHeartbeatAt: now,
      lastError: "",
    };
  }

  let baseline = null;
  try {
    baseline = await readLocalBaseline();
  } catch (error) {
    const localCatalogRebuildInProgress = releaseInspection.reasons.length > 0 &&
      error?.code === "ENOENT" &&
      /public[\\/]data[\\/]products\.json/.test(String(error?.path || error?.message || ""));
    if (!localCatalogRebuildInProgress) throw error;
    await log("local catalog snapshot is mid-rebuild; using the interrupted release checkpoint for resume");
  }
  const live = await readLiveFingerprint();
  const scheduledRun = scheduledReleaseDue(state);
  const reasons = [
    ...releaseInspection.reasons,
    ...(scheduledRun ? [`scheduled daily release due at ${scheduledRun.dueAt}`] : []),
    ...(baseline ? detectDrift(baseline, live, state) : []),
  ];
  if (!reasons.length) {
    state = await maybeRunCandidateHydration(state);
    state = await maybeStartCandidateTrainingSupervisor(state);
    state = await maybePrepareCandidateTraining(state);
    state = await maybeRunVisualTraining(state);
    await log(`no drift; latest=${live.latestProductHandle || live.latestProductId || "none"}`);
    return {
      ...state,
      watcherPid: process.pid,
      lastCheckedAt: live.checkedAt,
      watcherHeartbeatAt: new Date().toISOString(),
      activeReleasePid: 0,
      releaseStatus: "idle",
      visualTaxonomyTraining: await readVisualTrainingStatus(),
      visualTaxonomyShardTraining: await readVisualShardTrainingState(),
      visualTaxonomyTrainingReadiness: await readVisualTrainingReadiness(),
      visualCandidateHydration: await readVisualCandidateHydrationState(),
      visualCandidateCorpus: await readVisualCandidateCorpusState(),
      lastError: "",
    };
  }

  const recoveredInterruptedRelease = releaseInspection.release?.interruptedByWatcher === true;
  const corruptedResumeCheckpoint = releaseInspection.release?.status === "failed" &&
    /Cannot resume .* release from catalog run state|Cannot resume .* release from daily run state|Cannot resume daily release from catalog run state/i.test(
      String(releaseInspection.release?.error || ""),
    );
  if (state?.nextRetryAt && timestamp(state.nextRetryAt) > Date.now() && !recoveredInterruptedRelease && !corruptedResumeCheckpoint) {
    await log(`drift held for retry backoff until ${state.nextRetryAt}: ${reasons.join("; ")}`);
    return {
      ...state,
      watcherPid: process.pid,
      lastCheckedAt: live.checkedAt,
      watcherHeartbeatAt: new Date().toISOString(),
      lastDriftReasons: reasons,
    };
  }

  if (!(await acquireLock())) {
    await log(`drift detected while another release is running: ${reasons.join("; ")}`);
    return {
      ...state,
      watcherPid: process.pid,
      lastCheckedAt: live.checkedAt,
      watcherHeartbeatAt: new Date().toISOString(),
      lastDriftReasons: reasons,
    };
  }

  try {
    await log(`deterministic drift detected; starting guarded release: ${reasons.join("; ")}`);
    const resume = ["failed", "running"].includes(releaseInspection.release?.status);
    await log(`release mode: ${resume ? "resume from checkpoint" : "full catalog run"}`);
    const scheduledReleaseDate = scheduledRun?.dateKey || "";
    let monitorState = await notifyUser(state, {
      key: `repair-start:${resume ? "resume" : "full"}:${reasons.join("|").slice(0, 300)}`,
      title: "SALT release repair started",
      message: `${resume ? "Resuming" : "Starting"} the guarded release. The watcher is monitoring every checkpoint.`,
    });
    monitorState = {
      ...monitorState,
      scheduledReleaseInProgressDate: scheduledReleaseDate,
      scheduledReleaseTarget: scheduledReleaseDate ? `${scheduledReleaseHour}:${String(scheduledReleaseMinute).padStart(2, "0")}` : "",
    };
    monitorState = await runDailyRelease({ resume, state: monitorState });
    const refreshed = await readLiveFingerprint();
    await log(`guarded release completed and live fingerprint refreshed`);
    monitorState = await notifyUser(monitorState, {
      key: `repair-success:${refreshed.latestProductUpdatedAt}:${JSON.stringify(refreshed.collectionCounts || {})}`,
      title: "SALT release completed",
      message: "The guarded release completed and live verification passed.",
    });
    return {
      ...monitorState,
      watcherPid: process.pid,
      lastCheckedAt: refreshed.checkedAt,
      lastSuccessfulReleaseAt: new Date().toISOString(),
      lastScheduledReleaseDate: scheduledReleaseDate || monitorState.lastScheduledReleaseDate || "",
      scheduledReleaseInProgressDate: "",
      lastSuccessfulLiveUpdatedAt: refreshed.latestProductUpdatedAt,
      lastSuccessfulFingerprint: refreshed,
      lastDriftReasons: [],
      failureCount: 0,
      nextRetryAt: "",
      lastError: "",
    };
  } catch (error) {
    const failureCount = Number(state?.failureCount || 0) + 1;
    const retryMs = Math.min(maxRetryIntervalMs, pollIntervalMs * 2 ** Math.min(failureCount - 1, 8));
    const nextRetryAt = new Date(Date.now() + retryMs).toISOString();
    await log(`guarded release failed; no partial repair attempted: ${error.message}`);
    const failedState = await notifyUser(state, {
      key: `release-failure:${String(error.message || error).slice(0, 500)}`,
      title: "SALT release failed",
      message: `${String(error.message || error).split("\n")[0]}. The watcher will retry from the checkpoint.`,
    });
    return {
      ...failedState,
      watcherPid: process.pid,
      lastCheckedAt: live.checkedAt,
      lastDriftReasons: reasons,
      failureCount,
      nextRetryAt,
      scheduledReleaseInProgressDate: "",
      activeReleasePid: 0,
      releaseStatus: "failed",
      lastError: error.message,
    };
  } finally {
    await releaseLock();
  }
}

async function main() {
  await log(`watcher started; polling every ${Math.round(pollIntervalMs / 1000)}s; monitoring every ${Math.round(monitorIntervalMs / 1000)}s`);
  let state = await readJson(statePath, {});
  state = {
    ...state,
    watcherPid: process.pid,
    watcherHeartbeatAt: new Date().toISOString(),
    watcherHeartbeatIntervalMs: watcherHeartbeatMs,
    releaseMonitorIntervalMs: monitorIntervalMs,
  };
  await writeState(state);

  let heartbeatWriteInFlight = false;
  const heartbeatTimer = setInterval(() => {
    if (heartbeatWriteInFlight) return;
    heartbeatWriteInFlight = true;
    void (async () => {
      try {
        const persisted = await readJson(statePath, {});
        const heartbeatAt = new Date().toISOString();
        await writeState({
          ...persisted,
          watcherPid: process.pid,
          watcherHeartbeatAt: heartbeatAt,
        });
      } catch (error) {
        await log(`watcher heartbeat write failed: ${String(error?.message || error).slice(0, 500)}`);
      } finally {
        heartbeatWriteInFlight = false;
      }
    })();
  }, watcherHeartbeatMs);
  heartbeatTimer.unref?.();

  try {
    while (true) {
      if (passiveMode) {
        const release = await readJson(releaseRunStatePath, null);
        if (release?.status && release.status !== "running") {
          const terminalState = {
            ...state,
            watcherPid: process.pid,
            activeReleasePid: 0,
            releaseStatus: release.status,
            lastCheckedAt: new Date().toISOString(),
            watcherHeartbeatAt: new Date().toISOString(),
            lastError: release.status === "failed" ? String(release.error || "release failed") : "",
          };
          state = release.status === "failed"
            ? await notifyUser(terminalState, {
              key: `passive-release-failure:${String(release.error || "release failed").slice(0, 500)}`,
              title: "SALT release failed",
              message: `${String(release.error || "release failed").split("\n")[0]}. The main watcher will resume it.`,
            })
            : terminalState;
          await log(`passive handoff ended; release status=${release.status}`);
          await writeState(state);
          break;
        }
      }
      try {
        state = await checkOnce(state);
        state = {
          ...state,
          watcherPid: process.pid,
          watcherHeartbeatAt: new Date().toISOString(),
        };
        await writeState(state);
      } catch (error) {
        await log(`fingerprint check failed; no mutation attempted: ${error.message}`);
        state = {
          ...state,
          watcherPid: process.pid,
          lastError: error.message,
          lastCheckedAt: new Date().toISOString(),
          watcherHeartbeatAt: new Date().toISOString(),
        };
        state = await notifyUser(state, {
          key: `watcher-error:${String(error?.message || error).slice(0, 500)}`,
          title: "SALT watcher error",
          message: `${String(error?.message || error).split("\n")[0]}. No release mutation was attempted.`,
        });
        await writeState(state);
      }
      await sleep(pollIntervalMs);
    }
  } finally {
    clearInterval(heartbeatTimer);
  }
}

main().catch(async (error) => {
  await log(`watcher stopped: ${error.message}`);
  process.exit(1);
});
