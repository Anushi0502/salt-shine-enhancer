import { describe, expect, it } from "vitest";

import {
  compactReleaseLog,
  paginateReleaseLog,
  formatVisualShardProgress,
  formatGptSeoProgress,
  mergeOperationalLogs,
  buildReleaseActivity,
  formatVisualTrainingStatus,
  isActiveReleaseState,
  isResumableReleaseCheckpoint,
  applyResumeCheckpointSelection,
  isProcessAlive,
  resolveReleaseStopPid,
  summarizeReleaseError,
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

  it("allows GPT and normal SEO modes", () => {
    expect(validateStartRequest({ seoMode: "deterministic" })).toEqual({
      profile: "catalog",
      seoMode: "deterministic",
      seoScope: "all-products",
      resume: false,
    });
    expect(validateStartRequest({ seoScope: "new-products", resume: true })).toEqual({
      profile: "catalog",
      seoMode: "gpt",
      seoScope: "new-products",
      resume: true,
    });
  });

  it("preserves the saved mode, scope, and step on resume", () => {
    const request = applyResumeCheckpointSelection(validateStartRequest({
      seoMode: "deterministic",
      seoScope: "new-products",
      resume: true,
    }), {
      status: "interrupted",
      stepIndex: 5,
      seoMode: "gpt",
      seoScope: "all-products",
    });
    expect(request).toMatchObject({ seoMode: "gpt", seoScope: "all-products", resumeFromStep: 5 });
    expect(isResumableReleaseCheckpoint({ status: "interrupted", stepIndex: 5 })).toBe(true);
    expect(isResumableReleaseCheckpoint({ status: "completed", stepIndex: 5 })).toBe(false);
  });

  it("preserves an explicit bounded repair step over the saved checkpoint", () => {
    const request = applyResumeCheckpointSelection(validateStartRequest({
      seoMode: "gpt",
      seoScope: "all-products",
      resume: true,
      resumeFromStep: 24,
    }), {
      status: "interrupted",
      stepIndex: 36,
      seoMode: "gpt",
      seoScope: "all-products",
    });
    expect(request).toMatchObject({ resume: true, resumeFromStep: 24 });
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

  it("uses the live checkpoint for the operator activity summary", () => {
    expect(buildReleaseActivity({
      status: "failed",
      stepIndex: 25,
      totalSteps: 66,
      stepLabel: "Apply exact full-catalog collection reconciliation",
      heartbeatAt: "2026-09-15T08:39:47.145Z",
      error: "Release stopped at step 25/66 with exit code 1.",
    })).toEqual({
      status: "failed",
      step: "25/66",
      activity: "Apply exact full-catalog collection reconciliation",
      heartbeatAt: "2026-09-15T08:39:47.145Z",
      error: "Release stopped at step 25/66 with exit code 1.",
    });
    expect(buildReleaseActivity({ status: "running", stepIndex: 4, totalSteps: 66 }, { processActive: false }).status).toBe("stale");
  });

  it("keeps the visible failure reason short", () => {
    expect(summarizeReleaseError({ error: "first line\nCatalog integrity verification failed: 1,156 issues remain" })).toBe("Catalog integrity verification failed: 1,156 issues remain");
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
    const appleScript = await import("node:fs/promises").then(({ readFile }) => readFile("./scripts/gpt-seo-applescript.applescript", "utf8"));
    expect(appleScript).toContain('tell application "SALT Release Control" to activate');
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
    expect(formatVisualTrainingStatus({
      status: "verified",
      lifecycle: { mode: "frozen-final", retrainPolicy: "manual-only" },
    })).toEqual({
      label: "frozen final",
      detail: "Visual model is finalized; automatic retraining is disabled.",
    });
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

  it("shows the live GPT batch checkpoint instead of a stale step-only status", () => {
    expect(formatGptSeoProgress({
      total: 17747,
      message: "GPT SEO batch 3/36 - waiting for ChatGPT response; 1,000/17,747 processed; 997 accepted; 3 queued for retry.",
    })).toContain("batch 3/36");
    expect(formatGptSeoProgress({})).toBe("");
  });

  it("keeps the newest release child output when the watcher tail is large", () => {
    const releaseLog = "[watcher] heartbeat\n[release] GPT SEO batch 5/36 - waiting for ChatGPT response";
    const watcherLog = Array.from({ length: 200 }, (_, index) => `[watcher] heartbeat ${index}`).join("\n");
    const merged = mergeOperationalLogs(releaseLog, watcherLog, "[release-state] running; step=35/66", "", 5000);
    expect(merged).toContain("[release] GPT SEO batch 5/36");
    expect(merged).not.toContain("[watcher-daemon tail]");
  });
});
