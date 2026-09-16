#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, copyFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { lookup } from "node:dns/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { retryDelayMs, recommendedConcurrency, sleep, stableJson } from "./lib/performance-runtime.mjs";
import { readFileWithRetry } from "./reliable-file-read.mjs";
import { runReleasePreflight } from "./release-preflight.mjs";
import { writeReleaseBottleneckReport } from "./release-bottleneck-report.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const nodeBin = process.execPath;
const require = createRequire(import.meta.url);

// Keep local CPU/Metal work fully occupied without turning Shopify writes into
// an unbounded fan-out. These are bounded throughput floors for the canonical
// release; Shopify writes still rely on retry, backoff, and live-readback gates.
const RELEASE_PERFORMANCE_MINIMUMS = {
  SALT_CATALOG_CLASSIFICATION_CONCURRENCY: 12,
  SALT_CATALOG_TAXONOMY_CONCURRENCY: 4,
  SALT_COLLECTION_SOURCE_APPLY_CONCURRENCY: 6,
  SALT_COLLECTION_MEMBERSHIP_READ_CONCURRENCY: 6,
  SALT_COLLECTION_MEMBERSHIP_REFRESH_CONCURRENCY: 6,
  SALT_BACKFILL_APPLY_CONCURRENCY: 6,
  SALT_VARIANT_COST_READ_CONCURRENCY: 6,
  SALT_CATALOG_VARIANT_CONTINUATION_CONCURRENCY: 6,
  SALT_VARIANT_IMAGE_PLAN_CONCURRENCY: 48,
  SALT_VARIANT_IMAGE_FETCH_CONCURRENCY: 6,
  SALT_VARIANT_IMAGE_APPLY_CONCURRENCY: 3,
  SALT_COLLECTION_SHUFFLE_APPLY_CONCURRENCY: 3,
  SALT_COLLECTION_SHUFFLE_READ_CONCURRENCY: 8,
  SALT_SHOPIFY_PUBLICATION_CONCURRENCY: 6,
  SALT_SHOPIFY_SEO_READ_CONCURRENCY: 4,
  SALT_SHOPIFY_SEO_READBACK_CONCURRENCY: 4,
  SALT_SHOPIFY_SEO_HYDRATE_CONCURRENCY: 8,
  SALT_BACKFILL_READ_CONCURRENCY: 4,
  SALT_SHOPIFY_READ_CONCURRENCY: 4,
  SALT_SHOPIFY_ENRICHMENT_CONCURRENCY: 4,
  SALT_COLLECTION_PRODUCT_READ_CONCURRENCY: 4,
};
const explicitPerformanceSettings = new Set(
  Object.keys(RELEASE_PERFORMANCE_MINIMUMS)
    .filter((key) => {
      const value = Number(process.env[key]);
      return Number.isFinite(value) && value > 0;
    }),
);
for (const [key, minimum] of Object.entries(RELEASE_PERFORMANCE_MINIMUMS)) {
  const current = Number(process.env[key]);
  if (Number.isFinite(current) && current < minimum) process.env[key] = String(minimum);
  if (!explicitPerformanceSettings.has(key)) {
    const kind = /MEMBERSHIP|READ|ENRICHMENT|PUBLICATION|SEO|FETCH|SHUFFLE|SOURCE|BACKFILL/.test(key)
      ? "io"
      : "cpu";
    const tuned = recommendedConcurrency({
      kind,
      reserve: kind === "io" ? 2 : 1,
      max: kind === "io" ? 8 : 16,
    });
    process.env[key] = String(Math.max(minimum, tuned));
  }
}
const setAutoTunedConcurrency = (key, value) => {
  if (!process.env[key] || /^(auto|adaptive|tuned)$/i.test(String(process.env[key]).trim())) {
    process.env[key] = String(value);
  }
};
setAutoTunedConcurrency(
  "SALT_VARIANT_IMAGE_VISION_CONCURRENCY",
  recommendedConcurrency({ kind: "vision", reserve: 1, max: 2, min: 1 }),
);
setAutoTunedConcurrency(
  "SALT_SHOPIFY_REQUEST_CONCURRENCY",
  recommendedConcurrency({ kind: "io", reserve: 2, max: 8, min: 1 }),
);
setAutoTunedConcurrency(
  "SALT_CATEGORY_READ_CONCURRENCY",
  recommendedConcurrency({ kind: "io", reserve: 2, max: 8, min: 1 }),
);
const configuredRequestDelay = Number(process.env.SALT_SHOPIFY_REQUEST_DELAY_MS);
if (!Number.isFinite(configuredRequestDelay) || configuredRequestDelay > 200) {
  process.env.SALT_SHOPIFY_REQUEST_DELAY_MS = "200";
}
const catalogBatchSize = Math.max(1, Math.min(1000, Number(process.env.SALT_CATALOG_BATCH_SIZE || 50)));
const releaseRunStatePath = resolve(rootDir, "output", "release-run-state.json");
const releaseRunStateMirrorDir = resolve(rootDir, "output");
const releaseHeartbeatMs = Math.max(10_000, Number(process.env.SALT_RELEASE_HEARTBEAT_MS || 30_000));
const releaseStageTelemetryMs = Math.max(1_000, Number(process.env.SALT_RELEASE_STAGE_TELEMETRY_MS || 5_000));
const releaseStageRetries = Math.max(0, Math.min(3, Number(process.env.SALT_RELEASE_STAGE_RETRIES || 2)));
const releaseStageRetryDelayMs = Math.max(1000, Number(process.env.SALT_RELEASE_STAGE_RETRY_DELAY_MS || 5000));
const releaseStageRetryDelayMaxMs = Math.max(
  releaseStageRetryDelayMs,
  Number(process.env.SALT_RELEASE_STAGE_RETRY_DELAY_MAX_MS || 30_000),
);
const releaseNetworkPollMs = Math.max(5_000, Number(process.env.SALT_RELEASE_NETWORK_POLL_MS || 30_000));
const releaseNetworkProbeTimeoutMs = Math.max(2_000, Number(process.env.SALT_RELEASE_NETWORK_PROBE_TIMEOUT_MS || 15_000));
const releaseNetworkFailureBackoffMs = Math.max(1_000, Number(process.env.SALT_RELEASE_NETWORK_FAILURE_BACKOFF_MS || 2_000));
const releaseNetworkFailureBackoffMaxMs = Math.max(
  releaseNetworkFailureBackoffMs,
  Number(process.env.SALT_RELEASE_NETWORK_FAILURE_BACKOFF_MAX_MS || 30_000),
);
const releaseNetworkRetryLimit = Math.max(0, Math.min(100, Number(process.env.SALT_RELEASE_NETWORK_RETRY_LIMIT || 0)));
const releaseFailureOutputLimit = 24_000;
const releaseFailureStateLimit = 4_000;
const networkFailurePattern = /429|rate limit|throttl|timeout|timed out|network|socket|temporar|aborted|econnreset|econnrefused|econnaborted|enetunreach|ehostunreach|enotfound|eai_again|getaddrinfo|dns|err_network|und_err|fetch failed|could not resolve host|name resolution|no such host|connection refused|connection reset|service unavailable|bad gateway|gateway timeout/i;
const retryableStageFailurePattern = /429|too many requests|rate limit|throttl|timeout|timed out|network|socket|temporar|aborted|econn|enet|ehost|enotfound|eai_again|getaddrinfo|dns|fetch failed|service unavailable|bad gateway|gateway timeout|\bHTTP\s+5\d\d\b|\b5\d\d\s+(?:error|response)|bulk operation .*?(?:did not finish|failed to complete|timed out)|readback .*?(?:pending|temporar|not ready)|temporar(?:y|ily) unavailable/i;
const remoteReleaseStagePattern = /shopify|sync:data|seo:new-products:apply|catalog-integrity|collection|publication/i;
const sharedCatalogSnapshotPath = resolve(rootDir, "output", "release-catalog-snapshot.json");
const appliedIntegrityManifestPath = resolve(rootDir, "output", "shopify-catalog-integrity-applied-generation.json");
const missingCostDeletionManifestPath = resolve(rootDir, "output", "shopify-missing-cost-product-deletion-manifest.json");
const standbyRepairScriptPath = resolve(rootDir, "scripts", "release-proactive-repair.mjs");
const releaseOwnerLockPath = resolve(rootDir, "output", "release-process.lock");
const releaseWatcherScriptPath = resolve(rootDir, "scripts", "realtime-release-watcher.mjs");

// A catalog release is not considered autonomous unless the verified visual
// taxonomy model is present (or can be trained by the preceding ensure step).
// Keep this requirement in the orchestrator so every entrypoint, including
// the watcher and future package aliases, inherits the same gate.
process.env.SALT_REQUIRE_VISUAL_TAXONOMY_MODEL ||= "1";

// Keep the public npm entrypoints thin. These defaults used to be duplicated
// in `package.json`, which made `release`, `release:daily`, and watcher retries
// drift apart. Environment variables still win, so operators can tune a run
// without creating another release command.
const CANONICAL_RELEASE_DEFAULTS = Object.freeze({
  SALT_RELEASE_SKIP_MOBILE: "1",
  SALT_SHOPIFY_SYNC_ACTIVE_CATALOG: "1",
  SALT_SHOPIFY_USE_COMPLETE_CUSTOM_DATA_CACHE: "1",
  SALT_ALLOW_MISSING_CANONICAL_COLLECTIONS: "hats,wigs",
  SALT_REQUIRE_KNOWLEDGE_MODEL: "1",
  SALT_KNOWLEDGE_ACCELERATOR: "auto",
  SALT_CATALOG_DETERMINISTIC_FALLBACK_ALLOWED: "1",
  SALT_CATALOG_TAXONOMY_APPROVED: "1",
  SALT_CATALOG_TAXONOMY_APPROVAL_ID: "salt-full-catalog-release-2026-08-06-approved",
  SALT_CATALOG_COLLECTIONS_APPROVED: "1",
  SALT_CATALOG_COLLECTIONS_APPROVAL_ID: "salt-full-catalog-collections-2026-09-09-school-products-approved",
  SALT_CATALOG_MARKET_PRICE_MARGIN_APPROVED: "1",
  SALT_CATALOG_MARKET_PRICE_MARGIN_APPROVAL_ID: "salt-market-price-margin-2026-09-08-approved",
  SALT_VARIANT_MARKET_PRICE_MARGIN_PERCENT: "0.20",
  SALT_VARIANT_MARKET_PRICE_MARGIN_MODE: "markup",
  SALT_VARIANT_MARKET_PRICE_MARGIN_POLICY_ID: "live-market-anchor-plus-20pct-2026-09-08",
  SALT_CATALOG_PRICE_REWORK_APPROVED: "1",
  SALT_CATALOG_PRICE_REWORK_APPROVAL_ID: "salt-price-rework-2026-08-03-tiered-multipliers-approved",
  SALT_CATALOG_COLLECTION_MERGES_APPROVED: "1",
  SALT_CATALOG_FORCE_COLLECTION_SOURCE_REFRESH: "1",
  SALT_VARIANT_COST_CAMPAIGN_COST_PER_ORDER: "18",
  SALT_VARIANT_COST_MIN_CONTRIBUTION_MARGIN: "0.30",
  SALT_VARIANT_COST_CLOTHING_MIN_CONTRIBUTION_MARGIN: "0.43",
  SALT_VARIANT_PRICE_OUTLIER_RATIO: "2.5",
  SALT_VARIANT_PRICE_OUTLIER_MINIMUM_DELTA: "25",
  SALT_VARIANT_IMAGE_RESUME: "1",
  SALT_VARIANT_IMAGE_REPROCESS_VISION_ERRORS: "1",
  SALT_SHOPIFY_MAX_REQUEST_ATTEMPTS: "10",
  SALT_SHOPIFY_MAX_RETRY_DELAY_MS: "120000",
  SALT_COLLECTION_MERGE_APPLY_CONCURRENCY: "4",
  SALT_COLLECTION_MERGE_VERIFY_CONCURRENCY: "6",
  SALT_COLLECTION_MERGE_MUTATION_BATCH_SIZE: "25",
  SALT_COLLECTION_MERGE_PROGRESS_EVERY: "25",
  SALT_COLLECTION_MEMBERSHIP_REFRESH_CONCURRENCY: "6",
  SALT_CATALOG_VARIANT_CONTINUATION_CONCURRENCY: "6",
  SALT_SHOPIFY_SEO_READ_CONCURRENCY: "4",
  SALT_SHOPIFY_SEO_READBACK_CONCURRENCY: "4",
  SALT_SHOPIFY_SEO_CONNECTION_CONCURRENCY: "3",
  SALT_BACKFILL_READ_CONCURRENCY: "4",
  SALT_SHOPIFY_SEO_REUSE_LIVE_CATALOG: "1",
  SALT_RELEASE_SEO_MODE: "deterministic",
  SALT_RELEASE_SEO_SCOPE: "all-products",
  SALT_GPT_SEO_PROVIDER: "applescript",
  SALT_GPT_SEO_BATCH_SIZE: "500",
  // A rejected GPT record must be regenerated on the next guarded resume;
  // never let a failed quality record become a reusable checkpoint.
  SALT_GPT_SEO_REPROCESS_REJECTED: "1",
  SALT_GPT_SEO_CONCURRENCY: "8",
  SALT_GPT_SEO_REUSE_SHARED_SNAPSHOT: "1",
  // MLX batches are checkpointed as stable prefixes; 32 improves Metal
  // throughput without changing the resume or verification contract.
  SALT_VISUAL_ENCODER_BATCH_SIZE: "32",
  SALT_CATALOG_PRODUCT_ANOMALY_REPAIR_APPROVED: "1",
  SALT_PRODUCT_ANOMALY_REPAIR_APPROVAL_ID: "salt-product-anomaly-repair-2026-09-12-approved",
  SALT_PRODUCT_ANOMALY_REPAIR_POLICY_ID: "cost-peer-outlier-draft-2026-09-12",
  SALT_PRODUCT_ANOMALY_APPLY_CONCURRENCY: "4",
  SALT_PRODUCT_ANOMALY_REPAIR_REUSE_SHARED_SNAPSHOT: "1",
  SALT_SHOPIFY_REQUEST_DELAY_MS: "200",
});

