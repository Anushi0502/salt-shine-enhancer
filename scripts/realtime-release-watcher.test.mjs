// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  isMissingCatalogBaselineError,
  isActiveReleaseCheckpointStatus,
  isManualStopSuppressed,
  releaseProgressLogKey,
  isResumableReleaseCheckpointStatus,
  shouldDeferWatcherCheck,
  shouldReclaimUnreadableWatcherLock,
  shouldTrustLiveReleaseStage,
  mergeActiveReleaseTelemetry,
  resolveReleaseLaunchConfig,
} from "./realtime-release-watcher.mjs";
import { buildProcessTerminationTargets, parseProcessTable } from "./lib/process-runtime.mjs";

describe("realtime release watcher checkpoint policy", () => {
  it("resumes both failed and manually interrupted releases", () => {
    expect(isResumableReleaseCheckpointStatus("failed")).toBe(true);
    expect(isResumableReleaseCheckpointStatus("interrupted")).toBe(true);
    expect(isResumableReleaseCheckpointStatus("waiting_for_network")).toBe(true);
  });

  it("does not resume terminal or active checkpoints", () => {
    expect(isResumableReleaseCheckpointStatus("completed")).toBe(false);
    expect(isResumableReleaseCheckpointStatus("running")).toBe(false);
    expect(isResumableReleaseCheckpointStatus("unknown")).toBe(false);
  });

  it("keeps a live network wait owned by the current release", () => {
    expect(isActiveReleaseCheckpointStatus("running")).toBe(true);
    expect(isActiveReleaseCheckpointStatus("waiting_for_network")).toBe(true);
    expect(isActiveReleaseCheckpointStatus("failed")).toBe(false);
  });

  it("carries the saved GPT SEO mode into watcher retries", () => {
    expect(resolveReleaseLaunchConfig({ profile: "catalog", seoMode: "gpt", seoScope: "all-products" }, {})).toEqual({
      script: "release:core",
      profile: "catalog",
      seoMode: "gpt",
      seoScope: "all-products",
      provider: "applescript",
      batchSize: 500,
    });
    expect(resolveReleaseLaunchConfig({ profile: "catalog", seoMode: "deterministic" }, { releaseSeoMode: "gpt" }).seoMode).toBe("deterministic");
    expect(resolveReleaseLaunchConfig({}, { releaseSeoMode: "gpt", releaseSeoScope: "new-products" })).toMatchObject({
      seoMode: "gpt",
      seoScope: "new-products",
    });
  });

  it("refreshes cached active-release telemetry on every heartbeat", () => {
    expect(mergeActiveReleaseTelemetry({ releaseStepIndex: 2, releaseTotalSteps: 66 }, {
      pid: 68197,
      status: "running",
      stepIndex: 6,
      totalSteps: 66,
      stepLabel: "Refresh Shopify data",
      heartbeatAt: "2026-09-15T07:23:00.000Z",
      seoMode: "gpt",
      seoScope: "all-products",
    })).toMatchObject({
      activeReleasePid: 68197,
      releaseStatus: "running",
      releaseStepIndex: 6,
      releaseTotalSteps: 66,
      releaseStepLabel: "Refresh Shopify data",
      releaseSeoMode: "gpt",
      releaseSeoScope: "all-products",
      gptSeoProvider: "applescript",
      gptSeoBatchSize: 500,
    });
    expect(mergeActiveReleaseTelemetry({ releaseStepIndex: 2 }, { status: "failed", pid: 68197 })).toEqual({ releaseStepIndex: 2 });
  });

  it("suppresses only the release instance explicitly stopped by the operator", () => {
    expect(isManualStopSuppressed({ pid: 42 }, { manualStopReleasePid: 42 })).toBe(true);
    expect(isManualStopSuppressed({ pid: 43 }, { manualStopReleasePid: 42 })).toBe(false);
    expect(isManualStopSuppressed({ pid: 0 }, { manualStopReleasePid: 42 })).toBe(false);
  });

  it("changes the terminal progress key only when the release or step changes", () => {
    const release = { pid: 42, startedAt: "2026-09-12T10:00:00.000Z", stepIndex: 30, totalSteps: 59, stepLabel: "SEO" };
    expect(releaseProgressLogKey(release)).toBe(releaseProgressLogKey({ ...release, heartbeatAt: "2026-09-12T10:01:00.000Z" }));
    expect(releaseProgressLogKey(release)).not.toBe(releaseProgressLogKey({ ...release, stepIndex: 31 }));
  });

  it("does not kill a live stage child when the parent heartbeat is stale", () => {
    expect(shouldTrustLiveReleaseStage({
      releaseAlive: true,
      stageAlive: true,
      stageStatus: "running",
      heartbeatAgeMs: 18 * 60 * 1000,
      staleMs: 15 * 60 * 1000,
    })).toBe(true);
    expect(shouldTrustLiveReleaseStage({
      releaseAlive: true,
      stageAlive: false,
      stageStatus: "running",
      heartbeatAgeMs: 18 * 60 * 1000,
      staleMs: 15 * 60 * 1000,
    })).toBe(false);
    expect(shouldTrustLiveReleaseStage({
      releaseAlive: true,
      stageAlive: true,
      stageStatus: "completed",
      heartbeatAgeMs: 18 * 60 * 1000,
      staleMs: 15 * 60 * 1000,
    })).toBe(false);
  });

  it("does not reclaim an unreadable lock during its atomic-write window", () => {
    expect(shouldReclaimUnreadableWatcherLock({ lockAgeMs: 5_000, monitorIntervalMs: 30_000 })).toBe(false);
    expect(shouldReclaimUnreadableWatcherLock({ lockAgeMs: 90_000, monitorIntervalMs: 30_000 })).toBe(true);
    expect(shouldReclaimUnreadableWatcherLock({ lockAgeMs: Number.NaN, monitorIntervalMs: 30_000 })).toBe(false);
  });

  it("uses a bounded stale threshold for a duplicate watcher process", () => {
    expect(shouldReclaimUnreadableWatcherLock({ lockAgeMs: 60_000, monitorIntervalMs: 30_000 })).toBe(true);
    expect(shouldReclaimUnreadableWatcherLock({ lockAgeMs: 59_999, monitorIntervalMs: 30_000 })).toBe(false);
  });

  it("treats only the retired public catalog manifest as a recoverable baseline miss", () => {
    expect(isMissingCatalogBaselineError({
      code: "ENOENT",
      path: "/workspace/public/data/products.json",
    })).toBe(true);
    expect(isMissingCatalogBaselineError({
      code: "ENOENT",
      path: "/workspace/public/data/products-0001.json",
    })).toBe(false);
    expect(isMissingCatalogBaselineError({
      code: "EACCES",
      path: "/workspace/public/data/products.json",
    })).toBe(false);
  });

  it("defers repeated monitor checks during guarded backoff", () => {
    expect(shouldDeferWatcherCheck({
      nextRetryAt: new Date(Date.now() + 60_000).toISOString(),
      now: Date.now(),
    })).toBe(true);
    expect(shouldDeferWatcherCheck({
      nextRetryAt: new Date(Date.now() + 60_000).toISOString(),
      now: Date.now(),
      hasActionableRelease: true,
    })).toBe(false);
    expect(shouldDeferWatcherCheck({
      nextRetryAt: new Date(Date.now() + 60_000).toISOString(),
      now: Date.now(),
      scheduledDue: true,
    })).toBe(false);
    expect(shouldDeferWatcherCheck({
      nextRetryAt: new Date(Date.now() - 1).toISOString(),
      now: Date.now(),
    })).toBe(false);
  });

  it("builds deepest-first termination targets for a detached release tree", () => {
    const table = parseProcessTable("100 1\n200 100\n300 200\n400 100\n500 9\n");
    expect(buildProcessTerminationTargets(100, table, 999)).toEqual([300, 400, 200, 100]);
    expect(buildProcessTerminationTargets(999, table, 999)).toEqual([]);
  });
});
