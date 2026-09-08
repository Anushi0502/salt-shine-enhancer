import { describe, expect, it } from "vitest";

import {
  buildStaleMembershipPulsePlans,
  filterMembershipToActiveProducts,
} from "./shopify-catalog-integrity.mjs";

describe("active collection membership scope", () => {
  it("ignores archived or draft product IDs for active-catalog conformance", () => {
    const members = new Set(["active-1", "inactive-1", "draft-1"]);
    const active = new Set(["active-1"]);

    expect(filterMembershipToActiveProducts(members, active)).toEqual(new Set(["active-1"]));
  });
});

describe("stale collection membership repair planning", () => {
  it("plans a pulse only for an extra member missing the canonical tag", () => {
    const plans = buildStaleMembershipPulsePlans({
      verification: {
        failedCollectionHandles: ["classification-fallback"],
      },
      targets: [{
        policy: { handle: "classification-fallback", kind: "semantic", tag: "classification-fallback" },
        readback: { extraProductIds: ["gid://shopify/Product/8113431543907"] },
      }],
      tagTasks: [{
        productId: "gid://shopify/Product/8113431543907",
        handle: "womens-classic-polo-shirt-short-sleeve-polo-shirt-with-button-placket-and-slim-fit",
        desiredTags: ["new-arrivals", "women", "womens-fashion"],
      }],
    });

    expect(plans).toEqual([expect.objectContaining({
      collectionHandle: "classification-fallback",
      productId: "gid://shopify/Product/8113431543907",
      pulseTag: "classification-fallback",
      finalTags: ["new-arrivals", "women", "womens-fashion"],
    })]);
  });

  it("does not pulse products that already have the canonical tag", () => {
    const plans = buildStaleMembershipPulsePlans({
      verification: { failedCollectionHandles: ["classification-fallback"] },
      targets: [{
        policy: { handle: "classification-fallback", kind: "semantic", tag: "classification-fallback" },
        readback: { extraProductIds: ["p-1"] },
      }],
      tagTasks: [{
        productId: "p-1",
        handle: "already-tagged",
        desiredTags: ["classification-fallback"],
      }],
    });

    expect(plans).toEqual([]);
  });

  it("caps the repair cohort", () => {
    const plans = buildStaleMembershipPulsePlans({
      verification: { failedCollectionHandles: ["classification-fallback"] },
      targets: [{
        policy: { handle: "classification-fallback", kind: "semantic", tag: "classification-fallback" },
        readback: { extraProductIds: ["p-1", "p-2"] },
      }],
      tagTasks: [
        { productId: "p-1", handle: "one", desiredTags: ["one"] },
        { productId: "p-2", handle: "two", desiredTags: ["two"] },
      ],
      maxProducts: 1,
    });

    expect(plans).toHaveLength(1);
  });
});
