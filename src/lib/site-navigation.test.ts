import { describe, expect, it } from "vitest";
import { resolveCollectionFeedHandle } from "@/lib/site-navigation";

describe("resolveCollectionFeedHandle", () => {
  it("uses the parent collection feed when there is no subcollection override", () => {
    expect(resolveCollectionFeedHandle("senior-living-solutions")).toBe("books");
  });

  it("prefers the subcollection feed handle when one exists", () => {
    expect(resolveCollectionFeedHandle("senior-living-solutions", "gifts-for-seniors")).toBe("gifts");
  });

  it("falls back to the parent collection feed when the subcollection is not mapped", () => {
    expect(resolveCollectionFeedHandle("home-kitchen", "kitchen-gadgets")).toBe("cookware");
  });
});
