import { describe, expect, it } from "vitest";
import { buildCollectionNavigation, normalizeShopifyNavigationPayload } from "@/lib/shopify-navigation";

describe("Shopify collection navigation", () => {
  it("keeps only the two reserved collection links when the Admin menu is unavailable", () => {
    const groups = buildCollectionNavigation({ items: [] });

    expect(groups.map((group) => group.title)).toEqual(["Best Sellers", "New Arrivals"]);
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
      "Best Sellers",
      "New Arrivals",
      "Admin Home Group",
      "Admin Outdoor",
    ]);
    expect(groups[2]?.handle).toBeNull();
    expect(groups[2]?.items.map((item) => item.title)).toEqual(["Admin Cookware"]);
    expect(groups[3]?.href).toBe("/collections/admin-outdoor");
    expect(groups[3]?.items[0]?.href).toBe(
      "/collections/admin-outdoor?collection=admin-travel-picks",
    );
    expect(groups.map((group) => group.title)).not.toContain("Home & Kitchen");
  });
});
