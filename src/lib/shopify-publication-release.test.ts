import { describe, expect, it } from "vitest";

import {
  planProductPublication,
  verifyProductPublicationReadback,
} from "@/lib/shopify-publication-release.js";

describe("all-channel product publication", () => {
  const publications = [
    { id: "gid://shopify/Publication/1", name: "Online Store" },
    { id: "gid://shopify/Publication/2", name: "Shop" },
  ];

  it("plans every unpublished channel for an active regular product", () => {
    const plan = planProductPublication(
      {
        id: "gid://shopify/Product/1",
        handle: "test-product",
        title: "Test Product",
        status: "ACTIVE",
        unpublishedPublications: { nodes: [publications[1]] },
      },
      publications,
    );

    expect(plan.publicationIds).toEqual(["gid://shopify/Publication/2"]);
    expect(plan.subscriptionExcludedIds).toEqual([]);
  });

  it("keeps subscription-only products constrained to Online Store", () => {
    const plan = planProductPublication(
      {
        id: "gid://shopify/Product/2",
        status: "ACTIVE",
        requiresSellingPlan: true,
        unpublishedPublications: { nodes: publications },
      },
      publications,
    );

    expect(plan.publicationIds).toEqual(["gid://shopify/Publication/1"]);
    expect(plan.subscriptionExcludedIds).toEqual(["gid://shopify/Publication/2"]);
  });

  it("still verifies a subscription-only product is not already exposed on another channel", () => {
    const plan = planProductPublication(
      {
        id: "gid://shopify/Product/3",
        status: "ACTIVE",
        requiresSellingPlan: true,
        unpublishedPublications: { nodes: [publications[0]] },
      },
      publications,
    );

    expect(plan.publicationIds).toEqual(["gid://shopify/Publication/1"]);
    expect(plan.subscriptionExcludedIds).toEqual(["gid://shopify/Publication/2"]);
    expect(verifyProductPublicationReadback(
      { unpublishedPublications: { nodes: [publications[0]] } },
      plan.publicationIds,
      plan.subscriptionExcludedIds,
    )).toEqual({
      ok: false,
      missing: ["gid://shopify/Publication/1"],
      unexpectedPublished: ["gid://shopify/Publication/2"],
    });
  });

  it("requires published targets and retains Shopify-required exclusions", () => {
    const verification = verifyProductPublicationReadback(
      { unpublishedPublications: { nodes: [{ id: "gid://shopify/Publication/2", name: "Shop" }] } },
      ["gid://shopify/Publication/1"],
      ["gid://shopify/Publication/2"],
    );

    expect(verification).toEqual({ ok: true, missing: [], unexpectedPublished: [] });
  });
});
