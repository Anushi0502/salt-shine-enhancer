import { describe, expect, it } from "vitest";

import { buildHomeCollectionHierarchy } from "@/lib/collection-hierarchy";
import type { ShopifyCollection } from "@/types/shopify";

function makeCollection(handle: string, title: string): ShopifyCollection {
  return {
    id: handle.length * 100 + title.length,
    title,
    handle,
    description: "",
    published_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    image: null,
    products_count: 1,
  };
}

describe("buildHomeCollectionHierarchy", () => {
  it("keeps the canonical category order, drops missing branches, and groups live subcategories", () => {
    const hierarchy = buildHomeCollectionHierarchy([
      makeCollection("pet-assocerries", "Pet Supplies"),
      makeCollection("face-mask", "Fitness & Wellness"),
      makeCollection("books", "Senior Living Solutions"),
      makeCollection("cookware", "Home & Kitchen"),
      makeCollection("kitchen-gadgets", "Kitchen Gadgets"),
      makeCollection("storage-organization", "Storage & Organization"),
      makeCollection("coffee-tea-accessories", "Coffee & Tea Accessories"),
      makeCollection("dining-essentials", "Dining Essentials"),
      makeCollection("cleaning-tools", "Cleaning Tools"),
      makeCollection("home-decor", "Home Decor & Lighting"),
      makeCollection("wall-lights", "Wall Lights"),
      makeCollection("decorative-lamps", "Decorative Lamps"),
      makeCollection("wall-art", "Wall Art"),
      makeCollection("seasonal-decor", "Seasonal Decor"),
      makeCollection("smart-lighting", "Smart Lighting"),
      makeCollection("decorative-accessories", "Decorative Accessories"),
      makeCollection("dog-supplies", "Dog Supplies"),
      makeCollection("cat-supplies", "Cat Supplies"),
      makeCollection("pet-travel", "Pet Travel"),
      makeCollection("pet-feeding", "Pet Feeding"),
      makeCollection("pet-grooming", "Pet Grooming"),
      makeCollection("pet-toys", "Pet Toys"),
      makeCollection("posture-support", "Posture Support"),
      makeCollection("sleep-essentials", "Sleep Essentials"),
      makeCollection("relaxation-products", "Relaxation Products"),
      makeCollection("massage-tools", "Massage Tools"),
      makeCollection("wellness-accessories", "Wellness Accessories"),
      makeCollection("shopping-bags-jute-bags", "Travel & Outdoor"),
      makeCollection("travel-organizers", "Travel Organizers"),
      makeCollection("car-accessories", "Car Accessories"),
      makeCollection("camping-gear", "Camping Gear"),
      makeCollection("portable-gadgets", "Portable Gadgets"),
      makeCollection("outdoor-essentials", "Outdoor Essentials"),
      makeCollection("daily-living-aids", "Daily Living Aids"),
      makeCollection("home-safety", "Home Safety"),
      makeCollection("memory-organization", "Memory & Organization"),
      makeCollection("caregiver-essentials", "Caregiver Essentials"),
      makeCollection("mobility-support", "Mobility Support"),
      makeCollection("gifts", "Gifts Collection"),
      makeCollection("gifts-for-mom", "Gifts for Mom"),
      makeCollection("gifts-for-dad", "Gifts for Dad"),
      makeCollection("gifts-for-seniors", "Gifts for Seniors"),
      makeCollection("housewarming-gifts", "Housewarming Gifts"),
      makeCollection("birthday-gifts", "Birthday Gifts"),
      makeCollection("holiday-gifts", "Holiday Gifts"),
      makeCollection("unique-products", "Trending Finds"),
      makeCollection("viral-tiktok-products", "Viral TikTok Products"),
      makeCollection("new-arrivals", "New Arrivals"),
      makeCollection("appplaza-best-sellers", "Best Sellers"),
      makeCollection("staff-picks", "Staff Picks"),
      makeCollection("under-25", "Under $25"),
      makeCollection("under-50", "Under $50"),
    ]);

    expect(hierarchy.defaultCategoryHandle).toBe("cookware");
    expect(hierarchy.categories.map((category) => category.label)).toEqual([
      "Home & Kitchen",
      "Home Decor & Lighting",
      "Pet Essentials",
      "Health & Wellness",
      "Travel & Outdoor",
      "Senior Living Solutions",
      "Gifts Collection",
      "Trending Finds",
    ]);
    expect(hierarchy.categories.map((category) => category.handle)).toEqual([
      "cookware",
      "home-decor",
      "pet-assocerries",
      "face-mask",
      "shopping-bags-jute-bags",
      "books",
      "gifts",
      "unique-products",
    ]);
    expect(hierarchy.categories[0].items.map((item) => item.handle)).toEqual([
      "kitchen-gadgets",
      "storage-organization",
      "coffee-tea-accessories",
      "dining-essentials",
      "cleaning-tools",
    ]);
    expect(hierarchy.categories[0].items[0].href).toBe("/collections/kitchen-gadgets");
    expect(hierarchy.categories[1].items.map((item) => item.handle)).toEqual([
      "wall-lights",
      "decorative-lamps",
      "wall-art",
      "seasonal-decor",
      "smart-lighting",
      "decorative-accessories",
    ]);
    expect(hierarchy.categories[2].items.map((item) => item.handle)).toEqual([
      "dog-supplies",
      "cat-supplies",
      "pet-travel",
      "pet-feeding",
      "pet-grooming",
      "pet-toys",
    ]);
    expect(hierarchy.categories[3].items.map((item) => item.handle)).toEqual([
      "posture-support",
      "sleep-essentials",
      "relaxation-products",
      "massage-tools",
      "wellness-accessories",
    ]);
    expect(hierarchy.categories[4].items.map((item) => item.handle)).toEqual([
      "travel-organizers",
      "car-accessories",
      "camping-gear",
      "portable-gadgets",
      "outdoor-essentials",
    ]);
    expect(hierarchy.categories[5].items.map((item) => item.handle)).toEqual([
      "daily-living-aids",
      "home-safety",
      "memory-organization",
      "caregiver-essentials",
      "gifts-for-seniors",
      "mobility-support",
    ]);
    expect(hierarchy.categories[6].items.map((item) => item.handle)).toEqual([
      "gifts-for-mom",
      "gifts-for-dad",
      "gifts-for-seniors",
      "housewarming-gifts",
      "birthday-gifts",
      "holiday-gifts",
    ]);
    expect(hierarchy.categories[7].items.map((item) => item.handle)).toEqual([
      "viral-tiktok-products",
      "appplaza-best-sellers",
      "new-arrivals",
      "staff-picks",
      "under-25",
      "under-50",
    ]);
    expect(hierarchy.categories.some((category) => category.label === "Jewelry")).toBe(false);
    expect(hierarchy.categories.some((category) => category.label === "Clothing")).toBe(false);
  });

  it("resolves pinned shortcuts to live collection routes", () => {
    const hierarchy = buildHomeCollectionHierarchy([
      makeCollection("new-arrivals", "New Arrivals"),
      makeCollection("appplaza-best-sellers", "Best Sellers"),
      makeCollection("deals-sale", "Deals & Sale"),
    ]);

    expect(hierarchy.featuredShortcuts).toEqual([
      { label: "New Arrivals", handle: "new-arrivals", href: "/collections/new-arrivals" },
      { label: "Best Sellers", handle: "appplaza-best-sellers", href: "/collections/appplaza-best-sellers" },
      { label: "Today's Deals", handle: "deals-sale", href: "/collections/deals-sale" },
    ]);
  });
});
