import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

describe("candidate training supervisor contract", () => {
  it("keeps the source target and no-guess handoff explicit", async () => {
    const source = await readFile(resolve(process.cwd(), "scripts", "supervise-visual-taxonomy-candidate-training.mjs"), "utf8");
    expect(source).toContain("50_000_000_000");
    expect(source).toContain("SALT_VISUAL_ALLOW_CANDIDATE_LABELS");
    expect(source).toContain("source exhausted below 50 GB");
  });
});
