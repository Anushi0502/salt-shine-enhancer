// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  isMissingCatalogBaselineError,
  isResumableReleaseCheckpointStatus,
  shouldDeferWatcherCheck,
  shouldReclaimUnreadableWatcherLock,
} from "./realtime-release-watcher.mjs";

describe("realtime release watcher checkpoint policy", () => {
  it("resumes both failed and manually interrupted releases", () => {
    expect(isResumableReleaseCheckpointStatus("failed")).toBe(true);
    expect(isResumableReleaseCheckpointStatus("interrupted")).toBe(true);
  });

  it("does not resume terminal or active checkpoints", () => {
    expect(isResumableReleaseCheckpointStatus("completed")).toBe(false);
    expect(isResumableReleaseCheckpointStatus("running")).toBe(false);
    expect(isResumableReleaseCheckpointStatus("unknown")).toBe(false);
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
});
