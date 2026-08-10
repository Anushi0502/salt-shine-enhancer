import { describe, expect, it } from "vitest";
import {
  buildProductKnowledgePayload,
  classifyProductKnowledge,
  PRODUCT_KNOWLEDGE_BASE_VERSION,
} from "@/lib/product-knowledge-base.js";
import {
  classifyCatalogTaxonomy,
  classifyCatalogTaxonomyWithoutOverrides,
} from "@/lib/catalog-taxonomy.js";

describe("product knowledge base", () => {
  it("classifies a product from reusable evidence and keeps false friends separate", () => {
    const lamp = classifyProductKnowledge({
      id: 1,
      handle: "usb-jellyfish-lamp",
      title: "USB Jellyfish Lamp",
      product_type: "lighting",
      tags: ["lamp", "lighting"],
    });
    const charger = classifyProductKnowledge({
      id: 2,
      handle: "lightning-charger-set",
      title: "Fast Lightning Charger Set",
      product_type: "electronics",
      tags: ["charger", "lightning"],
    });

    expect(lamp.familyId).toBe("home-lighting");
    expect(lamp.searchTerms).toContain("lamp");
    expect(charger.familyId).toBe("electronics");
    expect(charger.searchTerms).toContain("lightning");
    expect(charger.searchTerms).not.toContain("lighting");

    const lightUpToy = classifyProductKnowledge({
      id: 3,
      handle: "baby-bath-toy-led-light-up",
      title: "Cute Animals Bath Toy LED Light Up",
      product_type: "Baby Bath Toy",
      tags: ["kids toys", "baby"],
    });

    expect(lightUpToy.familyId).toBe("baby-family");
  });

  it("uses additive controlled tags when a product belongs to more than one shopper path", () => {
    const lunchBox = classifyProductKnowledge({
      id: 4,
      title: "Insulated Bento Lunch Box With Cutlery",
      handle: "insulated-bento-lunch-box-camping-meal-container",
    });
    const fitnessShaker = classifyProductKnowledge({
      id: 5,
      title: "Protein Shaker Bottle for Gym Workouts",
      handle: "protein-shaker-bottle-gym-workout",
    });

    expect(lunchBox.categoryId).toBe("kitchen-cookware");
    expect(lunchBox.relatedCategories).toEqual([
      expect.objectContaining({
        departmentId: "camping-travel",
        categoryId: "camping-essentials",
        relationship: "portable outdoor use",
      }),
    ]);
    expect(lunchBox.proposedTags).toEqual(expect.arrayContaining([
      "home-decor",
      "kitchen-cookware",
      "camping-travel",
      "camping-essentials",
    ]));
    expect(lunchBox.searchTerms).toContain("camping");

    expect(fitnessShaker.canonicalType).toBe("Fitness Shaker Bottle");
    expect(fitnessShaker.proposedTags).toEqual(expect.arrayContaining([
      "kitchen-cookware",
      "fitness-equipment",
    ]));
  });

  it("keeps the long tail unbounded through 100,000 unique product types", () => {
    const products = Array.from({ length: 100_000 }, (_, index) => ({
      id: index + 1,
      handle: `custom-product-${index + 1}`,
      title: `Custom Product ${index + 1}`,
      product_type: `custom type ${index + 1}`,
      tags: ["custom"],
    }));
    const payload = buildProductKnowledgePayload({ products, generatedAt: "2026-07-31T00:00:00.000Z" });

    expect(payload.version).toBe(PRODUCT_KNOWLEDGE_BASE_VERSION);
    expect(payload.totalProducts).toBe(100_000);
    expect(payload.uniqueProductTypes).toBe(100_000);
    expect(payload.uniqueProductKnowledgeRecords).toBe(100_000);
    expect(payload.types).toHaveLength(100_000);
    expect(payload.products).toHaveLength(100_000);
    expect(new Set(payload.products.map((product) => product.productKnowledgeId)).size).toBe(100_000);
    expect(new Set(payload.products.map((product) => product.specificTypeKey)).size).toBe(100_000);
  }, 60_000);

  it("keeps separate records distinct even when Shopify reuses a product type", () => {
    const first = classifyProductKnowledge({
      id: 1001,
      handle: "wireless-earbuds-black",
      title: "Wireless Earbuds Black",
      product_type: "electronics accessories",
    });
    const second = classifyProductKnowledge({
      id: 1002,
      handle: "wireless-earbuds-white",
      title: "Wireless Earbuds White",
      product_type: "electronics accessories",
    });

    expect(first.specificType).toBe(second.specificType);
    expect(first.productKnowledgeId).not.toBe(second.productKnowledgeId);
    expect(first.specificTypeKey).not.toBe(second.specificTypeKey);
  });

  it("uses product nouns and exclusions to prevent high-cost catalog mistakes", () => {
    const belt = classifyProductKnowledge({
      id: 10,
      title: "Women Leather Waist Belt With Gold Buckle",
      handle: "women-leather-waist-belt-gold-buckle",
      tags: ["WOMEN FAISHON"],
    });
    const pants = classifyProductKnowledge({
      id: 11,
      title: "Men Casual Cargo Pants",
      handle: "men-casual-cargo-pants",
    });
    const ring = classifyProductKnowledge({
      id: 12,
      title: "Simple Gold Finger Ring",
      handle: "simple-gold-finger-ring",
    });
    const ringLight = classifyProductKnowledge({
      id: 13,
      title: "Ring Light With Tripod for Video",
      handle: "ring-light-tripod-video",
    });
    const phoneCase = classifyProductKnowledge({
      id: 14,
      title: "Shockproof iPhone Case",
      handle: "shockproof-iphone-case",
    });
    const phoneHolder = classifyProductKnowledge({
      id: 15,
      title: "Car Phone Holder Mount",
      handle: "car-phone-holder-mount",
    });
    const penDrive = classifyProductKnowledge({
      id: 16,
      title: "USB Type C Pen Drive 128GB",
      handle: "usb-type-c-pen-drive-128gb",
    });

    expect(belt.subcategoryId).toBe("belts");
    expect(belt.familyId).not.toBe("apparel");
    expect(pants.subcategoryId).toBe("trousers-pants");
    expect(ring.subcategoryId).toBe("rings");
    expect(ringLight.subcategoryId).toBe("ring-lights");
    expect(phoneCase.subcategoryId).toBe("phone-cases");
    expect(phoneHolder.subcategoryId).toBe("phone-holders-mounts");
    expect(penDrive.subcategoryId).toBe("usb-flash-drives");
    expect(penDrive.proposedTags).toContain("type-c");
  });

  it("trusts explicit product language over conflicting supplier tags", () => {
    const bag = classifyProductKnowledge({
      id: 17,
      title: "Temperament Small Square Bag Autumn Shoulder",
      handle: "small-square-bag-shoulder-handheld-fashion",
      tags: ["BAGS AND WALLETS", "WOMEN FAISHON"],
    });
    const smartWatch = classifyProductKnowledge({
      id: 18,
      title: "Bluetooth Smart Watch With Phone Calling",
      handle: "bluetooth-smartwatch-fitness-smart-bracelet",
      tags: ["watches"],
    });
    const hairCare = classifyProductKnowledge({
      id: 19,
      title: "Keratin Protein Hair Straightening Cream",
      handle: "keratin-hair-care-treatment-smoothing-cream",
      tags: ["Beauty and Makeups", "Hair accessories"],
    });

    expect(bag.canonicalType).toBe("Bag");
    expect(smartWatch.canonicalType).toBe("Smart Watch");
    expect(hairCare.canonicalType).toBe("Hair Care");
  });

  it("does not infer wireless connectivity from supplier tags on wired devices", () => {
    const wiredMouse = classifyProductKnowledge({
      id: 25,
      title: "USB Optical Wired Mouse Laptop Office",
      handle: "usb-optical-wired-mouse-laptop-office",
      tags: ["wireless", "bluetooth", "computer mouse"],
    });
    const wirelessMouse = classifyProductKnowledge({
      id: 26,
      title: "Wireless Bluetooth Mouse",
      handle: "wireless-bluetooth-mouse",
    });

    expect(wiredMouse.attributes.features || []).not.toEqual(expect.arrayContaining(["wireless", "bluetooth"]));
    expect(wiredMouse.proposedTags).not.toContain("wireless");
    expect(wiredMouse.proposedTags).not.toContain("bluetooth");
    expect(wirelessMouse.attributes.features).toEqual(expect.arrayContaining(["wireless", "bluetooth"]));
    expect(wirelessMouse.proposedTags).toEqual(expect.arrayContaining([
      "wireless",
      "bluetooth",
    ]));
  });

  it("does not let stale merchandising signals override direct product evidence", () => {
    const mensShoes = classifyProductKnowledge({
      id: 27,
      title: "Men Running Shoes Marathon Sneakers",
      handle: "men-running-shoes-marathon-sneakers",
      tags: ["salt:audience:men", "salt:category:men-fashion", "salt:department:men"],
      customData: { collectionSignal: "Baby & Children's Athletic Shoes" },
    });
    const lunchBox = classifyProductKnowledge({
      id: 28,
      title: "Side Open Lunch Box",
      handle: "side-open-lunch-box-bento-food-container",
      tags: ["salt:category:kitchen-cookware", "salt:department:home-decor"],
      customData: { collectionSignal: "Pen & Pencil Cases" },
    });

    expect(mensShoes.departmentId).toBe("men");
    expect(mensShoes.categoryId).toBe("men-fashion");
    expect(mensShoes.categoryId).not.toBe("kids-wear");
    expect(lunchBox.categoryId).toBe("kitchen-cookware");
    expect(lunchBox.categoryId).not.toBe("office-school-supplies");
  });

  it("does not let an audience supplier tag override a conflicting title", () => {
    const womensShirt = classifyProductKnowledge({
      id: 29,
      title: "T-Shirt For Women Loose Cotton Top",
      handle: "t-shirt-for-women-loose-cotton-top",
      tags: ["Men T shirts", "salt:audience:women"],
    });

    expect(womensShirt.departmentId).toBe("women");
    expect(womensShirt.categoryId).toBe("women-fashion");
    expect(womensShirt.categoryId).not.toBe("men-fashion");
  });

  it("lets a title-level product noun beat conflicting supplier-handle words", () => {
    const pants = classifyProductKnowledge({
      id: 21,
      title: "Unisex Casual Elegant Pants For Work And Weekend Looks",
      handle: "womens-trousers-autumn-new-one-perfect-pant-store-streetwear-fashion-belt-casual-slim-pants-black-sexy-elegant-female-trousers",
      tags: ["WOMEN FAISHON"],
    });
    const watch = classifyProductKnowledge({
      id: 22,
      title: "Smael Mens Watch Multifunctional Sports 50m",
      handle: "smael-8109-new-mens-watch-multifunctional-sports-50m-waterproof-dual-display-led-night-light-leisure-student-electronic-watch",
      tags: ["watches"],
    });
    const womensWatch = classifyProductKnowledge({
      id: 23,
      title: "Hot Watch Leather Skeleton Strap",
      handle: "hot-fashion-women-watch-luxury-leather-skeleton-strap-watch-women-dress-watch-casual-quartz-watch-reloj-mujer-wristwatch-girl",
      tags: ["watches", "Women watches", "womens accessories"],
    });
    const batteryChargerBoard = classifyProductKnowledge({
      id: 24,
      title: "Automatic Solar Panel Battery Charger Board Night Light LED Lamp",
      handle: "automatic-solar-panel-battery-charger-board-night-light-led-lamp-control-switch-battery-charger-charging-controller-module",
    });

    expect(pants.canonicalType).toBe("Pants");
    expect(pants.familyId).toBe("apparel");
    expect(watch.canonicalType).toBe("Watch");
    expect(watch.familyId).toBe("jewelry-accessories");
    expect(womensWatch.canonicalType).toBe("Watch");
    expect(womensWatch.familyId).toBe("jewelry-accessories");
    expect(batteryChargerBoard.familyId).toBe("electronics");
    expect(batteryChargerBoard.familyId).not.toBe("home-lighting");
  });

  it("does not route products into legacy or wrong-audience collections", () => {
    const mensWallet = classifyProductKnowledge({
      id: 30,
      title: "Men Leather Wallet With Card Slots",
      handle: "men-leather-wallet-card-slots",
    });
    const womensBag = classifyProductKnowledge({
      id: 31,
      title: "Women Shoulder Handbag",
      handle: "women-shoulder-handbag",
    });
    const planner = classifyProductKnowledge({
      id: 32,
      title: "Weekly Study Planner Notebook",
      handle: "weekly-study-planner-notebook",
    });

    expect(mensWallet.collectionTargets).not.toContain("women-bags-and-wallets");
    expect(womensBag.collectionTargets).toContain("women-bags-and-wallets");
    expect(planner.collectionTargets).not.toContain("books");
  });

  it("withholds SEO tags when catalog evidence is insufficient", () => {
    const unknown = classifyProductKnowledge({
      id: 20,
      title: "ZX-72 Experimental Merchandise",
      handle: "zx-72-experimental-merchandise",
      tags: ["misc"],
    });

    expect(unknown.reviewRequired).toBe(true);
    expect(unknown.seoEligible).toBe(false);
    expect(unknown.proposedTags).toEqual([]);
  });

  it("uses image-reviewed corrections for ambiguous catalog products", () => {
    const hairClip = {
      id: 8049806999651,
      title: "Elegant Unisex Hair Clip For Hair Styling And Outfit Detail",
      handle: "korean-women-elegant-hair-clips-barrettes-for-girls-metal-hair-claws-hairpin-bangs-duckbill-clip-ponytail-fashion-accessories",
      tags: ["Hair accessories", "women accessories", "womens accessories"],
    };
    const waxPot = {
      id: 8037094555747,
      title: "Bee Wax Melting Pot Stainless Steel",
      handle: "2-5l-bee-wax-melting-pot-stainless-steel-pouring-pot-beekeeping-tool-silver-beekeeping-melting-equipment-set-melting-tank",
    };
    const targetGame = {
      id: 8066093711459,
      title: "1 Set Of Toys Suitable For Indoor And Outdoor Activities Including",
      handle: "1-set-of-toys-suitable-for-indoor-and-outdoor-activities-including-sports-jumping-cartoon-dart-board-throwing-sticky-balls",
    };
    const desktopOrganizer = {
      id: 8069099225187,
      title: "1pc Pp Desktop Double Layer Storage Rack Rectangular White",
      handle: "1pc-pp-desktop-double-layer-storage-rack-rectangular-white-organizing-student-desk-office-cosmetics-stationery",
    };

    expect(classifyCatalogTaxonomyWithoutOverrides(hairClip).reviewRequired).toBe(true);
    expect(classifyCatalogTaxonomy(hairClip)).toMatchObject({
      ruleId: "hair-accessories",
      subcategoryId: "hair-accessories",
      reviewRequired: false,
    });
    expect(classifyCatalogTaxonomy(waxPot)).toMatchObject({
      ruleId: "beekeeping-supplies",
      subcategoryId: "beekeeping-supplies",
      reviewRequired: false,
    });
    expect(classifyCatalogTaxonomy(targetGame)).toMatchObject({
      ruleId: "target-games",
      subcategoryId: "target-games",
      reviewRequired: false,
    });
    expect(classifyCatalogTaxonomy(desktopOrganizer)).toMatchObject({
      ruleId: "office-desk",
      subcategoryId: "desk-office-accessories",
      reviewRequired: false,
    });
  });
});
