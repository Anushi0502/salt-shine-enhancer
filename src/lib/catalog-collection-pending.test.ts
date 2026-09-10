import { describe, expect, it } from "vitest";

import { manifestPendingCreationHandles } from "./catalog-collection-pending.js";

describe("manifestPendingCreationHandles", () => {
  it("accepts only create targets from the current collection-plan version", () => {
    const handles = manifestPendingCreationHandles(
      {
        releaseVersion: "plan.8",
        collectionTargets: [
          { action: "create", entry: { handle: "Footwear" } },
          { action: "rebuild", entry: { handle: "wigs" }, existing: { id: "1" } },
          { action: "create", entry: { handle: "rings" }, existing: { id: "2" } },
          { action: "create", entry: {} },
        ],
      },
      "plan.8",
    );

    expect([...handles]).toEqual(["footwear"]);
  });

  it("rejects a stale or missing manifest version", () => {
    expect(
      manifestPendingCreationHandles(
        { releaseVersion: "plan.7", collectionTargets: [{ action: "create", entry: { handle: "rings" } }] },
        "plan.8",
      ).size,
    ).toBe(0);
    expect(manifestPendingCreationHandles(null, "plan.8").size).toBe(0);
  });
});
