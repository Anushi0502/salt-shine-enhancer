#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { access, copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
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
const releaseRunStatePath = resolve(rootDir, "output", "release-run-state.json");
const releaseHeartbeatMs = Math.max(10_000, Number(process.env.SALT_RELEASE_HEARTBEAT_MS || 30_000));
const releaseStageTelemetryMs = Math.max(1_000, Number(process.env.SALT_RELEASE_STAGE_TELEMETRY_MS || 5_000));
const releaseStageRetries = Math.max(0, Math.min(3, Number(process.env.SALT_RELEASE_STAGE_RETRIES || 2)));
const releaseStageRetryDelayMs = Math.max(1000, Number(process.env.SALT_RELEASE_STAGE_RETRY_DELAY_MS || 5000));
const sharedCatalogSnapshotPath = resolve(rootDir, "output", "release-catalog-snapshot.json");
const appliedIntegrityManifestPath = resolve(rootDir, "output", "shopify-catalog-integrity-applied-generation.json");
const missingCostDeletionManifestPath = resolve(rootDir, "output", "shopify-missing-cost-product-deletion-manifest.json");
const standbyRepairScriptPath = resolve(rootDir, "scripts", "release-proactive-repair.mjs");

// A catalog release is not considered autonomous unless the verified visual
// taxonomy model is present (or can be trained by the preceding ensure step).
// Keep this requirement in the orchestrator so every entrypoint, including
// the watcher and future package aliases, inherits the same gate.
process.env.SALT_REQUIRE_VISUAL_TAXONOMY_MODEL ||= "1";

// The canonical release uses the separately approved cost-band policy. Direct
// invocation of the alignment script remains legacy-compatible unless callers
// explicitly select the new policy.
for (const [key, value] of Object.entries({
  SALT_CATALOG_COST_BASED_PRICING_APPROVED: "1",
  SALT_CATALOG_COST_BASED_PRICING_APPROVAL_ID: "salt-cost-based-pricing-2026-08-24-approved",
  SALT_VARIANT_COST_PRICING_POLICY: "cost-band-v2",
  SALT_VARIANT_COST_POLICY_ID: "cost-band-v2-2026-08-24",
  SALT_VARIANT_COST_OVERHEAD: "16",
  SALT_DELETE_MISSING_COST_PRODUCTS_APPROVED: "1",
  SALT_DELETE_MISSING_COST_PRODUCTS_APPROVAL_ID: "salt-missing-cost-deletion-2026-08-27-approved",
})) {
  if (!process.env[key]) process.env[key] = value;
}

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

let releaseRunState = {};

function areCompatibleResumeProfiles(previousProfile, requestedProfile) {
  if (!previousProfile || previousProfile === requestedProfile) return true;
  // catalog and daily intentionally share the same full-catalog step graph.
  // A watcher may resume a catalog run through the scheduled daily alias.
  return [previousProfile, requestedProfile].every((profile) => ["catalog", "daily"].includes(profile));
}

