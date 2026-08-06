import { describe, expect, it } from "vitest";

import {
  COLLECTION_GOVERNANCE_POLICIES,
  PRICE_COLLECTION_POLICIES,
  SEMANTIC_COLLECTION_POLICIES,
  buildPriceCollectionSource,
  buildProductCollectionTags,
  buildSemanticCollectionSource,
  collectionTagForHandle,
  productMatchesPricePolicy,
  resolveCollectionPolicyByLiveHandle,
} from "./catalog-collection-governance.js";

const LIVE_HANDLES_BEFORE_REPAIR = [
  "all-products", "appplaza-best-sellers", "artificial-aquarium-decor-plants", "audio", "back-to-school",
  "beauty-makeup-essentials", "bedsheets-handlooms-towels", "blush-glow", "books", "camping-gear", "candles",
  "car-accessories", "caregiver-essentials", "cat-supplies", "cleaning-tools", "coffee-tea-accessories", "cookware",
  "covers-cases", "daily-living-aids", "decorative-accessories", "dining-essentials", "dog-supplies", "dramatic-lashes",
  "earbuds-and-cases", "electronic-accessories", "eye-beauty-collection", "face-creams-moisturizers", "fitness-equipment",
  "garden-tools", "gifts", "gifts-for-dad", "gifts-for-mom", "gifts-for-seniors", "glam-eye-palettes", "gloves",
  "hair-nourishment", "hair-wash-essentials", "health-wellness", "holiday-gifts", "home-decor", "home-safety",
  "housewarming-gifts", "iphone-cases", "jeans", "kids", "kids-toys-games", "kids-wear", "kitchen-gadgets",
  "lips-and-care", "luxury-fragrances", "magsafe-gadgets", "mascara-collection", "massage-tools", "medical-accessories",
  "memory-organization", "men-collection", "men-t-shirt", "mens-accessories", "mens-bags-wallets", "mens-beauty-skincare",
  "mens-fashion", "mobility-support", "mouse-keyboard", "new-arrivals", "office-school-supplies", "pet-assocerries",
  "pet-feeding", "pet-grooming", "pet-toys", "pet-travel", "portable-gadgets", "posture-support", "premium-picks",
  "relaxation-products", "repair-shine-serums", "robe", "seasonal-decor", "sleep-essentials", "smart-lighting",
  "staff-picks", "stationery", "storage-organization", "t-shirt", "travel-outdoor", "trousers", "under-100",
  "under-25", "under-35", "under-50", "unique-products", "viral-tiktok-products", "wall-art", "wall-lights", "watches",
  "women", "women-bags-and-wallets", "womens-accessories", "womens-beauty-essentials", "womens-fashion",
];

describe("catalog collection governance", () => {
  it("governs every collection that existed before the full-catalog repair", () => {
    expect(LIVE_HANDLES_BEFORE_REPAIR).toHaveLength(99);
    expect(LIVE_HANDLES_BEFORE_REPAIR.filter((handle) => !resolveCollectionPolicyByLiveHandle(handle))).toEqual([]);
  });

  it("uses one unique controlled tag for every semantic collection", () => {
    const tags = SEMANTIC_COLLECTION_POLICIES.map((policy) => policy.tag);
    expect(new Set(tags).size).toBe(tags.length);
    expect(tags.every((tag) => tag.startsWith("salt:collection:"))).toBe(true);
    expect(buildSemanticCollectionSource(SEMANTIC_COLLECTION_POLICIES[0]).inclusion.conditions).toHaveLength(1);
  });

  it("repairs drifted price handles and writes exact price conditions", () => {
    expect(resolveCollectionPolicyByLiveHandle("under-100")?.handle).toBe("under-44-99");
    expect(resolveCollectionPolicyByLiveHandle("gloves")?.handle).toBe("under-60");
    const under45 = PRICE_COLLECTION_POLICIES.find((policy) => policy.handle === "under-44-99");
    expect(buildPriceCollectionSource(under45).inclusion.conditions).toEqual([
      { variantPrice: { relation: "LESS_THAN", value: { amount: "45", currencyCode: "USD" } } },
    ]);
  });

  it("matches price collections against every variant", () => {
    const under25 = PRICE_COLLECTION_POLICIES.find((policy) => policy.handle === "under-25");
    expect(productMatchesPricePolicy({ variants: [{ price: "24.99" }, { price: "199.99" }] }, under25)).toBe(true);
    expect(productMatchesPricePolicy({ variants: [{ price: "25.00" }] }, under25)).toBe(false);
  });

  it("gives automotive products a semantic collection assignment", () => {
    const product = { title: "Portable Car Tire Inflator", handle: "portable-car-tire-inflator" };
    const knowledge = {
      departmentId: "automotive",
      categoryId: "vehicle-accessories",
      subcategoryId: "tire-inflators-pumps",
      classificationRule: "tire-inflators",
      proposedTags: [],
      collectionTargets: [],
      audience: { id: "unisex" },
    };
    expect(buildProductCollectionTags(product, knowledge)).toContain(collectionTagForHandle("car-accessories"));
  });

  it("has no duplicate canonical handles or aliases", () => {
    const canonical = COLLECTION_GOVERNANCE_POLICIES.map((policy) => policy.handle);
    expect(new Set(canonical).size).toBe(canonical.length);
    const aliases = COLLECTION_GOVERNANCE_POLICIES.flatMap((policy) => policy.legacyHandles || []);
    expect(aliases.some((alias) => canonical.includes(alias))).toBe(false);
  });
});
