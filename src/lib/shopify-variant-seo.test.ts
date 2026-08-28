import { describe, expect, it } from "vitest";

import { buildVariantSeoProfiles, hasDistinctVariantSeo } from "@/lib/shopify-variant-seo.js";

describe("variant-aware SEO", () => {
  it("includes the live variant price in the description", () => {
    const profiles = buildVariantSeoProfiles({
      title: "10 Piece Pots And Pans Set",
      variants: [{ id: 1, title: "United States", price: "209.99" }],
    });

    expect(profiles[0].description).toContain("Available for 209.99 USD.");
  });

  it("creates a distinct profile for each materially different variant", () => {
    const profiles = buildVariantSeoProfiles({
      title: "Multi-purpose school set",
      variants: [
        { id: 1, title: "Backpack", price: "69.99" },
        { id: 2, title: "Lunch box", price: "39.99" },
        { id: 3, title: "Pencil case", price: "35.99" },
      ],
    });

    expect(hasDistinctVariantSeo({ variants: profiles })).toBe(true);
    expect(profiles.map((profile) => profile.title)).toEqual([
      "Multi-purpose school set - Backpack | SALT Online Store",
      "Multi-purpose school set - Lunch box | SALT Online Store",
      "Multi-purpose school set - Pencil case | SALT Online Store",
    ]);
    expect(profiles[1].description).toContain("39.99");
  });

  it("uses a standard option when Shopify has a default variant", () => {
    const [profile] = buildVariantSeoProfiles({
      title: "Single item",
      variants: [{ id: 1, title: "Default Title", price: "35.00" }],
    });

    expect(profile.label).toBe("Standard Option");
    expect(profile.title).toBe("Single item | SALT Online Store");
  });

  it("keeps long product titles distinct by reserving space for variant labels", () => {
    const profiles = buildVariantSeoProfiles({
      title: "Premium oversized travel backpack with expandable compartments and organizer panel",
      variants: [
        { id: 1, title: "Lunch box", price: "49.99" },
        { id: 2, title: "Bottle", price: "39.99" },
        { id: 3, title: "Pencil case", price: "35.99" },
      ],
    });

    expect(new Set(profiles.map((profile) => profile.title.toLowerCase())).size).toBe(3);
    expect(profiles.every((profile) => profile.title.length <= 70)).toBe(true);
    expect(profiles.map((profile) => profile.title).join(" ")).toContain("Lunch box");
    expect(profiles.map((profile) => profile.title).join(" ")).toContain("Bottle");
    expect(profiles.map((profile) => profile.title).join(" ")).toContain("Pencil case");
  });

  it("adds a deterministic collision suffix for repeated option labels", () => {
    const profiles = buildVariantSeoProfiles({
      title: "Travel set",
      variants: [
        { id: 1, title: "Black", price: "39.99" },
        { id: 2, title: "Black", price: "44.99" },
      ],
    });

    expect(profiles[0].title).not.toBe(profiles[1].title);
    expect(profiles[1].title).toContain("(2)");
  });
});
