#!/usr/bin/env node

import { appendFile, mkdir, rename, rm, stat, statfs, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { buildProcessTerminationTargets, parseProcessTable } from "./lib/process-runtime.mjs";

import { COLLECTION_GOVERNANCE_POLICIES } from "../src/lib/catalog-collection-governance.js";
import { createShopifyAdminGraphQLClient } from "./shopify-admin-graphql-client.mjs";
import { readProductCatalogPayload } from "./product-catalog-files.mjs";
import { isTransientFileReadError, readFileWithRetry } from "./reliable-file-read.mjs";
import { DEFAULT_HEAD_ONLY_MIN_FREE_BYTES, DEFAULT_MIN_FREE_BYTES, evaluateVisualTrainingAdmission } from "./visual-training-admission.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const outputDir = resolve(rootDir, "output");
const statePath = resolve(outputDir, "realtime-release-watcher-state.json");
const releaseRunStatePath = resolve(outputDir, "release-run-state.json");
const releaseCatalogSourcePath = resolve(outputDir, "release-catalog-source.json");
const releaseRunStateMirrorDir = outputDir;
const collectionShuffleProgressPath = resolve(outputDir, "shopify-collection-shuffle-progress.json");
const collectionShuffleManifestPath = resolve(outputDir, "shopify-collection-shuffle-manifest.json");
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
const visualCandidateOutputDir = resolve(outputDir, "visual-taxonomy-candidate");
const visualCandidateModelPath = resolve(visualCandidateOutputDir, "visual-taxonomy-model.json");
const logPath = resolve(outputDir, "realtime-release-watcher.log");
const lockPath = resolve(outputDir, "realtime-release.lock");
const watcherProcessLockPath = resolve(outputDir, "realtime-release-watcher-process.lock");
const pollIntervalMs = Math.max(60_000, Number(process.env.SALT_RELEASE_WATCHER_POLL_MS || 300_000));
const monitorIntervalMs = Math.max(10_000, Number(process.env.SALT_RELEASE_WATCHER_MONITOR_MS || 30_000));
const watcherHeartbeatMs = Math.max(10_000, Number(process.env.SALT_RELEASE_WATCHER_HEARTBEAT_MS || 30_000));
const maxRetryIntervalMs = Math.max(pollIntervalMs, Number(process.env.SALT_RELEASE_WATCHER_MAX_RETRY_MS || 3_600_000));
const releaseStateStaleMs = Math.max(
  pollIntervalMs * 2,
  Number(process.env.SALT_RELEASE_WATCHER_STALE_MS || 900_000),
);
const operationProgressStaleMs = Math.max(
  releaseStateStaleMs,
  Number(process.env.SALT_RELEASE_WATCHER_OPERATION_STALE_MS || 900_000),
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
const visualCandidateHydrationRetryMs = Math.max(
  300_000,
  Number(process.env.SALT_RELEASE_WATCHER_CANDIDATE_HYDRATION_RETRY_MS || 1_800_000),
);
// A dead adopted owner leaves a valid shard checkpoint behind. Retry it on the
// next watcher poll instead of applying the full failure backoff.
const visualTrainingOrphanRetryMs = Math.max(30_000, Math.min(visualTrainingRetryMs, pollIntervalMs));

function isTransientRemoteError(error) {
  const message = String(error?.message || error || "");
  return /\b(?:ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|EAGAIN)\b|getaddrinfo\s+(?:ENOTFOUND|EAI_AGAIN)|socket hang up|(?:TypeError:\s*)?fetch failed|network request failed|Unknown system error -11/i.test(message);
}

function visualTrainingRetryDelayMs(error) {
  // Image staging can fail with an undici TypeError that omits the useful DNS
  // code. Treat it like the other remote failures so the shard checkpoint is
  // retried promptly instead of waiting for the full training backoff.
  return isTransientRemoteError(error)
    ? Math.min(visualTrainingRetryMs, visualTrainingOrphanRetryMs)
    : visualTrainingRetryMs;
}
const visualTrainingParallel = process.env.SALT_RELEASE_WATCHER_TRAINING_PARALLEL === "1";
const releaseScript = String(process.env.SALT_RELEASE_WATCHER_RELEASE_SCRIPT || "release:daily").trim();
if (!["release", "release:core", "release:daily"].includes(releaseScript)) {
  throw new Error(`Unsupported watcher release script: ${releaseScript || "missing"}. Use release, release:core, or release:daily.`);
}
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const execFileAsync = promisify(execFile);
const client = createShopifyAdminGraphQLClient({ rootDir, agentName: "realtime-release-watcher" });

function normalizeSeoMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return mode === "deterministic" ? "deterministic" : "gpt";
}

function normalizeSeoScope(value) {
  return String(value || "").trim().toLowerCase() === "new-products" ? "new-products" : "all-products";
}

export function resolveReleaseLaunchConfig(release = {}, watcherState = {}) {
  const profile = ["catalog", "daily", "products"].includes(String(release?.profile || "").trim().toLowerCase())
    ? String(release.profile).trim().toLowerCase()
    : "catalog";
  const seoMode = normalizeSeoMode(
    release?.seoMode || watcherState?.releaseSeoMode || process.env.SALT_RELEASE_SEO_MODE || "gpt",
  );
  const seoScope = normalizeSeoScope(
    release?.seoScope || watcherState?.releaseSeoScope || process.env.SALT_RELEASE_SEO_SCOPE || "all-products",
  );
  return {
    script: "release:core",
    profile,
    seoMode,
    seoScope,
    provider: seoMode === "gpt" ? "applescript" : "",
    batchSize: seoMode === "gpt" ? 500 : 0,
  };
}

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
  const lastActivityAt = String(release?.stageLastActivityAt || lastOutputAt);
  const lastOutputTimestamp = timestamp(lastOutputAt);
  const lastActivityTimestamp = timestamp(lastActivityAt);
  return {
    releaseStageStatus: String(release?.stageStatus || ""),
    releaseStageChildPid: Number(release?.stageChildPid || 0),
    releaseStageStartedAt: String(release?.stageStartedAt || ""),
    releaseStageLastOutputAt: lastOutputAt,
    releaseStageLastActivityAt: lastActivityAt,
    releaseStageOutputBytes: Number(release?.stageOutputBytes || 0),
    releaseStageActivityIdleSeconds: lastActivityTimestamp > 0
      ? Math.max(0, Math.round((Date.now() - lastActivityTimestamp) / 1000))
      : 0,
    releaseStageIdleSeconds: lastOutputTimestamp > 0
      ? Math.max(0, Math.round((Date.now() - lastOutputTimestamp) / 1000))
      : 0,
  };
}

export function mergeActiveReleaseTelemetry(watcherState = {}, release = {}) {
  const releasePid = Number(release?.pid || 0);
  if (!isActiveReleaseCheckpointStatus(release?.status) || releasePid <= 0) return watcherState;
  const launch = resolveReleaseLaunchConfig(release, watcherState);
  return {
    ...watcherState,
    ...stageTelemetry(release),
    activeReleasePid: releasePid,
    releaseStatus: String(release.status),
    releaseSeoMode: launch.seoMode,
    releaseSeoScope: launch.seoScope,
    gptSeoProvider: launch.provider,
    gptSeoBatchSize: launch.batchSize,
    releaseStepIndex: Number(release.stepIndex || 0),
    releaseTotalSteps: Number(release.totalSteps || 0),
    releaseStepLabel: String(release.stepLabel || ""),
    releaseHeartbeatAt: String(release.heartbeatAt || ""),
    lastError: "",
  };
}

