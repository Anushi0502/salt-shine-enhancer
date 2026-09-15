import { describe, expect, it } from "vitest";

import {
  compactReleaseLog,
  paginateReleaseLog,
  formatVisualShardProgress,
  formatVisualTrainingStatus,
  isActiveReleaseState,
  isProcessAlive,
  resolveReleaseStopPid,
  validateStartRequest,
} from "./release-control-ui.mjs";

describe("release control UI start contract", () => {
  it("defaults to the GPT full-catalog run", () => {
    expect(validateStartRequest({}, { hasOpenAiKey: false })).toEqual({
      profile: "catalog",
      seoMode: "gpt",
      seoScope: "all-products",
      resume: false,
    });
  });

  it("keeps the desktop control surface GPT-only", () => {
    expect(() => validateStartRequest({ seoMode: "deterministic" })).toThrow(/Only GPT SEO/);
    expect(validateStartRequest({ seoScope: "new-products", resume: true })).toEqual({
      profile: "catalog",
      seoMode: "gpt",
      seoScope: "new-products",
      resume: true,
    });
  });

  it("routes the legacy daily selector through the unified catalog workflow", () => {
    expect(validateStartRequest({ profile: "daily" })).toEqual({
      profile: "catalog",
      seoMode: "gpt",
      seoScope: "all-products",
      resume: false,
    });
  });

  it("rejects unsupported profiles and modes", () => {
    expect(() => validateStartRequest({ profile: "products" })).toThrow(/profile/);
    expect(() => validateStartRequest({ seoMode: "guess" })).toThrow(/seoMode/);
    expect(() => validateStartRequest({ seoScope: "sample" })).toThrow(/seoScope/);
  });

  it("recognizes the current process without requiring a shell", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    expect(isProcessAlive(0)).toBe(false);
  });

  it("resolves the detached supervisor before the release child", () => {
    expect(resolveReleaseStopPid({
      release: { pid: 81022, status: "running" },
      watcher: { releaseSupervisorPid: 80896, releaseSupervisorReleasePid: 81022 },
    })).toBe(80896);
    expect(resolveReleaseStopPid({ release: { pid: 81022 }, watcher: {} })).toBe(81022);
    expect(isActiveReleaseState({ pid: 81022, status: "running" })).toBe(true);
    expect(isActiveReleaseState({ pid: 81022, status: "completed" })).toBe(false);
  });

  it("compacts unchanged progress only in the operator display", () => {
    const log = [
      "[2026-09-12T10:00:00.000Z] release active; step=30/59 SEO",
      "[2026-09-12T10:01:00.000Z] release active; step=30/59 SEO",
      "[2026-09-12T10:02:00.000Z] release active; step=30/59 SEO",
      "[2026-09-12T10:03:00.000Z] release active; step=31/59 collections",
    ].join("\n");
    const compacted = compactReleaseLog(log);
    expect(compacted).toContain("unchanged progress repeated 3 times");
    expect(compacted).toContain("step=31/59 collections");
    expect(compacted).not.toContain("10:01:00.000Z");
  });

  it("shows only the newest fifteen log messages until earlier history is requested", () => {
    const value = Array.from({ length: 31 }, (_, index) => `message-${index + 1}`).join("\n");
    const latest = paginateReleaseLog(value);
    expect(latest.start).toBe(16);
    expect(latest.visible.split("\n")).toEqual(Array.from({ length: 15 }, (_, index) => `message-${index + 17}`));
    expect(latest.hasEarlier).toBe(true);
    const expanded = paginateReleaseLog(value, 1);
    expect(expanded.visible.startsWith("message-2")).toBe(true);
    expect(expanded.hiddenCount).toBe(1);
  });

  it("keeps the model gate visible in the operator surface", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) => readFile("./scripts/release-control-ui.mjs", "utf8"));
    expect(source).toContain("visualTaxonomyTraining");
    expect(source).toContain("visualTaxonomyShardTraining");
    expect(source).toContain("checkpoint-note");
    expect(source).toContain("Metal model:");
    expect(source).toContain("/api/stop");
    expect(source).toContain("Stop release");
  });

  it("turns stale taxonomy failures into an actionable retrain status", () => {
    expect(formatVisualTrainingStatus({
      status: "failed",
      error: "Command failed\nError: Taxonomy mismatch is not a unique append-only extension; retraining is required.",
    })).toEqual({
      label: "retrain required",
      detail: "Taxonomy mismatch is not a unique append-only extension; retraining is required.",
    });
    expect(formatVisualTrainingStatus({ status: "verified" })).toEqual({ label: "verified", detail: "" });
  });

  it("shows shard progress while the model gate is working", () => {
    expect(formatVisualShardProgress({
      phase: "adapter-training",
      currentShard: "3",
      currentProgress: { completedImages: 240, totalImages: 600 },
    })).toBe("Shard 3 - adapter-training - 240/600 images");
    expect(formatVisualShardProgress({
      phase: "adapter-training",
      currentShard: "1",
      currentProgress: { steps: 1925, totalSteps: 4442, completedImages: 30800, totalImages: 71070 },
    })).toBe("Shard 1 - adapter-training - 1925/4442 steps - 30800/71070 entries");
    expect(formatVisualShardProgress({
      phase: "embedding-encoding",
      currentShard: "1",
      shardCount: 9,
      adapterShards: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [String(index + 1), { status: "purged" }])),
      currentProgress: { recordsWritten: 10272, totalRecords: 71070 },
    })).toBe("Embedding pass - shard 1/9 - 10272/71070 images - adapter training 9/9 complete");
    expect(formatVisualShardProgress({ phase: "complete" })).toContain("All visual shards complete");
  });
});