function applyCanonicalReleaseDefaults(profile) {
  const defaults = {
    ...CANONICAL_RELEASE_DEFAULTS,
    ...(["catalog", "daily"].includes(profile) ? { SALT_CATALOG_VISION_SUPERVISED: "1" } : {}),
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (!process.env[key]) process.env[key] = value;
  }
}

export function assertReleaseModePrerequisites(args, env = process.env) {
  const mode = String(args?.seoMode || "").trim().toLowerCase();
  const provider = String(env.SALT_GPT_SEO_PROVIDER || "applescript").trim().toLowerCase();
  if (mode === "gpt" && !["applescript", "api"].includes(provider)) {
    throw new Error(`Unsupported GPT SEO provider ${provider}; expected applescript or api.`);
  }
  if (mode === "gpt" && provider === "api" && !String(env.OPENAI_API_KEY || "").trim()) {
    throw new Error(
      "GPT SEO mode requires OPENAI_API_KEY; release stopped before preflight and no model work or Shopify writes were started.",
    );
  }
}

// The canonical release uses the separately approved cost-band policy. Direct
// invocation of the alignment script remains legacy-compatible unless callers
// explicitly select the new policy.
for (const [key, value] of Object.entries({
  SALT_CATALOG_COST_BASED_PRICING_APPROVED: "1",
  SALT_CATALOG_COST_BASED_PRICING_APPROVAL_ID: "salt-cost-based-pricing-2026-08-24-approved",
  SALT_VARIANT_COST_PRICING_POLICY: "cost-band-v2",
  SALT_VARIANT_COST_POLICY_ID: "cost-band-v2-2026-08-24",
  SALT_VARIANT_COST_OVERHEAD: "16",
  SALT_VARIANT_COST_DRIFT_RECOVERY_PASSES: "3",
  SALT_CATALOG_TAG_READBACK_RETRY_ATTEMPTS: "3",
  SALT_CATALOG_TAG_READBACK_RETRY_DELAY_MS: "5000",
  SALT_CATALOG_TAG_READBACK_RETRY_CONCURRENCY: "4",
  SALT_CATALOG_MARKET_PRICE_MARGIN_APPROVED: "1",
  SALT_CATALOG_MARKET_PRICE_MARGIN_APPROVAL_ID: "salt-market-price-margin-2026-09-08-approved",
  SALT_VARIANT_MARKET_PRICE_MARGIN_PERCENT: "0.20",
  SALT_VARIANT_MARKET_PRICE_MARGIN_MODE: "markup",
  SALT_VARIANT_MARKET_PRICE_MARGIN_POLICY_ID: "live-market-anchor-plus-20pct-2026-09-08",
  SALT_DELETE_MISSING_COST_PRODUCTS_APPROVED: "1",
  SALT_DELETE_MISSING_COST_PRODUCTS_APPROVAL_ID: "salt-missing-cost-deletion-2026-08-27-approved",
})) {
  if (!process.env[key]) process.env[key] = value;
}

// `test` is a known unmanaged Shopify collection. Keep it explicitly
// read-only in every release entrypoint, including direct `node` invocations,
// without discarding any additional caller-provided exceptions.
const unmanagedLiveCollections = new Set(
  String(process.env.SALT_ALLOW_UNMANAGED_LIVE_COLLECTIONS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);
unmanagedLiveCollections.add("test");
process.env.SALT_ALLOW_UNMANAGED_LIVE_COLLECTIONS = [...unmanagedLiveCollections].join(",");
// Let integrity retries refresh only failed collections when the mismatch is
// local; it still falls back to a complete export for global/all-products
// failures. This avoids repeating a 100k+ membership export unnecessarily.
process.env.SALT_COLLECTION_MEMBERSHIP_RETRY_MODE ||= "adaptive";

const catalogIntegrityArgs = [
  "--reclassify",
  "--batch-size",
  String(catalogBatchSize),
];
const deterministicCatalogIntegrityArgs = [
  ...catalogIntegrityArgs,
  "--skip-vision",
  "--deterministic-only",
];
const supervisedVisionCatalogIntegrityArgs = [
  ...catalogIntegrityArgs,
  "--supervised-vision",
];

function formatCommand(command, args) {
  return [command, ...args].join(" ");
}

function stripAnsi(value) {
  return String(value || "").replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
}

export function isNetworkFailureText(value) {
  return networkFailurePattern.test(redactFailureText(value));
}

export function isRetryableStageFailure(value) {
  return retryableStageFailurePattern.test(redactFailureText(value));
}

export function isRemoteReleaseStage(command, args = []) {
  return remoteReleaseStagePattern.test(`${command} ${args.join(" ")}`);
}

export function shouldRepairKnowledgeModel(label, failureText) {
  return label === "Verify trained 128M-record catalog knowledge model" &&
    /Catalog knowledge model training fingerprint does not match the checked-in taxonomy\./i.test(
      stripAnsi(String(failureText || "")),
    );
}

async function runReleasePreflightWithModelRepair(profile) {
  let repairAttempted = false;
  while (true) {
    try {
      return await runReleasePreflight({ rootDir, profile });
    } catch (error) {
      const failureText = String(error?.message || error || "");
      if (repairAttempted || !shouldRepairKnowledgeModel(
        "Verify trained 128M-record catalog knowledge model",
        failureText,
      )) {
        throw error;
      }

      repairAttempted = true;
      process.stdout.write(
        "Preflight knowledge-model fingerprint drift detected; retraining the approved deterministic model before retrying preflight.\n",
      );
      execFileSync(npmBin, ["run", "catalog:knowledge:model:train"], {
        cwd: rootDir,
        env: process.env,
        stdio: "inherit",
      });
      process.stdout.write("Catalog knowledge model retrained; retrying release preflight.\n");
    }
  }
}

export function releaseStepFingerprint(step, profile) {
  return createHash("sha256")
    .update(stableJson({
      // `catalog` and `daily` are aliases for the same governed graph. Keep
      // their fingerprints identical so a scheduled run can safely resume a
      // manually started full-catalog run, and vice versa.
      profile: ["catalog", "daily"].includes(String(profile || "").trim().toLowerCase())
        ? "unified-catalog"
        : profile,
      label: step?.label,
      command: step?.command,
      args: step?.args,
      cwd: step?.cwd,
    }))
    .digest("hex");
}

function releaseRunStateMirrorPath(profile) {
  const safeProfile = String(profile || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  return safeProfile ? resolve(releaseRunStateMirrorDir, `release-run-state.${safeProfile}.json`) : null;
}

function releaseStateTimestamp(state) {
  return Math.max(
    0,
    ...[
      state?.heartbeatAt,
      state?.completedAt,
      state?.failedAt,
      state?.startedAt,
    ]
      .map((value) => Date.parse(String(value || "")))
      .filter((value) => Number.isFinite(value)),
  );
}

async function readJsonFile(path) {
  if (!path) return null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return JSON.parse(await readFileWithRetry(path, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT" || attempt === 3) return null;
      await sleep(Math.min(500, 50 * 2 ** attempt));
    }
  }
  return null;
}

export async function readReleaseRunState(profile = "") {
  const candidates = (await Promise.all([
    readJsonFile(releaseRunStatePath),
    readJsonFile(releaseRunStateMirrorPath(profile)),
  ])).filter(Boolean);
  const requestedProfile = String(profile || "").trim().toLowerCase();
  const exactProfileCandidates = candidates.filter((candidate) =>
    !requestedProfile || !candidate.profile || String(candidate.profile).trim().toLowerCase() === requestedProfile,
  );
  return (exactProfileCandidates.length ? exactProfileCandidates : candidates)
    .sort((left, right) => releaseStateTimestamp(right) - releaseStateTimestamp(left))[0] || null;
}

export function findReleaseGraphDrift(steps, completedSteps, profile) {
  if (!Array.isArray(steps) || !Array.isArray(completedSteps)) return null;
  for (const entry of completedSteps) {
    const index = Number(entry?.index || 0);
    const recordedFingerprint = String(entry?.fingerprint || "");
    if (!Number.isInteger(index) || index < 1 || !recordedFingerprint) continue;
    const step = steps[index - 1];
    if (!step || releaseStepFingerprint(step, profile) !== recordedFingerprint) {
      return {
        index,
        label: String(entry?.label || step?.label || "unknown"),
      };
    }
  }
  return null;
}

const RELEASE_REPAIR_ROUTES = Object.freeze([
  {
    failedLabel: "Validate refreshed catalog taxonomy",
    startLabel: "Regenerate catalog taxonomy and preserved-tag audit",
    matches: /taxonomy|override|classification|knowledge|image/i,
    reason: "taxonomy validation failed; replaying the catalog taxonomy generation before validation",
  },
  {
    failedLabel: "Require image-backed taxonomy evidence",
    startLabel: "Build visual taxonomy review queue",
    matches: /visual|classification|review|image|evidence/i,
    reason: "image-backed taxonomy evidence was incomplete; rebuilding the persisted review queue",
  },
  {
    failedLabel: "Apply exact full-catalog collection reconciliation",
    startLabel: "Dry-run exact full-catalog collection reconciliation",
    matches: /collection|classification|tag|membership|govern/i,
    reason: "collection reconciliation failed; replaying its guarded dry-run and apply pair",
  },
  {
    failedLabel: "Verify exact collection membership and price rules",
    startLabel: "Apply final current-generation collection reconciliation",
    matches: /collection|classification|price|membership|collectionless|govern/i,
    reason: "collection or price membership readback found drift; replaying the final governed collection apply",
  },
  {
    failedLabel: "Reconcile and verify Shopify SEO/product fields",
    startLabel: "Reconcile and verify Shopify SEO/product fields",
    matches: /seo|product|metafield|specificity|readback/i,
    reason: "SEO/product-field verification failed; replaying the guarded SEO stage",
  },
  {
    failedLabel: "Verify every active product has product-specific SEO and metafields",
    startLabel: "Reconcile and verify Shopify SEO/product fields",
    matches: /seo|product|metafield|specificity|readback/i,
    reason: "product-specificity verification failed; replaying the live SEO/product-field stage",
  },
  {
    failedLabel: "Verify full-catalog cost-band variant pricing and compare-at values",
    startLabel: "Dry-run full-catalog cost-band variant pricing",
    matches: /pricing|price|cost|compare-at|variant/i,
    reason: "pricing readback failed; replaying the approved cost-band dry-run and apply stages",
  },
  {
    failedLabel: "Verify variant-aware SEO profiles for every active variant",
    startLabel: "Reconcile variant-aware SEO profiles after final catalog writes",
    matches: /variant|seo|readback|metafield/i,
    reason: "variant-aware SEO readback failed; replaying the final variant SEO reconciliation",
  },
  {
    failedLabel: "Verify daily manual collection shuffle",
    startLabel: "Dry-run daily manual collection shuffle",
    matches: /shuffle|order|collection|readback/i,
    reason: "collection shuffle readback failed; replaying the same-seed shuffle plan",
  },
  {
    failedLabel: "Strict live audit of repaired collection classification",
    startLabel: "Repair final governed collection sources before strict audit",
    matches: /collection|classification|membership|source|audit/i,
    reason: "strict collection audit found drift; replaying the final governed source repair",
  },
  {
    failedLabel: "Final live-readback gate against the applied catalog generation",
    startLabel: "Repair final governed collection sources before strict audit",
    matches: /readback|collection|classification|membership|price|tag/i,
    reason: "final live readback found governed drift; replaying the bounded final repair gates",
  },
]);

export function getReleaseRepairRoute(steps, previousRunState, requestedResumeFromStep) {
  if (previousRunState?.status !== "failed") return null;
  const failureText = `${previousRunState?.stepLabel || ""}\n${previousRunState?.error || ""}`;
  for (const route of RELEASE_REPAIR_ROUTES) {
    const failedStep = steps.findIndex((step) => step?.label === route.failedLabel) + 1;
    const startStep = steps.findIndex((step) => step?.label === route.startLabel) + 1;
    if (failedStep < 1 || startStep < 1 || requestedResumeFromStep !== failedStep || startStep >= requestedResumeFromStep) {
      continue;
    }
    if (!route.matches.test(failureText)) continue;
    return {
      fromStep: startStep,
      failedStep,
      reason: route.reason,
      message: `Repair-aware resume: replaying steps ${startStep}-${failedStep} before retrying the failed gate.\n`,
    };
  }
  return null;
}

let releaseRunState = {};
let releaseOwnerLockAcquired = false;
let releaseRunStateOwned = false;
let releaseStateWriteQueue = Promise.resolve();

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function findRunningWatcherPids(psOutput = "", isAlive = isProcessAlive) {
  return String(psOutput || "")
    .split(/\r?\n/)
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(.*)$/);
      return match ? { pid: Number(match[1]), command: match[2] } : null;
    })
    .filter((entry) => entry && entry.pid > 0 && /realtime-release-watcher\.mjs/.test(entry.command))
    .filter((entry) => !/(?:^|\s|\/)(?:ps|rg)(?:\s|$)/.test(entry.command))
    .filter((entry) => isAlive(entry.pid))
    .map((entry) => entry.pid);
}

