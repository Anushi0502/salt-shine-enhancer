import { describe, expect, it } from "vitest";

import { determineHydrationStatus } from "./hydrate-visual-taxonomy-catalog-candidate-manifest.mjs";

describe("candidate visual hydration status", () => {
  it("is ready only after the signed byte target is reached", () => {
    expect(determineHydrationStatus({ completed: 10, sourceCount: 100, totalBytes: 50, targetBytes: 50 })).toBe("ready");
  });

  it("records source exhaustion when all source records are fetched below target", () => {
    expect(determineHydrationStatus({ completed: 100, sourceCount: 100, totalBytes: 49, targetBytes: 50 })).toBe("source-exhausted");
  });

  it("keeps an active source pass incomplete", () => {
    expect(determineHydrationStatus({ completed: 10, sourceCount: 100, totalBytes: 49, targetBytes: 50 })).toBe("incomplete");
  });
});
