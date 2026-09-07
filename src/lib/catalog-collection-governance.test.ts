import { describe, expect, it } from "vitest";

import {
  COLLECTION_GOVERNANCE_POLICIES,
  PRICE_COLLECTION_POLICIES,
  SEMANTIC_COLLECTION_POLICIES,
  buildPriceCollectionSource,
  buildProductCollectionTags,
  buildSemanticCollectionSource,
  canonicalCollectionHandle,
  collectionTagForHandle,
  productMatchesPricePolicy,
  resolveCollectionPolicyByLiveHandle,
} from "./catalog-collection-governance.js";
import { classifyCatalogTaxonomy } from "./catalog-taxonomy.js";

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
    expect(tags.every((tag) => !tag.includes(":"))).toBe(true);
    expect(buildSemanticCollectionSource(SEMANTIC_COLLECTION_POLICIES[0]).inclusion.conditions).toHaveLength(1);
  });

  it("preserves approved union rules for merged canonical collections", () => {
    const gifts = SEMANTIC_COLLECTION_POLICIES.find((policy) => policy.handle === "gifts");
    const source = buildSemanticCollectionSource(gifts);
    expect(source.inclusion.matchType).toBe("ANY");
    expect(source.inclusion.conditions.map((condition) => condition.productTag.values)).toEqual([
      ["gifts"],
      ["holiday-gifts"],
    ]);
  });

  it("repairs drifted price handles and writes exact price conditions", () => {
    expect(resolveCollectionPolicyByLiveHandle("under-100")?.handle).toBe("under-44-99");
    expect(resolveCollectionPolicyByLiveHandle("gloves")?.handle).toBe("under-60");
    const under45 = PRICE_COLLECTION_POLICIES.find((policy) => policy.handle === "under-44-99");
    expect(buildPriceCollectionSource(under45).inclusion.conditions).toEqual([
      { variantPrice: { relation: "LESS_THAN", value: { amount: "45", currencyCode: "USD" } } },
    ]);
  });

  it("canonicalizes legacy collection aliases before product membership verification", () => {
    expect(canonicalCollectionHandle("electronic-accessories")).toBe("portable-gadgets");
    expect(canonicalCollectionHandle("face-mask")).toBe("health-wellness");
    expect(resolveCollectionPolicyByLiveHandle("electronic-accessories")?.handle).toBe("portable-gadgets");
    expect(resolveCollectionPolicyByLiveHandle("face-mask")?.handle).toBe("health-wellness");
  });

  it("keeps taxonomy aliases from creating collection assignments", () => {
    const faceMaskKnowledge = {
      departmentId: "beauty",
      categoryId: "women-beauty-skincare",
      subcategoryId: "face-masks",
      classificationRule: "face-masks",
      proposedTags: ["face-mask"],
      collectionTargets: [],
      audience: { id: "women" },
    };
    const tags = buildProductCollectionTags(
      { title: "Women's UV Face Mask", handle: "womens-uv-face-mask" },
      faceMaskKnowledge,
    );
    expect(tags).not.toContain("health-wellness");
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

  it("assigns headwear to the governed hats collection", () => {
    const hats = SEMANTIC_COLLECTION_POLICIES.find((policy) => policy.handle === "hats");
    const product = { title: "Foldable Summer Sun Hat", handle: "foldable-summer-sun-hat" };
    const knowledge = {
      subcategoryId: "hats-caps",
      proposedTags: [],
      collectionTargets: ["hats"],
      classificationRule: "hats-caps",
    };
    expect(hats).toBeDefined();
    expect(collectionTagForHandle("hats")).toBe("hats");
    expect(buildProductCollectionTags(product, knowledge)).toContain("hats");
  });

  it("routes men wigs to wigs and men's accessories", () => {
    const product = {
      title: "Men's Short Black Hair Replacement Wig with Clips",
      handle: "men-hair-replacement-short-black-wig-with-clips",
    };
    const knowledge = classifyCatalogTaxonomy(product);
    const tags = buildProductCollectionTags(product, knowledge);

    expect(knowledge.ruleId).toBe("mens-hair-replacement-wigs");
    expect(knowledge.proposedTags).toContain("men-wigs");
    expect(tags).toEqual(expect.arrayContaining(["wigs", "mens-accessories"]));
    expect(tags).not.toContain("womens-accessories");
  });

  it("routes women wigs to wigs and women's accessories", () => {
    const product = {
      title: "Black Short Curly Hair Wig for Women",
      handle: "black-short-curly-hair-wig-for-women",
    };
    const knowledge = classifyCatalogTaxonomy(product);
    const tags = buildProductCollectionTags(product, knowledge);

    expect(knowledge.ruleId).toBe("womens-short-curly-wigs");
    expect(knowledge.proposedTags).toContain("women-wigs");
    expect(tags).toEqual(expect.arrayContaining(["wigs", "womens-accessories"]));
    expect(tags).not.toContain("mens-accessories");
  });

  it("keeps garden tools out of Home & Decor even when stale model tags remain", () => {
    const product = {
      title: "Manganese Steel Handheld Gardening Hoe Weeding Tool",
      handle: "manganese-steel-handheld-gardening-hoe-for-weeding-soil-loosening",
      product_type: "tool",
    };
    const knowledge = {
      departmentId: "home-decor",
      categoryId: "home-car-accessories",
      subcategoryId: "garden-tools",
      classificationRule: "garden-tools",
      proposedTags: ["home-decor", "garden-tools"],
      collectionTargets: ["home-decor", "garden-tools"],
      audience: { id: "unisex" },
    };
    const tags = buildProductCollectionTags(product, knowledge);

    expect(tags).toContain("garden-tools");
    expect(tags).not.toContain("home-decor");
  });

  it("does not place a skirt set in the T-Shirts collection", () => {
    const knowledge = classifyCatalogTaxonomy({
      title: "Black Two Piece Beaded Zipper Top Skirt Set 4 Shirt",
      handle: "black-two-piece-beaded-zipper-top-skirt-set",
      product_type: "shirt",
    });
    const tags = buildProductCollectionTags(
      { title: "Black Two Piece Beaded Zipper Top Skirt Set 4 Shirt", handle: "black-two-piece-beaded-zipper-top-skirt-set", product_type: "shirt" },
      knowledge,
    );

    expect(knowledge.ruleId).not.toBe("t-shirts");
    expect(tags).not.toContain("t-shirt");
  });

  it("does not route wig-care products into the wigs collection", () => {
    const product = {
      title: "Wig Care Shampoo and Conditioner Set",
      handle: "wig-care-shampoo-conditioner-set",
    };
    const knowledge = classifyCatalogTaxonomy(product);
    const tags = buildProductCollectionTags(product, knowledge);

    expect(knowledge.ruleId).toBe("hair-care");
    expect(tags).not.toContain("wigs");
  });

  it("requires audience and apparel evidence for Kids Wear", () => {
    const product = { title: "Men's Casual Watch", handle: "mens-casual-watch" };
    const knowledge = {
      departmentId: "men",
      subcategoryId: "kids-clothing",
      audience: { id: "men" },
      proposedTags: ["kids-wear"],
      collectionTargets: ["kids-wear"],
    };
    expect(buildProductCollectionTags(product, knowledge)).not.toContain("kids-wear");
  });

  it("keeps cat supplies, pet feeding, grooming, and travel pet-specific", () => {
    const nonPet = { title: "Cat Eye False Eyelashes", handle: "cat-eye-false-eyelashes" };
    const nonPetKnowledge = {
      departmentId: "beauty",
      subcategoryId: "eye-makeup",
      audience: { id: "beauty" },
      proposedTags: ["cat-supplies", "pet-grooming"],
      collectionTargets: ["cat-supplies", "pet-grooming"],
    };
    const pet = { title: "Portable Dog Water Bottle for Travel", handle: "portable-dog-water-bottle-travel" };
    const petKnowledge = {
      departmentId: "pets",
      subcategoryId: "dog-supplies",
      audience: { id: "pets" },
      proposedTags: [],
      collectionTargets: [],
    };

    const nonPetTags = buildProductCollectionTags(nonPet, nonPetKnowledge);
    const petTags = buildProductCollectionTags(pet, petKnowledge);
    expect(nonPetTags).not.toEqual(expect.arrayContaining(["cat-supplies", "pet-feeding", "pet-grooming", "pet-travel"]));
    expect(petTags).toEqual(expect.arrayContaining(["pet-feeding", "pet-travel"]));
  });

  it("does not treat generic portable pet cleaning products as travel products", () => {
    const product = {
      title: "Portable Pet Hair Remover Brush for Sofa and Clothes",
      handle: "portable-lint-remover-pet-hair-remover-brush-for-sofa-clothes-cleaning",
    };
    const knowledge = {
      departmentId: "pets",
      subcategoryId: "pet-grooming-tools",
      audience: { id: "pets" },
      proposedTags: [],
      collectionTargets: [],
    };
    expect(buildProductCollectionTags(product, knowledge)).not.toContain("pet-travel");
  });

  it("requires seasonal decor evidence instead of a holiday word alone", () => {
    const decor = {
      title: "Christmas Wreath Door Hanging Decoration",
      handle: "christmas-wreath-door-hanging-decoration",
    };
    const unrelated = {
      title: "Synthetic Mens Hair Wig for Halloween Costume",
      handle: "synthetic-mens-hair-wig-for-halloween-costume",
    };
    const knowledge = {
      departmentId: "general",
      subcategoryId: "general-merchandise",
      audience: { id: "unisex" },
      proposedTags: [],
      collectionTargets: [],
    };
    expect(buildProductCollectionTags(decor, knowledge)).toContain("seasonal-decor");
    expect(buildProductCollectionTags(unrelated, knowledge)).not.toContain("seasonal-decor");
  });

  it("keeps light fixtures and turf out of Artificial Plants", () => {
    const plantPolicy = SEMANTIC_COLLECTION_POLICIES.find((entry) => entry.handle === "artificial-plants");
    const light = { title: "Artificial Ivy Vine String Lights", handle: "artificial-ivy-vine-string-lights" };
    const plant = { title: "Artificial Ivy Vine Plant for Home Decor", handle: "artificial-ivy-vine-plant-home-decor" };
    const knowledge = {
      departmentId: "home-decor",
      subcategoryId: "home-decor",
      audience: { id: "unisex" },
      proposedTags: [],
      collectionTargets: [],
    };
    expect(plantPolicy).toBeDefined();
    expect(buildProductCollectionTags(light, knowledge)).not.toContain("artificial-plants");
    expect(buildProductCollectionTags(plant, knowledge)).toContain("artificial-plants");
  });

  it("renames the aquarium plant collection through a canonical alias", () => {
    const policy = SEMANTIC_COLLECTION_POLICIES.find((entry) => entry.handle === "artificial-plants");
    expect(policy?.title).toBe("Artificial Plants");
    expect(resolveCollectionPolicyByLiveHandle("artificial-aquarium-decor-plants")?.handle).toBe("artificial-plants");
    const source = buildSemanticCollectionSource(policy);
    expect(source.inclusion.matchType).toBe("ANY");
    expect(source.inclusion.conditions.map((condition) => condition.productTag.values)).toEqual([
      ["artificial-plants"],
      ["artificial-aquarium-decor-plants"],
    ]);
  });

  it("has no duplicate canonical handles or aliases", () => {
    const canonical = COLLECTION_GOVERNANCE_POLICIES.map((policy) => policy.handle);
    expect(new Set(canonical).size).toBe(canonical.length);
    const aliases = COLLECTION_GOVERNANCE_POLICIES.flatMap((policy) => policy.legacyHandles || []);
    expect(aliases.some((alias) => canonical.includes(alias))).toBe(false);
  });
});
