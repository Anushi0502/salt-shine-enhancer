import { describe, expect, it } from "vitest";

import {
  assessProductContentSpecificity,
  buildCatalogContentCollisionIndex,
  buildContentFingerprint,
  findCatalogContentCollisions,
  hasCatalogContentCollision,
} from "./product-content-specificity.js";

const charger = {
  id: 1,
  handle: "portable-wireless-charger-15w-for-iphone-travel",
  title: "Portable 15W Wireless Charger for iPhone",
  product_type: "Phone Charger",
  tags: ["electronics", "salt:collection:portable-gadgets"],
};

describe("product content specificity", () => {
  it("accepts copy anchored to distinctive product evidence", () => {
    const result = assessProductContentSpecificity(
      "Portable 15W wireless charger compatible with iPhone for travel setups.",
      charger,
      { field: "seo-description" },
    );

    expect(result.specific).toBe(true);
    expect(result.matchedPrimaryTokens).toEqual(expect.arrayContaining(["15w", "wireless", "charger", "iphone"]));
  });

  it("rejects generic marketing filler that contains no product evidence", () => {
    const result = assessProductContentSpecificity(
      "Shop this premium high quality product online. A perfect everyday choice.",
      charger,
      { field: "seo-description" },
    );

    expect(result.specific).toBe(false);
    expect(result.issues).toContain("insufficient-product-evidence");
    expect(result.genericPatterns.length).toBeGreaterThan(0);
  });

  it("normalizes HTML and punctuation into stable fingerprints", () => {
    expect(buildContentFingerprint("<p>15W Wireless Charger &amp; Stand</p>")).toBe(
      "15w wireless charger stand",
    );
  });

  it("finds exact catalog collisions and exposes a reusable index", () => {
    const products = [
      { ...charger, customData: { subtitle: "Portable wireless charging accessory" } },
      {
        ...charger,
        id: 2,
        handle: "desktop-wireless-charger-20w-for-android",
        title: "Desktop 20W Wireless Charger for Android",
        customData: { subtitle: "Portable wireless charging accessory" },
      },
    ];
    const fields = [{
      id: "subtitle",
      getValue: (product: { customData?: { subtitle?: string } }) => product.customData?.subtitle,
    }];
    const collisions = findCatalogContentCollisions(products, fields);
    const index = buildCatalogContentCollisionIndex(products, fields);

    expect(collisions).toHaveLength(1);
    expect(collisions[0].members).toHaveLength(2);
    expect(hasCatalogContentCollision(index, "subtitle", "Portable wireless charging accessory")).toBe(true);
  });
});
