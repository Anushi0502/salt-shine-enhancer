import { describe, expect, it } from "vitest";
import { getEditorialPageContent } from "@/lib/editorial-pages";
import { RESOURCE_HUB_GUIDES, RESOURCE_HUB_HUB_FEATURED_PRODUCTS } from "@/lib/resource-hub-data";
import {
  buildResourceRoute,
  buildResourceTopicRoute,
  getResourceByHandle,
  getResourceTopicByHandle,
} from "@/lib/site-navigation";
function expectValidFeaturedHandle(handle: string) {
  expect(handle).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  expect(handle.length).toBeGreaterThan(4);
}

describe("resource hub content", () => {
  it("keeps the expected hub hierarchy and route helpers in sync", () => {
    expect(RESOURCE_HUB_GUIDES).toHaveLength(7);
    expect(RESOURCE_HUB_GUIDES.flatMap((guide) => guide.topics)).toHaveLength(27);

    const guide = getResourceByHandle("senior-living-guides");
    expect(guide?.title).toBe("Senior Living Guides");

    const topic = getResourceTopicByHandle("senior-living-guides", "home-safety-tips");
    expect(topic?.title).toBe("Home Safety Tips");
    expect(buildResourceRoute("senior-living-guides")).toBe(
      "/shop?resource=guide&handle=senior-living-guides",
    );
    expect(buildResourceTopicRoute("senior-living-guides", "home-safety-tips")).toBe(
      "/shop?resource=guide&handle=senior-living-guides%2Fhome-safety-tips",
    );
  });

  it("keeps every featured resource product as a valid live Shopify handle", () => {
    expect(RESOURCE_HUB_HUB_FEATURED_PRODUCTS).toHaveLength(3);

    for (const product of RESOURCE_HUB_HUB_FEATURED_PRODUCTS) {
      expectValidFeaturedHandle(product.handle);
    }

    for (const guide of RESOURCE_HUB_GUIDES) {
      for (const product of guide.featuredProducts) {
        expectValidFeaturedHandle(product.handle);
      }

      for (const topic of guide.topics) {
        for (const product of topic.featuredProducts) {
          expectValidFeaturedHandle(product.handle);
        }
      }
    }
  });

  it("scopes topic FAQs to the parent category", () => {
    const page = getEditorialPageContent("senior-living-guides/home-safety-tips");

    expect(page?.faqs?.length).toBeGreaterThan(0);
    expect(page?.faqs?.every((faq) => !faq.question.includes("Home Safety Tips"))).toBe(true);
    expect(page?.faqs?.some((faq) => faq.question.includes("Senior Living Guides"))).toBe(true);
  });
});