async function ensureEmbeddedWatcher(profile) {
  if (profile === "products" || process.env.SALT_RELEASE_WATCHER_CHILD === "1" || process.env.SALT_RELEASE_EMBEDDED_WATCHER === "0") {
    return { status: "skipped", reason: "release is already watcher-owned or product-only" };
  }

  let existing = [];
  try {
    const { stdout } = await new Promise((resolvePromise, rejectPromise) => {
      const child = spawn("/bin/ps", ["-axo", "pid=,command="], { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += String(chunk); });
      child.stderr.on("data", (chunk) => { stderr += String(chunk); });
      child.once("error", rejectPromise);
      child.once("exit", (code) => code === 0
        ? resolvePromise({ stdout, stderr })
        : rejectPromise(new Error(stderr || `ps exited with ${code}`)));
    });
    existing = findRunningWatcherPids(stdout);
  } catch (error) {
    const details = {
      status: "unknown",
      reason: `could not inspect watcher processes: ${String(error?.message || error).slice(0, 500)}`,
      checkedAt: new Date().toISOString(),
    };
    await writeReleaseRunState({ embeddedWatcher: details });
    return details;
  }

  if (existing.length) {
    const details = { status: "attached", pid: existing[0], checkedAt: new Date().toISOString() };
    await writeReleaseRunState({ embeddedWatcher: details });
    return details;
  }

  try {
    const embeddedReleaseScript = process.env.SALT_RELEASE_WATCHER_RELEASE_SCRIPT ||
      (profile === "daily" ? "release:daily" : "release:core");
    const watcher = spawn(nodeBin, [releaseWatcherScriptPath], {
      cwd: rootDir,
      env: {
        ...process.env,
        SALT_RELEASE_WATCHER_EMBEDDED: "1",
        SALT_RELEASE_WATCHER_RELEASE_SCRIPT: embeddedReleaseScript,
      },
      detached: true,
      stdio: "ignore",
    });
    watcher.unref();
    const details = { status: "spawned", pid: Number(watcher.pid || 0), startedAt: new Date().toISOString() };
    await writeReleaseRunState({ embeddedWatcher: details });
    process.stdout.write(`  watcher: ${details.pid ? `attached (pid ${details.pid})` : "start requested"}\n`);
    return details;
  } catch (error) {
    const details = {
      status: "failed",
      reason: String(error?.message || error).slice(0, 1000),
      failedAt: new Date().toISOString(),
    };
    await writeReleaseRunState({ embeddedWatcher: details });
    process.stderr.write(`Embedded watcher could not start; release will continue with its normal retries: ${details.reason}\n`);
    return details;
  }
}

async function acquireReleaseOwnerLock() {
  if (process.env.SALT_RELEASE_SKIP_OWNER_LOCK === "1") return;
  await mkdir(resolve(rootDir, "output"), { recursive: true });
  try {
    const current = JSON.parse(await readFileWithRetry(releaseRunStatePath, "utf8"));
    const currentPid = Number(current?.pid || 0);
    if (["running", "waiting_for_network"].includes(current?.status) && currentPid > 0 && currentPid !== process.pid && isProcessAlive(currentPid)) {
      throw new Error(`Cannot start release while release process ${currentPid} is still running`);
    }
  } catch (error) {
    if (error?.message?.includes("still running")) throw error;
    if (error?.code !== "ENOENT") {
      // A malformed or transient run-state file must not make a new release
      // overwrite a possibly-live owner. The lock check below remains the
      // authoritative recovery path.
    }
  }
  try {
    await mkdir(releaseOwnerLockPath);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    let owner = {};
    try {
      owner = JSON.parse(await readFileWithRetry(resolve(releaseOwnerLockPath, "owner.json"), "utf8"));
    } catch {
      // A partially-written stale lock is safe to reclaim only when no owner
      // process is alive. The new owner file is written atomically below.
    }
    const ownerPid = Number(owner?.pid || 0);
    if (ownerPid > 0 && ownerPid !== process.pid && isProcessAlive(ownerPid)) {
      throw new Error(`Cannot start release while release process ${ownerPid} is still running`);
    }
    await rm(releaseOwnerLockPath, { recursive: true, force: true });
    await mkdir(releaseOwnerLockPath);
  }
  const ownerPath = resolve(releaseOwnerLockPath, "owner.json");
  const tempPath = `${ownerPath}.tmp-${process.pid}`;
  await writeFile(tempPath, `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`, "utf8");
  await rename(tempPath, ownerPath);
  releaseOwnerLockAcquired = true;
}

async function releaseOwnerLock() {
  if (!releaseOwnerLockAcquired) return;
  try {
    const owner = JSON.parse(await readFileWithRetry(resolve(releaseOwnerLockPath, "owner.json"), "utf8"));
    if (Number(owner?.pid || 0) !== process.pid) return;
  } catch {
    return;
  }
  await rm(releaseOwnerLockPath, { recursive: true, force: true });
  releaseOwnerLockAcquired = false;
}

function areCompatibleResumeProfiles(previousProfile, requestedProfile) {
  if (!previousProfile || previousProfile === requestedProfile) return true;
  // catalog and daily intentionally share the same full-catalog step graph.
  // A watcher may resume a catalog run through the scheduled daily alias.
  return [previousProfile, requestedProfile].every((profile) => ["catalog", "daily"].includes(profile));
}

export function resolveResumeStep(steps, previousRunState, numericFallback = 1) {
  const savedLabel = String(previousRunState?.stepLabel || "").trim();
  if (!savedLabel) return { resumeFromStep: Math.max(1, Number(numericFallback) || 1), restarted: false };
  const availableSteps = Array.isArray(steps) ? steps : [];
  if (savedLabel === "Strict live audit of repaired collection classification") {
    const sourceRepairIndex = availableSteps.findIndex((step) => step?.label === "Repair final governed collection sources before strict audit");
    if (sourceRepairIndex >= 0) {
      return { resumeFromStep: sourceRepairIndex + 1, restarted: false, reason: "collection-audit-source-repair" };
    }
    const repairIndex = availableSteps.findIndex((step) => step?.label === "Apply final current-generation collection reconciliation");
    if (repairIndex >= 0) return { resumeFromStep: repairIndex + 1, restarted: false, reason: "collection-audit-repair" };
  }
  let matchingIndex = availableSteps.findIndex((step) => step?.label === savedLabel);
  if (matchingIndex < 0) {
    // The secondary refreshes used to be two sequential steps. Map either
    // legacy checkpoint to the new combined stage instead of restarting a
    // full catalog release merely because the graph was optimized.
    const legacyRefresh = savedLabel.match(/^(.*): (recently ordered products|managed collection membership)$/);
    if (legacyRefresh) {
      const combinedLabel = `${legacyRefresh[1]}: recently ordered products and managed collection membership (parallel)`;
      matchingIndex = availableSteps.findIndex((step) => step?.label === combinedLabel);
    }
  }
  if (matchingIndex >= 0) return { resumeFromStep: matchingIndex + 1, restarted: false };
  return { resumeFromStep: 1, restarted: true };
}

export function shouldRefreshSeoLiveCatalogOnResume(runState) {
  if (runState?.status !== "failed") return false;
  const stepLabel = String(runState?.stepLabel || "").toLowerCase();
  const error = String(runState?.error || "").toLowerCase();
  return stepLabel.includes("shopify seo") || stepLabel.includes("seo/product fields") ||
    /seo verification|shopify seo|readback still has differences|readback mismatch/.test(error);
}

export function hasCatalogBoundaryDrift(runState) {
  const failureText = [
    runState?.error,
    runState?.stageError,
    runState?.stageStderr,
    runState?.lastError,
  ]
    .filter(Boolean)
    .join("\n");
  return /catalog integrity scope drifted|manifest has\s+\d+\s+active products\s+and\s+\d+\s+classifications;\s*shopify has\s+\d+/i.test(
    failureText,
  );
}

export function productBoundaryFromPayload(payload, recordsKey = "products") {
  const records = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.[recordsKey])
      ? payload[recordsKey]
      : [];
  const handles = records
    .map((record) => String(record?.handle || "").trim().toLowerCase())
    .filter(Boolean)
    .sort();
  if (!handles.length) return null;
  return {
    count: handles.length,
    hash: createHash("sha256").update(handles.join("\n")).digest("hex"),
  };
}

async function readProductBoundary(filePath, recordsKey = "products") {
  try {
    const payload = JSON.parse(await readFileWithRetry(filePath, "utf8"));
    return productBoundaryFromPayload(payload, recordsKey);
  } catch {
    return null;
  }
}

