import { describe, expect, it } from "vitest";
import {
  SITE_COLLECTIONS,
  SITE_HEADER_COLLECTION_LINKS,
  buildSubcollectionRoute,
  isSiteHeaderCollectionLinkActive,
  resolveCollectionFeedHandle,
} from "@/lib/site-navigation";

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

  it("builds a Shopify-safe collection URL for subcollections", () => {
    expect(buildSubcollectionRoute("senior-living-solutions", "gifts-for-seniors")).toBe(
      "/collections/senior-living-solutions?collection=gifts",
    );
  });

  it("keeps Senior Living Solutions below Travel & Outdoor in the collection order", () => {
    const travelIndex = SITE_COLLECTIONS.findIndex((collection) => collection.title === "Travel & Outdoor");
    const seniorLivingIndex = SITE_COLLECTIONS.findIndex(
      (collection) => collection.title === "Senior Living Solutions",
    );

    expect(travelIndex).toBeGreaterThanOrEqual(0);
    expect(seniorLivingIndex).toBeGreaterThan(travelIndex);
  });

  it("exposes the featured header shortcuts in the requested order", () => {
    expect(SITE_HEADER_COLLECTION_LINKS.map((link) => link.label)).toEqual([
      "Best Sellers",
      "New Arrivals",
      "Today's Deals",
      "Trending Now",
      "Weekend Sale",
    ]);
  });

  it("points the featured header shortcuts at live collection routes", () => {
    expect(SITE_HEADER_COLLECTION_LINKS.map((link) => link.to)).toEqual([
      "/collections/trending-finds?collection=appplaza-best-sellers",
      "/collections/trending-finds?collection=new-arrivals",
      "/collections/deals-sale?collection=deals-sale",
      "/collections/trending-finds?collection=unique-products",
      "/collections/deals-sale?collection=under-35&promo=weekend-sale",
    ]);
  });

  it("marks the featured header shortcuts active for their collection feeds", () => {
    expect(
      isSiteHeaderCollectionLinkActive(
        "/collections/trending-finds",
        "?collection=appplaza-best-sellers",
        SITE_HEADER_COLLECTION_LINKS[0],
      ),
    ).toBe(true);
    expect(
      isSiteHeaderCollectionLinkActive("/collections/deals-sale", "?collection=under-35", SITE_HEADER_COLLECTION_LINKS[4]),
    ).toBe(true);
    expect(
      isSiteHeaderCollectionLinkActive(
        "/collections/trending-finds",
        "?collection=new-arrivals",
        SITE_HEADER_COLLECTION_LINKS[0],
      ),
    ).toBe(false);
  });
});
