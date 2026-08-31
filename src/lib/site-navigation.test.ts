import { describe, expect, it } from "vitest";
import {
  SITE_COLLECTIONS,
  SITE_HEADER_COLLECTION_LINKS,
  buildSubcollectionRoute,
  getCollectionRoutePaths,
  isSiteHeaderCollectionLinkActive,
  resolveCollectionFeedHandle,
  resolveCollectionRouteHandle,
  resolveCollectionShopifyHandle,
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

  it("resolves legacy and virtual collection handles to live Shopify feeds", () => {
    expect(resolveCollectionShopifyHandle("best-sellers")).toBe("best-sellers");
    expect(resolveCollectionShopifyHandle("new-arrivals")).toBe("new-arrivals");
    expect(resolveCollectionShopifyHandle("under-50")).toBe("under-50");
    expect(resolveCollectionShopifyHandle("trending-finds")).toBe("trending-finds");
    expect(resolveCollectionShopifyHandle("appplaza-best-sellers")).toBe("best-sellers");
    expect(resolveCollectionShopifyHandle("unique-products")).toBe("trending-finds");
    expect(resolveCollectionShopifyHandle("under-25")).toBe("under-50");
    expect(resolveCollectionShopifyHandle("winter-wear")).toBe("under-50");
    expect(resolveCollectionShopifyHandle("clearance-archive")).toBe("under-50");
  });

  it("canonicalizes nested legacy and virtual feeds without changing their routes", () => {
    expect(resolveCollectionFeedHandle("unique-products", "appplaza-best-sellers")).toBe("best-sellers");
    expect(resolveCollectionFeedHandle("trending-finds", "best-sellers")).toBe("best-sellers");
    expect(resolveCollectionFeedHandle("trending-finds", "under-25")).toBe("under-50");
  });

  it("builds a Shopify-safe collection URL for subcollections", () => {
    expect(buildSubcollectionRoute("senior-living-solutions", "gifts-for-seniors")).toBe(
      "/collections/senior-living-solutions?collection=gifts",
    );
  });

  it("normalizes the legacy winter-wear handle to the live sale route", () => {
    expect(resolveCollectionRouteHandle("winter-wear")).toBe("under-50");
    expect(getCollectionRoutePaths("winter-wear")).toEqual([
      "/collections/winter-wear",
      "/collections/under-50",
    ]);
  });

  it("smart-merges overlapping legacy collection handles onto their canonical routes", () => {
    expect(resolveCollectionRouteHandle("cooking-essential")).toBe("cookware");
    expect(resolveCollectionRouteHandle("apparel")).toBe("men-collection");
    expect(getCollectionRoutePaths("cookware")).toEqual([
      "/collections/cookware",
      "/collections/home-kitchen",
      "/collections/cooking-essential",
    ]);
    expect(getCollectionRoutePaths("men-collection")).toEqual([
      "/collections/men-collection",
      "/collections/apparel",
    ]);
  });

  it("keeps Senior Living Solutions below Travel & Outdoor in the collection order", () => {
    const travelIndex = SITE_COLLECTIONS.findIndex((collection) => collection.title === "Travel & Outdoor");
    const seniorLivingIndex = SITE_COLLECTIONS.findIndex(
      (collection) => collection.title === "Senior Living Solutions",
    );

    expect(travelIndex).toBeGreaterThanOrEqual(0);
    expect(seniorLivingIndex).toBeGreaterThan(travelIndex);
  });

  it("keeps sidebar subcollections scoped to their own parent collection", () => {
    expect(SITE_COLLECTIONS.find((collection) => collection.handle === "home-kitchen")?.subcollections.map((entry) => entry.title)).toEqual([
      "Kitchen Gadgets",
      "Cookware",
      "Storage & Organization",
      "Coffee & Tea Accessories",
      "Dining Essentials",
      "Cleaning Tools",
    ]);
    expect(SITE_COLLECTIONS.find((collection) => collection.handle === "home-decor-lighting")?.subcollections.map((entry) => entry.title)).toEqual([
      "Wall Lights",
      "Decorative Lamps",
      "Wall Art",
      "Seasonal Decor",
      "Smart Lighting",
      "Decorative Accessories",
    ]);
    expect(SITE_COLLECTIONS.find((collection) => collection.handle === "pet-essentials")?.subcollections.map((entry) => entry.title)).toEqual([
      "Dog Supplies",
      "Cat Supplies",
      "Pet Travel",
      "Pet Feeding",
      "Pet Grooming",
      "Pet Toys",
    ]);
    expect(SITE_COLLECTIONS.find((collection) => collection.handle === "health-wellness")?.subcollections.map((entry) => entry.title)).toEqual([
      "Sleep Essentials",
      "Relaxation Products",
      "Massage Tools",
      "Wellness Accessories",
    ]);
  });

  it("exposes the header collections in the requested order", () => {
    expect(SITE_HEADER_COLLECTION_LINKS.map((link) => link.label)).toEqual([
      "Home & Kitchen",
      "Home Decor & Lighting",
      "Pet Essentials",
      "Health & Wellness",
      "Travel & Outdoor",
      "Senior Living Solutions",
      "Gifts Collection",
      "Trending Finds",
    ]);
  });

  it("points the header collections at live collection routes", () => {
    expect(SITE_HEADER_COLLECTION_LINKS.map((link) => link.to)).toEqual([
      "/collections/cookware",
      "/collections/home-decor",
      "/collections/pet-assocerries",
      "/collections/face-mask",
      "/collections/shopping-bags-jute-bags",
      "/collections/books",
      "/collections/gifts",
      "/collections/trending-finds",
    ]);
  });

  it("marks the header collections active on their route and subcategory feeds", () => {
    expect(
      isSiteHeaderCollectionLinkActive(
        "/collections/cookware",
        "",
        SITE_HEADER_COLLECTION_LINKS[0],
      ),
    ).toBe(true);
    expect(
      isSiteHeaderCollectionLinkActive(
        "/collections/cookware",
        "?collection=kitchen-gadgets",
        SITE_HEADER_COLLECTION_LINKS[0],
      ),
    ).toBe(true);
    expect(
      isSiteHeaderCollectionLinkActive(
        "/collections/unique-products",
        "?collection=appplaza-best-sellers",
        SITE_HEADER_COLLECTION_LINKS[7],
      ),
    ).toBe(true);
  });
});
