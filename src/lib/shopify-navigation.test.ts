import { describe, expect, it } from "vitest";
import { buildCollectionNavigation, normalizeShopifyNavigationPayload } from "@/lib/shopify-navigation";

describe("Shopify collection navigation", () => {
  it("does not add reserved collection links when the Shopify menu is unavailable", () => {
    const groups = buildCollectionNavigation({ items: [] });

    expect(groups).toEqual([]);
  });

  it("uses Shopify menu titles, handles, and nested collection links without sample fallbacks", () => {
    const payload = normalizeShopifyNavigationPayload({
      items: [
        {
          title: "Admin Home Group",
          url: "#",
          items: [
            { title: "Admin Cookware", url: "/collections/admin-cookware" },
            { title: "Best Sellers", url: "/collections/appplaza-best-sellers" },
          ],
        },
        {
          title: "Admin Outdoor",
          url: "/collections/admin-outdoor",
          items: [{ title: "Admin Travel Picks", url: "/collections/admin-travel-picks" }],
        },
      ],
    });

    const groups = buildCollectionNavigation(payload);

    expect(groups.map((group) => group.title)).toEqual([
      "Admin Home Group",
      "Admin Outdoor",
    ]);
    expect(groups[0]?.handle).toBeNull();
    expect(groups[0]?.items.map((item) => item.title)).toEqual(["Admin Cookware"]);
    expect(groups[1]?.href).toBe("/collections/admin-outdoor");
    expect(groups[1]?.items[0]?.href).toBe("/collections/admin-travel-picks");
    expect(groups.map((group) => group.title)).not.toContain("Best Sellers");
    expect(groups.map((group) => group.title)).not.toContain("New Arrivals");
    expect(groups.map((group) => group.title)).not.toContain("Home & Kitchen");
  });

  it("keeps header groups separate from sidebar groups", () => {
    const payload = normalizeShopifyNavigationPayload({
      items: [
        { title: "Men", url: "/collections/men-collection", items: [] },
        { title: "Women", url: "/collections/women", items: [] },
        { title: "Kids", url: "/collections/kids", items: [] },
      ],
      headerItems: [
        { title: "Men", url: "/collections/men-collection", items: [] },
        { title: "Women", url: "/collections/women", items: [] },
        { title: "Kids", url: "/collections/kids", items: [] },
      ],
    });

    expect(buildCollectionNavigation(payload, "header").map((group) => group.title)).toEqual([
      "Men",
      "Women",
      "Kids",
    ]);
    expect(buildCollectionNavigation(payload, "sidebar").map((group) => group.title)).toEqual([
      "Men",
      "Women",
      "Kids",
    ]);
  });
});