function operationProgressAgeMs(progress) {
  const updatedAt = timestamp(progress?.updatedAt);
  return updatedAt > 0 ? Math.max(0, Date.now() - updatedAt) : 0;
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isResumableReleaseCheckpointStatus(status) {
  return ["failed", "interrupted", "waiting_for_network"].includes(String(status || "").trim().toLowerCase());
}

export function isActiveReleaseCheckpointStatus(status) {
  return ["running", "waiting_for_network"].includes(String(status || "").trim().toLowerCase());
}

export function isManualStopSuppressed(release = {}, watcherState = {}) {
  const releasePid = Number(release?.pid || 0);
  const stoppedReleasePid = Number(watcherState?.manualStopReleasePid || 0);
  return releasePid > 0 && stoppedReleasePid > 0 && releasePid === stoppedReleasePid;
}

export function releaseProgressLogKey(release = {}) {
  return [
    String(release?.pid || "unknown"),
    String(release?.startedAt || "unknown"),
    String(release?.stepIndex || "unknown"),
    String(release?.totalSteps || "unknown"),
    String(release?.stepLabel || "unknown"),
  ].join(":");
}

export function shouldReclaimUnreadableWatcherLock({ lockAgeMs, monitorIntervalMs } = {}) {
  const age = Number(lockAgeMs);
  const poll = Number(monitorIntervalMs);
  if (!Number.isFinite(age) || !Number.isFinite(poll)) return false;
  return age >= Math.max(poll, 60_000);
}

export function shouldDeferWatcherCheck({ nextRetryAt, now = Date.now(), hasActionableRelease = false, scheduledDue = false } = {}) {
  const retryAt = timestamp(nextRetryAt);
  return retryAt > Number(now) && !hasActionableRelease && !scheduledDue;
}

export function shouldTrustLiveReleaseStage({
  releaseAlive = false,
  stageAlive = false,
  stageStatus = "",
  heartbeatAgeMs = 0,
  staleMs = releaseStateStaleMs,
} = {}) {
  const heartbeatFresh = Number.isFinite(Number(heartbeatAgeMs)) && Number(heartbeatAgeMs) <= Number(staleMs);
  const stageRunning = stageAlive && ["running", "waiting_for_network"].includes(normalize(stageStatus));
  return Boolean(releaseAlive) && (heartbeatFresh || stageRunning);
}

function scheduledReleaseDue(state) {
  if (process.env.SALT_RELEASE_WATCHER_DAILY_RUN === "0") return null;
  // A failed scheduled attempt already has a guarded retry deadline. Do not
  // turn the daily due check into a tight notification/release loop while the
  // underlying scope or network problem is backing off.
  if (state?.nextRetryAt && timestamp(state.nextRetryAt) > Date.now()) return null;
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
  let lastError;
  // OneDrive can briefly expose an empty or half-written checkpoint while an
  // atomic writer is replacing it. Retry the parse, not only the filesystem
  // read, so telemetry does not trigger an unnecessary release recovery.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const raw = String(await readFileWithRetry(path, "utf8", 16)).trim();
      if (!raw) {
        const error = new Error(`empty JSON checkpoint: ${path}`);
        error.code = "EAGAIN";
        throw error;
      }
      return JSON.parse(raw);
    } catch (error) {
      if (error?.code === "ENOENT") return fallback;
      lastError = error;
      if (attempt === 7) throw error;
      await sleep(Math.min(4_000, 250 * 2 ** attempt));
    }
  }
  throw lastError;
}