export function resolveResumeStep(steps, previousRunState, numericFallback = 1) {
  const savedLabel = String(previousRunState?.stepLabel || "").trim();
  if (!savedLabel) return { resumeFromStep: Math.max(1, Number(numericFallback) || 1), restarted: false };
  const matchingIndex = (Array.isArray(steps) ? steps : []).findIndex((step) => step?.label === savedLabel);
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

async function writeReleaseRunState(patch = {}) {
  releaseRunState = {
    ...releaseRunState,
    ...patch,
    heartbeatAt: new Date().toISOString(),
  };

  try {
    await mkdir(resolve(rootDir, "output"), { recursive: true });
    const tempPath = `${releaseRunStatePath}.tmp-${process.pid}`;
    await writeFile(tempPath, `${JSON.stringify(releaseRunState, null, 2)}\n`, "utf8");
    await rename(tempPath, releaseRunStatePath);
  } catch {
    // Run-state telemetry must never turn a valid release into a failed release.
  }
}

function isRetryableStageFailure(error) {
  const message = String(error?.message || error || "");
  return /429|throttl|rate limit|network|enotfound|econnreset|etimedout|timeout|socket|temporar|readback mismatch|job .* did not finish|pending/i.test(message);
}

export function standbyRepairModes(label) {
  const normalized = String(label || "").toLowerCase();
  const modes = ["preflight"];
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
          : resolve(cwd, "output", "shopify-collection-shuffle-manifest.json");
      try {
        await access(requiredArtifact);
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

async function runStage({ label, command, args, cwd, index, total }) {
  const commandLine = formatCommand(command, args);

  process.stdout.write(`\n[${index}/${total}] ${label}\n`);
  process.stdout.write(`$ ${commandLine}\n`);

  async function runAttempt(attempt) {
    await writeReleaseRunState({ stepAttempt: attempt });
    return new Promise((resolveStep, rejectStep) => {
      const child = spawn(command, args, {
        cwd,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let outputTail = "";
      const stageStartedAt = new Date().toISOString();
      let stageLastOutputAt = stageStartedAt;
      let stageOutputBytes = 0;
      let stageTelemetryTimer = null;
      let stageTelemetryWriteInFlight = false;

      const flushStageTelemetry = async () => {
        if (stageTelemetryWriteInFlight) return;
        stageTelemetryWriteInFlight = true;
        try {
          await writeReleaseRunState({
            stageStatus: "running",
            stageChildPid: Number(child.pid || 0),
            stageStartedAt,
            stageLastOutputAt,
            stageOutputBytes,
          });
        } finally {
          stageTelemetryWriteInFlight = false;
        }
      };

      const scheduleStageTelemetry = () => {
        if (stageTelemetryTimer) return;
        stageTelemetryTimer = setTimeout(() => {
          stageTelemetryTimer = null;
          void flushStageTelemetry().catch(() => {});
        }, releaseStageTelemetryMs);
        stageTelemetryTimer.unref?.();
      };

      const finishStageTelemetry = (status, code = null, signal = "") => {
        if (stageTelemetryTimer) clearTimeout(stageTelemetryTimer);
        stageTelemetryTimer = null;
        void writeReleaseRunState({
          stageStatus: status,
          stageChildPid: 0,
          stageStartedAt,
          stageLastOutputAt,
          stageOutputBytes,
          stageFinishedAt: new Date().toISOString(),
          stageExitCode: code,
          stageSignal: signal || "",
        }).catch(() => {});
      };

      void flushStageTelemetry().catch(() => {});
      const forward = (chunk, target) => {
        target.write(chunk);
        outputTail = `${outputTail}${String(chunk)}`.slice(-24_000);
        stageLastOutputAt = new Date().toISOString();
        stageOutputBytes += Number(chunk?.length || String(chunk).length || 0);
        scheduleStageTelemetry();
      };
      child.stdout.on("data", (chunk) => forward(chunk, process.stdout));
      child.stderr.on("data", (chunk) => forward(chunk, process.stderr));

      child.on("error", (error) => {
        finishStageTelemetry("failed");
        rejectStep(
          new Error(
            `Release stopped at step ${index}/${total} (${label}).\nCommand: ${commandLine}\nWorking directory: ${cwd}\nReason: ${error.message}\n${outputTail}`,
          ),
        );
      });

      child.on("exit", (code, signal) => {
        finishStageTelemetry(code === 0 ? "completed" : "failed", code, signal || "");
        if (code === 0) {
          process.stdout.write(`[ok] ${label}\n`);
          resolveStep();
          return;
        }

        const exitDetail = signal ? `signal ${signal}` : `exit code ${code}`;
        rejectStep(
          new Error(
            `Release stopped at step ${index}/${total} (${label}) with ${exitDetail}.\nCommand: ${commandLine}\nWorking directory: ${cwd}\n${outputTail}`,
          ),
        );
      });
    });
  }

  for (let attempt = 0; attempt <= releaseStageRetries; attempt += 1) {
    try {
      await runAttempt(attempt + 1);
      return;
    } catch (error) {
      const canRetry = attempt < releaseStageRetries && isRetryableStageFailure(error);
      if (!canRetry) throw error;
      await runStandbyRepairs({ label, error, index, total, cwd });
      const delayMs = Math.min(120_000, releaseStageRetryDelayMs * 2 ** attempt);
      process.stderr.write(
        `Transient failure in step ${index}/${total}; checkpointed retry ${attempt + 2}/${releaseStageRetries + 1} in ${Math.round(delayMs / 1000)}s.\n`,
      );
      await new Promise((resolvePromise) => setTimeout(resolvePromise, delayMs));
    }
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
      label: `${labelPrefix}: recently ordered products`,
      command: nodeBin,
      args: ["scripts/sync-recently-ordered-products.mjs"],
      cwd: releaseRootDir,
    },
    {
      label: finalLabel || `${labelPrefix}: managed collection membership`,
      command: nodeBin,
      args: ["scripts/sync-managed-collection-membership.mjs"],
      cwd: releaseRootDir,
    },
  ];
}

function buildCatalogReleaseSteps({
  releaseRootDir = rootDir,
  includeMobile = process.env.SALT_RELEASE_SKIP_MOBILE !== "1",
  supervisedVision = false,
} = {}) {
  const { iosDir, androidDir, capacitorCliBin, shopifyThemeDir } = getReleasePaths(releaseRootDir);
  const integrityArgs = supervisedVision
    ? supervisedVisionCatalogIntegrityArgs
    : deterministicCatalogIntegrityArgs;
  const verificationIntegrityArgs = process.env.SALT_RELEASE_REUSE_VERIFIED_PLAN === "1"
    ? [...integrityArgs, "--reuse-prior-manifest"]
    : integrityArgs;
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
      label: "Dry-run exact full-catalog collection reconciliation",
      command: npmBin,
      args: ["run", "shopify:catalog-integrity:dry-run", "--", ...integrityArgs],
      cwd: releaseRootDir,
    },
    {
      label: "Apply exact full-catalog collection reconciliation",
      command: npmBin,
      args: ["run", "shopify:catalog-integrity:apply", "--", ...integrityArgs],
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
    {
      label: "Verify every active product has product-specific SEO and metafields",
      command: npmBin,
      args: ["run", "shopify:product-specificity:verify"],
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
  if (profile === "products") {
    return buildProductReleaseSteps({ releaseRootDir, includeMobile });
  }

  if (!["catalog", "daily"].includes(profile)) {
    throw new Error(`Invalid release profile ${profile}; expected catalog, daily, or products`);
  }

  return buildCatalogReleaseSteps({
    releaseRootDir,
    includeMobile,
    // A trained visual adapter may contribute evidence only through its
    // verified artifact, confidence, cross-image, and taxonomy-alignment
    // gates. The existing supervised Ollama path remains opt-in.
    supervisedVision: profile === "catalog" &&
      process.env.SALT_CATALOG_VISION_SUPERVISED === "1" &&
      process.env.SALT_RELEASE_ALLOW_AUTOMATED_VISION === "1",
  });
}

function parseArgs(argv) {
  const args = {
    profile: process.env.SALT_RELEASE_PROFILE || "catalog",
    resume: process.env.SALT_RELEASE_RESUME === "1",
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
    }
  }

  if (!["catalog", "daily", "products"].includes(args.profile)) {
    throw new Error(`Invalid release profile ${args.profile}; expected catalog, daily, or products`);
  }

  return args;
}

async function main() {
  let args = { profile: process.env.SALT_RELEASE_PROFILE || "catalog" };
  let heartbeatTimer;
  try {
    args = parseArgs(process.argv);
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
        previousRunState = JSON.parse(await readFile(releaseRunStatePath, "utf8"));
      } catch {
        throw new Error(`Cannot resume release: no readable run state at ${releaseRunStatePath}`);
      }
      if (!previousRunState || !["failed", "running"].includes(previousRunState.status)) {
        throw new Error(`Cannot resume release: run state is ${previousRunState?.status || "missing"}, not failed or interrupted`);
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
          const seoManifest = JSON.parse(await readFile(resolve(rootDir, "output", "shopify-seo-release-manifest.json"), "utf8"));
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
      if (previousRunState.stepIndex === 26) {
        // Category writes can partially complete before a throttle failure. A
        // fresh product readback lets the backfill checkpoint skip exact rows.
        process.env.SALT_BACKFILL_FORCE_LIVE_CUSTOM_DATA_REFRESH = "1";
      }
      const previousPid = Number(previousRunState.pid || 0);
      if (previousRunState.status === "running" && previousPid > 0 && previousPid !== process.pid) {
        try {
          process.kill(previousPid, 0);
          throw new Error(`Cannot resume while release process ${previousPid} is still running`);
        } catch (error) {
          if (error?.message?.includes("still running")) throw error;
        }
      }
    }
    let resumeFromStep = args.resume
      ? Math.max(1, Number(previousRunState?.stepIndex || previousRunState?.completedStepIndex || 1))
      : 1;
    const catalogBoundaryDrifted = /catalog integrity scope drifted|manifest has .* active products .* Shopify has/i.test(
      String(previousRunState?.error || ""),
    );
    if (args.resume && catalogBoundaryDrifted && args.profile !== "products") {
      // A long release can legitimately outlive a product import. Rebuild the
      // shared source and all dependent plans rather than retrying against a
      // partial generation that cannot cover the current active catalog.
      resumeFromStep = 1;
      process.env.SALT_RELEASE_CATALOG_SNAPSHOT_REFRESH = "1";
      process.env.SALT_SHOPIFY_SEO_FORCE_LIVE_CATALOG_REFRESH = "1";
      process.stdout.write(
        "Catalog boundary drift detected on the prior run; restarting the full-catalog generation from step 1.\n",
      );
    }
    let deletionBoundaryChanged = false;
    if (args.resume && args.profile !== "products") {
      try {
        const deletionManifest = JSON.parse(await readFile(missingCostDeletionManifestPath, "utf8"));
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
      startedAt: new Date().toISOString(),
      stepIndex: resumeFromStep - (args.resume ? 0 : 1),
      totalSteps: 0,
      stepLabel: "initializing",
      heartbeatAt: new Date().toISOString(),
      resumed: args.resume,
      resumedFromStep: args.resume ? resumeFromStep : null,
    };
    await writeReleaseRunState();
    heartbeatTimer = setInterval(() => {
      void writeReleaseRunState().catch(() => {});
    }, releaseHeartbeatMs);
    heartbeatTimer.unref?.();

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
    process.stdout.write(`  execution: ${args.resume ? `resume from step ${resumeFromStep}` : "full run"}\n`);

    if (args.profile === "products") {
      const { productCohortCatalog, productCohortHandles } = getReleasePaths(rootDir);
      await ensurePathExists(productCohortCatalog, "new-product cohort catalog");
      await ensurePathExists(productCohortHandles, "new-product cohort handles");
      process.stdout.write(`  product-cohort: ${productCohortHandles}\n`);
    }

    const steps = buildReleaseSteps({ rootDir, profile: args.profile });
    if (args.resume && previousRunState?.stepLabel) {
      const resolvedResume = resolveResumeStep(steps, previousRunState, resumeFromStep);
      resumeFromStep = resolvedResume.resumeFromStep;
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
        const snapshot = JSON.parse(await readFile(sharedCatalogSnapshotPath, "utf8"));
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
    if (resumeFromStep > steps.length) {
      throw new Error(`Cannot resume from step ${resumeFromStep}; release has ${steps.length} steps`);
    }
    await writeReleaseRunState({ totalSteps: steps.length });

    for (const [index, step] of steps.entries()) {
      if (index + 1 < resumeFromStep) continue;
      await writeReleaseRunState({
        stepIndex: index + 1,
        stepLabel: step.label,
      });
      if (
        step.label === "Refresh live merchandising data after final catalog writes" ||
        step.label.startsWith("Refresh live merchandising data after final catalog writes:")
      ) {
        process.env.SALT_SHOPIFY_FORCE_LIVE_PRODUCT_ENRICHMENT = "1";
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
      await writeReleaseRunState({ completedStepIndex: index + 1, stepAttempt: 0 });
    }

    await writeReleaseRunState({
      status: "completed",
      completedAt: new Date().toISOString(),
      stepLabel: "complete",
    });
    process.stdout.write("\nRelease complete.\n");
  } catch (error) {
    // Resume validation happens before the new run state is initialized. Keep
    // the prior checkpoint and annotate the failure so a watcher can recover
    // without losing the step that needs attention.
    await writeReleaseRunState({
      status: "failed",
      failedAt: new Date().toISOString(),
      error: error?.message || String(error),
    });
    throw error;
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(`\n${error.message}`);
    process.exit(1);
  });
}
