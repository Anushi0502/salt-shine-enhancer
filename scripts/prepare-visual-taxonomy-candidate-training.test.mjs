import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { resolveCandidateBaseCheckpoint } from "./prepare-visual-taxonomy-candidate-training.mjs";

describe("candidate visual model selection", () => {
  it("honors an explicit candidate checkpoint override", () => {
    const home = mkdtempSync(join(tmpdir(), "salt-candidate-health-"));
    const checkpoint = join(home, "candidate.checkpoint.json");
    const health = join(home, "candidate.health.json");
    mkdirSync(join(home, "model"));
    writeFileSync(checkpoint, JSON.stringify({ kind: "salt-visual-base-checkpoint", modelFingerprint: "fp", modelPath: join(home, "model") }));
    writeFileSync(health, JSON.stringify({ kind: "salt-visual-candidate-health", status: "passed", checkpointPath: checkpoint, modelFingerprint: "fp", runtime: { device: "metal", embeddingDimensions: 1024 } }));
    expect(resolveCandidateBaseCheckpoint({ SALT_VISUAL_CANDIDATE_BASE_CHECKPOINT: checkpoint, SALT_VISUAL_CANDIDATE_HEALTH_PATH: health }, home))
      .toBe(checkpoint);
    rmSync(home, { recursive: true, force: true });
  });

  it("keeps the production base as fallback when the candidate is unavailable", () => {
    expect(resolveCandidateBaseCheckpoint({}, "/tmp/nonexistent-salt-home"))
      .toBe("/tmp/nonexistent-salt-home/.cache/salt-visual-taxonomy/siglip-base.checkpoint.json");
  });

  it("rejects a candidate whose runtime health record is failed or stale", () => {
    const home = mkdtempSync(join(tmpdir(), "salt-candidate-unhealthy-"));
    const checkpoint = join(home, "candidate.checkpoint.json");
    const health = join(home, "candidate.health.json");
    mkdirSync(join(home, "model"));
    writeFileSync(checkpoint, JSON.stringify({ kind: "salt-visual-base-checkpoint", modelFingerprint: "new", modelPath: join(home, "model") }));
    writeFileSync(health, JSON.stringify({ kind: "salt-visual-candidate-health", status: "failed", checkpointPath: checkpoint, modelFingerprint: "old", runtime: { device: "metal", embeddingDimensions: 1024 } }));
    expect(resolveCandidateBaseCheckpoint({ SALT_VISUAL_CANDIDATE_BASE_CHECKPOINT: checkpoint, SALT_VISUAL_CANDIDATE_HEALTH_PATH: health }, home))
      .toBe(join(home, ".cache", "salt-visual-taxonomy", "siglip-base.checkpoint.json"));
    rmSync(home, { recursive: true, force: true });
  });
});