async function detectResumeCatalogBoundaryMismatch(resumeFromStep, profile) {
  if (profile === "products" || resumeFromStep <= 10) return { drift: false, mismatches: [] };

  const sourcePath = process.env.SALT_RELEASE_CATALOG_SOURCE_PATH ||
    resolve(rootDir, "output", "release-catalog-source.json");
  const source = await readProductBoundary(sourcePath);
  if (!source) {
    return {
      drift: true,
      mismatches: [`missing current catalog source (${sourcePath})`],
    };
  }

  const dependencies = [
    {
      label: "shared release snapshot",
      path: sharedCatalogSnapshotPath,
      recordsKey: "products",
    },
    {
      label: "taxonomy audit",
      path: resolve(rootDir, "output", "catalog-taxonomy-audit.json"),
      recordsKey: "products",
    },
    {
      label: "catalog integrity manifest",
      path: resolve(rootDir, "output", "shopify-catalog-integrity-manifest.json"),
      recordsKey: "classifications",
    },
  ];
  const boundaries = await Promise.all(
    dependencies.map(async (dependency) => ({
      ...dependency,
      boundary: await readProductBoundary(dependency.path, dependency.recordsKey),
    })),
  );
  const mismatches = boundaries
    .filter((dependency) => !dependency.boundary ||
      dependency.boundary.count !== source.count ||
      dependency.boundary.hash !== source.hash)
    .map((dependency) => {
      if (!dependency.boundary) return `${dependency.label} missing or unreadable`;
      return `${dependency.label} ${dependency.boundary.count} products does not match source ${source.count}`;
    });

  return { drift: mismatches.length > 0, source, mismatches };
}

export function shouldForceRestartFromStepOne(runState) {
  return Number(runState?.restartFromStep || 0) === 1;
}

export function getExplicitResumeStep(runState) {
  const step = Number(runState?.resumeFromStepOverride || 0);
  return Number.isInteger(step) && step > 0 ? step : null;
}

async function hasCompletedProductSeoManifestForResume() {
  try {
    const manifest = JSON.parse(await readFileWithRetry(
      resolve(rootDir, "output", "shopify-seo-release-manifest.json"),
      "utf8",
    ));
    const summary = manifest.summary || {};
    const sourceCandidates = [
      process.env.SALT_RELEASE_CATALOG_SOURCE_PATH,
      resolve(rootDir, "output", "release-catalog-source.json"),
      resolve(rootDir, "public", "data", "products.json"),
    ].filter(Boolean);
    let currentCount = 0;
    for (const sourcePath of sourceCandidates) {
      try {
        const payload = JSON.parse(await readFileWithRetry(sourcePath, "utf8"));
        const products = Array.isArray(payload) ? payload : payload?.products;
        if (Array.isArray(products) && products.length) {
          currentCount = products.length;
          break;
        }
      } catch {
        // Try the next current-catalog boundary.
      }
    }
    const planned = Number(summary.plannedProducts || 0);
    return manifest.mode === "apply"
      && Boolean(manifest.completedAt)
      && Number(summary.failed || 0) === 0
      && Number(summary.unresolved || 0) === 0
      && planned > 0
      && planned === currentCount
      && Number(summary.exactMatches || 0) + Number(summary.updatedVerified || 0) === planned;
  } catch {
    return false;
  }
}

async function writeReleaseRunState(patch = {}) {
  releaseRunState = {
    ...releaseRunState,
    ...patch,
    heartbeatAt: new Date().toISOString(),
  };

  const snapshot = { ...releaseRunState };
  const persist = async () => {
    try {
      await mkdir(resolve(rootDir, "output"), { recursive: true });
      const targets = [releaseRunStatePath, releaseRunStateMirrorPath(snapshot.profile)].filter(Boolean);
      for (const targetPath of targets) {
        const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
        await rename(tempPath, targetPath);
      }
    } catch {
      // Run-state telemetry must never turn a valid release into a failed release.
    }
  };

  // Heartbeat, stage telemetry, retry, and completion updates can overlap.
  // Serialize atomic snapshots so a late heartbeat cannot overwrite a newer
  // checkpoint or leave the profile mirror at a different generation.
  releaseStateWriteQueue = releaseStateWriteQueue.then(persist, persist);
  await releaseStateWriteQueue;
}

async function readResumeRunState(profile) {
  const requestedProfile = String(profile || "").trim().toLowerCase();
  const candidates = [
    releaseRunStateMirrorPath(requestedProfile),
    releaseRunStatePath,
  ];
  const states = (await Promise.all(candidates.filter(Boolean).map((statePath) => readJsonFile(statePath))))
    .filter((state) => state && String(state.profile || "").trim().toLowerCase() === requestedProfile)
    .sort((left, right) => releaseStateTimestamp(right) - releaseStateTimestamp(left));
  return states[0] || null;
}

export function standbyRepairModes(label) {
  const normalized = String(label || "").toLowerCase();
  const modes = ["preflight"];
  if (normalized.includes("collection") || normalized.includes("classification")) modes.push("collection");
  if (normalized.includes("seo") && normalized.includes("verify")) modes.push("seo");
  if (normalized.includes("visual") && normalized.includes("review")) modes.push("visual");
  if (normalized.includes("shuffle") || normalized.includes("final live-readback")) modes.push("postflight");
  return modes;
}

async function runStandbyRepairs({ label, error, index, total, cwd }) {
  const modes = standbyRepairModes(label);
  await writeReleaseRunState({
    standbyRepair: {
      status: "running",
      stepIndex: index,
      stepLabel: label,
      modes,
      reason: String(error?.message || error || "").slice(-4000),
      startedAt: new Date().toISOString(),
    },
  });
  const completed = [];
  const skipped = [];
  const failures = [];
  for (const mode of modes) {
    if (mode !== "preflight") {
      const requiredArtifact = mode === "seo"
        ? resolve(cwd, "output", "shopify-seo-release-manifest.json")
        : mode === "visual"
          ? resolve(cwd, "output", "catalog-image-review-fresh", "final-review-manifest.json")
          : mode === "postflight"
            ? resolve(cwd, "output", "shopify-collection-shuffle-manifest.json")
            : null;
      try {
        if (requiredArtifact) await access(requiredArtifact);
      } catch {
        skipped.push({ mode, reason: `required artifact not present: ${requiredArtifact}` });
        continue;
      }
    }
    process.stderr.write(`[standby] ${mode} repair check for step ${index}/${total}: ${label}\n`);
    try {
      execFileSync(nodeBin, [standbyRepairScriptPath, `--${mode}`], {
        cwd,
        env: {
          ...process.env,
          SALT_RELEASE_STANDBY_REPAIR: "1",
        },
        stdio: "inherit",
      });
      completed.push(mode);
    } catch (repairError) {
      // A diagnostic repair must not hide the original stage failure. The
      // stage remains checkpointed and will retry or surface its own error.
      failures.push({ mode, error: String(repairError?.message || repairError).slice(-4000) });
      process.stderr.write(`[standby] ${mode} repair check did not pass; preserving original stage failure.\n`);
    }
  }
  await writeReleaseRunState({
    standbyRepair: {
      status: failures.length ? "completed-with-diagnostics" : "completed",
      stepIndex: index,
      stepLabel: label,
      modes,
      completed,
      skipped,
      failures,
      completedAt: new Date().toISOString(),
    },
  });
}

function redactFailureText(value, limit = releaseFailureOutputLimit) {
  const redacted = stripAnsi(value)
    .replace(/(authorization|x-shopify-access-token|access[_-]?token|api[_-]?key|secret|password|token)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .trim();
  return redacted.length > limit ? `…${redacted.slice(-limit)}` : redacted;
}

async function probeReleaseNetwork() {
  const shopUrl = String(process.env.SALT_SHOP_URL || "https://0309d3-72.myshopify.com").trim();
  let parsedUrl;
  try {
    parsedUrl = new URL(shopUrl);
  } catch {
    return { available: false, reason: "release store URL is unavailable" };
  }

  try {
    await lookup(parsedUrl.hostname);
  } catch (error) {
    return { available: false, reason: `DNS lookup unavailable (${error?.code || "lookup failure"})` };
  }

  try {
    const response = await fetch(parsedUrl.origin, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(releaseNetworkProbeTimeoutMs),
    });
    response.body?.cancel?.();
    return { available: true, status: response.status };
  } catch (error) {
    return {
      available: false,
      reason: redactFailureText(error?.message || error, 300) || "store network probe failed",
    };
  }
}

async function waitForNetworkBeforeRetry({
  label,
  commandLine,
  cwd,
  index,
  total,
  attempt,
  initialProbe = null,
}) {
  const startedAt = releaseRunState.networkWait?.active && releaseRunState.networkWait?.startedAt
    ? releaseRunState.networkWait.startedAt
    : new Date().toISOString();
  const baseWait = retryDelayMs({
    attempt: Math.max(0, attempt - 1),
    baseMs: releaseNetworkFailureBackoffMs,
    maxMs: releaseNetworkFailureBackoffMaxMs,
    jitterMs: 500,
  });
  let pollCount = 0;
  let probe = initialProbe;

  await writeReleaseRunState({
    status: "waiting_for_network",
    networkWait: {
      active: true,
      stepIndex: index,
      totalSteps: total,
      stepLabel: label,
      command: commandLine,
      cwd,
      attempt,
      startedAt,
      pollCount,
      reason: releaseRunState.networkWait?.reason || "transient network or DNS failure",
      nextProbeAt: new Date(Date.now() + baseWait).toISOString(),
    },
  });
  process.stdout.write(
    `Network/DNS failure at step ${index}/${total}; entering waiting_for_network before retry ${attempt}.\n`,
  );
  await sleep(baseWait);

  while (true) {
    probe ||= await probeReleaseNetwork();
    const now = new Date().toISOString();
    if (probe.available) {
      await writeReleaseRunState({
        status: "running",
        networkWait: {
          active: false,
          stepIndex: index,
          totalSteps: total,
          stepLabel: label,
          command: commandLine,
          cwd,
          attempt,
          startedAt,
          pollCount,
          lastProbeAt: now,
          restoredAt: now,
          nextProbeAt: null,
          reason: "network restored; retrying the same guarded step",
        },
      });
      process.stdout.write(`Network restored; retrying step ${index}/${total} (${label}) from its checkpoint.\n`);
      return;
    }

    pollCount += 1;
    const nextProbeAt = new Date(Date.now() + releaseNetworkPollMs).toISOString();
    await writeReleaseRunState({
      status: "waiting_for_network",
      networkWait: {
        active: true,
        stepIndex: index,
        totalSteps: total,
        stepLabel: label,
        command: commandLine,
        cwd,
        attempt,
        startedAt,
        pollCount,
        lastProbeAt: now,
        nextProbeAt,
        reason: probe.reason || "store network probe failed",
      },
    });
    process.stdout.write(
      `Network still unavailable; next probe in ${Math.round(releaseNetworkPollMs / 1000)}s (poll ${pollCount}).\n`,
    );
    await sleep(releaseNetworkPollMs);
    probe = null;
  }
}

function stageFailureError({ label, commandLine, cwd, index, total, result }) {
  const exitDetail = result?.error
    ? `process error ${result.error.code || result.error.message || result.error}`
    : result?.signal
      ? `signal ${result.signal}`
      : `exit code ${result?.code}`;
  const output = redactFailureText(result?.output || "");
  return new Error([
    `Release stopped at step ${index}/${total} (${label}) with ${exitDetail}.`,
    `Command: ${commandLine}`,
    `Working directory: ${cwd}`,
    output ? `Output tail: ${redactFailureText(output, releaseFailureStateLimit)}` : "",
  ].filter(Boolean).join("\n"));
}