export function isMissingCatalogBaselineError(error) {
  if (error?.code !== "ENOENT") return false;
  const detail = String(error?.path || error?.message || "");
  return /public[\\/]data[\\/]products\.json(?:['\"]|$)/.test(detail);
}

function catalogBaselineSourcePaths() {
  return [
    process.env.SALT_RELEASE_CATALOG_SOURCE_PATH,
    releaseCatalogSourcePath,
  ]
    .filter(Boolean)
    .map((path) => resolve(rootDir, String(path)))
    .filter((path, index, paths) => paths.indexOf(path) === index);
}

async function readCatalogForBaseline() {
  // The release snapshot is authoritative once the public shard manifest has
  // been replaced or intentionally omitted. Prefer it so the watcher does
  // not fall back to the retired public/data/products.json path.
  for (const path of catalogBaselineSourcePaths()) {
    const payload = await readJson(path, null);
    if (Array.isArray(payload?.products) && payload.products.length) return payload;
  }

  return readProductCatalogPayload(resolve(rootDir, "public", "data"));
}

async function writeState(state) {
  await mkdir(outputDir, { recursive: true });
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const tempPath = `${statePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
      await rename(tempPath, statePath);
      await writeProfileReleaseCheckpoint(state);
      return;
    } catch (error) {
      lastError = error;
      if (!isTransientFileReadError(error) || attempt === 5) throw error;
      await sleep(Math.min(2_000, 100 * 2 ** attempt));
    }
  }
  throw lastError;
}

async function writeProfileReleaseCheckpoint(state) {
  const profile = String(state?.profile || state?.releaseProfile || "").trim().toLowerCase();
  if (!["catalog", "daily", "products"].includes(profile)) return;
  const mirrorPath = resolve(outputDir, `release-run-state.${profile}.json`);
  const mirrorTempPath = `${mirrorPath}.tmp-watcher-${process.pid}-${Date.now()}`;
  await writeFile(mirrorTempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(mirrorTempPath, mirrorPath);
}

async function readVisualTrainingStatus() {
  return readJson(visualTrainingStatusPath, {
    status: "unknown",
    reason: "visual taxonomy training status has not been recorded",
  });
}

async function readCollectionShuffleProgress() {
  const progress = await readJson(collectionShuffleProgressPath, null);
  if (progress) return progress;
  const manifest = await readJson(collectionShuffleManifestPath, null);
  if (manifest?.inFlightHandle) {
    return {
      kind: "salt-collection-shuffle-progress",
      version: 1,
      status: manifest.lastError ? "failed" : "running",
      handle: String(manifest.inFlightHandle),
      collectionId: String(manifest.inFlightCollectionId || ""),
      batch: Number(manifest.inFlightBatch || 0),
      maxBatches: Number(manifest.inFlightBatchMax || 0),
      phase: String(manifest.inFlightPhase || "unknown"),
      jobId: String(manifest.inFlightJobId || ""),
      jobAttempt: Number(manifest.inFlightJobAttempt || 0),
      jobMaxAttempts: Number(manifest.inFlightJobMaxAttempts || 0),
      updatedAt: String(
        manifest.inFlightProgressAt ||
        manifest.inFlightJobLastPolledAt ||
        manifest.lastAttemptAt ||
        manifest.updatedAt ||
        "",
      ),
      ...(manifest.lastError ? { error: String(manifest.lastError) } : {}),
      source: "collection-shuffle-manifest-fallback",
    };
  }
  return {
    status: "unknown",
    reason: "collection shuffle progress has not been recorded",
  };
}

async function readVisualTrainingLock() {
  const lock = await readJson(visualTrainingLockPath, null);
  const pid = Number(lock?.pid || 0);
  return pid > 0 ? { pid, startedAt: String(lock?.startedAt || "") } : null;
}

function summarizeVisualShardProgress(progress) {
  if (!progress || typeof progress !== "object") return progress;
  const completed = progress.completed;
  const completedImages = Array.isArray(completed)
    ? completed.length
    : completed && typeof completed === "object"
      ? Object.keys(completed).length
      : Number(progress.completedImages || progress.recordsWritten || progress.entriesProcessed || progress.imagesProcessed || progress.completed || 0);
  return {
    status: String(progress.status || "running"),
    sourceManifestSha256: String(progress.sourceManifestSha256 || ""),
    completedImages: Number.isFinite(completedImages) ? completedImages : 0,
    totalImages: Number(progress.totalImages || progress.totalRecords || progress.totalEntries || progress.imageCount || 0),
    completedBytes: Number(progress.completedBytes || progress.bytes || 0),
    updatedAt: String(progress.updatedAt || ""),
  };
}

async function readVisualShardTrainingState() {
  let state = await readJson(visualShardTrainingStatePath, {
    phase: "not-configured",
    reason: "sequential visual shard training has not started",
  });
  let progressPath = String(state?.currentProgressPath || "").trim();
  let currentProgress = progressPath ? await readJson(progressPath, null) : null;
  // Staging checkpoints are intentionally purged after a shard is staged. Do
  // not keep treating the deleted staging path as authoritative when the
  // trainer has moved on to encoder progress.
  if (!currentProgress) progressPath = "";
  if (!currentProgress) {
    const config = await readJson(visualTrainingConfigPath, null);
    const planPath = String(config?.shardPlan || "").trim();
    const plan = planPath ? await readJson(planPath, null) : null;
    const candidates = (Array.isArray(plan?.shards) ? plan.shards : []);
    const existingProgress = (await Promise.all(candidates.map(async (shard, index) => {
      const datasetDir = String(shard?.datasetDir || "").trim();
      if (!datasetDir) return null;
      const candidatePath = resolve(datasetDir, ".salt-visual-staging-progress.json");
      try {
        const details = await stat(candidatePath);
        return { candidatePath, index, mtimeMs: details.mtimeMs };
      } catch {
        return null;
      }
    }))).filter(Boolean).sort((left, right) => right.mtimeMs - left.mtimeMs)[0];
    if (existingProgress) {
      progressPath = existingProgress.candidatePath;
      state = {
        ...state,
        currentShard: String(existingProgress.index + 1),
        currentProgressPath: progressPath,
      };
    }
  }
  if (!progressPath) {
    // Older trainer checkpoints did not persist the active progress path.
    // Recover it from the signed plan so a watcher restart can still observe
    // staging or adapter progress without touching the training owner.
    const config = await readJson(visualTrainingConfigPath, null);
    const planPath = String(config?.shardPlan || "").trim();
    const currentShard = Number(state?.currentShard || 0);
    if (planPath && currentShard > 0) {
      const plan = await readJson(planPath, null);
      const shard = Array.isArray(plan?.shards) ? plan.shards[currentShard - 1] : null;
      const datasetDir = String(shard?.datasetDir || "").trim();
      const phase = String(state?.phase || "").trim();
      if (datasetDir && /staging/i.test(phase)) {
        progressPath = resolve(datasetDir, ".salt-visual-staging-progress.json");
      } else if (state?.currentAdapterPath) {
        progressPath = `${resolve(String(state.currentAdapterPath))}.progress.json`;
      }
    }
  }
  if (!progressPath) return state;
  const progress = await readJson(progressPath, {
    status: "unknown",
    reason: "current visual shard progress has not been written",
  });
  return {
    ...state,
    // Persist only aggregate progress. The staging checkpoint can contain
    // millions of completed-image keys and does not belong in watcher state.
    currentProgress: summarizeVisualShardProgress(progress),
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

function summarizeCandidateHydrationState(value) {
  if (!value || typeof value !== "object") return value;
  return {
    status: String(value.status || "not-started"),
    sourceSha256: String(value.sourceSha256 || ""),
    targetBytes: Number(value.targetBytes || 0),
    sourceCount: Number(value.sourceCount || 0),
    completed: Number(value.completed || 0),
    totalBytes: Number(value.totalBytes || 0),
    failureCount: Array.isArray(value.failures) ? value.failures.length : Number(value.failureCount || 0),
    sourceExhausted: value.sourceExhausted === true,
    updatedAt: String(value.updatedAt || ""),
  };
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
    catalog: summarizeCandidateHydrationState(catalog || { status: "not-started", completed: 0, totalBytes: 0 }),
    supplemental: summarizeCandidateHydrationState(supplemental || { status: "not-started", completed: 0, totalBytes: 0 }),
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
    return (await readFileWithRetry(path, "utf8")).split(/\r?\n/).filter(Boolean).length;
  } catch (error) {
    if (error?.code === "ENOENT") return 0;
    throw error;
  }
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function mirrorReleaseCheckpoint(state, suffix = "watcher") {
  const profile = normalize(state?.profile);
  if (!["catalog", "daily", "products"].includes(profile)) return;
  const mirrorPath = resolve(releaseRunStateMirrorDir, `release-run-state.${profile}.json`);
  const tempPath = `${mirrorPath}.tmp-${suffix}-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(tempPath, mirrorPath);
}

async function hasReusableHeadTrainingState(shardState) {
  const phase = normalize(shardState?.phase);
  if (!new Set(["head", "head-training", "embedding-assembly"]).has(phase)) return false;
  const embeddingShards = Object.values(shardState?.embeddingShards || {});
  if (!embeddingShards.length || !embeddingShards.every((entry) => entry?.status === "purged")) return false;
  const recordsPath = String(shardState?.currentRecordsPath || "").trim();
  const adapterPath = String(shardState?.currentAdapterPath || "").trim();
  if (!recordsPath || !adapterPath) return false;
  return (await pathExists(recordsPath)) && (await pathExists(adapterPath));
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

async function primaryVisualTrainingIsTerminal() {
  if (!(await pathExists(visualTrainingConfigPath))) return false;
  const status = await readJson(visualTrainingStatusPath, null);
  return ["failed", "blocked"].includes(String(status?.status || "").toLowerCase());
}

async function markInterruptedRelease(release, reason) {
  const current = await readJson(releaseRunStatePath, null);
  if (
    !current ||
    !isActiveReleaseCheckpointStatus(current.status) ||
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
  await mirrorReleaseCheckpoint(interrupted, "interrupted");
  return interrupted;
}

async function restoreLostReleaseCheckpoint(release, watcherState) {
  if (
    release?.status !== "failed" ||
    Number(release?.stepIndex || 0) > 0 ||
    !/Cannot resume .* release from catalog run state|Cannot resume .* release from daily run state|Cannot resume daily release from catalog run state|Cannot resume release: run state is interrupted/i.test(
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
    seoMode: normalizeSeoMode(release.seoMode || watcherState?.releaseSeoMode || process.env.SALT_RELEASE_SEO_MODE),
    seoScope: normalizeSeoScope(release.seoScope || watcherState?.releaseSeoScope || process.env.SALT_RELEASE_SEO_SCOPE),
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
  await mirrorReleaseCheckpoint(restored, "recovery");
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

function releaseSupervisorFor(release, state) {
  const releasePid = Number(release?.pid || 0);
  const supervisorPid = Number(state?.releaseSupervisorPid || 0);
  if (
    !state?.releaseSupervisorDetached ||
    releasePid <= 0 ||
    Number(state?.releaseSupervisorReleasePid || 0) !== releasePid
  ) {
    return 0;
  }
  return supervisorPid;
}

async function recoverLiveReleaseAfterMonitorError(state, error) {
  try {
    const release = await readJson(releaseRunStatePath, null);
    const pid = Number(release?.pid || 0);
    if (!isActiveReleaseCheckpointStatus(release?.status) || !isProcessAlive(pid)) return null;
    const now = new Date().toISOString();
    const detail = String(error?.message || error || "monitor read failed").split("\n")[0];
    const recovered = await notifyUser({
      ...state,
      ...stageTelemetry(release),
      watcherPid: process.pid,
      activeReleasePid: pid,
      releaseStatus: String(release.status),
      networkWait: release.networkWait || null,
      releaseStepIndex: Number(release.stepIndex || 0),
      releaseTotalSteps: Number(release.totalSteps || 0),
      releaseStepLabel: String(release.stepLabel || ""),
      releaseHeartbeatAt: String(release.heartbeatAt || ""),
      lastCheckedAt: now,
      watcherHeartbeatAt: now,
      nextRetryAt: "",
      lastError: "",
    }, {
      key: `release-monitor-recovered:${pid}:${release.stepIndex || 0}`,
      title: "SALT release monitor recovered",
      message: `The watcher recovered from a transient monitor read error (${detail}) and found the live release owner. No duplicate release was started.`,
    });
    await writeState(recovered);
    await log(`watcher monitor recovered live release owner; pid=${pid}; step=${release.stepIndex || "unknown"}/${release.totalSteps || "unknown"}`);
    return recovered;
  } catch (recoveryError) {
    await log(`live release monitor recovery failed: ${String(recoveryError?.message || recoveryError).slice(0, 500)}`);
    return null;
  }
}

async function readProcessTerminationTargets(pid) {
  try {
    const { stdout } = await execFileAsync("/bin/ps", ["-axo", "pid=,ppid="], { timeout: 5_000 });
    return buildProcessTerminationTargets(pid, parseProcessTable(stdout), process.pid);
  } catch {
    return buildProcessTerminationTargets(pid, [], process.pid);
  }
}

async function stopStaleRelease(pid, { processGroupPid = 0 } = {}) {
  const rootPid = Number(pid);
  const groupPid = Number(processGroupPid);
  const targets = await readProcessTerminationTargets(rootPid);
  const groupIsSafe = Number.isInteger(groupPid) && groupPid > 0 && groupPid !== process.pid;
  let groupSignaled = false;
  if (groupIsSafe && isProcessAlive(groupPid)) {
    try {
      process.kill(-groupPid, "SIGTERM");
      groupSignaled = true;
    } catch {
      // Fall back to the process table below if the group is already gone.
    }
  }
  for (const target of targets) {
    if (!isProcessAlive(target)) continue;
    try {
      process.kill(target, "SIGTERM");
    } catch {
      // The process may have exited between the liveness check and the kill.
    }
  }
  if (!groupSignaled && !targets.some((target) => isProcessAlive(target))) return;
  await sleep(5_000);
  if (groupSignaled) {
    try {
      process.kill(-groupPid, "SIGKILL");
    } catch {
      // The group may have exited after SIGTERM.
    }
  }
  for (const target of targets) {
    if (!isProcessAlive(target)) continue;
    try {
      process.kill(target, "SIGKILL");
    } catch {
      // The process may have exited between the liveness check and the kill.
    }
  }
}

async function inspectReleaseRun(state) {
  let release = await readJson(releaseRunStatePath, null);
  release = await restoreLostReleaseCheckpoint(release, state);
  if (!release?.status) return { active: false, reasons: [] };

  if (isActiveReleaseCheckpointStatus(release.status)) {
    const pid = Number(release.pid || 0);
    const ageMs = Date.now() - timestamp(release.heartbeatAt || release.startedAt);
    const releaseAlive = isProcessAlive(pid);
    const supervisorPid = releaseSupervisorFor(release, state);
    const stageChildPid = Number(release.stageChildPid || 0);
    const stageAlive = stageChildPid > 0 && isProcessAlive(stageChildPid);
    if (shouldTrustLiveReleaseStage({
      releaseAlive,
      stageAlive,
      stageStatus: release.stageStatus,
      heartbeatAgeMs: ageMs,
    })) {
      return { active: true, release, reasons: [] };
    }

    const interruptionReason = releaseAlive
      ? `release heartbeat stale for ${Math.round(ageMs / 1000)}s`
      : `release process ${pid || "unknown"} is no longer running`;
    if (releaseAlive && ageMs > releaseStateStaleMs) {
      await log(`release heartbeat stale for ${Math.round(ageMs / 1000)}s; stopping pid ${pid}`);
      await stopStaleRelease(pid, {
        processGroupPid: supervisorPid,
      });
    } else if (!releaseAlive && supervisorPid > 0 && isProcessAlive(supervisorPid)) {
      await log(`release owner pid ${pid || "unknown"} exited; stopping orphan supervisor pid ${supervisorPid}`);
      await stopStaleRelease(supervisorPid, { processGroupPid: supervisorPid });
    }
    const interrupted = await markInterruptedRelease(release, interruptionReason);
    return {
      active: false,
      release: interrupted,
      reasons: [`previous release interrupted at step ${release.stepIndex || "unknown"}: ${release.stepLabel || "unknown"} (${interruptionReason})`],
    };
  }

  if (isResumableReleaseCheckpointStatus(release.status)) {
    const successfulAt = timestamp(state?.lastSuccessfulReleaseAt);
    const interruptedAt = timestamp(release.interruptedAt || release.failedAt);
    if (interruptedAt > successfulAt) {
      return {
        active: false,
        release,
        reasons: [
          `${release.status === "interrupted" || release.interruptedByWatcher ? "previous release was interrupted" : "previous release failed"} at step ${release.stepIndex || "unknown"}: ${release.error || release.lastError || "unknown error"}`,
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
  let catalog;
  try {
    catalog = await readCatalogForBaseline();
  } catch (error) {
    // A release can briefly have neither the authoritative snapshot nor the
    // legacy public manifest while generated data is being replaced. This is
    // a degraded read-only state, not a release failure or a reason to alert
    // every polling cycle.
    if (isMissingCatalogBaselineError(error)) return null;
    throw error;
  }

  const [collections, recentOrders] = await Promise.all([
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
    let owner = {};
    let ownerReadable = true;
    try {
      owner = await readJson(resolve(lockPath, "owner.json"), {});
    } catch {
      // A killed watcher can leave an empty owner file behind. Do not reclaim
      // a freshly-created lock during the short atomic-write window; reclaim
      // only an unreadable lock that has remained stale beyond one poll.
      ownerReadable = false;
    }
    if (!ownerReadable) {
      try {
        const lockStats = await stat(lockPath);
        const lockAgeMs = Date.now() - Number(lockStats.mtimeMs || 0);
        if (!shouldReclaimUnreadableWatcherLock({ lockAgeMs, monitorIntervalMs })) return false;
      } catch (statError) {
        if (statError?.code !== "ENOENT") throw statError;
        return false;
      }
    }
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

let watcherProcessLockAcquired = false;

async function acquireWatcherProcessLock() {
  await mkdir(outputDir, { recursive: true });
  try {
    await mkdir(watcherProcessLockPath);
    await writeFile(
      resolve(watcherProcessLockPath, "owner.json"),
      `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`,
    );
    watcherProcessLockAcquired = true;
    return;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }

  let owner = {};
  let ownerReadable = true;
  try {
    owner = await readJson(resolve(watcherProcessLockPath, "owner.json"), {});
  } catch {
    ownerReadable = false;
  }
  if (!ownerReadable) {
    try {
      const lockStats = await stat(watcherProcessLockPath);
      const lockAgeMs = Date.now() - Number(lockStats.mtimeMs || 0);
      if (!shouldReclaimUnreadableWatcherLock({ lockAgeMs, monitorIntervalMs })) {
        throw new Error("SALT release watcher is already starting; process lock is not readable yet");
      }
    } catch (statError) {
      if (statError?.message?.includes("already starting")) throw statError;
      if (statError?.code === "ENOENT") return acquireWatcherProcessLock();
      throw statError;
    }
  }

  const ownerPid = Number(owner?.pid || 0);
  if (ownerPid > 0 && ownerPid !== process.pid && isProcessAlive(ownerPid)) {
    throw new Error(`SALT release watcher is already running as process ${ownerPid}`);
  }
  await rm(watcherProcessLockPath, { recursive: true, force: true });
  return acquireWatcherProcessLock();
}

async function releaseWatcherProcessLock() {
  if (!watcherProcessLockAcquired) return;
  try {
    const owner = await readJson(resolve(watcherProcessLockPath, "owner.json"), null);
    if (Number(owner?.pid || 0) !== process.pid) return;
  } catch {
    return;
  }
  await rm(watcherProcessLockPath, { recursive: true, force: true });
  watcherProcessLockAcquired = false;
}

async function releaseLock() {
  try {
    const owner = await readJson(resolve(lockPath, "owner.json"), null);
    if (Number(owner?.pid || 0) !== process.pid) return;
  } catch {
    // An unreadable lock is not ours to remove. A future watcher can reclaim
    // it after the stale-age guard in acquireLock has elapsed.
    return;
  }
  await rm(lockPath, { recursive: true, force: true });
}

async function runDailyRelease({ resume = false, state = {}, launch = {} } = {}) {
  const config = resolveReleaseLaunchConfig(launch.release || launch, state);
  const args = [
    "run",
    config.script,
    "--",
    "--profile",
    config.profile,
    "--seo-mode",
    config.seoMode,
    "--seo-scope",
    config.seoScope,
  ];
  if (resume) args.push("--resume");
  const child = spawn(npmBin, args, {
    cwd: rootDir,
    env: {
      ...process.env,
      SALT_RELEASE_WATCHER_CHILD: "1",
      SALT_RELEASE_SEO_MODE: config.seoMode,
      SALT_RELEASE_SEO_SCOPE: config.seoScope,
      ...(config.seoMode === "gpt" ? {
        SALT_GPT_SEO_PROVIDER: config.provider,
        SALT_GPT_SEO_BATCH_SIZE: String(config.batchSize),
        SALT_VISUAL_ENCODER_BATCH_SIZE: "32",
      } : {}),
    },
    stdio: "inherit",
    detached: true,
  });
  const exitPromise = new Promise((resolvePromise, rejectPromise) => {
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => resolvePromise({ code, signal }));
  });

  let monitorState = {
    ...state,
    watcherPid: process.pid,
    activeReleasePid: Number(child.pid || 0),
    releaseSupervisorPid: Number(child.pid || 0),
    releaseSupervisorReleasePid: 0,
    releaseSupervisorDetached: true,
    releaseStatus: "running",
    releaseSeoMode: config.seoMode,
    releaseSeoScope: config.seoScope,
    gptSeoProvider: config.provider,
    gptSeoBatchSize: config.batchSize,
    lastError: "",
    lastCheckedAt: new Date().toISOString(),
    watcherHeartbeatAt: new Date().toISOString(),
  };
  await writeState(monitorState);
  await log(`guarded release child started; pid=${child.pid || "unknown"}; script=${config.script}; mode=${config.seoMode}; scope=${config.seoScope}; resume=${resume}`);

  let lastProgressKey = "";
  let liveStageNoticeKey = "";
  let childExited = false;
  while (!childExited) {
    const waitResult = await Promise.race([
      exitPromise.then((result) => ({ done: true, result })),
      sleep(monitorIntervalMs).then(() => ({ done: false })),
    ]);
    childExited = waitResult.done;

    const release = await readJson(releaseRunStatePath, null);
    if (isActiveReleaseCheckpointStatus(release?.status)) {
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
      const progressKey = `${release.status}:${release.stepIndex || "?"}/${release.totalSteps || "?"}:${release.stepLabel || "unknown"}`;
      if (progressKey !== lastProgressKey) {
        await log(`release progress; step=${progressKey}; heartbeat=${release.heartbeatAt || "unknown"}`);
        lastProgressKey = progressKey;
      }
      const heartbeatAgeMs = Date.now() - timestamp(release.heartbeatAt || release.startedAt);
      const now = new Date().toISOString();
      monitorState = {
        ...monitorState,
        ...stageTelemetry(release),
        collectionShuffleProgress: await readCollectionShuffleProgress(),
        visualTaxonomyTraining: await readVisualTrainingStatus(),
        visualTaxonomyShardTraining: await readVisualShardTrainingState(),
        visualTaxonomyTrainingReadiness: await readVisualTrainingReadiness(),
        watcherPid: process.pid,
        activeReleasePid: Number(child.pid || release.pid || 0),
        releaseSupervisorPid: Number(child.pid || monitorState.releaseSupervisorPid || 0),
        releaseSupervisorReleasePid: Number(release.pid || monitorState.releaseSupervisorReleasePid || 0),
        releaseSupervisorDetached: true,
        releaseStatus: String(release.status),
        networkWait: release.networkWait || null,
        releaseStepIndex: Number(release.stepIndex || 0),
        releaseTotalSteps: Number(release.totalSteps || 0),
        releaseStepLabel: String(release.stepLabel || ""),
        releaseHeartbeatAt: String(release.heartbeatAt || ""),
        lastCheckedAt: now,
        watcherHeartbeatAt: now,
        lastDriftReasons: [],
      };
      await writeState(monitorState);

      const releaseOwnerAlive = isProcessAlive(Number(release?.pid || 0)) || isProcessAlive(Number(child.pid || 0));
      const stageChildPid = Number(release.stageChildPid || 0);
      const stageChildAlive = stageChildPid > 0 && isProcessAlive(stageChildPid);
      const stageIsLive = shouldTrustLiveReleaseStage({
        releaseAlive: releaseOwnerAlive,
        stageAlive: stageChildAlive,
        stageStatus: release.stageStatus,
        heartbeatAgeMs,
      });
      if (heartbeatAgeMs > releaseStateStaleMs && !stageIsLive) {
        const staleMessage = `Release heartbeat is stale at step ${release.stepIndex || "unknown"}/${release.totalSteps || "unknown"}. The watcher will resume it safely.`;
        await log(`${staleMessage} age=${Math.round(heartbeatAgeMs / 1000)}s`);
        monitorState = await notifyUser(monitorState, {
          key: `stale:${release.stepIndex || "unknown"}:${release.stepLabel || "unknown"}`,
          title: "SALT release needs repair",
          message: staleMessage,
        });
        await writeState(monitorState);
        await stopStaleRelease(Number(release.pid || child.pid || 0), {
          processGroupPid: Number(monitorState.releaseSupervisorPid || child.pid || 0),
        });
        throw new Error(`release heartbeat stale for ${Math.round(heartbeatAgeMs / 1000)}s`);
      }
      if (heartbeatAgeMs > releaseStateStaleMs && stageIsLive) {
        const nextLiveStageNoticeKey = `${release.stepIndex || "unknown"}:${stageChildPid}:${release.stageStartedAt || ""}`;
        if (nextLiveStageNoticeKey !== liveStageNoticeKey) {
          const liveStageMessage = `Release heartbeat is stale at step ${release.stepIndex || "unknown"}, but stage child ${stageChildPid} is still running; leaving the release active.`;
          await log(liveStageMessage);
          liveStageNoticeKey = nextLiveStageNoticeKey;
        }
      }

      const shuffleProgress = monitorState.collectionShuffleProgress;
      const isShuffleStage = /shuffle/i.test(String(release.stepLabel || ""));
      const shuffleProgressAgeMs = operationProgressAgeMs(shuffleProgress);
      const stageOutputAgeMs = Math.max(
        0,
        Date.now() - timestamp(release.stageLastActivityAt || release.stageLastOutputAt || release.stageStartedAt || release.heartbeatAt),
      );
      if (
        isShuffleStage &&
        shuffleProgress?.status === "running" &&
        shuffleProgressAgeMs > operationProgressStaleMs &&
        stageOutputAgeMs > operationProgressStaleMs &&
        stageChildPid > 0
      ) {
        const staleMessage = `Collection shuffle progress is stale at ${shuffleProgress.handle || "the active collection"}; the watcher will resume the release from its batch checkpoint.`;
        await log(`${staleMessage} age=${Math.round(shuffleProgressAgeMs / 1000)}s`);
        monitorState = await notifyUser(monitorState, {
          key: `shuffle-stale:${shuffleProgress.handle || "unknown"}:${shuffleProgress.batch || 0}`,
          title: "SALT collection shuffle needs repair",
          message: staleMessage,
        });
        await writeState(monitorState);
        await stopStaleRelease(Number(release.pid || child.pid || 0), {
          processGroupPid: Number(monitorState.releaseSupervisorPid || child.pid || 0),
        });
        throw new Error(`collection shuffle progress stale for ${Math.round(shuffleProgressAgeMs / 1000)}s`);
      }
      if (
        isShuffleStage &&
        shuffleProgress?.status === "running" &&
        shuffleProgressAgeMs > operationProgressStaleMs &&
        stageChildAlive &&
        stageOutputAgeMs <= operationProgressStaleMs
      ) {
        await log(`collection shuffle checkpoint is quiet for ${Math.round(shuffleProgressAgeMs / 1000)}s but stage child ${stageChildPid} has recent output; leaving the request running`);
      }

      // Do not restart a live network stage based only on quiet stdout.
    } else if (release?.status === "failed") {
      monitorState = {
        ...monitorState,
        ...stageTelemetry(release),
        watcherPid: process.pid,
        activeReleasePid: 0,
        releaseSupervisorPid: 0,
        releaseSupervisorReleasePid: 0,
        releaseSupervisorDetached: false,
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
        releaseSupervisorPid: 0,
        releaseSupervisorReleasePid: 0,
        releaseSupervisorDetached: false,
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
  return {
    ...monitorState,
    activeReleasePid: 0,
    releaseSupervisorPid: 0,
    releaseSupervisorReleasePid: 0,
    releaseSupervisorDetached: false,
  };
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
      // Keep corpus staging network-bound but bounded; the staging worker
      // itself enforces the upper limit while avoiding an unnecessary default
      // bottleneck on machines that can sustain more concurrent fetches.
      SALT_VISUAL_STAGING_CONCURRENCY: process.env.SALT_VISUAL_STAGING_CONCURRENCY || "16",
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
    const retryAt = new Date(Date.now() + visualTrainingRetryDelayMs(detail)).toISOString();
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
      const retryAt = new Date(Date.now() + visualTrainingRetryDelayMs(detail)).toISOString();
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
    const pendingRetry = timestamp(state?.visualTrainingRetryAt);
    if (state?.visualTrainingStatus === "failed" && state?.visualTrainingError === detail) {
      if (pendingRetry > Date.now()) return state;
      return {
        ...state,
        visualTrainingRetryAt: "",
        visualTrainingError: "",
      };
    }
    const retryAt = new Date(Date.now() + visualTrainingOrphanRetryMs).toISOString();
    await log(`orphaned visual training owner detected; preserving the shard checkpoint and retrying after ${retryAt}`);
    return {
      ...state,
      visualTrainingStatus: "failed",
      visualTrainingChildPid: 0,
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
  const pendingRetry = timestamp(state?.visualTrainingRetryAt);
  const existingError = state?.visualTrainingError || status.error || "parallel visual training child is no longer running";
  if (state?.visualTrainingStatus === "failed" && state?.visualTrainingError === existingError) {
    if (pendingRetry > Date.now()) return state;
    return {
      ...state,
      visualTrainingRetryAt: "",
      visualTrainingError: "",
    };
  }
  const retryAt = new Date(Date.now() + visualTrainingOrphanRetryMs).toISOString();
  await log(`visual training owner pid ${childPid} is no longer running; preserving the shard checkpoint and retrying after ${retryAt}`);
  return {
    ...state,
    visualTrainingStatus: "failed",
    visualTrainingChildPid: 0,
    visualTrainingRetryAt: retryAt,
    visualTrainingError: existingError,
  };
}

async function maybeRunVisualTraining(state, { releaseActive = false, detached = false } = {}) {
  const [configExists, modelExists, available, trainingConfig, shardState] = await Promise.all([
    pathExists(visualTrainingConfigPath),
    pathExists(visualTrainingModelPath),
    availableBytes(rootDir),
    readJson(visualTrainingConfigPath, {}),
    readVisualShardTrainingState(),
  ]);
  const headOnlyReady = await hasReusableHeadTrainingState(shardState);
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
    headOnlyReady,
    headOnlyMinFreeBytes: Number(process.env.SALT_VISUAL_TRAINING_HEAD_ONLY_MIN_FREE_BYTES || DEFAULT_HEAD_ONLY_MIN_FREE_BYTES),
    retryAt: isTransientRemoteError(state?.visualTrainingError)
      ? ""
      : state?.visualTrainingRetryAt,
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
  // A terminal primary training config must not permanently disable the
  // independent candidate-only pipeline. The candidate writes to its own
  // directory and can be prepared safely after the primary attempt failed.
  if (await pathExists(visualTrainingConfigPath) && !(await primaryVisualTrainingIsTerminal())) {
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
  // Candidate images are review-only supplemental data. Once the primary
  // signed training lifecycle is configured or running, do not stage another
  // corpus beside it: that wastes disk/network capacity and can make the
  // watcher report the wrong training owner after a restart.
  if (await pathExists(visualTrainingConfigPath) && !(await primaryVisualTrainingIsTerminal())) return state;
  const primaryTrainingPid = Number(state?.visualTrainingChildPid || 0);
  if (primaryTrainingPid > 0 && isProcessAlive(primaryTrainingPid)) return state;
  const primaryLock = await readVisualTrainingLock();
  if (primaryLock && isProcessAlive(primaryLock.pid)) return state;
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
  if (currentPid && !isProcessAlive(currentPid)) {
    const previousRetryAt = timestamp(state?.visualCandidateHydrationRetryAt);
    if (state?.visualCandidateHydrationStatus === "failed" && previousRetryAt > Date.now()) {
      return {
        ...state,
        visualCandidateHydration: hydration,
        visualCandidateHydrationChildPid: 0,
      };
    }
    const detail = `candidate visual hydration pid ${currentPid} is no longer running`;
    const retryAt = new Date(Date.now() + visualCandidateHydrationRetryMs).toISOString();
    await log(`${detail}; preserving the hydration checkpoint and retrying after ${retryAt}`);
    return {
      ...state,
      visualCandidateHydration: hydration,
      visualCandidateHydrationChildPid: 0,
      visualCandidateHydrationStatus: "failed",
      visualCandidateHydrationRetryAt: retryAt,
      visualCandidateHydrationError: detail,
    };
  }
  const pendingRetryAt = timestamp(state?.visualCandidateHydrationRetryAt);
  if (pendingRetryAt > Date.now()) {
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
    visualCandidateHydrationRetryAt: "",
    visualCandidateHydrationError: "",
    visualCandidateHydrationStartedAt: startedAt,
  };
}

async function maybeStartCandidateTrainingSupervisor(state) {
  let nextState = await reconcileCandidateTrainingSupervisor(state);
  // Candidate labels are review-only. Never let their supplemental trainer
  // compete with or replace a live primary training owner. A terminal primary
  // attempt is eligible for an isolated candidate retry, but the candidate
  // model remains review-only until its own quality gate passes.
  if (await pathExists(visualTrainingConfigPath) && !(await primaryVisualTrainingIsTerminal())) return nextState;
  if (await pathExists(visualTrainingModelPath) || await pathExists(visualCandidateModelPath)) {
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
  const available = await availableBytes(rootDir);
  const maxShardBytes = Math.max(
    1,
    Math.min(25_000_000_000, Number(process.env.SALT_VISUAL_STAGING_MAX_SHARD_BYTES || 6_000_000_000)),
  );
  const requiredFreeBytes = Math.max(DEFAULT_MIN_FREE_BYTES, maxShardBytes + 8 * 1024 ** 3);
  const candidateAdmission = {
    status: available >= requiredFreeBytes ? "admitted" : "blocked",
    availableBytes: available,
    requiredFreeBytes,
    maxShardBytes,
    checkedAt: new Date().toISOString(),
    reason: available >= requiredFreeBytes
      ? "candidate-only training inputs are complete and disk headroom is sufficient"
      : `insufficient free space for the candidate ${Math.round(maxShardBytes / 1_000_000_000)} GB shard plus headroom (${available} < ${requiredFreeBytes} bytes)`,
  };
  nextState = { ...nextState, visualCandidateTrainingAdmission: candidateAdmission };
  if (candidateAdmission.status !== "admitted") {
    if (state?.visualCandidateTrainingAdmission?.reason !== candidateAdmission.reason) {
      await log(`candidate visual training not admitted: ${candidateAdmission.reason}`);
    }
    return nextState;
  }
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
      SALT_VISUAL_STAGING_CONCURRENCY: process.env.SALT_VISUAL_STAGING_CONCURRENCY || "16",
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
  if (await pathExists(visualCandidateModelPath)) {
    return {
      ...state,
      visualCandidateTrainingSupervisorPid: 0,
      visualCandidateTrainingSupervisorStatus: "completed",
      visualCandidateTrainingSupervisorRetryAt: "",
      visualCandidateTrainingSupervisorError: "",
    };
  }

  const detail = `candidate visual training supervisor pid ${pid} is no longer running before model verification`;
  const retryAt = new Date(Date.now() + visualTrainingRetryDelayMs(detail)).toISOString();
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

let lastLoggedReleaseProgressKey = "";

async function checkOnce(state) {
  const persistedState = await readJson(statePath, {});
  state = { ...state, ...persistedState };
  const releaseInspection = await inspectReleaseRun(state);
  if (releaseInspection.active) {
    const progressKey = releaseProgressLogKey(releaseInspection.release);
    if (progressKey !== lastLoggedReleaseProgressKey) {
      await log(`release active; step=${releaseInspection.release.stepIndex || "unknown"}/${releaseInspection.release.totalSteps || "unknown"} ${releaseInspection.release.stepLabel || "unknown"}`);
      lastLoggedReleaseProgressKey = progressKey;
    }
    const now = new Date().toISOString();
    const persisted = await readJson(statePath, {});
    let activeState = await reconcileParallelVisualTraining({ ...state, ...persisted });
    // Supplemental candidate data is review-only and can be very network and
    // disk heavy. Never launch or relaunch it while the release owns the
    // machine; only the primary verified model may run in parallel.
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
      networkWait: releaseInspection.release.networkWait || null,
      collectionShuffleProgress: await readCollectionShuffleProgress(),
      watcherPid: process.pid,
      lastCheckedAt: now,
      activeReleasePid: Number(releaseInspection.release.pid || 0),
      releaseStatus: String(releaseInspection.release.status),
      releaseSeoMode: resolveReleaseLaunchConfig(releaseInspection.release, activeState).seoMode,
      releaseSeoScope: resolveReleaseLaunchConfig(releaseInspection.release, activeState).seoScope,
      gptSeoProvider: resolveReleaseLaunchConfig(releaseInspection.release, activeState).provider,
      gptSeoBatchSize: resolveReleaseLaunchConfig(releaseInspection.release, activeState).batchSize,
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

  // A manual Stop action is an explicit override for this release instance.
  // Preserve the checkpoint without letting the autonomous watcher launch an
  // immediate retry; a new Start/Resume request clears this instance marker.
  if (isManualStopSuppressed(releaseInspection.release, state)) {
    const now = new Date().toISOString();
    const release = releaseInspection.release;
    return {
      ...state,
      ...stageTelemetry(release),
      watcherPid: process.pid,
      lastCheckedAt: now,
      watcherHeartbeatAt: now,
      activeReleasePid: 0,
      releaseStatus: String(release?.status || "interrupted"),
      releaseStepIndex: Number(release?.stepIndex || state?.releaseStepIndex || 0),
      releaseTotalSteps: Number(release?.totalSteps || state?.releaseTotalSteps || 0),
      releaseStepLabel: String(release?.stepLabel || state?.releaseStepLabel || ""),
      releaseHeartbeatAt: String(release?.heartbeatAt || state?.releaseHeartbeatAt || ""),
      lastDriftReasons: [],
      nextRetryAt: "",
      lastError: "",
    };
  }

  // A user-paused release is resumable, but must not be treated as drift or a
  // scheduled repair until they explicitly run the release resume command.
  if (releaseInspection.release?.status === "paused") {
    const now = new Date().toISOString();
    return {
      ...state,
      ...stageTelemetry(releaseInspection.release),
      watcherPid: process.pid,
      lastCheckedAt: now,
      watcherHeartbeatAt: now,
      activeReleasePid: 0,
      releaseStatus: "paused",
      releaseStepIndex: Number(releaseInspection.release.stepIndex || 0),
      releaseTotalSteps: Number(releaseInspection.release.totalSteps || 0),
      releaseStepLabel: String(releaseInspection.release.stepLabel || ""),
      releaseHeartbeatAt: String(releaseInspection.release.heartbeatAt || ""),
      lastError: "",
    };
  }

  const scheduledRun = scheduledReleaseDue(state);
  if (shouldDeferWatcherCheck({
    nextRetryAt: state?.nextRetryAt,
    hasActionableRelease: releaseInspection.reasons.length > 0,
    scheduledDue: Boolean(scheduledRun),
  })) {
    const now = new Date().toISOString();
    const release = releaseInspection.release;
    const releaseStatus = String(release?.status || "idle");
    return {
      ...state,
      watcherPid: process.pid,
      lastCheckedAt: now,
      watcherHeartbeatAt: now,
      activeReleasePid: isActiveReleaseCheckpointStatus(releaseStatus) ? Number(release?.pid || 0) : 0,
      releaseStatus,
      releaseStepIndex: Number(release?.stepIndex || state?.releaseStepIndex || 0),
      releaseTotalSteps: Number(release?.totalSteps || state?.releaseTotalSteps || 0),
      releaseStepLabel: String(release?.stepLabel || state?.releaseStepLabel || ""),
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
  if (!baseline && state?.localBaselineStatus !== "unavailable") {
    await log("local catalog baseline is unavailable; drift comparison is deferred until the release snapshot is available");
  }
  const live = await readLiveFingerprint();
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
      localBaselineStatus: baseline ? "available" : "unavailable",
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
    /Cannot resume .* release from catalog run state|Cannot resume .* release from daily run state|Cannot resume daily release from catalog run state|Cannot resume release: run state is interrupted/i.test(
      String(releaseInspection.release?.error || ""),
    );
  const priorFailureWasTransient = isTransientRemoteError(state?.lastError || "");
  if (state?.nextRetryAt && timestamp(state.nextRetryAt) > Date.now() && !recoveredInterruptedRelease && !corruptedResumeCheckpoint && !priorFailureWasTransient) {
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
    const releaseLaunch = resolveReleaseLaunchConfig(releaseInspection.release, state);
    await log(`${releaseLaunch.seoMode} drift detected; starting guarded release: ${reasons.join("; ")}`);
    const resume = ["failed", "running", "interrupted", "waiting_for_network"].includes(releaseInspection.release?.status);
    // Preserve the source profile checkpoint before the child can write the
    // shared state file. This prevents a daily retry from hiding a catalog
    // failure when both profiles use the same output directory.
    await writeProfileReleaseCheckpoint(releaseInspection.release);
    await log(`release mode: ${resume ? "resume from checkpoint" : "full catalog run"}`);
    await log(`release profile: ${releaseLaunch.profile}; command=${releaseLaunch.script}; mode=${releaseLaunch.seoMode}; scope=${releaseLaunch.seoScope}`);
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
    monitorState = await runDailyRelease({ resume, state: monitorState, launch: { release: releaseLaunch } });
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
    const liveRecovery = await recoverLiveReleaseAfterMonitorError(state, error);
    if (liveRecovery) return liveRecovery;
    const failureCount = Number(state?.failureCount || 0) + 1;
    const watcherInterruption = /collection shuffle progress stale|release heartbeat stale|release exited with signal SIGTERM/i.test(
      String(error?.message || error),
    );
    const transientRemoteFailure = isTransientRemoteError(error);
    const retryMs = watcherInterruption || transientRemoteFailure
      ? Math.min(maxRetryIntervalMs, pollIntervalMs)
      : Math.min(maxRetryIntervalMs, pollIntervalMs * 2 ** Math.min(failureCount - 1, 8));
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
  await acquireWatcherProcessLock();
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
        const release = await readJson(releaseRunStatePath, null);
        const releaseIsLive = isActiveReleaseCheckpointStatus(release?.status) &&
          isProcessAlive(Number(release?.pid || 0));
        const heartbeatState = releaseIsLive
          ? mergeActiveReleaseTelemetry({ ...persisted, watcherHeartbeatAt: heartbeatAt }, release)
          : { ...persisted, watcherHeartbeatAt: heartbeatAt };
        await writeState({
          ...heartbeatState,
          watcherPid: process.pid,
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
        if (release?.status && !isActiveReleaseCheckpointStatus(release.status)) {
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
        const liveRecovery = await recoverLiveReleaseAfterMonitorError(state, error);
        if (liveRecovery) {
          state = liveRecovery;
          await sleep(Math.min(pollIntervalMs, monitorIntervalMs));
          continue;
        }
        await log(`fingerprint check failed; no mutation attempted: ${error.message}`);
        const transientRemoteFailure = isTransientRemoteError(error);
        const failureCount = Number(state?.failureCount || 0) + 1;
        const retryMs = transientRemoteFailure
          ? Math.min(maxRetryIntervalMs, pollIntervalMs)
          : Math.min(maxRetryIntervalMs, pollIntervalMs * 2 ** Math.min(failureCount - 1, 8));
        state = {
          ...state,
          watcherPid: process.pid,
          failureCount,
          nextRetryAt: new Date(Date.now() + retryMs).toISOString(),
          lastError: error.message,
          lastCheckedAt: new Date().toISOString(),
          watcherHeartbeatAt: new Date().toISOString(),
        };
        try {
          const latestRelease = await readJson(releaseRunStatePath, null);
          const latestPid = Number(latestRelease?.pid || 0);
          const liveReleaseOwner = isActiveReleaseCheckpointStatus(latestRelease?.status) && isProcessAlive(latestPid);
          state = {
            ...state,
            activeReleasePid: liveReleaseOwner ? latestPid : 0,
            releaseStatus: isActiveReleaseCheckpointStatus(latestRelease?.status)
              ? (liveReleaseOwner ? String(latestRelease.status) : "interrupted")
              : String(latestRelease?.status || "idle"),
            releaseStepIndex: Number(latestRelease?.stepIndex || state.releaseStepIndex || 0),
            releaseTotalSteps: Number(latestRelease?.totalSteps || state.releaseTotalSteps || 0),
            releaseStepLabel: String(latestRelease?.stepLabel || state.releaseStepLabel || ""),
          };
        } catch {
          // Preserve the monitor error when the release checkpoint is itself
          // mid-replacement; the next poll will reconcile it.
        }
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
    await releaseWatcherProcessLock();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(async (error) => {
    await log(`watcher stopped: ${error.message}`);
    process.exit(1);
  });
}
