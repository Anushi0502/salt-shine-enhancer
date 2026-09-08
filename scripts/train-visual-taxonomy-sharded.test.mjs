import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadState, saveState } from "./train-visual-taxonomy-sharded.mjs";

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
});
