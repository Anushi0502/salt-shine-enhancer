import { describe, expect, it } from "vitest";

import {
  applyCollectionReorderMoves,
  buildCollectionReorderMoves,
  shuffleCollectionProductIds,
} from "@/lib/shopify-collection-shuffle.js";

describe("manual collection shuffle", () => {
  it("is deterministic per collection seed and changes with the seed", () => {
    const ids = ["1", "2", "3", "4", "5"];
    expect(shuffleCollectionProductIds(ids, "2026-08-14:collection")).toEqual(
      shuffleCollectionProductIds(ids, "2026-08-14:collection"),
    );
    expect(shuffleCollectionProductIds(ids, "2026-08-14:collection")).not.toEqual(
      shuffleCollectionProductIds(ids, "2026-08-15:collection"),
    );
  });

  it("creates sequential moves that exactly produce the target order", () => {
    const current = ["a", "b", "c", "d"];
    const desired = ["c", "a", "d", "b"];
    const moves = buildCollectionReorderMoves(current, desired);
    expect(applyCollectionReorderMoves(current, moves)).toEqual(desired);
  });

  it("caps each mutation batch at Shopify's move limit", () => {
    const current = Array.from({ length: 300 }, (_, index) => String(index));
    const desired = [...current].reverse();
    expect(buildCollectionReorderMoves(current, desired, 250)).toHaveLength(250);
  });
});