function runStageAttempt({ command, args, cwd, index, total, label, attempt, stageRunId }) {
  return new Promise((resolveAttempt) => {
    let output = "";
    let outputBytes = 0;
    let settled = false;
    let child;
    let telemetryTimer;
    const stageStartedAt = new Date().toISOString();
    let lastOutputAt = stageStartedAt;

    const appendOutput = (chunk) => {
      const text = String(chunk || "");
      outputBytes += Buffer.byteLength(text);
      lastOutputAt = new Date().toISOString();
      output = `${output}${text}`;
      if (output.length > releaseFailureOutputLimit) output = output.slice(-releaseFailureOutputLimit);
    };

    const writeStageTelemetry = (patch = {}) => {
      // A timer callback from a completed child can fire after the next stage
      // has already started. Do not let that late callback overwrite the new
      // stage's checkpoint or exit fields.
      if (releaseRunState.stageRunId && releaseRunState.stageRunId !== stageRunId) return;
      void writeReleaseRunState({
        stageStatus: "running",
        stageRunId,
        stageLabel: label,
        stageAttempt: attempt,
        stageStartedAt,
        stageLastOutputAt: lastOutputAt,
        stageLastActivityAt: lastOutputAt,
        stageOutputBytes: outputBytes,
        ...patch,
      }).catch(() => {});
    };

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (telemetryTimer) clearInterval(telemetryTimer);
      writeStageTelemetry({
        stageStatus: result.code === 0 ? "completed" : "failed",
        stageFinishedAt: new Date().toISOString(),
        stageExitCode: result.code ?? null,
        stageSignal: result.signal || "",
        stageChildPid: 0,
        stageLastActivityAt: new Date().toISOString(),
      });
      resolveAttempt({ ...result, output, index, total });
    };

    child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
    });
    writeStageTelemetry({
      stageChildPid: child.pid || 0,
      stageFinishedAt: null,
      stageExitCode: null,
      stageSignal: "",
    });
    telemetryTimer = setInterval(() => {
      writeStageTelemetry({ stageChildPid: child.pid || 0 });
    }, releaseStageTelemetryMs);
    telemetryTimer.unref?.();

    child.stdout?.on("data", (chunk) => {
      process.stdout.write(chunk);
      appendOutput(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      process.stderr.write(chunk);
      appendOutput(chunk);
    });
    child.on("error", (error) => finish({ error }));
    // Wait for stdout/stderr to drain before the stage result is published.
    // This prevents a late child error from overwriting a newer checkpoint.
    child.on("close", (code, signal) => finish({ code, signal }));
  });
}

