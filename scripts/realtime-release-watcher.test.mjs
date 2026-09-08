// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  isResumableReleaseCheckpointStatus,
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
});
