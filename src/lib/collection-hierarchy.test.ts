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
  it("keeps the DOCX category order, drops missing branches, and groups live subcategories", () => {
    const hierarchy = buildHomeCollectionHierarchy([
      makeCollection("cookware", "Kitchen Essentials"),
      makeCollection("cooking-essential", "COOKING ESSENTIAL"),
      makeCollection("jaar-opener", "Can and Jar Lid Screwer Non-slip Twist Bottle Opener"),
      makeCollection("home-decor", "Home & Living"),
      makeCollection("candles", "CANDLES"),
      makeCollection("artificial-aquarium-decor-plants", "Artificial Aquarium Decor Plants"),
      makeCollection("men-collection", "Men Collection"),
      makeCollection("jeans", "JEANS"),
      makeCollection("t-shirt", "T-SHIRT"),
      makeCollection("trousers", "TROUSERS"),
      makeCollection("robe", "ROBE"),
      makeCollection("shoes", "SHOES"),
      makeCollection("hair-accessories", "HAIR ACCESSORIES"),
      makeCollection("garden-tools", "Garden Tools"),
      makeCollection("tools", "Smart Home Gadgets"),
      makeCollection("pet-assocerries", "Pet Supplies"),
      makeCollection("medical-accessories", "Electronics & Gadgets"),
      makeCollection("personal-care", "Beauty & Personal Care"),
      makeCollection("face-mask", "Fitness & Wellness"),
      makeCollection("books", "Senior Living Solutions"),
      makeCollection("gifts", "Gifts & Seasonal"),
      makeCollection("unique-products", "Trending Products"),
      makeCollection("summer-collection", "Summer Collection"),
      makeCollection("shopping-bags-jute-bags", "Travel Accessories"),
      makeCollection("shopping-bag-market-trolley-bag-with-wheels-collapsible", "Shopping Bag Market Trolley Bag with Wheels Collapsible"),
      makeCollection("deals-sale", "Deals & Sale"),
      makeCollection("gloves", "Under $60"),
      makeCollection("under-35", "Under 35"),
      makeCollection("new-arrivals", "New Arrivals"),
      makeCollection("appplaza-best-sellers", "Best Sellers"),
    ]);

    expect(hierarchy.defaultCategoryHandle).toBe("cookware");
    expect(hierarchy.categories.map((category) => category.label)).toEqual([
      "Kitchen & Dining",
      "Home & Decor",
      "Clothing",
      "Shoes & Accessories",
      "Garden & Tools",
      "Pet Supplies",
      "Health, Wellness & Planners",
      "Gifts & Lifestyle",
      "Travel & Portable Essentials",
      "Deals & Sale",
    ]);
    expect(hierarchy.categories.map((category) => category.handle)).toEqual([
      "cookware",
      "home-decor",
      "men-collection",
      "shoes",
      "garden-tools",
      "pet-assocerries",
      "medical-accessories",
      "gifts",
      "shopping-bags-jute-bags",
      "deals-sale",
    ]);
    expect(hierarchy.categories[0].items.map((item) => item.handle)).toEqual([
      "cooking-essential",
      "jaar-opener",
    ]);
    expect(hierarchy.categories[1].items.map((item) => item.handle)).toEqual([
      "candles",
      "artificial-aquarium-decor-plants",
    ]);
    expect(hierarchy.categories[2].items.map((item) => item.handle)).toEqual([
      "jeans",
      "t-shirt",
      "trousers",
      "robe",
    ]);
    expect(hierarchy.categories[3].items.map((item) => item.handle)).toEqual(["hair-accessories"]);
    expect(hierarchy.categories[4].items.map((item) => item.handle)).toEqual(["tools"]);
    expect(hierarchy.categories[5].items).toEqual([]);
    expect(hierarchy.categories[6].items.map((item) => item.handle)).toEqual([
      "personal-care",
      "face-mask",
      "books",
    ]);
    expect(hierarchy.categories[7].items.map((item) => item.handle)).toEqual([
      "unique-products",
      "summer-collection",
    ]);
    expect(hierarchy.categories[8].items.map((item) => item.handle)).toEqual([
      "shopping-bag-market-trolley-bag-with-wheels-collapsible",
    ]);
    expect(hierarchy.categories[9].items.map((item) => item.handle)).toEqual(["gloves", "under-35"]);
    expect(hierarchy.categories.some((category) => category.label === "Jewelry")).toBe(false);
    expect(hierarchy.categories.some((category) => category.label === "Outdoor & Camping")).toBe(false);
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
