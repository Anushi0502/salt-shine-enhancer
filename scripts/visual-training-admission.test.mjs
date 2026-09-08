import { describe, expect, it } from "vitest";

import { evaluateVisualTrainingAdmission } from "./visual-training-admission.mjs";

describe("visual training admission", () => {
  it("does not start while a release is active or inputs are missing", () => {
    expect(evaluateVisualTrainingAdmission({ releaseActive: true, configExists: true }).status).toBe("deferred");
    expect(evaluateVisualTrainingAdmission({ configExists: false }).status).toBe("blocked");
  });

  it("can admit bounded training alongside a release only when explicitly enabled", () => {
    const result = evaluateVisualTrainingAdmission({
      releaseActive: true,
      allowDuringRelease: true,
      configExists: true,
      availableBytes: 40_000_000_000,
    });
    expect(result.shouldStart).toBe(true);
    expect(result.status).toBe("admitted-parallel");
  });

  it("requires 25 GB shard headroom before admission", () => {
    const result = evaluateVisualTrainingAdmission({ configExists: true, availableBytes: 15_000_000_000 });
    expect(result.shouldStart).toBe(false);
    expect(result.status).toBe("blocked");
  });

  it("admits one worker only when storage is sufficient", () => {
    expect(evaluateVisualTrainingAdmission({ configExists: true, availableBytes: 40_000_000_000 }).shouldStart).toBe(true);
    expect(evaluateVisualTrainingAdmission({ configExists: true, trainingActive: true, availableBytes: 40_000_000_000 }).status).toBe("running");
  });

  it("supports a smaller configured shard without weakening its headroom floor", () => {
    const result = evaluateVisualTrainingAdmission({
      configExists: true,
      availableBytes: 27_000_000_000,
      maxShardBytes: 16_000_000_000,
      requiredFreeBytes: 26_000_000_000,
    });
    expect(result.shouldStart).toBe(true);
    expect(result.requiredFreeBytes).toBe(26_000_000_000);
  });

  it("admits resumable head training without requiring another raw shard", () => {
    const result = evaluateVisualTrainingAdmission({
      configExists: true,
      availableBytes: 11_000_000_000,
      requiredFreeBytes: 14_500_000_000,
      maxShardBytes: 6_000_000_000,
      headOnlyReady: true,
    });
    expect(result.shouldStart).toBe(true);
    expect(result.requiredFreeBytes).toBe(8_000_000_000);
  });

  it("does not admit resumable head training below its own safety floor", () => {
    const result = evaluateVisualTrainingAdmission({
      configExists: true,
      availableBytes: 7_500_000_000,
      headOnlyReady: true,
    });
    expect(result.shouldStart).toBe(false);
    expect(result.reason).toContain("resumable head training");
  });
});