async function runStage({ label, command, args, cwd, index, total }) {
  const commandLine = formatCommand(command, args);

  process.stdout.write(`\n[${index}/${total}] ${label}\n`);
  process.stdout.write(`$ ${commandLine}\n`);

  let stageAttempt = 0;
  let networkAttempt = 0;
  let knowledgeModelRepairAttempted = false;
  while (true) {
    stageAttempt += 1;
    const stageRunId = `${process.pid}:${index}:${stageAttempt}:${Date.now()}`;
    await writeReleaseRunState({
      status: "running",
      stageStatus: "starting",
      stageRunId,
      stageAttempt,
      stageRetryLimit: releaseStageRetries,
      stageRetryable: false,
      stageFinishedAt: null,
      stageExitCode: null,
      stageSignal: "",
      stageChildPid: 0,
    });

    const result = await runStageAttempt({
      command,
      args,
      cwd,
      index,
      total,
      label,
      attempt: stageAttempt,
      stageRunId,
    });
    if (result.code === 0) {
      await writeReleaseRunState({
        status: "running",
        stageStatus: "completed",
        stageRunId,
        stageAttempt,
        stageFinishedAt: new Date().toISOString(),
      });
      process.stdout.write(`[ok] ${label}\n`);
      return;
    }

    const failureText = `${result.error?.code || ""} ${result.error?.message || ""} ${result.output || ""}`;
    const failure = stageFailureError({ label, commandLine, cwd, index, total, result });
    if (!knowledgeModelRepairAttempted && shouldRepairKnowledgeModel(label, failureText)) {
      knowledgeModelRepairAttempted = true;
      process.stdout.write(
        "Knowledge model fingerprint drift detected; retraining the approved 128M-record local model before retrying verification.\n",
      );
      try {
        execFileSync(npmBin, ["run", "catalog:knowledge:model:train"], {
          cwd,
          env: process.env,
          stdio: "inherit",
        });
      } catch (repairError) {
        throw new Error(`Knowledge model fingerprint repair failed: ${repairError?.message || repairError}`);
      }
      process.stdout.write("Catalog knowledge model retrained; retrying the original verification gate.\n");
      continue;
    }

    let initialProbe = null;
    let networkFailure = isNetworkFailureText(failureText);
    if (!networkFailure && isRemoteReleaseStage(command, args)) {
      initialProbe = await probeReleaseNetwork();
      networkFailure = !initialProbe.available;
    }
    if (networkFailure) {
      networkAttempt += 1;
      if (releaseNetworkRetryLimit > 0 && networkAttempt > releaseNetworkRetryLimit) {
        await writeReleaseRunState({
          status: "failed",
          networkWait: {
            ...(releaseRunState.networkWait || {}),
            active: false,
            exhausted: true,
            attempts: networkAttempt,
            exhaustedAt: new Date().toISOString(),
          },
        });
        throw failure;
      }
      releaseRunState = {
        ...releaseRunState,
        networkWait: {
          ...(releaseRunState.networkWait || {}),
          reason: redactFailureText(failureText, releaseFailureStateLimit) ||
            initialProbe?.reason || "transient network or DNS failure",
          lastFailureAt: new Date().toISOString(),
        },
      };
      await waitForNetworkBeforeRetry({
        label,
        commandLine,
        cwd,
        index,
        total,
        attempt: networkAttempt,
        initialProbe,
      });
      continue;
    }

    if (stageAttempt > releaseStageRetries || !isRetryableStageFailure(failureText)) throw failure;
    await runStandbyRepairs({ label, error: failure, index, total, cwd });
    const delayMs = retryDelayMs({
      attempt: stageAttempt - 1,
      baseMs: releaseStageRetryDelayMs,
      maxMs: releaseStageRetryDelayMaxMs,
      jitterMs: Math.min(500, Math.floor(releaseStageRetryDelayMs / 2)),
    });
    await writeReleaseRunState({
      status: "running",
      stageStatus: "retrying",
      stageRunId,
      stageAttempt,
      stageRetryable: true,
      stageRetryAt: new Date(Date.now() + delayMs).toISOString(),
      stageRetryReason: redactFailureText(failureText, releaseFailureStateLimit),
    });
    process.stderr.write(
      `Transient failure in step ${index}/${total}; checkpointed retry ${stageAttempt + 1}/${releaseStageRetries + 1} in ${Math.round(delayMs / 1000)}s.\n`,
    );
    await sleep(delayMs);
  }
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

function buildSyncDataSteps({ releaseRootDir, labelPrefix, finalLabel = null }) {
  return [
    {
      label: `${labelPrefix}: Shopify product and collection data`,
      command: nodeBin,
      args: ["scripts/sync-shopify-data.mjs", "--skip-generated-listings"],
      cwd: releaseRootDir,
    },
    {
      label: finalLabel || `${labelPrefix}: recently ordered products and managed collection membership (parallel)`,
      command: nodeBin,
      args: ["scripts/release-secondary-data-refresh.mjs"],
      cwd: releaseRootDir,
    },
  ];
}

function buildCatalogReleaseSteps({
  releaseRootDir = rootDir,
  includeMobile = process.env.SALT_RELEASE_SKIP_MOBILE !== "1",
  supervisedVision = false,
  candidateVisualReview = false,
} = {}) {
  const { iosDir, androidDir, capacitorCliBin, shopifyThemeDir } = getReleasePaths(releaseRootDir);
  const integrityArgs = supervisedVision
    ? supervisedVisionCatalogIntegrityArgs
    : deterministicCatalogIntegrityArgs;
  const verificationIntegrityArgs = process.env.SALT_RELEASE_REUSE_VERIFIED_PLAN === "1"
    ? [...integrityArgs, "--reuse-prior-manifest"]
    : integrityArgs;
  // Step 24 has already produced the exact governed plan. Reuse that plan in
  // step 25 after fetching a fresh live catalog, avoiding a second full CPU
  // classification pass while keeping the mutation and readback gates intact.
  const collectionApplyArgs = [...integrityArgs, "--reuse-prior-manifest"];
  // The final gate runs after all writes, so verify the generation applied by
  // the preceding reconciliation stage. Reclassifying here would create a
  // second plan from transient image/network evidence and compare writes that
  // were never applied. The apply stages already reclassify the full catalog.
  const finalIntegrityArgs = [...integrityArgs, "--reuse-prior-manifest"];

  return [
    {
      label: "Audit visual taxonomy training inputs and 25 GB shard policy",
      command: npmBin,
      args: ["run", "catalog:vision:model:audit"],
      cwd: releaseRootDir,
    },
    {
      label: "Ensure verified Metal visual taxonomy model and raw-data retention gate",
      command: npmBin,
      args: ["run", "catalog:vision:model:ensure"],
      cwd: releaseRootDir,
    },
    {
      label: "Verify trained 128M-record catalog knowledge model",
      command: npmBin,
      args: ["run", "catalog:knowledge:model:verify"],
      cwd: releaseRootDir,
    },
    {
      label: "Verify approved catalog taxonomy release",
      command: nodeBin,
      args: ["scripts/catalog-taxonomy-approval.mjs"],
      cwd: releaseRootDir,
    },
    {
      label: "Scan and remove active products missing live variant cost",
      command: npmBin,
      args: ["run", "shopify:products:missing-cost:apply"],
      cwd: releaseRootDir,
    },
    ...buildSyncDataSteps({
      releaseRootDir,
      labelPrefix: "Refresh Shopify data",
    }),
    {
      label: "Dry-run active product option and unit-cost anomaly repair",
      command: npmBin,
      args: ["run", "shopify:product-anomalies:repair:dry-run"],
      cwd: releaseRootDir,
    },
    {
      label: "Apply deterministic option repairs and draft high-cost outliers",
      command: npmBin,
      args: ["run", "shopify:product-anomalies:repair:apply"],
      cwd: releaseRootDir,
    },
    {
      label: "Verify product anomaly repairs with live readback",
      command: npmBin,
      args: ["run", "shopify:product-anomalies:repair:verify"],
      cwd: releaseRootDir,
    },
    ...buildSyncDataSteps({
      releaseRootDir,
      labelPrefix: "Refresh Shopify data after product anomaly repairs",
    }),
    {
      label: "Build shared full-catalog release snapshot",
      command: nodeBin,
      args: ["scripts/build-release-catalog-snapshot.mjs"],
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
    ...(candidateVisualReview ? [
      {
        label: "Ensure local free-use SigLIP visual candidate is downloaded",
        command: npmBin,
        args: ["run", "catalog:vision:candidate:download"],
        cwd: releaseRootDir,
      },
      {
        label: "Verify downloaded local SigLIP visual candidate on Metal",
        command: npmBin,
        args: ["run", "catalog:vision:candidate:verify"],
        cwd: releaseRootDir,
      },
      {
        label: "Run local SigLIP visual review assist for unresolved products",
        command: npmBin,
        args: ["run", "catalog:vision:candidate:infer"],
        cwd: releaseRootDir,
      },
    ] : []),
    {
      label: "Run verified Metal visual taxonomy model when installed",
      command: npmBin,
      args: ["run", "catalog:vision:model:infer"],
      cwd: releaseRootDir,
    },
    {
      label: "Require image-backed taxonomy evidence",
      command: npmBin,
      args: ["run", "catalog:image-review:validate"],
      cwd: releaseRootDir,
    },
    {
      label: "Validate deterministic collection classification repairs",
      command: nodeBin,
      args: ["scripts/validate-collection-repair-rules.mjs"],
      cwd: releaseRootDir,
    },
    {
      label: "Dry-run exact full-catalog collection reconciliation",
      command: npmBin,
      args: ["run", "shopify:catalog-integrity:dry-run", "--", ...integrityArgs],
      cwd: releaseRootDir,
    },
    {
      label: "Apply exact full-catalog collection reconciliation",
      command: npmBin,
      args: ["run", "shopify:catalog-integrity:apply", "--", ...collectionApplyArgs],
      cwd: releaseRootDir,
    },
    ...buildSyncDataSteps({
      releaseRootDir,
      labelPrefix: "Refresh Shopify data after collection reconciliation",
    }),
    {
      label: "Finalize supervised visual decisions and zero the review queue",
      command: nodeBin,
      args: ["scripts/finalize-catalog-image-review.mjs"],
      cwd: releaseRootDir,
    },
    {
      label: "Ensure Shopify product metafield definitions",
      command: npmBin,
      args: ["run", "shopify:product-metafields:ensure"],
      cwd: releaseRootDir,
    },
    {
      label: "Verify approved live cost-based pricing policy",
      command: nodeBin,
      args: ["scripts/catalog-cost-based-pricing-approval.mjs"],
      cwd: releaseRootDir,
    },
    {
      label: "Ensure Shopify variant-specific SEO metafield definitions",
      command: npmBin,
      args: ["run", "shopify:variant-seo-metafields:ensure"],
      cwd: releaseRootDir,
    },
    {
      label: "Dry-run full-catalog cost-band variant pricing",
      command: npmBin,
      args: ["run", "shopify:variant-cost-price:dry-run"],
      cwd: releaseRootDir,
    },
    {
      label: "Apply full-catalog cost-band variant pricing",
      command: npmBin,
      args: ["run", "shopify:variant-cost-price:apply"],
      cwd: releaseRootDir,
    },
    {
      label: "Verify full-catalog cost-band variant pricing and compare-at values",
      command: npmBin,
      args: ["run", "shopify:variant-cost-price:verify"],
      cwd: releaseRootDir,
    },
    ...(process.env.SALT_RELEASE_SEO_MODE === "gpt" ? [
      {
        label: "Prepare GPT SEO enrichment in 500-product checkpoints",
        command: npmBin,
        args: [
          "run",
          "catalog:seo:gpt:prepare",
          "--",
          "--scope",
          process.env.SALT_RELEASE_SEO_SCOPE || "all-products",
          "--batch-size",
          process.env.SALT_GPT_SEO_BATCH_SIZE || "500",
        ],
        cwd: releaseRootDir,
      },
    ] : []),
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
    ...buildSyncDataSteps({
      releaseRootDir,
      labelPrefix: "Refresh Shopify data after final product publication",
    }),
    {
      label: "Apply Shopify merchandising metafield backfill after catalog boundary changes",
      command: npmBin,
      args: ["run", "shopify:product-metafields:backfill:all-active"],
      cwd: releaseRootDir,
    },
    ...buildSyncDataSteps({
      releaseRootDir,
      labelPrefix: "Refresh Shopify data after merchandising backfill",
    }),
    ...(process.env.SALT_RELEASE_SEO_MODE === "gpt" ? [
      {
        label: "Apply and verify GPT product-type metafields in 500-product checkpoints",
        command: npmBin,
        args: ["run", "shopify:gpt-seo:metafields:apply"],
        cwd: releaseRootDir,
      },
    ] : []),
    {
      label: "Verify every active product has product-specific SEO and metafields",
      command: npmBin,
      args: ["run", "shopify:product-specificity:verify-and-repair"],
      cwd: releaseRootDir,
    },
    {
      label: "Apply final current-generation collection reconciliation",
      command: npmBin,
      args: ["run", "shopify:catalog-integrity:apply", "--", ...integrityArgs],
      cwd: releaseRootDir,
    },
    ...buildSyncDataSteps({
      releaseRootDir,
      labelPrefix: "Refresh live merchandising data after final catalog writes",
      finalLabel: "Refresh live merchandising data after final catalog writes",
    }),
    {
      label: "Verify exact collection membership and price rules",
      command: npmBin,
      args: ["run", "shopify:catalog-integrity:verify", "--", ...verificationIntegrityArgs, "--reuse-prior-manifest"],
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
      args: ["run", "build:web:release"],
      cwd: releaseRootDir,
    },
    {
      label: "Generate Shopify theme bundle",
      command: npmBin,
      args: ["run", "theme:bundle:release", "--", "--out", shopifyThemeDir],
      cwd: releaseRootDir,
    },
    {
      label: "Dry-run approved similar-purpose collection merges",
      command: npmBin,
      args: ["run", "shopify:collection-merges:dry-run"],
      cwd: releaseRootDir,
    },
    {
      label: "Apply approved similar-purpose collection merges with live readback",
      command: npmBin,
      args: ["run", "shopify:collection-merges:apply:approved"],
      cwd: releaseRootDir,
    },
    {
      label: "Snapshot and dry-run guarded SALT tag and collection cleanup",
      command: npmBin,
      args: ["run", "shopify:tag-collection-cleanup:snapshot"],
      cwd: releaseRootDir,
    },
    {
      label: "Abort on ambiguous SALT tag or collection cleanup changes",
      command: npmBin,
      args: ["run", "shopify:tag-collection-cleanup:dry-run"],
      cwd: releaseRootDir,
    },
    {
      label: "Apply verified SALT tag and collection cleanup with live readback",
      command: npmBin,
      args: ["run", "shopify:tag-collection-cleanup:apply"],
      cwd: releaseRootDir,
    },
    {
      label: "Reconcile variant-aware SEO profiles after final catalog writes",
      command: nodeBin,
      args: ["scripts/shopify-variant-google-metafields.mjs", "--apply", "--scope", "all-products"],
      cwd: releaseRootDir,
    },
    {
      label: "Verify variant-aware SEO profiles for every active variant",
      command: npmBin,
      args: ["run", "shopify:variant-seo:verify"],
      cwd: releaseRootDir,
    },
    {
      label: "Dry-run daily manual collection shuffle",
      command: npmBin,
      args: ["run", "shopify:collections:shuffle:dry-run"],
      cwd: releaseRootDir,
    },
    {
      label: "Apply daily manual collection shuffle with live readback",
      command: npmBin,
      args: ["run", "shopify:collections:shuffle:apply"],
      cwd: releaseRootDir,
    },
    {
      label: "Verify daily manual collection shuffle",
      command: npmBin,
      args: ["run", "shopify:collections:shuffle:verify"],
      cwd: releaseRootDir,
    },
    {
      label: "Repair final governed collection sources before strict audit",
      command: nodeBin,
      args: ["scripts/repair-shopify-governed-collection-sources.mjs"],
      cwd: releaseRootDir,
    },
    {
      label: "Strict live audit of repaired collection classification",
      command: npmBin,
      args: [
        "run",
        "shopify:collections:classification:audit",
        "--",
        "--strict",
        "--manifest",
        "output/shopify-catalog-integrity-applied-generation.json",
      ],
      cwd: releaseRootDir,
    },
    {
      label: "Final live-readback gate against the applied catalog generation",
      command: npmBin,
      args: ["run", "shopify:catalog-integrity:verify", "--", ...finalIntegrityArgs],
      cwd: releaseRootDir,
    },
    ...(includeMobile ? [
      {
        label: "Sync iOS Capacitor shell",
        command: nodeBin,
        args: [resolve(releaseRootDir, "scripts", "sync-capacitor-local.mjs"), "ios"],
        cwd: releaseRootDir,
      },
      {
        label: "Sync Android Capacitor shell",
        command: nodeBin,
        args: [resolve(releaseRootDir, "scripts", "sync-capacitor-local.mjs"), "android"],
        cwd: releaseRootDir,
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
      args: ["run", "build:web:release"],
      cwd: releaseRootDir,
    },
    {
      label: "Generate Shopify theme bundle",
      command: npmBin,
      args: ["run", "theme:bundle:release", "--", "--out", shopifyThemeDir],
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
  const unifiedCatalogProfile = ["catalog", "daily"].includes(profile);
  // Full catalog and scheduled daily runs intentionally share one graph. The
  // candidate-review stages may produce audit evidence, but the integrity
  // resolver cannot consume it unless an explicit supervised-vision flag is
  // present; deterministic releases therefore remain safe by default.
  if (profile === "products") {
    return buildProductReleaseSteps({ releaseRootDir, includeMobile });
  }

  if (!["catalog", "daily"].includes(profile)) {
    throw new Error(`Invalid release profile ${profile}; expected catalog, daily, or products`);
  }

  return buildCatalogReleaseSteps({
    releaseRootDir,
    includeMobile,
    candidateVisualReview: unifiedCatalogProfile,
    // A trained visual adapter may contribute evidence only through its
    // verified artifact, confidence, cross-image, and taxonomy-alignment
    // gates. The existing supervised Ollama path remains opt-in.
    supervisedVision: unifiedCatalogProfile &&
      process.env.SALT_CATALOG_VISION_SUPERVISED === "1" &&
      process.env.SALT_RELEASE_ALLOW_AUTOMATED_VISION === "1",
  });
}

function parseArgs(argv) {
  const configuredResumeStep = Number(process.env.SALT_RELEASE_RESUME_FROM_STEP || 0);
  const args = {
    profile: process.env.SALT_RELEASE_PROFILE || "catalog",
    resume: process.env.SALT_RELEASE_RESUME === "1",
    seoMode: String(process.env.SALT_RELEASE_SEO_MODE || "deterministic").trim().toLowerCase(),
    seoScope: String(process.env.SALT_RELEASE_SEO_SCOPE || "all-products").trim().toLowerCase(),
    resumeFromStep: Number.isInteger(configuredResumeStep) && configuredResumeStep > 0 ? configuredResumeStep : null,
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
      continue;
    }

    if (token === "--resume") {
      args.resume = true;
      continue;
    }

    if (token === "--resume-from-step") {
      if (!next) throw new Error("Missing value for --resume-from-step");
      const resumeFromStep = Number(next);
      if (!Number.isInteger(resumeFromStep) || resumeFromStep <= 0) {
        throw new Error("--resume-from-step must be a positive integer");
      }
      args.resume = true;
      args.resumeFromStep = resumeFromStep;
      index += 1;
      continue;
    }

    if (token === "--seo-mode") {
      if (!next) throw new Error("Missing value for --seo-mode");
      args.seoMode = String(next).trim().toLowerCase();
      index += 1;
      continue;
    }

    if (token === "--seo-scope") {
      if (!next) throw new Error("Missing value for --seo-scope");
      args.seoScope = String(next).trim().toLowerCase();
      index += 1;
      continue;
    }
  }

  if (!["catalog", "daily", "products"].includes(args.profile)) {
    throw new Error(`Invalid release profile ${args.profile}; expected catalog, daily, or products`);
  }
  if (!["deterministic", "gpt"].includes(args.seoMode)) {
    throw new Error(`Invalid SEO mode ${args.seoMode}; expected deterministic or gpt`);
  }
  if (!["all-products", "new-products"].includes(args.seoScope)) {
    throw new Error(`Invalid SEO scope ${args.seoScope}; expected all-products or new-products`);
  }

  return args;
}

async function main() {
  let args = { profile: process.env.SALT_RELEASE_PROFILE || "catalog" };
  let heartbeatTimer;
  let preflightResult = null;
  let selectedRepairRoute = null;
  try {
    args = parseArgs(process.argv);
    applyCanonicalReleaseDefaults(args.profile);
    assertReleaseModePrerequisites(args);
    process.env.SALT_RELEASE_SEO_MODE = args.seoMode;
    process.env.SALT_RELEASE_SEO_SCOPE = args.seoScope;
    // Only a guarded resume may reuse the GPT enrichment checkpoint. A fresh
    // run must build a new artifact instead of silently mixing generations.
    process.env.SALT_GPT_SEO_RESUME = args.resume ? "1" : "0";
    if (args.profile !== "products") {
      // Release stages need a full catalog for audits and Shopify mutations,
      // but the storefront must not materialize the old product/search/home
      // listing payloads. Keep that input in ignored release-only storage.
      process.env.SALT_RELEASE_SKIP_GENERATED_LISTINGS = "1";
      process.env.SALT_RELEASE_CATALOG_SOURCE_PATH = resolve(
        rootDir,
        "output",
        "release-catalog-source.json",
      );
      // Collection repairs are only safe when the following catalog sync reads
      // every collection from Shopify rather than reusing a stale local map.
      process.env.SALT_SHOPIFY_FORCE_LIVE_COLLECTION_MEMBERSHIPS = "1";
    }
    // Validate the target, approval manifests, trained model, collection
    // registry, and listing-intelligence contract before taking the owner lock.
    // A failed preflight therefore preserves the previous resumable checkpoint.
    preflightResult = await runReleasePreflightWithModelRepair(args.profile);
    await acquireReleaseOwnerLock();
    process.env.SALT_SHOPIFY_PUBLICATION_CONCURRENCY ||= "4";
    if (args.resume) {
      process.env.SALT_VARIANT_IMAGE_RESUME = "1";
      // Reuse the verified full-catalog live SEO snapshot on resume. The SEO
      // gate validates its handle boundary before using it, avoiding a second
      // 15k-product download after a no-write preflight failure.
      process.env.SALT_SHOPIFY_SEO_REUSE_LIVE_CATALOG = "1";
      try {
        await access(sharedCatalogSnapshotPath);
        process.env.SALT_RELEASE_CATALOG_SNAPSHOT_PATH = sharedCatalogSnapshotPath;
      } catch {
        // Step 4 will create the snapshot during a resumed run if necessary.
      }
    }
    let previousRunState = null;
    if (args.resume) {
      try {
        previousRunState = await readResumeRunState(args.profile);
        if (!previousRunState) throw new Error("profile checkpoint not found");
      } catch {
        throw new Error(`Cannot resume ${args.profile} release: no readable profile checkpoint`);
      }
      // Older watcher versions persisted `interrupted` directly. Treat it as
      // resumable just like the current `failed` representation so a manual
      // resume can recover the checkpoint instead of overwriting it.
      if (!previousRunState || !["failed", "running", "interrupted", "paused", "waiting_for_network"].includes(previousRunState.status)) {
        throw new Error(`Cannot resume release: run state is ${previousRunState?.status || "missing"}, not failed, running, interrupted, paused, or waiting_for_network`);
      }
      if (shouldRefreshSeoLiveCatalogOnResume(previousRunState)) {
        // A failed SEO apply may have written some products after the reusable
        // live snapshot was captured. Reusing it can make the planner skip the
        // exact product that failed final readback. Refresh only this recovery
        // path; successful resumes retain the normal cache-speed optimization.
        process.env.SALT_SHOPIFY_SEO_FORCE_LIVE_CATALOG_REFRESH = "1";
        process.stdout.write("SEO resume recovery: forcing a fresh live Shopify catalog before planning.\n");
      }
      // Keep the old checkpoint in memory until all resume validation passes.
      // If validation fails, the catch block can preserve the exact prior
      // step instead of replacing it with a one-line failure record.
      releaseRunState = { ...previousRunState };
      if (!areCompatibleResumeProfiles(previousRunState.profile, args.profile)) {
        throw new Error(`Cannot resume ${args.profile} release from ${previousRunState.profile} run state`);
      }
      if (previousRunState.stepIndex === 22) {
        try {
          const seoManifest = JSON.parse(await readFileWithRetry(resolve(rootDir, "output", "shopify-seo-release-manifest.json"), "utf8"));
          const summary = seoManifest.summary || {};
          if (
            seoManifest.mode === "apply" &&
            seoManifest.completedAt &&
            Number(summary.failed || 0) === 0 &&
            Number(summary.updatedVerified || 0) === Number(summary.plannedProducts || 0)
          ) {
            process.env.SALT_SEO_GUARDED_RESUME_FROM_VARIANT_IMAGE = "1";
          }
        } catch {
          // An incomplete SEO manifest must run the guarded preflight again.
        }
      }
      if (
        previousRunState.stepLabel === "Reconcile and verify Shopify SEO/product fields" &&
        !shouldRefreshSeoLiveCatalogOnResume(previousRunState) &&
        await hasCompletedProductSeoManifestForResume()
      ) {
        process.env.SALT_SEO_GUARDED_RESUME_AFTER_PRODUCT_SEO = "1";
      }
      if (previousRunState.stepIndex === 26) {
        // Category writes can partially complete before a throttle failure. A
        // fresh product readback lets the backfill checkpoint skip exact rows.
        process.env.SALT_BACKFILL_FORCE_LIVE_CUSTOM_DATA_REFRESH = "1";
      }
      const previousPid = Number(previousRunState.pid || 0);
      if (["running", "waiting_for_network"].includes(previousRunState.status) && previousPid > 0 && previousPid !== process.pid) {
        try {
          process.kill(previousPid, 0);
          throw new Error(`Cannot resume while release process ${previousPid} is still running`);
        } catch (error) {
          if (error?.message?.includes("still running")) throw error;
        }
      }
    }
    const explicitResumeStep = args.resume
      ? args.resumeFromStep || getExplicitResumeStep(previousRunState)
      : null;
    let resumeFromStep = args.resume
      ? Math.max(1, Number(explicitResumeStep || previousRunState?.stepIndex || previousRunState?.completedStepIndex || 1))
      : 1;
    let deletionBoundaryChanged = false;
    if (args.resume && args.profile !== "products") {
      try {
        const deletionManifest = JSON.parse(await readFileWithRetry(missingCostDeletionManifestPath, "utf8"));
        const deletionAt = Date.parse(deletionManifest?.completedAt || deletionManifest?.generatedAt || "");
        const priorRunAt = Date.parse(previousRunState?.failedAt || previousRunState?.startedAt || "");
        deletionBoundaryChanged = deletionManifest?.mode === "apply" &&
          Number(deletionManifest?.summary?.deletedVerified || 0) > 0 &&
          Number.isFinite(deletionAt) && Number.isFinite(priorRunAt) && deletionAt > priorRunAt;
      } catch {
        // A missing or incomplete deletion manifest must not affect resume.
      }
    }
    if (deletionBoundaryChanged) {
      resumeFromStep = 1;
      process.env.SALT_RELEASE_CATALOG_SNAPSHOT_REFRESH = "1";
      process.env.SALT_SHOPIFY_SEO_FORCE_LIVE_CATALOG_REFRESH = "1";
      process.stdout.write(
        "Approved missing-cost deletion changed the live catalog boundary; restarting the full-catalog generation from step 1.\n",
      );
    }
    releaseRunState = {
      status: "running",
      pid: process.pid,
      profile: args.profile,
      seoMode: args.seoMode,
      seoScope: args.seoScope,
      gptSeoProvider: args.seoMode === "gpt" ? String(process.env.SALT_GPT_SEO_PROVIDER || "applescript") : "",
      gptSeoBatchSize: args.seoMode === "gpt" ? Number(process.env.SALT_GPT_SEO_BATCH_SIZE || 500) : 0,
      startedAt: new Date().toISOString(),
      stepIndex: resumeFromStep - (args.resume ? 0 : 1),
      totalSteps: 0,
      stepLabel: "initializing",
      heartbeatAt: new Date().toISOString(),
      resumed: args.resume,
      resumedFromStep: args.resume ? resumeFromStep : null,
      resumeFromStepOverride: explicitResumeStep,
      completedSteps: [],
      completedStepFingerprint: "",
      preflight: preflightResult,
    };
    await writeReleaseRunState();
    releaseRunStateOwned = true;
    await ensureEmbeddedWatcher(args.profile);
    heartbeatTimer = setInterval(() => {
      void writeReleaseRunState().catch(() => {});
    }, releaseHeartbeatMs);
    heartbeatTimer.unref?.();

    const packageJson = JSON.parse(await readFileWithRetry(resolve(rootDir, "package.json"), "utf8"));
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
    process.stdout.write(`  execution: ${args.resume ? `resume from step ${resumeFromStep}` : "full run"}\n`);
    process.stdout.write(
      `  preflight: verified ${preflightResult?.target?.host || "unknown target"}; ` +
      `${preflightResult?.listingIntelligence?.catalogProducts || 0} catalog products` +
      `${preflightResult?.reused ? " (cached)" : ""}\n`,
    );

    if (args.profile === "products") {
      const { productCohortCatalog, productCohortHandles } = getReleasePaths(rootDir);
      await ensurePathExists(productCohortCatalog, "new-product cohort catalog");
      await ensurePathExists(productCohortHandles, "new-product cohort handles");
      process.stdout.write(`  product-cohort: ${productCohortHandles}\n`);
    }

    const steps = buildReleaseSteps({ rootDir, profile: args.profile });
    const graphDrift = args.resume && args.profile !== "products"
      ? findReleaseGraphDrift(steps, previousRunState?.completedSteps, args.profile)
      : null;
    if (graphDrift) {
      resumeFromStep = 1;
      process.env.SALT_RELEASE_CATALOG_SNAPSHOT_REFRESH = "1";
      process.env.SALT_SHOPIFY_SEO_FORCE_LIVE_CATALOG_REFRESH = "1";
      process.stdout.write(
        `Completed-step fingerprint drift at ${graphDrift.index}/${steps.length} (${graphDrift.label}); restarting the full-catalog generation from step 1.\n`,
      );
    }
    if (args.resume && previousRunState?.stepLabel && !graphDrift) {
      const resolvedResume = resolveResumeStep(steps, previousRunState, resumeFromStep);
      resumeFromStep = resolvedResume.resumeFromStep;
      process.stdout.write(
        `Resume checkpoint verified: step ${resumeFromStep}/${steps.length} (${steps[resumeFromStep - 1]?.label || "unknown"}).\n`,
      );
      if (resolvedResume.reason === "collection-audit-source-repair") {
        process.env.SALT_CATALOG_FORCE_COLLECTION_SOURCE_REFRESH = "1";
        process.env.SALT_CATALOG_FORCE_PRICE_COLLECTION_REFRESH = "1";
        process.stdout.write(
          "Collection audit drift detected; resuming from the bounded final governed-source repair gate.\n",
        );
      } else if (resolvedResume.reason === "collection-audit-repair") {
        // A strict collection audit is read-only. Re-run the immediately
        // preceding full-catalog reconciliation so stale sources and
        // condition-based membership indexes can converge before auditing.
        process.env.SALT_CATALOG_FORCE_COLLECTION_SOURCE_REFRESH = "1";
        process.env.SALT_CATALOG_FORCE_PRICE_COLLECTION_REFRESH = "1";
        process.stdout.write(
          "Collection audit drift detected; resuming from final collection reconciliation with forced source and price refresh.\n",
        );
      }
      if (resolvedResume.restarted && args.profile !== "products") {
        // A checkpoint from an older graph cannot be mapped safely. Restart
        // the catalog graph rather than guessing a semantic stage boundary.
        resumeFromStep = 1;
        process.env.SALT_RELEASE_CATALOG_SNAPSHOT_REFRESH = "1";
        process.env.SALT_SHOPIFY_SEO_FORCE_LIVE_CATALOG_REFRESH = "1";
        process.stdout.write(
          `Resume checkpoint label was not found in the ${steps.length}-step graph; restarting catalog generation from step 1.\n`,
        );
      }
    }
    if (
      args.resume &&
      previousRunState?.stepLabel === "Verify Shopify merchandising backfill" &&
      process.env.SALT_RELEASE_SKIP_FINAL_MERCH_REFRESH !== "1"
    ) {
      const refreshBlockStart = steps.findIndex(
        (step) => step.label === "Refresh Shopify data after final product publication: Shopify product and collection data",
      );
      if (refreshBlockStart >= 0) {
        // A stale merchandising readback can mean that the prior backfill
        // planned against a locally synthesized value and skipped a live
        // collection/product write. Re-run the publication refresh and the
        // checkpointed merchandising backfill before attempting readback.
        resumeFromStep = refreshBlockStart + 1;
      }
    }
    if (args.resume && previousRunState?.stepLabel === "Refresh live merchandising data after final catalog writes") {
      const refreshIndex = steps.findIndex((step) => step.label === "Refresh live merchandising data after final catalog writes");
      try {
        const snapshot = JSON.parse(await readFileWithRetry(sharedCatalogSnapshotPath, "utf8"));
        const snapshotAt = Date.parse(snapshot?.generatedAt || "");
        const failedAt = Date.parse(previousRunState?.failedAt || "");
        if (refreshIndex >= 0 && Number.isFinite(snapshotAt) && Number.isFinite(failedAt) && snapshotAt >= failedAt) {
          // The live sync completed before a post-stage orchestration error;
          // the refreshed snapshot is already durable, so continue at the
          // next numbered gate instead of downloading Shopify again.
          resumeFromStep = refreshIndex + 2;
        }
      } catch {
        // Fall back to rerunning the live refresh when its snapshot is absent.
      }
    }
    if (args.resume && previousRunState?.stepLabel === "Verify variant-aware SEO profiles for every active variant") {
      const reconcileIndex = steps.findIndex(
        (step) => step.label === "Reconcile variant-aware SEO profiles after final catalog writes",
      );
      if (reconcileIndex >= 0) {
        // The prior verifier proved that the existing manifest was stale. Run
        // the checkpointed diff apply once before retrying the readback gate.
        resumeFromStep = reconcileIndex + 1;
      }
    }
    if (args.resume && hasCatalogBoundaryDrift(previousRunState) && args.profile !== "products") {
      // Resolve the saved label and all special-case rewinds first. A catalog
      // boundary mismatch is stronger than any stage-local resume rule: the
      // shared source and every dependent plan must be regenerated together.
      resumeFromStep = 1;
      process.env.SALT_RELEASE_CATALOG_SNAPSHOT_REFRESH = "1";
      process.env.SALT_SHOPIFY_SEO_FORCE_LIVE_CATALOG_REFRESH = "1";
      process.stdout.write(
        "Catalog boundary drift detected on the prior run; restarting the full-catalog generation from step 1.\n",
      );
    }
    if (args.resume && shouldForceRestartFromStepOne(previousRunState) && args.profile !== "products") {
      resumeFromStep = 1;
      process.env.SALT_RELEASE_CATALOG_SNAPSHOT_REFRESH = "1";
      process.env.SALT_SHOPIFY_SEO_FORCE_LIVE_CATALOG_REFRESH = "1";
      process.stdout.write(
        "Explicit restart marker detected; restarting the full-catalog generation from step 1.\n",
      );
    }
    if (args.resume && explicitResumeStep && args.profile !== "products" && !graphDrift) {
      resumeFromStep = explicitResumeStep;
      process.stdout.write(
        `Explicit resume marker detected; resuming the catalog at step ${explicitResumeStep}.\n`,
      );
    }
    if (args.resume && !explicitResumeStep && args.profile !== "products" && !graphDrift) {
      selectedRepairRoute = getReleaseRepairRoute(steps, previousRunState, resumeFromStep);
      if (selectedRepairRoute) {
        resumeFromStep = selectedRepairRoute.fromStep;
        process.env.SALT_RELEASE_REPAIR_ROUTE = selectedRepairRoute.reason;
        process.stdout.write(selectedRepairRoute.message);
      }
    }
    if (selectedRepairRoute) {
      await writeReleaseRunState({ repairRoute: selectedRepairRoute });
    }
    if (args.resume && args.profile !== "products") {
      const boundaryCheck = await detectResumeCatalogBoundaryMismatch(resumeFromStep, args.profile);
      if (boundaryCheck.drift) {
        resumeFromStep = 1;
        process.env.SALT_RELEASE_CATALOG_SNAPSHOT_REFRESH = "1";
        process.env.SALT_SHOPIFY_SEO_FORCE_LIVE_CATALOG_REFRESH = "1";
        process.stdout.write(
          `Resume dependency boundary drift detected (${boundaryCheck.mismatches.join("; ")}); restarting the full-catalog generation from step 1.\n`,
        );
      }
    }
    if (
      args.resume &&
      !selectedRepairRoute &&
      previousRunState?.stepFingerprint &&
      Number(previousRunState?.stepIndex || 0) === resumeFromStep
    ) {
      const currentStep = steps[resumeFromStep - 1];
      const currentFingerprint = currentStep ? releaseStepFingerprint(currentStep, args.profile) : "";
      if (currentFingerprint && currentFingerprint !== previousRunState.stepFingerprint) {
        resumeFromStep = 1;
        process.env.SALT_RELEASE_CATALOG_SNAPSHOT_REFRESH = "1";
        process.env.SALT_SHOPIFY_SEO_FORCE_LIVE_CATALOG_REFRESH = "1";
        process.stdout.write(
          "Resume gate definition changed since the checkpoint; restarting the full-catalog generation from step 1.\n",
        );
      }
    }
    if (graphDrift) {
      // A changed completed gate invalidates every downstream artifact. Do
      // not let a later label-specific repair route override the full restart.
      resumeFromStep = 1;
      selectedRepairRoute = null;
    }
    if (resumeFromStep > steps.length) {
      throw new Error(`Cannot resume from step ${resumeFromStep}; release has ${steps.length} steps`);
    }
    const priorCompletedSteps = args.resume && Array.isArray(previousRunState?.completedSteps)
      ? previousRunState.completedSteps
      : [];
    const completedStepsForResume = resumeFromStep > 1
      ? priorCompletedSteps
        .filter((entry) => Number(entry?.index || 0) > 0 && Number(entry.index) < resumeFromStep)
        .map((entry) => ({
          index: Number(entry.index),
          label: String(entry.label || ""),
          fingerprint: String(entry.fingerprint || ""),
          completedAt: String(entry.completedAt || ""),
          durationMs: Number(entry.durationMs || 0),
        }))
      : [];
    releaseRunState = {
      ...releaseRunState,
      completedSteps: completedStepsForResume,
    };
    await writeReleaseRunState({ totalSteps: steps.length, completedSteps: completedStepsForResume });

    for (const [index, step] of steps.entries()) {
      const stepIndex = index + 1;
      const stepFingerprint = releaseStepFingerprint(step, args.profile);
      if (stepIndex < resumeFromStep) {
        process.stdout.write(`[reuse] ${stepIndex}/${steps.length} ${step.label}\n`);
        continue;
      }
      const stepStartedAt = Date.now();
      await writeReleaseRunState({
        stepIndex,
        stepLabel: step.label,
        stepFingerprint,
        stageStatus: "starting",
      });
      if (
        step.label === "Refresh live merchandising data after final catalog writes" ||
        step.label.startsWith("Refresh live merchandising data after final catalog writes:")
      ) {
        process.env.SALT_SHOPIFY_FORCE_LIVE_PRODUCT_ENRICHMENT = "1";
      }
      if (step.label === "Reconcile variant-aware SEO profiles after final catalog writes") {
        // This stage must derive SEO from the same current live titles and
        // prices that the following verifier reads, never from an older
        // completed variant catalog checkpoint.
        process.env.SALT_VARIANT_GOOGLE_FORCE_LIVE_REFRESH = "1";
      }
      if (step.label === "Final live-readback gate against the applied catalog generation") {
        // Make direct resume at the final gate deterministic too; skipped
        // earlier steps do not get a chance to set this process-local env var.
        process.env.SALT_CATALOG_REUSE_MANIFEST_PATH = appliedIntegrityManifestPath;
      }
      await runStage({
        ...step,
        index: index + 1,
        total: steps.length,
      });

      if (step.label === "Reconcile and verify Shopify SEO/product fields") {
        execFileSync(nodeBin, ["scripts/release-proactive-repair.mjs", "--seo"], {
          cwd: rootDir,
          env: process.env,
          stdio: "inherit",
        });
      }

      if (step.label === "Build shared full-catalog release snapshot") {
        process.env.SALT_RELEASE_CATALOG_SNAPSHOT_PATH = sharedCatalogSnapshotPath;
        execFileSync(nodeBin, ["scripts/release-proactive-repair.mjs", "--preflight"], {
          cwd: rootDir,
          env: process.env,
          stdio: "inherit",
        });
      }

      if (step.label === "Final live-readback gate against the applied catalog generation") {
        // Keep the audits inside the existing final gate so the published step
        // sequence remains stable for old resume checkpoints and tests.
        execFileSync(nodeBin, ["scripts/release-proactive-repair.mjs", "--visual"], {
          cwd: rootDir,
          env: process.env,
          stdio: "inherit",
        });
        execFileSync(nodeBin, ["scripts/release-proactive-repair.mjs", "--postflight"], {
          cwd: rootDir,
          env: process.env,
          stdio: "inherit",
        });
      }

      if (step.label === "Refresh live merchandising data after final catalog writes") {
        // The live enrichment pass updates public/data after the original
        // snapshot was created. Refresh the same shared snapshot before any
        // final readback so verifiers do not compare Shopify against stale
        // pre-repair custom data.
        execFileSync(nodeBin, ["scripts/build-release-catalog-snapshot.mjs"], {
          cwd: rootDir,
          env: {
            ...process.env,
            SALT_RELEASE_CATALOG_SNAPSHOT_PATH: sharedCatalogSnapshotPath,
            SALT_RELEASE_CATALOG_SNAPSHOT_REFRESH: "1",
          },
          stdio: "inherit",
        });
      }

      if (step.label === "Apply final current-generation collection reconciliation") {
        await copyFile(resolve(rootDir, "output", "shopify-catalog-integrity-manifest.json"), appliedIntegrityManifestPath);
      }

      if (step.label === "Verify exact collection membership and price rules") {
        process.env.SALT_CATALOG_REUSE_MANIFEST_PATH = appliedIntegrityManifestPath;
      }

      if (step.label === "Build web app") {
        await ensurePathExists(resolve(rootDir, "dist", "index.html"), "Vite build output");
      }
      const completedSteps = [
        ...(Array.isArray(releaseRunState.completedSteps) ? releaseRunState.completedSteps : []),
        {
          index: stepIndex,
          label: step.label,
          fingerprint: stepFingerprint,
          completedAt: new Date().toISOString(),
          durationMs: Math.max(0, Date.now() - stepStartedAt),
        },
      ].filter((entry, entryIndex, entries) =>
        entries.findIndex((candidate) => candidate.index === entry.index) === entryIndex,
      );
      await writeReleaseRunState({
        completedStepIndex: stepIndex,
        completedStepFingerprint: stepFingerprint,
        completedSteps,
        stepAttempt: 0,
      });
      try {
        const report = await writeReleaseBottleneckReport({
          steps,
          completedSteps,
          releaseState: {
            ...releaseRunState,
            status: "running",
            stepIndex,
            completedStepIndex: stepIndex,
            totalSteps: steps.length,
          },
          outputDir: resolve(rootDir, "output"),
        });
        const top = report.topBottlenecks[0];
        if (top) {
          process.stdout.write(
            `[telemetry] top bottleneck: step ${top.index} ${top.durationMinutes}m (${top.category})\n`,
          );
        }
      } catch (reportError) {
        process.stderr.write(`[telemetry] bottleneck report unavailable: ${reportError?.message || reportError}\n`);
      }
    }

    await writeReleaseRunState({
      status: "completed",
      completedAt: new Date().toISOString(),
      stepLabel: "complete",
    });
    try {
      await writeReleaseBottleneckReport({
        steps,
        completedSteps: releaseRunState.completedSteps,
        releaseState: { ...releaseRunState, status: "completed", stepIndex: steps.length },
        outputDir: resolve(rootDir, "output"),
      });
    } catch (reportError) {
      process.stderr.write(`[telemetry] final bottleneck report unavailable: ${reportError?.message || reportError}\n`);
    }
    process.stdout.write("\nRelease complete.\n");
  } catch (error) {
    // Resume validation happens before the new run state is initialized. Keep
    // the prior checkpoint and annotate the failure so a watcher can recover
    // without losing the step that needs attention.
    if (releaseRunStateOwned) {
      await writeReleaseRunState({
        status: "failed",
        failedAt: new Date().toISOString(),
        error: error?.message || String(error),
      });
    }
    throw error;
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    await releaseOwnerLock();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(`\n${error.message}`);
    process.exit(1);
  });
}
