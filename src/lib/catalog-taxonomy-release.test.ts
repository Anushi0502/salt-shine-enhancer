import { describe, expect, it } from "vitest";

import {
  buildCatalogTaxonomyReleasePlan,
  buildManagedTagAdditions,
  buildTaxonomyMetafieldValue,
  isActiveShopifyProduct,
  isOnlineStorePublishedLiveProduct,
  taxonomyMetafieldMatches,
  verifyTaxonomyTaskReadback,
} from "@/lib/catalog-taxonomy-release.js";
import { classifyCatalogTaxonomy, classifyCatalogTaxonomyByRuleId } from "@/lib/catalog-taxonomy.js";
import { buildProductKnowledgeFromTaxonomy } from "@/lib/product-knowledge-base.js";

describe("catalog taxonomy release", () => {
  it("keeps short-sleeve shirts out of the shorts taxonomy", () => {
    const classification = classifyCatalogTaxonomy({
      title: "Custom Name And Number Men's Embroidery Baseball Jersey Short Sleeve T-Shirt",
      handle: "custom-name-and-number-mens-embroidery-baseball-jersey-short-sleeve-t-shirt",
    });

    expect(classification.ruleId).not.toBe("shorts");
  });

  it("keeps lavalier microphones out of phone-case taxonomy", () => {
    const classification = classifyCatalogTaxonomy({
      title: "Wireless Lavalier Microphone With Windproof Cover For iPhone",
      handle: "wireless-lavalier-microphone-with-windproof-cover-for-iphone",
    });

    expect(classification.ruleId).toBe("microphones");
    expect(classification.ruleId).not.toBe("phone-case");
  });

  it("classifies compact flowerpots as planters rather than cookware", () => {
    const classification = classifyCatalogTaxonomy({
      title: "Plastic Flowerpot Grow Box For Flowers And Plants",
      handle: "flowerpot-plastic-grow-box-for-flowers-and-plants",
    });

    expect(classification.ruleId).toBe("plant-pots");
    expect(classification.ruleId).not.toBe("cookware");
  });

  it("prefers cycling jerseys over shorts when the handle says short sleeve", () => {
    const classification = classifyCatalogTaxonomy({
      title: "Netcompany Ineos Cycling Team 2026 Jersey Set Bicycle Short Sleeve",
      handle: "netcompany-ineos-cycling-team-2026-jersey-set-bicycle-short-sleeve-clothing-kits-bike-shirts-suit-bicycle-bib-shorts-maillot",
    });

    expect(classification.ruleId).toBe("cycling-jerseys");
    expect(classification.ruleId).not.toBe("shorts");
  });

  it("keeps anime short-sleeve t-shirts out of anime shorts", () => {
    const classification = classifyCatalogTaxonomy({
      title: "Demon Slayer Anime Clothes Men's Short Sleeve T Shirt",
      handle: "demon-slayer-anime-clothes-mens-short-sleeve-t-shirt-spring-summer-outfit-middle-school-teen-kids-trendy-t-shirt-top",
    });

    expect(classification.ruleId).toBe("anime-graphic-tshirts");
    expect(classification.ruleId).not.toBe("anime-shorts");
  });

  it("prefers a child sleep sack over a generic camping sleeping bag", () => {
    const classification = classifyCatalogTaxonomy({
      title: "Sleeping Bag For Children 3 24 Months Kids Sleepwear Sleeve Removable",
      handle: "sleeping-bag-for-children-3-24months-kids-sleepwear-sleeve-removable-winter-warm-thicker-anti-kick-blanket-baby-sleepsack-3-5tog",
    });

    expect(classification.ruleId).toBe("kids-sleepwear");
    expect(classification.ruleId).not.toBe("camping-gear");
  });

  it("keeps artificial potted foliage out of cookware and planter taxonomy", () => {
    const classification = classifyCatalogTaxonomy({
      title: "Plastic Leaf Pots Kitchen Dining Accessories",
      handle: "artificial-ivy-plant-plastic-leaf-with-pots-wedding-festival-arch-decoration-home-window-sill-ornamental-flowerpot-wall-hanging",
    });

    expect(classification.ruleId).toBe("artificial-plants");
    expect(classification.ruleId).not.toBe("cookware");
    expect(classification.ruleId).not.toBe("plant-pots");
  });

  it("classifies collapsed baby jumpsuit handles as baby clothing", () => {
    const classification = classifyCatalogTaxonomy({
      title: "Gentleman Handsome Formal Dress Party Cotton",
      handle: "newborn-clothes-spring-and-autumn-0-18m-gentleman-style-handsome-formal-dress-party-cotton-comfortable-long-sleeved-babyjumpsuit",
    });

    expect(classification.ruleId).toBe("baby-rompers-clothing");
    expect(classification.ruleId).not.toBe("dresses");
  });

  it("uses explicit handkerchief handle evidence over incidental pants or towel words", () => {
    const classification = classifyCatalogTaxonomy({
      title: "Square Hanky Chest Towel Suit Accessories",
      handle: "brand-handkerchief-man-floral-paisley-striped-fit-formal-party-pocket-square-hanky-chest-towel-suit-accessories-men-necktie",
    });

    expect(classification.ruleId).toBe("handkerchiefs-pocket-squares");
    expect(classification.ruleId).not.toBe("towels");
    expect(classification.ruleId).not.toBe("ties");
  });

  it("keeps Crocs decorations out of the shoe taxonomy", () => {
    const classification = classifyCatalogTaxonomy({
      title: "Cartoon Cute 11pcs Demon Slayer Collection",
      handle: "cartoon-cute-11pcs-demon-slayer-collection-charms-diy-decorations-decorations-sandal-decorate-for-crocs-party-gift",
    });

    expect(classification.ruleId).toBe("shoe-charms");
    expect(classification.ruleId).not.toBe("shoes");
  });

  it("uses explicit anime figure and keychain handle nouns over stale generated copy", () => {
    const figure = classifyCatalogTaxonomy({
      title: "Car Ornaments Cartoon Toys Gifts",
      handle: "anime-naruto-figure-naruto-kakashi-figures-action-figure-accessories-car-ornaments-cartoon-kids-toys-gifts",
    });
    const keychain = classifyCatalogTaxonomy({
      title: "Jiraiya Pvc Keychain Bag Keyring Charm",
      handle: "naruto-anime-figures-naruto-sasuke-kakashi-itachi-jiraiya-pvc-keychain-bag-keyring-charm-accessories-kids-toys-birthday-gifts",
    });

    expect(figure.ruleId).toBe("anime-figures-standees");
    expect(keychain.ruleId).toBe("key-ring");
  });

  it("routes photo album keychains to card-collecting supplies instead of wallets", () => {
    const classification = classifyCatalogTaxonomy({
      title: "Holder Photo Keychain Albums Pendant",
      handle: "holder-photo-keychain-albums-pendant-pictures-storage-card-bag-collection-card-holder-card-book-keyring-photo-album-keychain",
    });

    expect(classification.ruleId).toBe("photo-album-keychains");
    expect(classification.collectionTargets).toContain("office-school-supplies");
    expect(classification.ruleId).not.toBe("wallets");
  });

  it("keeps anime card-holder lanyards out of trading-card collections", () => {
    const classification = classifyCatalogTaxonomy({
      title: "Anime Characters Card Holder Lanyard Keychain Id Credit Bus Card",
      handle: "anime-characters-card-holder-lanyard-keychain-id-credit-bus-card-cover-hang-rope-lariat-lanyard-key-rings-fans-gifts",
    });

    expect(classification.ruleId).toBe("card-holder-lanyards");
    expect(classification.ruleId).not.toBe("anime-trading-cards");
  });

  it("does not treat a camera lanyard as a card-holder product", () => {
    const classification = classifyCatalogTaxonomy({
      title: "Kids Instant Print Camera With Print Paper",
      handle: "kids-instant-print-camera-ips-screen-selfie-toy-camera-with-print-paper-32g-card-lanyard-diy-gift-for-3-12-years-boys-girls",
    });

    expect(classification.ruleId).not.toBe("card-holder-lanyards");
  });

  it("only adds missing managed tags and preserves legacy tags exactly", () => {
    expect(
      buildManagedTagAdditions(
        ["WOMEN FAISHON", "Hair Nourishment", "salt:department:women"],
        ["women", "women-fashion", "belt"],
      ),
    ).toEqual(["women-fashion", "belt"]);
  });

  it("fails closed for products that are not published to Online Store", () => {
    expect(
      isOnlineStorePublishedLiveProduct({
        status: "ACTIVE",
        resourcePublications: {
          nodes: [{ isPublished: true, channel: { name: "Point of Sale" } }],
        },
      }),
    ).toBe(false);
    expect(
      isOnlineStorePublishedLiveProduct({
        status: "ACTIVE",
        resourcePublications: {
          nodes: [{ isPublished: true, channel: { name: "Online Store" } }],
        },
      }),
    ).toBe(true);
  });

  it("recognizes every active Shopify product for the all-product release phase", () => {
    expect(isActiveShopifyProduct({ status: "ACTIVE" })).toBe(true);
    expect(isActiveShopifyProduct({ status: "DRAFT" })).toBe(false);
    expect(isActiveShopifyProduct({ status: "ARCHIVED" })).toBe(false);
  });

  it("resolves checked-in hyphenated rule ids at the release boundary", () => {
    const classification = classifyCatalogTaxonomyByRuleId(
      { title: "Order Price Difference Adjustment", handle: "order-price-difference-adjustment" },
      "order-price-adjustments",
      { source: "test" },
    );

    expect(classification).toMatchObject({
      ruleId: "order-price-adjustments",
      reviewRequired: false,
      seoEligible: false,
    });
  });

  it("creates an additive task for an active product before the publication phase", () => {
    const local = {
      id: 1,
      handle: "women-leather-waist-belt",
      title: "Women Leather Waist Belt",
      tags: ["WOMEN FAISHON"],
    };
    const plan = buildCatalogTaxonomyReleasePlan([local], [
      {
        id: "gid://shopify/Product/1",
        handle: local.handle,
        status: "ACTIVE",
        tags: ["WOMEN FAISHON"],
      },
    ]);

    expect(plan.summary.ready).toBe(1);
    expect(plan.tasks[0]?.initialTags).toEqual(["WOMEN FAISHON"]);
    expect(plan.tasks[0]?.tagsToAdd).toContain("belt");
    expect(plan.tasks[0]?.tagsToAdd.every((tag) => !tag.includes(":"))).toBe(true);
    expect(plan.tasks[0]?.metafieldNeedsUpdate).toBe(true);
  });

  it("uses frozen product knowledge without mutating authoritative collection tags", () => {
    const local = {
      id: 4,
      handle: "wireless-lavalier-microphone-for-phone",
      title: "Wireless Lavalier Microphone For Phone",
    };
    const taxonomy = classifyCatalogTaxonomyByRuleId(local, "microphones", {
      source: "catalog-integrity-test",
    });
    const knowledge = buildProductKnowledgeFromTaxonomy(local, taxonomy);
    const plan = buildCatalogTaxonomyReleasePlan([local], [
      {
        id: "gid://shopify/Product/4",
        handle: local.handle,
        status: "ACTIVE",
        tags: ["salt:collection:microphones"],
      },
    ], {
      mutateTags: false,
      knowledgeByHandle: new Map([[local.handle, knowledge]]),
    });

    expect(plan.tasks[0]?.knowledge.classificationRule).toBe("microphones");
    expect(plan.tasks[0]?.proposedTags).toContain("microphone");
    expect(plan.tasks[0]?.tagsToAdd).toEqual([]);
    expect(plan.tasks[0]?.mutateTags).toBe(false);
    expect(plan.policy.managedTags).toContain("collection integrity is authoritative");
  });

  it("does not schedule a taxonomy metafield rewrite when the live value is exact", () => {
    const local = {
      id: 1,
      handle: "women-leather-waist-belt",
      title: "Women Leather Waist Belt",
    };
    const expectedValue = buildTaxonomyMetafieldValue(local);
    const plan = buildCatalogTaxonomyReleasePlan([local], [
      {
        id: "gid://shopify/Product/1",
        handle: local.handle,
        status: "ACTIVE",
        tags: [],
        taxonomyMetafield: {
          namespace: "salt_taxonomy",
          key: "classification",
          value: expectedValue,
        },
      },
    ]);

    expect(plan.tasks[0]?.metafieldNeedsUpdate).toBe(false);
    expect(taxonomyMetafieldMatches(
      { taxonomyMetafield: { value: expectedValue } },
      plan.tasks[0]?.taxonomyMetafield,
    )).toBe(true);
  });

  it("requires a tag superset and exact managed metafield readback", () => {
    const local = {
      id: 1,
      handle: "women-leather-waist-belt",
      title: "Women Leather Waist Belt",
      tags: ["WOMEN FAISHON"],
    };
    const plan = buildCatalogTaxonomyReleasePlan([local], [
      {
        id: "gid://shopify/Product/1",
        handle: local.handle,
        status: "ACTIVE",
        tags: ["WOMEN FAISHON"],
      },
    ]);
    const task = plan.tasks[0];
    const readback = {
      tags: [...task.initialTags, ...task.tagsToAdd],
      metafields: [
        {
          namespace: "salt_taxonomy",
          key: "classification",
          value: task.taxonomyMetafield.value,
        },
      ],
    };

    expect(verifyTaxonomyTaskReadback(task, readback)).toMatchObject({ ok: true });
    expect(JSON.parse(buildTaxonomyMetafieldValue(local))).toMatchObject({
      canonicalType: { label: "Belt" },
      category: { id: "women-accessories" },
    });
  });

  it("records related buyer paths as additive category tags instead of Shopify category writes", () => {
    const local = {
      id: 3,
      handle: "insulated-bento-lunch-box",
      title: "Insulated Bento Lunch Box",
    };
    const plan = buildCatalogTaxonomyReleasePlan([local], [
      {
        id: "gid://shopify/Product/3",
        handle: local.handle,
        status: "ACTIVE",
        tags: ["Kitchen"],
      },
    ]);
    const task = plan.tasks[0];
    const metafield = JSON.parse(task?.taxonomyMetafield.value || "{}");

    expect(task?.tagsToAdd).toEqual(expect.arrayContaining([
      "kitchen-cookware",
      "camping-essentials",
    ]));
    expect(metafield.relatedCategories).toEqual([
      expect.objectContaining({
        category: expect.objectContaining({ id: "camping-essentials" }),
        tagging: "additive-controlled-tag",
      }),
    ]);
    expect(plan.policy.categoryMembership).toContain("no Shopify product category mutation");
  });

  it("processes a low-confidence product without applying a potentially wrong category tag", () => {
    const local = {
      id: 2,
      handle: "zx-72-imported-unit",
      title: "ZX-72 Imported Unit",
    };
    const plan = buildCatalogTaxonomyReleasePlan([local], [
      {
        id: "gid://shopify/Product/2",
        handle: local.handle,
        status: "ACTIVE",
        tags: ["Legacy importer wording"],
      },
    ]);

    expect(plan.summary.ready).toBe(1);
    expect(plan.summary.reviewMarked).toBe(1);
    expect(plan.tasks[0]?.tagsToAdd).toEqual([]);
    expect(plan.tasks[0]?.knowledge.reviewRequired).toBe(true);
    expect(JSON.parse(plan.tasks[0]?.taxonomyMetafield.value || "{}")).toMatchObject({
      reviewRequired: true,
      tagApplication: "withheld-pending-review",
    });
  });

  it.each([
    ["10 100 Pcs Cartoon Dinosaur Liquid Free Bubble Empty Bottle For Kids", "bubble-toys"],
    ["120ML Unisex Fresh Perfume Car Aromatherapy Car Fragrance", "car-fragrance"],
    ["1pc Time Saver Reusable Washable Lint Roller", "lint-rollers"],
    ["10sets Mouse Skates Pad Mouse Feet for Logitech", "mouse-accessories"],
    ["2 Practical Reusable Seasoning Containers Salt And Pepper Bottle Set", "kitchen-seasoning"],
    ["20 Toys For Soldiers And Children", "toy-figures"],
    ["200ML Salad Dressing Shaker BPA Free", "kitchen-seasoning"],
    ["22pcs Professional Makeup Brushes Tools", "makeup-brush-sets"],
    ["36ML Castor Oil Cold Pressed", "carrier-oils"],
    ["24pcs Hand Cream Hydrating Moisturizing", "hand-care"],
    ["24pcs Plastic Beadable Pens Black Ink", "beadable-pens"],
    ["50 Piece Pimple Patches For Daily Beauty Routines", "acne-patches"],
    ["26pcs Cartoon Cat Book Alphabet Stickers", "decorative-stickers"],
    ["2L Sports Water Jug Large Capacity", "sports-water-jugs"],
    ["2pcs Kids Funny Prank Ketchup Bottles Practical Joke", "prank-toys"],
    ["2pcs Stainless Steel Powdered Sugar Shakers With Handle Fine Mesh", "kitchen-seasoning"],
    ["30 Page Children Grid Symmetrical Drawing Toy", "drawing-activity-toys"],
    ["300g Locion Corporal De Para Hombres", "body-lotions"],
    ["30g Hand Foot Cream Can Deeply Nourish", "hand-foot-care"],
    ["60ML Hair Removal Cream", "hair-removal-creams"],
    ["60g Female Intimate Cream Moisturizing", "intimate-care"],
    ["30pcs Makeup Remover Wipes Face Moisturizing", "makeup-remover-wipes"],
    ["48ml Hydrating Concentrate", "hydrating-concentrates"],
    ["30ML Oil Aceite Para Bajar De Peso", "slimming-massage-oils"],
    ["50pcs Refillable Glass Spray Bottle", "refillable-spray-bottles"],
    ["350ML Reusable Drink Containers For Bubble Tea", "reusable-drink-bottles"],
    ["3d Geometric Pillar Candle Mold DIY Candles", "candle-molds"],
    ["4pcs Cute Cat Kitchen Towels", "kitchen-towels"],
    ["3d Whitewash Brick Tile Stickers Water Resistant", "wall-tile-stickers"],
    ["Cute Retractable Pens Cat Gel Pens Cartoon Pen", "gel-pens"],
    ["500ML Liquid Measurement Graduated Cylinder", "science-measuring-tools"],
    ["50g Green Plush Handmade DIY Crochet Knitting Sweater Bag Hair Loop Hand Account Book Yarn", "yarn-crochet-supplies"],
    ["304 Stainless Steel Hexagon Socket Screw Locking Splint", "hardware-fasteners"],
    ["300ML Baby Feeding Bottle With Handle", "baby-care"],
    ["Men Outdoor Sports Fitness Casual Socks", "socks"],
    ["Football Sports Socks Men Anti Slip", "sports-socks"],
    ["480ML Water Bottle With Straw Kids Girls", "straw-water-bottles"],
    ["Table Altars Plate Holder Divinations Ceremony Candlestick", "altar-ceremony-decor"],
    ["Plastic Squeezable Bottles Dropper Bottles Ink Glue Dispensers", "precision-dispensing-bottles"],
    ["Set Bottle Beer Miniatures For 1 12 Dollhouse", "dollhouse-miniatures"],
    ["Small Plastic Bottle 100ML Milk Bottles Small Juice Bottles", "small-beverage-bottles"],
    ["Cica Panthenol Moisturizing Cream Hydrating", "cica-panthenol-cream"],
    ["Stainless Steel Shaker For Cocktails Cocktail Mixer", "cocktail-shakers"],
    ["Removable Piano Keyboard Stickers For Beginners", "piano-keyboard-labels"],
    ["Forehead Nasolabial Fold Patch", "face-smoothing-patches"],
    ["A5 Book Jacket Lace Fabric Protective Cover", "book-covers"],
    ["Acrylic Brochure Holder Clear Literature Flyer", "literature-holders"],
    ["Acrylic Periodic Table Figurines Mendeleev Printing", "periodic-table-desk-decor"],
    ["Absorbent Pet Feeding Mat Waterproof", "pet-feeding-mats"],
    ["Adult English Calligraphy Copybook Learn to Write", "calligraphy-workbooks"],
    ["Adult Sensory Stress Squeeze Toy Squishy Relax", "stress-squeeze-toys"],
    ["Panda Patches For Dress Embroidery Badge", "embroidery-patches"],
    ["Lightening Face Care Set Whitening Serum Day Cream", "brightening-skincare-sets"],
    ["Air Fryer Parchment Paper Liners", "air-fryer-liners"],
    ["All Day Hydrating Calming Skin Cream", "calming-skin-creams"],
    ["Aluminum Alloy Laptop Bracket Rotation Foldable", "laptop-stands"],
    ["Ampoule Bottle Opener Easiest Nurse Assistant", "ampoule-openers"],
    ["Nicotinamide Moisturizing Cream Daily Care", "niacinamide-creams"],
    ["Cash Savings Book Wallet Money Book", "cash-savings-binders"],
    ["Artificial Flower Green Leaf Lighting String", "artificial-vine-lights"],
    ["Artificial Peony Rose Bouquet Silk Flowers", "artificial-flower-bouquets"],
    ["Artificial Pine Bonsai Tree Desktop Decoration", "artificial-plants"],
    ["Electric Pepper And Salt Grinder Set Rechargeable", "electric-spice-grinders"],
    ["Automatic Aromatherapy Diffuser Car Air Freshner", "car-fragrance"],
    ["Mini Electric Popcorn Maker For Home Kitchen", "popcorn-machines"],
    ["Automatic Powder Mixing Machine For Mixing And Filling Tasks", "industrial-mixing-filling-machines"],
    ["Baby Forehead Temperature Sticker Flexible Digital Thermometer", "baby-thermometers"],
    ["Baby Pajamas Sets Cotton Child Pajamas Toddler", "kids-sleepwear"],
    ["Baby Toy Cartoon Press Gear Car Toy Inertia Pull Back", "toy-vehicles"],
    ["Banana Shaped Loose Powder Can Reduce Pores", "loose-face-powders"],
    ["Banknote Savings Book With Closure Flip Pocket Wallet", "cash-savings-binders"],
    ["Base Makeup Facial Moisturizing Primer", "makeup-primers"],
    ["Bath Bombs For Kids With Surprise Inside", "kids-bath-bombs"],
    ["Beach Toys Shovel Sandbox Castle Building", "beach-sand-toys"],
    ["Black Surma Kuhla Classic Kajal Traditional", "kohl-kajal-eye-makeup"],
    ["Blue Bottle Stickers Birthday Holiday Party", "party-bottle-stickers"],
    ["Bluetooth Smart Aroma Diffuser For Home And Hotels", "home-aroma-diffusers"],
    ["Blushes Pearlescent Blusher Powder Brighten Facial", "blush-powders"],
    ["Body Firming Moisturizing Oil Moisturizes Lifts", "body-firming-oils"],
    ["Bicycle School Kids Water Bottle", "cycling-water-bottles"],
    ["Boys Gyro Toys Metal Battle Gyro Battle Spinning", "spinning-top-toys"],
    ["Brightening Blusher Cream Natural Transparent Lightweight", "cream-blushes"],
    ["Lip Brightening Cream Enhance Gloss Elasticity", "lip-brightening-creams"],
    ["Bubble Electric Gun Toy Children Outdoor", "bubble-electric-guns"],
    ["Caffeine Moisturizing Cream Provides Lifting", "body-firming-creams"],
    ["Calendula Motsturizing Cream Improve Skin Lifting", "calendula-skin-creams"],
    ["Camping Fishing Flat Caps Casquette Gorras", "flat-caps"],
    ["Can Shape Bowling Toy For Kids Indoor", "kids-bowling-games"],
    ["Cards Holder Albums 20page Board Game", "collectible-card-albums"],
    ["Capybara Stationery Graduation Birthday Gift", "stationery-gift-sets"],
    ["Car Seat Back Kick Protector With Organizer Pockets", "car-seat-back-organizers"],
    ["High Pressure Car Wash Foam Sprayer", "car-wash-sprayers"],
    ["Cartoon Dinosaur Table Cover Birthday Supplies", "party-table-covers"],
    ["Centella Asiatica Eye Cream Moisturizes Tightens", "eye-creams"],
    ["Ceramic Dinner Bowl Bowl Set", "ceramic-bowl-sets"],
    ["Damascus Kitchen Knife Set Chef Meat Fruit Knives", "kitchen-knife-sets"],
    ["Children Outdoor Sports Games Toss And Catch Ball Set Two Player", "toss-catch-games"],
    ["Children Playing House Little Doctor Toys Stethoscope Medical Kit", "kids-doctor-playsets"],
    ["Children Toys Electric Animals Simulated Cows Rabbits Zebras", "animal-figure-toys"],
    ["Children Toys Pretend Play Barbecue Fast Food Pizza Sushi", "pretend-play-food-sets"],
    ["Children Shooting Games Simulated Smoking Sound Effect And LED", "toy-blasters"],
    ["Children Toothpaste Sweet Orange Flavor Oral Cleansing", "kids-toothpaste"],
    ["Children Wooden Fishing Game Toys Early Education", "kids-fishing-games"],
    ["Christmas Glove Pattern Soy Wax Scented Candles", "novelty-shaped-candles"],
    ["Cleansing Balm Refreshing Non Greasy", "cleansing-balms"],
    ["Body Soap Cleansing Gentle Nourishment Oil Control Odor", "body-cleansing-soaps"],
    ["Clear Cosmetic Box Cover", "cosmetic-storage-boxes"],
    ["Collagen Shea Butter Skin Smoothing Cream", "collagen-shea-butter-creams"],
    ["Color Makeup Base Light Moisturizing", "color-correcting-makeup-bases"],
    ["Colorful 3 In 1 Stationery Set Cute Paper Clips Binder Clips", "binder-clip-sets"],
    ["Colors Liquid Powder Blusher Waterproof", "liquid-blushes"],
    ["Compact CO2 Air Diffuser For Planted Systems", "aquarium-co2-diffusers"],
    ["Cooking Apron Kitchen Kitchen Accessories", "kitchen-aprons"],
    ["Coolcold A9 RGB Laptop Cooler Fans", "laptop-cooling-pads"],
    ["Credit Card Holder Wallet Metal Name", "metal-card-wallets"],
    ["Crema Facial Lifting Con Colageno Y Q10", "facial-lifting-creams"],
    ["Custom Kids Name Tags For School Bottles Supplies Waterproof", "personalized-school-labels"],
    ["Cute Angel Wing Rabbit Harness Adjustable Pet", "small-pet-harnesses"],
    ["Cute Creative Chocolate Stationery Set For School Gift", "novelty-stationery-sets"],
    ["Cute plaid snacks printed cotton fabric patchwork doll skirt", "printed-craft-fabric"],
    ["Delicate Two Color Compact Powder Lightweight", "compact-face-powders"],
    ["Manual Retro Page Turning Alarm Clock Calendar", "alarm-clocks"],
    ["Dinosaur Themed Camping Bottle For Water Drinking Cup With Straw", "kids-straw-water-bottles"],
    ["Double-Sided Paper Cutter A4 Paper Cutter Small Manual Ledger", "paper-cutters"],
    ["Dr Browns Newborn Baby Glass Bottle Wide Caliber Anti Flatulence", "baby-feeding-bottles"],
    ["Dry Powder Spray Bottle Refillable Atomizer Baby Powder Dispenser", "body-powder-dispensers"],
    ["Educational Wooden Kids Toys Memory Games Match Fruit Animals", "kids-matching-games"],
    ["Electric Milk Frother Coffee Cappuccino Foamer", "milk-frothers"],
    ["Electric Shock Toy For Kids Touch Maze Game", "wire-loop-skill-games"],
    ["Electronic Pets Game Toys Virtual Tamagotchi", "virtual-pet-toys"],
    ["English Learning Small Laptop Toy For Children Kids", "kids-learning-laptop-toys"],
    ["Doctor Kit For Kids Ages 3 Toddler Toys Medical Playset", "kids-doctor-playsets"],
    ["European Street Mens Tie Dyed Straight Leg Jeans", "jeans"],
    ["Exquisite Adorable Patterned Stationery Sets Ideal For Creative Writing", "writing-stationery-sets"],
    ["Face Patches Pimples Microneedles Drying Patch", "makeup-microneedle-patches"],
    ["Man Facial Firming Cream Fade Fine Lines", "facial-lifting-creams"],
    ["Formal Wear Business Suit Cotton Ties", "formal-neckties"],
    ["Gentle Cleansing Oil Quickly Dissolves Makeup", "cleansing-oils"],
    ["Gentle Non Irritating Makeup Remover Cream Deep Cleansing", "makeup-remover-cleansing-balms"],
    ["Gentle Tender Abdominal Patch Convenient Easy", "abdominal-wellness-patches"],
    ["Gze Mens Pomade Long Lasting Hold", "hair-pomades"],
    ["False Eyelash Tweezers For Fake Eyelashes Extensions", "eyelash-tweezers"],
    ["Hair Removal Oil 60ML Natural Inhibitor", "hair-removal-oils"],
    ["Hanboro Automatic Watch Mechanical Wristwatch", "mechanical-watches"],
    ["Hands On Kids Kitchen Helper Set Realistic Play Food", "kids-kitchen-playsets"],
    ["Hanging Garbage Bag Stand Space Saving", "kitchen-trash-bag-holders"],
    ["High Heeled Shoes Come Black Eyeliner", "novelty-eyeliners"],
    ["Hole Silicone Cake Mold Air Fryer Kitchen Accessories", "silicone-baking-molds"],
    ["Hollow Hoe Handheld Weeding Rake Perfect", "garden-hoes-weeding-tools"],
    ["Hot New Numberblocks Assembly Model Toys Gift", "number-learning-toys"],
    ["Huge Kids Outdoor Playground Equipment For Sale", "outdoor-playground-equipment"],
    ["Hot Swappable Side Key Board For Op18k Op1w4k And Op1we", "gaming-mouse-replacement-boards"],
    ["India Kairali Dasanakanthi Choornam Traditional Cleaning", "herbal-tooth-powders"],
    ["Interesting Bottle Guessing Game Color", "bottle-guessing-games"],
    ["Makeup Remover Cream Deeply Cleanses Face Eyes And Lips", "makeup-remover-oils"],
    ["Italy Olivem1000 Olive Oil Emulsified Wax", "cosmetic-emulsifying-waxes"],
    ["Ivoskin Intensive Cica Repair Cream Korean", "cica-repair-creams"],
    ["Japanese Practice Copybook Standard Japanese Writing Exercise Book", "language-practice-copybooks"],
    ["Jute Tote Bag Jute Bags", "shopping-bags"],
    ["Keyboard Keychain Fidget Clicker Toy For Desk Use", "keyboard-fidget-keychains"],
    ["Keydiy Remote Key PCB Board For Vw Audi And Porsche", "car-remote-key-pcb-boards"],
    ["Kid Tablet 10inch Android15 20GB Ram", "kids-tablets"],
    ["Kid Travel Tray For Toddler Car Seat Travel Tray For Kids", "kids-car-seat-travel-trays"],
    ["Kids Anti Cavity Toothpaste With Hydroxyapatite Strawberry Flavor", "kids-toothpaste"],
    ["Kids Baby Anti Slip Cartoon Knee Pads Socks Sets", "baby-crawling-knee-pad-socks"],
    ["Kids Brush 360 Degree U Shaped Childrens Toothbrush", "kids-toothbrushes"],
    ["Kids Busy Board Toy Enhances Fine Motor Skills", "kids-busy-boards"],
    ["Kids Cash Register Toy With Real Calculator Pretend Play Store", "kids-cash-register-playsets"],
    ["Kids Diving Game Toys Skillmatics Pool Toys 64 Colorful Gems", "kids-diving-pool-games"],
    ["Kids DIY Cartoon Paper Cut Book Handmade Craft Scrapbooking Art", "kids-paper-craft-books"],
    ["Kids Electric Cars 24V Ride On Car Atv Bikes", "kids-ride-on-vehicles"],
    ["Kids Favors Breath Calm Anxiety Sensory Stickers", "calming-sensory-stickers"],
    ["Kids Kitchen Set Creative Feeding Toy Set Simulation Fruit Cutting", "kids-kitchen-food-cutting-sets"],
    ["Kids Kitchen Set With Realistic Cooking Tools Creative Role Play", "kids-cooking-tool-playsets"],
    ["Kids Makeup Kit For Girl Toys Washable Real Cosmetic Makeup", "kids-makeup-playsets"],
    ["Kids Money Bank With Lock Mini Metal Safe Box", "kids-money-bank-safes"],
    ["Kids Mountain Shaped Toothbrush Soft Bristles", "kids-toothbrushes"],
    ["Kids Pen Control Training Card For Childrens Concentration", "kids-pen-control-training-cards"],
    ["Kids Playground Outdoor Playhouse Wooden Kids Outdoor Wood Slide", "kids-outdoor-playhouses"],
    ["Kids Pretend Play Kitchen Toys Simulation Food Barbecue Cooking Toys", "kids-kitchen-food-cutting-sets"],
    ["Kids Pretend Role Play Toy Musical Car Key Simulation", "pretend-play-car-keys"],
    ["Kids Stress Relieving Pocket Klotski Educational Brain Teaser Toy", "sliding-puzzle-games"],
    ["Kids Tablet Toddler Learning Mat With LED Screen Teaches Music", "kids-electronic-learning-tablets"],
    ["Kids To Do List Chore Chart Slide Knob Checklist", "kids-chore-charts"],
    ["Kids Toothbrush Toddler Toothbrush Extra Soft", "kids-toothbrushes"],
    ["Kids Trash Can Childrens Waste Disposal Bin Easy Lift Lid", "kids-trash-bins"],
    ["Kids Walkie Talkie One Click Call Without Network Hd Video", "kids-video-walkie-talkies"],
    ["Kids Water Sensory Play Set Pigment Dropper Science", "kids-water-sensory-playsets"],
    ["Kids Toothbrush Toddler Toothbrush Extra Soft Floss Bristle", "kids-toothbrushes"],
    ["Kindergarten Nap Bed Solid Wood Bunk Bed", "kindergarten-bunk-beds"],
    ["Knee Compression Sleeve Adjustable Straps Running", "knee-compression-supports"],
    ["Kskin Steamer Facial Nano Ionic Face", "facial-steamers"],
    ["Ladies Watch Elegant Quartz Wristwatch Stylish", "quartz-watches"],
    ["Laikou Mens Hydrating Day Cream Spf30", "mens-spf-day-creams"],
    ["Lakerain Collagen Hydrating Facial Spray Deep", "collagen-facial-mists"],
    ["Laptop Sleeve Bag Inch Notebook Pouch", "laptop-sleeves"],
    ["Leg Straight Shorts Gym", "gym-shorts"],
    ["Lens Presbyopia Light", "vision-correction-lenses"],
    ["Library Lantern Decorative Bookshelf Lighting Reading Book Shelf Lights", "book-nook-lamps"],
    ["Life Skills For Kids Practical Guide To Cooking Cleaning Organizing", "kids-life-skills-books"],
    ["Lightweight Waterproof Bb Cream Long Lasting", "bb-creams"],
    ["Lint Catcher Rich Hair For Washing Machine", "washing-machine-lint-catchers"],
    ["Lip Aloe Balm Nourishing Refreshing Hydrating", "aloe-lip-balms"],
    ["Lip Brightening Balm Moisturizing Care Long", "lip-brightening-balms"],
    ["Lip Nourishing Oil Relieve Dryness Brightening", "lip-nourishing-oils"],
    ["Lip Plumper Oil Instantly Volumising Increase", "lip-plumper-oils"],
    ["Bubble Solution Refill Non Toxic Bubble Liquid", "bubble-solution-refills"],
    ["Long Lasting Makeup Oil Control Sweat", "makeup-setting-sprays"],
    ["Magnetic Car Sun Shade Pack Uv", "car-window-sun-shades"],
    ["Magnetic Gym Water Bottle Bag Non", "gym-water-bottle-holders"],
    ["Makeup Bob Three Dimensional Thick Beautiful Eye Black", "volumizing-mascaras"],
    ["Makeup Removal Oil Non Greasy Cleanse", "makeup-remover-oils"],
    ["Manganese Steel Weeding Rake Teeth Manual", "garden-weeding-rakes"],
    ["Marble Stripes Ceramic Soap Dish", "ceramic-soap-dishes"],
    ["Mens Hair Replacement Wig With Clips", "mens-hair-replacement-wigs"],
    ["Mens Body Care Kit Gentle Skin", "mens-body-care-kits"],
    ["Mens Personal Deodorant Cream Long Lasting", "mens-intimate-deodorant-creams"],
    ["Mens Collagen Moisturizing Cream Retinol Vitamins", "mens-retinol-face-creams"],
    ["Mens Short Grey Wig Natural Layered", "mens-hair-replacement-wigs"],
    ["Mens Toupee Real Human Hair Soft", "mens-hair-replacement-wigs"],
    ["Mens Sportswear Breathable Stylish Casual Activewear", "mens-activewear-sets"],
    ["Mens T Shirt More Boy Kissing T-Shirts Hip Hop Heated Rivalry Beach Tee Shirt Y2K Basic Print Cotton Clothes Gift Idea", "mens-graphic-tshirts"],
    ["Mens Tone Up Cream Hydrates Moisturizes", "mens-tone-up-creams"],
    ["Mini Gps Tracker Find My App", "bluetooth-item-trackers"],
    ["Ml Moisturizing Calming Essence Lotion Ha", "ceramide-calming-lotions"],
    ["Moeyu Anime Backpack School Shoulder Bag", "anime-school-shoulder-bags"],
    ["Moisturizes No Moisturizing Oil Control Sweat", "makeup-setting-sprays"],
    ["Moisturizing Aloe Vera Gel Suitable Face", "aloe-vera-gels"],
    ["Moisturizing Corrector Cream Lightweight Hydrating Facial", "moisturizing-corrector-creams"],
    ["Moisturizing Curl Mousse Creates Soft Curls", "curl-defining-mousses"],
    ["Moisturizing Facial Care Stick Lifting Deeply", "facial-lifting-care-sticks"],
    ["Moisturizing Lip Mask Gentle Hydration Nourish", "hydrating-lip-masks"],
    ["Moisturizing Lip Plumping Gloss Nutritious Mineral", "lip-plumper-oils"],
    ["Moisturizing Soothing Aloe Gel Rejuvenating", "aloe-vera-gels"],
    ["Moisturizing Soothing Cream 80ML Repairs Barrier", "skin-barrier-repair-creams"],
    ["Money Box Gift Holder Pull Out", "cash-surprise-gift-boxes"],
    ["Money Skills For Kids Financial Literacy Guide For Smart Spending", "kids-life-skills-books"],
    ["Moroccan Hexagonal Floor Stickers Non Slip", "moroccan-floor-tile-stickers"],
    ["Mountain River Incense Burner Backflow Aroma", "backflow-incense-burners"],
    ["Mouse Ring Remote Control Touchpad", "ring-remote-controls"],
    ["Multi Use Knife For Daily Kitchen Use And Daily Kitchen Accessories", "kitchen-knife-utensil-organizers"],
    ["Multipurpose Coconut Oil Hair Skin Makeup", "carrier-oils"],
    ["Muscle Patch Face Facial Nasolabial Folds", "face-smoothing-patches"],
    ["Nail Art Design Kitchen Apron", "nail-art-kitchen-aprons"],
    ["New Outdoor Toss And Catch Game Catch Toys Fine Motor Toys Toddler", "toss-catch-games"],
    ["New Women Denim Tie Waist Flare Jeans Boyfriend Jeans Ladies High Waist Skinny Bell Bottom Jeans Pants Autumn Wide Leg Mom Jeans", "womens-flare-jeans"],
    ["No Punch Kitchen Shelf Rack Sink Storage For Rags Spices", "kitchen-sink-storage-racks"],
    ["Reusable Plant Stem Support No Stake Trellis Organizer", "plant-stem-support-trellises"],
    ["Nordic Marbled Plates Golden Inlay Dinner Dish", "marbled-dinner-plate-sets"],
    ["Nordic Style Dressing Table Storage LED Organizer Modern Dressing", "led-vanity-dressing-tables"],
    ["Olive Oil Frizz Control Shine Glossing", "hair-glossing-oils"],
    ["Ouhole Lip Repair Balm Moisturizing Hydrating", "lip-repair-balms"],
    ["Oz Rosehip Seed Oil Hair Relaxer", "rosehip-seed-oils"],
    ["Pack Reusable Makeup Remover Pads Washable", "reusable-makeup-remover-pads"],
    ["Paired Toys Parent Child Interactive Teaching Tools Designed To", "kids-matching-games"],
    ["Colorful Drinking Straws Wedding Party Supplies Kitchen Essentials", "drinking-straws"],
    ["Pcs Handheld Bottle Opener Simple Seal", "handheld-can-bottle-openers"],
    ["10pcs Plastic Beadable Pens Bead Pens For DIY Making Kit", "beadable-pens"],
    ["Piece Moisturizing Hydrating Lightening Lip Lines", "lip-brightening-care-sets"],
    ["Piece Portable Camping Cookware Non Stick", "portable-camping-cookware-sets"],
    ["Polygonum Multiflorum Herbal Hair Essence Nourishes Dry Strands", "polygonum-multiflorum-hair-essences"],
    ["Portable AA Rechargeable Battery Fast Charge 1 5V Li Ion Battery", "aa-rechargeable-battery-kits"],
    ["Portable Bladeless USB Air Cooler Fan", "mini-usb-air-cooler-fans"],
    ["Portable Large Empty Box Baby Powder Sub Bottling Storage", "powder-puff-storage-cases"],
    ["Portable LED Book Lights USB Night Light Room Decor Table Desk Lamp", "portable-usb-reading-lights"],
    ["Portable Mini Travel Powder Packaging", "powder-puff-storage-cases"],
    ["Power Boat Toys And Electric Boat Toys Are Suitable For Boys", "electric-boat-toys"],
    ["Powerful Hair Nourishing Oil Giving Africans", "african-hair-nourishing-oils"],
    ["Private Part Moisturizing Cream All", "womens-intimate-moisturizing-creams"],
    ["Protective Case For Galaxy Buds 4 Pro", "earbuds-protective-cases"],
    ["R134a Car Air Conditioning Refrigerant Recharge Refill Gas Air Car", "automotive-ac-refrigerant-kits"],
    ["Random Miniature Dollhouse Supermarket Food Snacks", "dollhouse-miniatures"],
    ["Rechargeable LED Lighted Menu LED Backlit Menu Table Tent Display", "led-menu-displays"],
    ["Red Correction Functions Cover Blemishes CC", "cc-correcting-creams"],
    ["Religious Tract Holder Bible Study Wallet Ministry Storage Book", "religious-study-wallet-organizers"],
    ["Rolling Knee Protection Pad Wheels Built", "rolling-knee-protection-pads"],
    ["Rom Nd Hanall Eyepot Liner Silky", "cream-eyeshadow-pots"],
    ["Rose Smoke Powder Bright Starry Sky", "glitter-lipsticks"],
    ["Rosemary Cloves Hot Oil Accelerate Scalp", "rosemary-clove-hair-oils"],
    ["Russian Roulette Toy Guns Revolver Safe Toys For Boy Children", "toy-revolver-launchers"],
    ["Short Curly Hair Wig", "womens-short-curly-wigs"],
    ["Silicone Protective Case For Realme Buds Air 6 Pro", "realme-earbuds-protective-cases"],
    ["Silicone Protective Case For Realme Buds Air 8", "realme-earbuds-protective-cases"],
    ["Silicone Thumb Knife Protector Vegetable Harvesting", "garden-harvesting-thumb-protectors"],
    ["Skin Makeup Removal Oil Quickly Gently", "makeup-remover-oils"],
    ["Smart Car Key PCB Replacement Board Without Key Shell", "car-remote-key-pcb-boards"],
    ["Soft Soled Sports Insoles Shock Absorbing", "sports-shock-absorbing-insoles"],
    ["Spf Korean Color Changing Cc Cream", "color-changing-cc-creams"],
    ["Stress Toys Adults Funny Soft Relief", "stress-ball-toys"],
    ["Succulent Bonsai Mini Garden Planter Tool Gardening Tools", "succulent-garden-tool-sets"],
    ["Sweat Resistant Contouring Powder Palette Matte", "contouring-powder-palettes"],
    ["Silk Peony Hydrangea Bouquet", "artificial-flower-bouquets"],
    ["Soft Soled Sports Insoles For Men Shock Absorbing And Breathable", "sports-shock-absorbing-insoles"],
    ["Synthetic Mens Hair Wig Short Blonde", "mens-hair-replacement-wigs"],
    ["Tail Comb Foldable Mouse Styling", "tail-combs"],
    ["Three Sided Children Toothbrush Soft Bristle Teeth Whitening", "kids-three-sided-toothbrushes"],
    ["Toy Food Pretend Play Kitchen", "kids-pretend-food-playsets"],
    ["Toys For Kids Luminous Toys Flying Ball Sensing Automatic Rotation", "magic-flying-ball-toys"],
    ["Trimmer Lubricating Oil", "hair-trimmer-lubricating-oils"],
    ["Turmeric Face Moisturizing Cream Hydrating Skin", "turmeric-face-creams"],
    ["Turmeric Vitamin C Cream Lightweight Nourishment", "turmeric-vitamin-c-face-creams"],
    ["Twister Game Indoor Outdoor Toys Play Mat Funny Family Company", "twister-party-games"],
    ["Ultra Gentle Cica Hydration Cream 45g", "cica-hydration-creams"],
    ["Universal Foldable Leather Sleeve Macbook Air", "universal-laptop-sleeves"],
    ["USB Charging Cable For Electric Shavers And Hair Clippers", "grooming-device-charging-cables"],
    ["Ushas Eye Primer Long Lasting Makeup", "eye-makeup-primers"],
    ["Ushas Makeup Remover Cleaning Water Moisturizing", "makeup-remover-cleansing-waters"],
    ["Wall Bar Counter Home Dinning Table Rectangular Simple Table", "bar-table-sets"],
    ["Water Beak Kettle Succulent Flower Watering", "plant-watering-bottles"],
    ["Waterproof Socks Breathable Outdoor Waterproof Hiking Wading Camping", "waterproof-hiking-socks"],
    ["With Password Lock Saving Money Binder Handbook Wallet Storage Planner Organizer", "cash-savings-binders"],
    ["Wooden Desktop Organiser", "wooden-desk-organizers"],
    ["Yoga Socks For Women Non Slip Grips Straps Bandage Cotton Sock Ideal", "yoga-grip-socks"],
  ])("resolves the image-confirmed family %s", (title, ruleId) => {
    const classification = classifyCatalogTaxonomy({ title, handle: title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-") });

    expect(classification.ruleId).toBe(ruleId);
    expect(classification.reviewRequired).toBe(false);
  });

  it("uses an inspected source image when supplier text cannot safely classify a product", () => {
    const classification = classifyCatalogTaxonomy({
      id: "8059440627811",
      handle: "makeup-tool-kits-moisturizing-with-a-cream",
      title: "Makeup Tool Kits Moisturizing Cream",
    });

    expect(classification).toMatchObject({
      ruleId: "brightening-skincare-packs",
      reviewRequired: false,
      override: { id: "image-prime-whitening-pack-8059440627811" },
    });
  });

  it("uses an inspected source image for the vague pigmentation-treatment listing", () => {
    const classification = classifyCatalogTaxonomy({
      id: "8051857162339",
      handle: "nourish-the-skin-and-awaken-its-regeneration-ᴿᵉᵐᵒᵛᵉ-ᵐᵉˡᵃⁿⁱⁿ",
      title: "Nourish Skin Awaken Its Regeneration",
    });

    expect(classification).toMatchObject({
      ruleId: "pigmentation-brightening-treatment-sets",
      reviewRequired: false,
      override: { id: "image-pigmentation-brightening-treatment-8051857162339" },
    });
  });

  it("keeps operational order-adjustment links out of SEO and discovery tags", () => {
    const classification = classifyCatalogTaxonomy({
      title: "Order Price Difference Adjustment",
      handle: "link-for-price-difference-link-for-price-difference",
    });

    expect(classification).toMatchObject({
      ruleId: "order-price-adjustments",
      reviewRequired: false,
      seoEligible: false,
      proposedTags: [],
    });
  });

  it("uses inspected source images for supplier titles that contradict the product", () => {
    const cases = [
      [
        "8059441578083",
        "mens-care-cream-with-mild-ingredients-to-comfort-and-care-for-men-s-body-external-topical-care-cream-for-daily-use",
        "Mens Care Cream Mild Ingredients Comfort",
        "mens-intimate-performance-creams",
      ],
      [
        "8053900279907",
        "moeyu-anime-backpack-school-shoulder-bag-student-laptop-travel-hiking-camping-rucksack-fashion-boy-girl-cosplay-knapsack",
        "Moeyu Anime Backpack School Shoulder Bag",
        "anime-school-shoulder-bags",
      ],
      [
        "8052547584099",
        "hypoallergenic-moisturising-lotion-with-honey-glycerin-and-vitamin-c-for-all-skin-types-fresh-scented-and-ideal-for-daily-use",
        "Moisturising Lotion Honey Glycerin Vitamin",
        "topical-joint-care-creams",
      ],
      [
        "8059441086563",
        "moisturizing-exfoliant-gently-exfoliates-locks-moisture-and-repairs-dry-skin",
        "Moisturizing Exfoliant Gently Exfoliates Locks Moisture",
        "whey-protein-powders",
      ],
      [
        "8048929013859",
        "a-must-have-for-stylish-guys-and-to-take-photos-suitable-for-both-men-and-women-available-in-multiple-colors",
        "Must Have Stylish Guys Take Photos",
        "sunglasses",
      ],
      [
        "7801986777187",
        "hollowfly-graduation-money-box-pull-out-cash-gift-holder",
        "Out Cash Gift Holder",
        "cash-surprise-gift-boxes",
      ],
    ];

    for (const [id, handle, title, ruleId] of cases) {
      const classification = classifyCatalogTaxonomy({ id, handle, title });
      expect(classification).toMatchObject({ ruleId, reviewRequired: false });
      expect(classification.override?.id).toMatch(/^image-/);
    }
  });

  it("uses an explicit men's rule when a product title contains conflicting kids terms", () => {
    const classification = classifyCatalogTaxonomy({
      title: "Mens T Shirt More Boy Kissing T-Shirts Hip Hop Heated Rivalry Beach Tee Shirt Y2K Basic Print Cotton Clothes Gift Idea",
      handle: "mens-t-shirt-more-boy-kissing-t-shirts-hip-hop-heated-rivalry-beach-tee-shirt-y2k-basic-print-cotton-clothes-gift-idea",
    });

    expect(classification).toMatchObject({
      ruleId: "mens-graphic-tshirts",
      departmentId: "men",
      categoryId: "men-fashion",
      audience: { id: "men", source: "taxonomy-rule" },
    });
  });

  it("uses an approved specific handle phrase when the supplier title is only a broad noun", () => {
    const classification = classifyCatalogTaxonomy({
      title: "Pens DIY Making Kit Beaded Office",
      handle: "10pcs-plastic-beadable-pens-bead-pens-for-diy-making-kit-for-pens-beaded-pens-for-office-school-kids-students-nurse",
    });

    expect(classification).toMatchObject({
      ruleId: "beadable-pens",
      reviewRequired: false,
    });
  });

  it("uses the real supplier handle when a short title omits the product noun", () => {
    const cases = [
      [
        "Steamer Household Oil Treatment Machine",
        "hair-steamer-luxury-household-oil-treatment-machine-hair-salon",
        "salon-hair-steamers",
      ],
      [
        "Styling Long Lasting Oil Control Making",
        "long-lasting-hair-fluffiness-powder-lightweight-texture-long-lasting-styling-long-lasting-oil-control-making-hair-fresher",
        "hair-volumizing-texture-powders",
      ],
      [
        "Sweatproof Long Lasting Oil Control Hydrating",
        "30ml-makeup-fixer-spray-waterproof-sweatproof-long-lasting-oil-control-hydrating-makeup-fixing-setting-spray-cosmetics-new",
        "makeup-setting-sprays",
      ],
      [
        "Toys Interesting Early Education Farm",
        "toys-interesting-early-education-farm-pull-radish-game-vegetable-memory-game-pulling-radish-toys-parent-child-interaction-toys",
        "kids-pull-radish-games",
      ],
      [
        "Youngcome Repair Damage Frizz Anti Dryness",
        "youngcome-repair-damage-frizz-anti-dryness-soft-smooth-shiny-moisturize-hair-scalp-care-rosemary-mint-strengthening-hair-cream",
        "rosemary-mint-hair-masks",
      ],
      [
        "Yuitikue Care Cream 100g Formula Firms",
        "yuitikue-345-care-cream-100g-3-in-1-formula-firms-deeply-hydrates-brightens-for-all-skin-types-natural-ingredients",
        "hydrating-brightening-skin-creams",
      ],
    ];

    for (const [title, handle, ruleId] of cases) {
      const classification = classifyCatalogTaxonomy({ title, handle });
      expect(classification).toMatchObject({ ruleId, reviewRequired: false });
    }
  });

  it("does not allow a generic title match to eclipse specific handle evidence", () => {
    const classification = classifyCatalogTaxonomy({
      title: "120ML Unisex Fresh Perfume For Daily Wear And Everyday Fragrance Use",
      handle: "120ml-car-perfume-simple-refined-richly-fragrant-car-aromatherapy-car-fragrance",
    });

    expect(classification.ruleId).toBe("car-fragrance");
    expect(classification.reviewRequired).toBe(false);
  });

  it("never derives taxonomy or physical features from managed salt tags", () => {
    const base = classifyCatalogTaxonomy({
      title: "Scented Decorative Candle Aromatherapy Nordic Room Decor",
      handle: "scented-decorative-candle-aromatherapy-nordic-room-decor",
      tags: ["Home Decor"],
    });
    const rerun = classifyCatalogTaxonomy({
      title: "Scented Decorative Candle Aromatherapy Nordic Room Decor",
      handle: "scented-decorative-candle-aromatherapy-nordic-room-decor",
      tags: [
        "Home Decor",
        "salt:collection:smart-lighting",
        "salt:feature:smart",
        "salt:category:lighting-decor",
      ],
    });

    expect(rerun.ruleId).toBe(base.ruleId);
    expect(rerun.attributes.features || []).not.toContain("smart");
    expect(rerun.proposedTags).not.toContain("salt:feature:smart");
  });

  it.each([
    ["Car Sun Shade Umbrella Foldable Windshield", "car-windshield-sunshade-umbrellas"],
    ["Kids Sneakers For Boys Girls Running Tennis Shoes Lightweight", "kids-sports-footwear"],
    ["For DJI Mic Stick Rode Wireless GO Mic Wireless Lavalier Microphone Handle", "microphone-accessories"],
    ["Newborn Photography Props Baby Crochet Knit Costume Accessories Infant Photo Shoot", "newborn-photography-props"],
    ["Sleeping Bag For Children Kids Sleepwear Anti-Kick Blanket Baby Sleepsack", "kids-sleepwear"],
    ["Code Geass Lelouch Anime School Uniform Cosplay Costume", "anime-cosplay-costumes"],
    ["Demon Slayer Anime Printed Gym Shorts", "anime-shorts"],
    ["Demon Slayer Anime Retro Cosplay T-Shirt", "anime-graphic-tshirts"],
    ["Demon Slayer Anime Printed Pajamas And Loungewear", "anime-pajamas"],
    ["Demon Slayer Cartoon Cookie Molds", "cookie-cutters-molds"],
    ["Evangelion Anime Cosplay Doll Plush Stuffed Doll", "anime-plush-dolls"],
    ["Anime Character Line Art Drawing Exercise Book", "books-learning"],
    ["Large Handkerchief High Absorbency Pocket Towel For Gym", "towels"],
    ["Kids Adults Barefoot Water Shoes Quick Dry Aqua Socks", "water-shoes-aqua-socks"],
    ["Anime Vest Clothing Is Suitable For 1 12 Movable Humanoid Toys", "action-figure-clothing-accessories"],
    ["LED Cat Dog Nail Clipper Professional Pet Claw Trimmer With Safety Lock", "pet-nail-clippers"],
    ["Photocard Holder With Keychains 3 Inch Card Protect Sleeves", "photocard-holders-keychains"],
    ["Umbrella Corporation Lanyard Card ID Holder Employee Information Neck Strap", "id-card-lanyards-badge-holders"],
  ])("classifies release-boundary long-tail products without a guess: %s", (title, ruleId) => {
    const classification = classifyCatalogTaxonomy({
      title,
      handle: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    });

    expect(classification).toMatchObject({ ruleId, reviewRequired: false });
  });
});
