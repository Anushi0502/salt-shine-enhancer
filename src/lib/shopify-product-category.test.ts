import { describe, expect, it } from "vitest";
import {
  inferApprovedDisclosureReferences,
  inferDeterministicShopifyTaxonomyCategory,
  inferShopifyTaxonomyCategory,
} from "./shopify-product-category.js";

describe("Shopify product taxonomy classifier", () => {
  it("classifies explicit product families with Shopify taxonomy ids", () => {
    expect(inferShopifyTaxonomyCategory({ handle: "womens-sunshade-hat" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/aa-2-17",
    );
    expect(inferShopifyTaxonomyCategory({ handle: "portable-usb-flash-drive-128gb" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/el-7-9-14-8",
    );
    expect(inferShopifyTaxonomyCategory({ handle: "kids-running-shoes" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/aa-8-11-4",
    );
    expect(inferShopifyTaxonomyCategory({ handle: "car-battery-charger-12v" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/vp-1-5-7-3",
    );
    expect(inferShopifyTaxonomyCategory({ handle: "kids-montessori-learning-toy" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/tg-5-9",
    );
    expect(inferShopifyTaxonomyCategory({ handle: "baby-health-grooming-kit" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/bt-3-1",
    );
    expect(inferShopifyTaxonomyCategory({ handle: "wireless-bluetooth-earbuds-with-microphone" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/el",
    );
    expect(inferShopifyTaxonomyCategory({ handle: "large-capacity-pencil-case-for-school" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/os-3-16",
    );
    expect(inferShopifyTaxonomyCategory({ handle: "61-key-digital-electronic-piano-keyboard" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/ae",
    );
    expect(inferShopifyTaxonomyCategory({ handle: "usb-air-humidifier-aroma-diffuser" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/hb-3-21-3",
    );
    expect(inferShopifyTaxonomyCategory({ handle: "mechanical-gaming-keyboard-stabilizer-pad" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/el",
    );
    expect(inferShopifyTaxonomyCategory({ handle: "stainless-steel-steamer-rack-for-dumplings" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/hg-11-8",
    );
    expect(inferShopifyTaxonomyCategory({ handle: "manual-garlic-mincer-crusher-press" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/hg-11-8",
    );
  });

  it("does not guess when no high-confidence family matches", () => {
    expect(inferShopifyTaxonomyCategory({ handle: "assorted-everyday-item" })).toBeNull();
    expect(inferShopifyTaxonomyCategory({ handle: "educational-mathematics-toys-for-kids" })?.name).toBe("Toys");
    expect(inferShopifyTaxonomyCategory({ handle: "children-school-book-bag-backpack" })).toBeNull();
  });

  it("covers deterministic category families that previously had missing Shopify categories", () => {
    expect(inferDeterministicShopifyTaxonomyCategory({ handle: "adjustable-wrist-thumb-brace-splint" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/hb-1-24",
    );
    expect(inferDeterministicShopifyTaxonomyCategory({ handle: "adjustable-laptop-stand" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/el-7-8-3-4",
    );
    expect(inferDeterministicShopifyTaxonomyCategory({ handle: "folding-laptop-lap-desk" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/os-6",
    );
    expect(inferDeterministicShopifyTaxonomyCategory({ handle: "automatic-liquid-soap-dispenser" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/hg-1-15",
    );
    expect(inferDeterministicShopifyTaxonomyCategory({ handle: "bamboo-soap-dish" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/hg-1-16",
    );
    expect(inferDeterministicShopifyTaxonomyCategory({ handle: "solar-outdoor-lantern" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/hg",
    );
    expect(inferDeterministicShopifyTaxonomyCategory({ handle: "organic-shea-butter" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/hb",
    );
    expect(inferDeterministicShopifyTaxonomyCategory({ handle: "folding-breakfast-tray" })?.id).toBe(
      "gid://shopify/TaxonomyCategory/hg-11-10-7-9",
    );
    expect(inferDeterministicShopifyTaxonomyCategory({
      handle: "petkit-smart-cat-toilet-special-accessories-max2-automatic-cat-bedpans",
      title: "Petkit Smart Cat Toilet Special Accessories",
    })).toMatchObject({
      fullName: "Animals & Pet Supplies > Pet Supplies > Cat Supplies",
      confidence: "high",
    });
  });

  it("repairs category-fallback products with deterministic broad categories", () => {
    expect(inferDeterministicShopifyTaxonomyCategory({
      handle: "replacement-shower-filter-for-held-showerhead-high-output-shower-water-filter",
      title: "Replacement Shower Filter For Held Showerhead High Output Shower Water Filter",
      tags: ["classification-fallback"],
    })?.id).toBe("gid://shopify/TaxonomyCategory/hg");
    expect(inferDeterministicShopifyTaxonomyCategory({
      handle: "miniature-household-multifunctional-sewing-machine",
      title: "Miniature Household Multifunctional Sewing Machine",
      tags: ["classification-fallback"],
    })?.id).toBe("gid://shopify/TaxonomyCategory/ae");
    expect(inferDeterministicShopifyTaxonomyCategory({
      handle: "portable-blender-with-usb-rechargeable-mini-kitchen-fruit-juice-mixer",
      title: "Portable Blender With USB Rechargeable Mini Kitchen Fruit Juice Mixer",
      tags: ["classification-fallback"],
    })?.id).toBe("gid://shopify/TaxonomyCategory/hg");
    expect(inferDeterministicShopifyTaxonomyCategory({
      handle: "women-flats-round-toe-mary-jane-ankle-strap",
      tags: ["classification-fallback"],
    })?.id).toBe("gid://shopify/TaxonomyCategory/aa-8");
    expect(inferDeterministicShopifyTaxonomyCategory({
      handle: "new-lightweight-suitcase-for-boarding-travel-luggage",
      tags: ["classification-fallback"],
    })?.id).toBe("gid://shopify/TaxonomyCategory/lb");
    expect(inferDeterministicShopifyTaxonomyCategory({
      handle: "anti-lost-card-dog-identity-tag-metal-lettering",
      tags: ["classification-fallback"],
    })?.id).toBe("gid://shopify/TaxonomyCategory/ap");
    expect(inferDeterministicShopifyTaxonomyCategory({
      handle: "work-badge-brooch-character-display",
      tags: ["classification-fallback"],
    })?.id).toBe("gid://shopify/TaxonomyCategory/aa");
    expect(inferDeterministicShopifyTaxonomyCategory({
      handle: "folding-rod-case-hole-hole-universal-wheel-rod-portable-storage-travel",
      tags: ["classification-fallback"],
    })?.id).toBe("gid://shopify/TaxonomyCategory/lb");
    expect(inferDeterministicShopifyTaxonomyCategory({
      handle: "mens-breathable-casual-business-leather-shoestrendy-and-versatile",
      tags: ["classification-fallback"],
    })?.id).toBe("gid://shopify/TaxonomyCategory/aa-8");
  });

  it.each([
    ["artificial-potted-bonsai-trees-flowers-for-home-garden-decor", "hg"],
    ["new-halloween-plush-spider-decoration", "tg-5"],
    ["finger-chopsticks-for-gamer-snacks", "hg-11-8"],
    ["forged-small-kitchen-boning-knife", "hg-11-8"],
    ["lightweight-tactical-helmet", "sg"],
    ["wifi-repeater-signal-amplifier", "el"],
    ["spine-posture-corrector", "hb-1-24"],
    ["electric-bbq-brush-for-grill-grates", "hg"],
    ["portable-thermal-label-printer", "os"],
    ["iphone-android-type-c-data-cable", "el"],
    ["professional-sports-kneecaps", "sg"],
    ["lace-one-piece-swimsuit", "aa"],
    ["high-waist-bikini-swimsuit", "aa"],
    ["quilted-paper-illustration-material", "ae"],
    ["distance-measuring-ruler-tape-measure", "ha"],
    ["ergonomic-lumbar-support-seat-cushion", "hb-1-24"],
    ["portable-hanging-neck-fan", "el"],
  ])("resolves newly added product family %s", (handle, suffix) => {
    expect(inferShopifyTaxonomyCategory({ handle })?.id).toBe(
      `gid://shopify/TaxonomyCategory/${suffix}`,
    );
  });

  it.each([
    ["egg-slicer-for-hard-boiled-eggs", "hg-11-8"],
    ["stainless-steel-egg-beating-mixing-basin", "hg-11-8"],
    ["ceramic-breakfast-dessert-plate", "hg-11-10"],
    ["blackout-bedroom-curtain", "hg"],
    ["yg300-home-4k-projector", "el"],
    ["hotel-wall-landline-telephone", "el"],
    ["smart-door-window-magnetic-sensor", "el"],
    ["home-hardware-set-pliers-hammers-repair-kit", "ha"],
    ["tuya-smart-biometric-door-lock", "el"],
    ["cotton-fitted-sheet-bedspread-mattress-cover", "hg-15"],
  ])("assigns a stable category to previously uncovered family %s", (handle, suffix) => {
    expect(inferShopifyTaxonomyCategory({ handle })?.id).toBe(
      `gid://shopify/TaxonomyCategory/${suffix}`,
    );
  });

  it("requires both explicit warning evidence and an approved disclosure object", () => {
    const product = { body_html: "<p>Choking hazard: small parts. Not for children under 3.</p>" };
    expect(inferApprovedDisclosureReferences(product, [])).toEqual([]);
    expect(
      inferApprovedDisclosureReferences(product, [
        {
          id: "gid://shopify/Metaobject/1",
          type: "shopify--disclosure-us-cpsc-choking_small_parts",
        },
      ]),
    ).toEqual(["gid://shopify/Metaobject/1"]);
  });
});
