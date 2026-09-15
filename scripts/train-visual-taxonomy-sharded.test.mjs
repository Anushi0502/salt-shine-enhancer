import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildFullManifest,
  canonicalShardPlanFingerprint,
  isCandidateTrainingEnabled,
  loadState,
  saveState,
} from "./train-visual-taxonomy-sharded.mjs";

const plan = {
  sourceManifestSha256: "s".repeat(64),
  targetBytes: 50_000_000_000,
  maxShardBytes: 6_000_000_000,
};
const planSha256 = "p".repeat(64);

function state(phase, updatedAt) {
  return {
    kind: "salt-visual-taxonomy-shard-training-state",
    version: 1,
    planSha256,
    sourceManifestSha256: plan.sourceManifestSha256,
    targetBytes: plan.targetBytes,
    maxShardBytes: plan.maxShardBytes,
    phase,
    adapterShards: {},
    embeddingShards: {},
    updatedAt,
  };
}

describe("sharded visual training state", () => {
  it("derives candidate staging mode only from the explicit candidate environment flag", () => {
    expect(isCandidateTrainingEnabled({ SALT_VISUAL_ALLOW_CANDIDATE_LABELS: "1" })).toBe(true);
    expect(isCandidateTrainingEnabled({ SALT_VISUAL_ALLOW_CANDIDATE_LABELS: "0" })).toBe(false);
    expect(isCandidateTrainingEnabled({})).toBe(false);
  });

  it("accepts an explicitly recorded candidate exclusion without weakening the target gate", () => {
    const previous = process.env.SALT_VISUAL_ALLOW_CANDIDATE_LABELS;
    process.env.SALT_VISUAL_ALLOW_CANDIDATE_LABELS = "1";
    try {
      const manifest = buildFullManifest([
        { entries: [
          { image: "images/one.webp", imageSha256: "a".repeat(64), bytes: 100, productId: "1", ruleId: "hats-caps", split: "train" },
          { image: "images/two.webp", imageSha256: "c".repeat(64), bytes: 100, productId: "3", ruleId: "home-furniture", split: "train" },
        ] },
      ], { bytes: 210, targetBytes: 200 }, [
        { sha256: "b".repeat(64), bytes: 10, productId: "2", ruleId: "hats-caps", status: 404 },
      ]);
      expect(manifest).toMatchObject({ bytes: 200, plannedBytes: 210, excludedImageCount: 1, excludedBytes: 10 });
    } finally {
      if (previous === undefined) delete process.env.SALT_VISUAL_ALLOW_CANDIDATE_LABELS;
      else process.env.SALT_VISUAL_ALLOW_CANDIDATE_LABELS = previous;
    }
  });

  it("counts only explicit candidate quarantine bytes toward signed target coverage", () => {
    const previous = process.env.SALT_VISUAL_ALLOW_CANDIDATE_LABELS;
    process.env.SALT_VISUAL_ALLOW_CANDIDATE_LABELS = "1";
    try {
      const manifest = buildFullManifest([
        { entries: [
          { image: "images/one.webp", imageSha256: "a".repeat(64), bytes: 95, productId: "1", ruleId: "hats-caps", split: "train" },
          { image: "images/two.webp", imageSha256: "c".repeat(64), bytes: 95, productId: "2", ruleId: "home-furniture", split: "train" },
        ] },
      ], { bytes: 210, targetBytes: 200 }, [
        { sha256: "b".repeat(64), bytes: 20, productId: "3", ruleId: "hats-caps", status: 404 },
      ]);
      expect(manifest).toMatchObject({ bytes: 190, plannedBytes: 210, excludedImageCount: 1, excludedBytes: 20 });
    } finally {
      if (previous === undefined) delete process.env.SALT_VISUAL_ALLOW_CANDIDATE_LABELS;
      else process.env.SALT_VISUAL_ALLOW_CANDIDATE_LABELS = previous;
    }
  });

  it("accounts for candidate-only source drift with explicit checksum evidence", () => {
    const previous = process.env.SALT_VISUAL_ALLOW_CANDIDATE_LABELS;
    process.env.SALT_VISUAL_ALLOW_CANDIDATE_LABELS = "1";
    try {
      const manifest = buildFullManifest([
        { entries: [
          { image: "images/one.webp", imageSha256: "a".repeat(64), bytes: 90, productId: "1", ruleId: "hats-caps", split: "train" },
          { image: "images/two.webp", imageSha256: "c".repeat(64), bytes: 10, productId: "2", ruleId: "home-furniture", split: "train" },
        ] },
      ], { bytes: 110, targetBytes: 100 }, [], [{
        originalSha256: "b".repeat(64),
        originalBytes: 100,
        actualSha256: "a".repeat(64),
        actualBytes: 90,
        target: "images/one.webp",
      }]);
      expect(manifest).toMatchObject({ bytes: 100, plannedBytes: 100, sourceDriftCount: 1, sourceDriftDeltaBytes: -10 });
    } finally {
      if (previous === undefined) delete process.env.SALT_VISUAL_ALLOW_CANDIDATE_LABELS;
      else process.env.SALT_VISUAL_ALLOW_CANDIDATE_LABELS = previous;
    }
  });

  it("prefers the newest local checkpoint and mirrors saves for the watcher", async () => {
    const directory = await mkdtemp(join(tmpdir(), "salt-visual-state-test-"));
    try {
      const remotePath = join(directory, "output", "state.json");
      const localPath = join(directory, "cache", "state.json");
      const stale = state("adapter", "2026-08-31T10:00:00.000Z");
      const fresh = state("head-training", "2026-08-31T11:00:00.000Z");
      await mkdir(join(directory, "output"), { recursive: true });
      await mkdir(join(directory, "cache"), { recursive: true });
      await writeFile(remotePath, `${JSON.stringify(stale)}\n`, "utf8");
      await writeFile(localPath, `${JSON.stringify(fresh)}\n`, "utf8");

      await expect(loadState(remotePath, planSha256, plan, localPath)).resolves.toMatchObject({
        phase: "head-training",
      });

      await saveState(remotePath, fresh, { phase: "complete" }, localPath);
      const mirrored = JSON.parse(await readFile(remotePath, "utf8"));
      const local = JSON.parse(await readFile(localPath, "utf8"));
      expect(mirrored.phase).toBe("complete");
      expect(local.phase).toBe("complete");
      expect(mirrored.planSha256).toBe(planSha256);
      expect(local.planSha256).toBe(planSha256);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps the shard fingerprint stable when only plan generation time changes", () => {
    const basePlan = {
      kind: "salt-visual-taxonomy-shard-plan",
      version: 1,
      generatedAt: "2026-09-13T10:00:00.000Z",
      sourceManifest: "/cache/source.jsonl",
      sourceManifestSha256: "s".repeat(64),
      targetBytes: 50_000_000_000,
      maxShardBytes: 6_000_000_000,
      bytes: 50_000_000_000,
      imageCount: 10,
      shardCount: 2,
      labelIndex: [{ index: 0, ruleId: "hats-caps" }],
      status: "planned",
      shards: [{ shardIndex: 1, shardName: "shard-001", bytes: 25_000_000_000, imageCount: 5, sourceManifest: "/cache/1", datasetDir: "/tmp/1", labelsOutput: "/tmp/1.labels" }],
    };
    expect(canonicalShardPlanFingerprint(basePlan)).toBe(canonicalShardPlanFingerprint({
      ...basePlan,
      generatedAt: "2026-09-13T11:00:00.000Z",
      status: "refreshing",
    }));
  });

  it("accepts a legacy checkpoint when its signed source inputs still match", async () => {
    const directory = await mkdtemp(join(tmpdir(), "salt-visual-legacy-state-test-"));
    try {
      const remotePath = join(directory, "output", "state.json");
      const planWithIdentity = { ...plan, sourceManifestSha256: "s".repeat(64) };
      const legacy = { ...state("adapter", "2026-08-31T10:00:00.000Z"), sourceManifestSha256: planWithIdentity.sourceManifestSha256, targetBytes: planWithIdentity.targetBytes, maxShardBytes: planWithIdentity.maxShardBytes };
      await mkdir(join(directory, "output"), { recursive: true });
      await writeFile(remotePath, `${JSON.stringify(legacy)}\n`, "utf8");
      await expect(loadState(remotePath, "n".repeat(64), planWithIdentity, "", "l".repeat(64))).resolves.toMatchObject({
        phase: "adapter",
        planSha256: "n".repeat(64),
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
