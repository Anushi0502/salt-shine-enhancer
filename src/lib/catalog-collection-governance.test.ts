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

  it("routes reviewed rose bears and plush toys to the governed kids collection", () => {
    const product = {
      id: "7705848807523",
      title: "Rose Bear Artificial Foam Teddy Toy",
      handle: "rose-bear-artificial-foam-teddy-bear-valentines-gift",
      product_type: "toy",
      tags: ["kids", "soft-toy", "soft-toys"],
    };
    const knowledge = classifyCatalogTaxonomy(product);
    const tags = buildProductCollectionTags(product, knowledge);
    expect(knowledge.ruleId).toBe("soft-toys");
    expect(knowledge.categoryId).toBe("soft-toys");
    expect(knowledge.collectionTargets).toContain("kids-toys-games");
    expect(knowledge.collectionTargets).not.toContain("soft-toys");
    expect(tags).toContain("kids-toys-games");
  });

  it("routes legacy glove taxonomy targets into audience-safe accessories", () => {
    const product = {
      title: "Winter Cycling Gloves",
      handle: "mens-womens-winter-cycling-gloves-waterproof-thermal-non-slip",
      product_type: "Winter Cycling Gloves",
      tags: ["gloves", "men", "mens-accessories"],
    };
    const knowledge = classifyCatalogTaxonomy(product);
    const tags = buildProductCollectionTags(product, knowledge);
    expect(knowledge.ruleId).toBe("gloves");
    expect(knowledge.collectionTargets).toEqual(["general-merchandise"]);
    expect(tags).toContain("general-merchandise");
    expect(tags).not.toContain("gloves");

    const singleAudienceProduct = {
      title: "Men's Winter Cycling Gloves",
      handle: "mens-winter-cycling-gloves",
      product_type: "Winter Cycling Gloves",
    };
    const singleAudienceKnowledge = classifyCatalogTaxonomy(singleAudienceProduct);
    expect(singleAudienceKnowledge.collectionTargets).toEqual(["mens-accessories"]);
    expect(buildProductCollectionTags(singleAudienceProduct, singleAudienceKnowledge))
      .toContain("mens-accessories");
  });

  it("keeps sleeping bonnets out of ties and routes them to hair accessories", () => {
    const product = {
      title: "Satin Sleeping Hat Stretchy Tie Band",
      handle: "satin-sleeping-hat-stretchy-tie-band-hair-bonnet",
      product_type: "Satin Sleeping Hat",
      tags: ["tie", "women", "womens-accessories"],
    };
    const knowledge = classifyCatalogTaxonomy(product);
    const tags = buildProductCollectionTags(product, knowledge);
    expect(knowledge.ruleId).toBe("sleeping-hair-bonnets");
    expect(knowledge.collectionTargets).toEqual(["womens-accessories"]);
    expect(tags).toContain("womens-accessories");
    expect(tags).not.toContain("tie");
  });

  it("routes hijabs to women accessories instead of leaving generic scarves unassigned", () => {
    const product = {
      title: "Crossed Forehead Hijab Stretchy Islamic Jersey",
      handle: "crossed-forehead-hijab-stretchy-islamic-jersey-scarf",
      product_type: "Forehead Hijab",
      tags: ["scarf", "women", "womens-accessories"],
    };
    const knowledge = classifyCatalogTaxonomy(product);
    const tags = buildProductCollectionTags(product, knowledge);
    expect(knowledge.ruleId).toBe("hijabs");
    expect(knowledge.collectionTargets).toEqual(["womens-accessories"]);
    expect(tags).toContain("womens-accessories");
    expect(tags).not.toContain("scarf");
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

  it("routes adult protective bibs away from baby care", () => {
    const product = {
      title: "Waterproof Apron Bib",
      handle: "stain-resistant-waterproof-apron-unisex-adult-bib-for-home",
      product_type: "Waterproof Apron Bib",
      tags: ["baby-care", "baby-care-product", "kids", "waterproof"],
    };
    const knowledge = classifyCatalogTaxonomy(product);
    const tags = buildProductCollectionTags(product, knowledge);

    expect(knowledge.ruleId).toBe("mobility-aids");
    expect(knowledge.categoryId).toBe("health-wellness");
    expect(knowledge.collectionTargets).toContain("daily-living-aids");
    expect(tags).toContain("daily-living-aids");
    expect(tags).not.toContain("kids");
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

  it("does not treat connector gender geometry as shopper audience evidence", () => {
    const product = {
      title: "Male to Female USB C Connector Adapter Cable",
      handle: "male-to-female-usb-c-connector-adapter-cable",
      product_type: "Electronic Accessory",
    };
    const staleKnowledge = {
      audience: { id: "men" },
      proposedTags: ["mens-accessories", "men-fashion"],
      collectionTargets: ["mens-accessories", "mens-fashion", "men-collection"],
      classificationRule: "mens-accessories",
    };

    expect(buildProductCollectionTags(product, staleKnowledge)).not.toEqual(expect.arrayContaining([
      "mens-accessories",
      "mens-fashion",
      "men-collection",
    ]));
  });

  it("preserves direct audience evidence for genuine men's apparel", () => {
    const product = {
      title: "Men's Cotton Crew Neck T-Shirt",
      handle: "mens-cotton-crew-neck-t-shirt",
      product_type: "Men's T-Shirt",
    };
    const knowledge = {
      audience: { id: "men" },
      subcategoryId: "t-shirts",
      proposedTags: ["men", "men-fashion"],
      collectionTargets: ["men-collection"],
      classificationRule: "t-shirts",
    };
    expect(buildProductCollectionTags(product, knowledge)).toEqual(expect.arrayContaining([
      "men-t-shirt",
      "mens-fashion",
      "men-collection",
    ]));
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
      subcategoryId: "pet-feeding-accessories",
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
    expect(source.inclusion.matchType).toBe("ALL");
    expect(source.inclusion.conditions.map((condition) => condition.productTag.values)).toEqual([
      ["artificial-plants"],
    ]);
  });

  it("removes the reported home-safety mouse false positive even with stale taxonomy evidence", () => {
    const product = {
      title: "Ergonomic Wireless Computer Mouse",
      handle: "ergonomic-wireless-computer-mouse",
      product_type: "home safety",
    };
    const knowledge = {
      proposedTags: ["home-safety"],
      collectionTargets: ["home-safety"],
      classificationRule: "home-safety",
    };
    expect(buildProductCollectionTags(product, knowledge)).not.toContain("home-safety");
  });

  it("removes the reported hats beer-opener false positive even with stale taxonomy evidence", () => {
    const product = {
      title: "Stainless Steel Beer Bottle Opener",
      handle: "stainless-steel-beer-bottle-opener",
    };
    const knowledge = {
      subcategoryId: "hats-caps",
      proposedTags: ["hats"],
      collectionTargets: ["hats"],
      classificationRule: "hats-caps",
    };
    expect(buildProductCollectionTags(product, knowledge)).not.toContain("hats");
  });

  it("keeps pet products out of human collections without blocking cat-eye cosmetics", () => {
    const staleBeautyKnowledge = {
      departmentId: "beauty",
      subcategoryId: "face-makeup",
      proposedTags: ["beauty-makeup-essentials"],
      collectionTargets: ["beauty-makeup-essentials"],
      classificationRule: "face-makeup",
    };

    expect(buildProductCollectionTags({
      title: "Dog Nail File and Clipper Set",
      handle: "dog-nail-file-clipper-set",
      product_type: "Beauty Tool",
    }, staleBeautyKnowledge)).not.toContain("beauty-makeup-essentials");

    expect(buildProductCollectionTags({
      title: "Cat-Eye Liquid Eyeliner",
      handle: "cat-eye-liquid-eyeliner",
      product_type: "Eye Makeup",
    }, staleBeautyKnowledge)).toContain("beauty-makeup-essentials");

    expect(buildProductCollectionTags({
      title: "Pet Makeup Brush for Dogs",
      handle: "pet-makeup-brush-for-dogs",
      product_type: "Makeup Brush",
    }, staleBeautyKnowledge)).not.toContain("beauty-makeup-essentials");
  });

  it("blocks pet products from other human collections before stale assignments are considered", () => {
    const petProduct = {
      title: "Portable Dog Grooming Brush",
      handle: "portable-dog-grooming-brush",
      product_type: "Massage Tool",
    };
    const staleKnowledge = {
      departmentId: "wellness",
      subcategoryId: "massage-recovery",
      proposedTags: ["massage-tools", "relaxation-products", "medical-accessories"],
      collectionTargets: ["massage-tools", "relaxation-products", "medical-accessories"],
    };
    const tags = buildProductCollectionTags(petProduct, staleKnowledge);

    expect(tags).not.toEqual(expect.arrayContaining([
      "massage-tools",
      "relaxation-products",
      "medical-accessories",
    ]));
  });

  it("holds review-required classifications out of semantic collections", () => {
    const product = {
      title: "School Supplies Product Pending Review",
      handle: "school-supplies-product-pending-review",
    };
    const reviewKnowledge = {
      reviewRequired: true,
      subcategoryId: "writing-supplies",
      proposedTags: [],
      collectionTargets: ["stationery", "back-to-school"],
    };

    expect(buildProductCollectionTags(product, reviewKnowledge)).toEqual([]);
  });

  it("uses recipient-plus-gift evidence for Dad and Mom collections", () => {
    const dad = { title: "Leather Gift Set for Dad", handle: "leather-gift-set-for-dad" };
    const mom = { title: "Personalized Birthday Present for Mom", handle: "personalized-birthday-present-for-mom" };
    const unrelated = { title: "Men's Cotton Baseball Cap", handle: "mens-cotton-baseball-cap" };
    const knowledge = { proposedTags: [], collectionTargets: [], classificationRule: "general-merchandise" };

    expect(buildProductCollectionTags(dad, knowledge)).toContain("gifts-for-dad");
    expect(buildProductCollectionTags(mom, knowledge)).toContain("gifts-for-mom");
    expect(buildProductCollectionTags(unrelated, knowledge)).not.toEqual(expect.arrayContaining(["gifts-for-dad", "gifts-for-mom"]));
  });

  it("broadens living-aid, senior-solution, and candle evidence without requiring taxonomy", () => {
    const knowledge = { proposedTags: [], collectionTargets: [], classificationRule: "general-merchandise" };
    expect(buildProductCollectionTags(
      { title: "Adjustable Elderly Bed Rail Assistive Support", handle: "adjustable-elderly-bed-rail" },
      knowledge,
    )).toContain("daily-living-aids");
    expect(buildProductCollectionTags(
      { title: "Caregiver Daily Living Aid for Assisted Living", handle: "caregiver-daily-living-aid" },
      knowledge,
    )).toContain("senior-living-solutions");
    expect(buildProductCollectionTags(
      { title: "Scented Soy Candle in Glass Jar", handle: "scented-soy-candle-glass-jar" },
      knowledge,
    )).toContain("candles");
  });

  it("routes human footwear into the four precise footwear collections", () => {
    const men = {
      title: "Men's Leather Running Sneakers",
      handle: "mens-leather-running-sneakers",
      product_type: "Men's Shoes",
    };
    const women = {
      title: "Women's Formal Oxford Shoes",
      handle: "womens-formal-oxford-shoes",
      product_type: "Women's Footwear",
    };
    const kids = {
      title: "Kids Breathable Running Shoes",
      handle: "kids-breathable-running-shoes",
      product_type: "Kids Footwear",
    };
    const pet = {
      title: "Breathable Dog Mesh Shoes",
      handle: "breathable-dog-mesh-shoes",
      product_type: "Dog Mesh Shoes",
    };

    expect(buildProductCollectionTags(men, {
      departmentId: "men",
      subcategoryId: "footwear",
      proposedTags: [],
      collectionTargets: [],
    })).toEqual(expect.arrayContaining(["mens-footwear"]));
    expect(buildProductCollectionTags(women, {
      departmentId: "women",
      subcategoryId: "footwear",
      proposedTags: [],
      collectionTargets: [],
    })).toEqual(expect.arrayContaining(["womens-footwear", "formal-footwear"]));
    expect(buildProductCollectionTags(kids, {
      departmentId: "kids",
      subcategoryId: "kids-footwear",
      proposedTags: [],
      collectionTargets: [],
    })).toContain("kids-footwear");
    expect(buildProductCollectionTags(pet, {
      departmentId: "pets",
      subcategoryId: "footwear",
      proposedTags: [],
      collectionTargets: [],
    })).not.toEqual(expect.arrayContaining(["mens-footwear", "womens-footwear", "kids-footwear", "formal-footwear"]));
  });

  it("excludes shoe mentions that are accessories or storage", () => {
    const knowledge = { departmentId: "men", subcategoryId: "footwear", proposedTags: [], collectionTargets: [] };
    expect(buildProductCollectionTags(
      { title: "Travel Tote Bag with Shoe Compartment", handle: "travel-tote-bag-shoe-compartment" },
      knowledge,
    )).not.toContain("mens-footwear");
    expect(buildProductCollectionTags(
      { title: "Sports Insoles for Shoes", handle: "sports-insoles-for-shoes" },
      knowledge,
    )).not.toContain("mens-footwear");
  });

  it("routes human footwear into the common Footwear collection only", () => {
    const footwear = {
      title: "Women's Leather Walking Shoes",
      handle: "womens-leather-walking-shoes",
      product_type: "Women's Footwear",
    };
    const tags = buildProductCollectionTags(footwear, {
      departmentId: "women",
      subcategoryId: "footwear",
      proposedTags: [],
      collectionTargets: [],
    });
    expect(tags).toContain("footwear");
    expect(tags).toContain("womens-footwear");
    expect(tags).not.toContain("footwear-accessories");
  });

  it("keeps footwear accessories and non-human shoes out of common Footwear", () => {
    const knowledge = {
      departmentId: "general",
      subcategoryId: "footwear-accessories",
      proposedTags: ["footwear"],
      collectionTargets: ["footwear"],
    };
    expect(buildProductCollectionTags({ title: "Shoe Storage Organizer", handle: "shoe-storage-organizer" }, knowledge))
      .not.toContain("footwear");
    expect(buildProductCollectionTags({ title: "Dog Mesh Shoes", handle: "dog-mesh-shoes" }, {
      ...knowledge,
      departmentId: "pets",
      subcategoryId: "footwear",
    })).not.toContain("footwear");
  });

  it("routes jewelry subcategories and the broad Everyday Jewelry collection", () => {
    const examples = [
      ["rings", "Gold Statement Ring", "gold-statement-ring"],
      ["necklaces-pendants", "Sterling Silver Pendant Necklace", "sterling-silver-pendant-necklace"],
      ["bracelets", "Charm Bracelet", "charm-bracelet"],
      ["earrings", "Gold Hoop Earrings", "gold-hoop-earrings"],
    ];
    for (const [subcategoryId, title, handle] of examples) {
      const tags = buildProductCollectionTags({ title, handle }, {
        departmentId: "jewelry",
        subcategoryId,
        proposedTags: [],
        collectionTargets: [],
      });
      expect(tags).toContain(subcategoryId === "necklaces-pendants" ? "necklaces" : subcategoryId);
      expect(tags).toContain("everyday-jewelry");
      expect(tags).toContain("jewelry-accessories");
    }
  });

  it("separates school bags, lunch boxes, and water bottles from adjacent products", () => {
    const schoolBag = buildProductCollectionTags(
      { title: "Kids School Backpack with Laptop Sleeve", handle: "kids-school-backpack" },
      { departmentId: "camping-travel", subcategoryId: "backpacks", proposedTags: [], collectionTargets: [] },
    );
    expect(schoolBag).toEqual(expect.arrayContaining(["school-bags", "back-to-school"]));
    expect(schoolBag).not.toContain("stationery");

    const travelBag = buildProductCollectionTags(
      { title: "Lightweight Hiking Travel Backpack", handle: "lightweight-hiking-travel-backpack" },
      { departmentId: "camping-travel", subcategoryId: "backpacks", proposedTags: [], collectionTargets: [] },
    );
    expect(travelBag).not.toEqual(expect.arrayContaining(["school-bags", "back-to-school"]));

    const genericKidsBackpack = buildProductCollectionTags(
      { title: "Cute Kids Backpack", handle: "cute-kids-backpack" },
      { departmentId: "kids", subcategoryId: "backpacks", proposedTags: [], collectionTargets: [] },
    );
    expect(genericKidsBackpack).not.toEqual(expect.arrayContaining(["school-bags", "back-to-school"]));

    const bagAccessory = buildProductCollectionTags(
      { title: "Cartoon Backpack Pendant Keychain", handle: "cartoon-backpack-pendant-keychain" },
      { departmentId: "camping-travel", subcategoryId: "backpacks", proposedTags: [], collectionTargets: [] },
    );
    expect(bagAccessory).not.toContain("back-to-school");

    const schoolBagCover = buildProductCollectionTags(
      { title: "Waterproof School Backpack Rain Cover", handle: "waterproof-school-backpack-rain-cover" },
      { departmentId: "camping-travel", subcategoryId: "backpacks", proposedTags: [], collectionTargets: [] },
    );
    expect(schoolBagCover).not.toContain("school-bags");

    const lunchBox = buildProductCollectionTags(
      { title: "Kids School Stainless Steel Bento Lunch Box", handle: "kids-school-stainless-steel-bento-lunch-box" },
      { departmentId: "home-decor", subcategoryId: "food-storage-containers", proposedTags: [], collectionTargets: [] },
    );
    expect(lunchBox).toEqual(expect.arrayContaining(["lunch-boxes", "back-to-school"]));
    expect(lunchBox).not.toContain("stationery");

    const lunchBag = buildProductCollectionTags(
      { title: "Insulated Lunch Box Bag", handle: "insulated-lunch-box-bag" },
      { departmentId: "home-decor", subcategoryId: "food-storage-containers", proposedTags: [], collectionTargets: [] },
    );
    expect(lunchBag).not.toContain("lunch-boxes");

    const lunchNotes = buildProductCollectionTags(
      { title: "Cute Lunch Box Notes for Kids", handle: "cute-lunch-box-notes-for-kids" },
      { departmentId: "home-decor", subcategoryId: "food-storage-containers", proposedTags: [], collectionTargets: [] },
    );
    expect(lunchNotes).not.toContain("lunch-boxes");

    const coveredLunchBox = buildProductCollectionTags(
      { title: "Bento Lunch Box with Removable Cover", handle: "bento-lunch-box-removable-cover" },
      { departmentId: "home-decor", subcategoryId: "food-storage-containers", proposedTags: [], collectionTargets: [] },
    );
    expect(coveredLunchBox).toContain("lunch-boxes");

    const waterBottle = buildProductCollectionTags(
      { title: "Kids Leakproof School Water Bottle", handle: "kids-school-water-bottle" },
      { departmentId: "home-decor", subcategoryId: "drinkware", proposedTags: [], collectionTargets: [] },
    );
    expect(waterBottle).toEqual(expect.arrayContaining(["water-bottles", "back-to-school"]));

    const bottlePart = buildProductCollectionTags(
      { title: "Replacement Water Bottle Lid", handle: "replacement-water-bottle-lid" },
      { departmentId: "home-decor", subcategoryId: "drinkware", proposedTags: [], collectionTargets: [] },
    );
    expect(bottlePart).not.toContain("water-bottles");
    expect(bottlePart).not.toContain("back-to-school");
  });

  it("keeps Stationery limited to office and school stationery subcategories", () => {
    const stationery = buildProductCollectionTags(
      { title: "Student Gel Pen Writing Set", handle: "student-gel-pen-writing-set" },
      { departmentId: "office-school", subcategoryId: "writing-supplies", proposedTags: [], collectionTargets: [] },
    );
    expect(stationery).toContain("stationery");

    const officeStorage = buildProductCollectionTags(
      { title: "Desktop Storage Organizer", handle: "desktop-storage-organizer" },
      { departmentId: "office-school", subcategoryId: "desk-office-accessories", proposedTags: [], collectionTargets: [] },
    );
    expect(officeStorage).not.toContain("stationery");

    const typoedBottle = buildProductCollectionTags(
      { title: "Flat Water Botlte Sports Drinking Bottle", handle: "flat-water-botlte-sports-drinking-bottle" },
      { departmentId: "office-school", subcategoryId: "notebooks-planners", proposedTags: [], collectionTargets: [] },
    );
    expect(typoedBottle).not.toContain("stationery");
  });

  it("has no duplicate canonical handles or aliases", () => {
    const canonical = COLLECTION_GOVERNANCE_POLICIES.map((policy) => policy.handle);
    expect(new Set(canonical).size).toBe(canonical.length);
    const aliases = COLLECTION_GOVERNANCE_POLICIES.flatMap((policy) => policy.legacyHandles || []);
    expect(aliases.some((alias) => canonical.includes(alias))).toBe(false);
  });
});
