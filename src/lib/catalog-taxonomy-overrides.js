import { CATALOG_TAXONOMY_IMAGE_OVERRIDES } from "./catalog-taxonomy-image-overrides.js";

// Product-specific corrections are deliberately source-controlled. An override
// can only select an existing taxonomy rule and must be explicitly approved.
export const CATALOG_TAXONOMY_OVERRIDE_VERSION = "2026-09-14.1";

const MANUAL_CATALOG_TAXONOMY_OVERRIDES = Object.freeze([
  {
    id: "gsc-semantic-repair-2021-womens-watch",
    handle: "2021-new-watch-women-watches-set-top-brand-luxury-gold-waterproof-quartz-wrist-watch-ladies-clock-fashion-simple-women-relogio",
    ruleId: "traditional-watch",
    approved: true,
    reason: "GSC semantic repair: product is a women's quartz wristwatch, not a shirt.",
  },
  {
    id: "gsc-semantic-repair-lige-2026-womens-watch",
    handle: "lige-new-2026-top-elegant-womens-watches-fashion-simple-ladies-watches-quartz-waterproof-watches-for-women-relogio-feminino-box",
    ruleId: "traditional-watch",
    approved: true,
    reason: "GSC semantic repair: product is a women's quartz wristwatch, not a shirt.",
  },
  {
    id: "gsc-semantic-repair-lige-2024-womens-watch",
    handle: "lige-2024-new-fashion-women-watches-ladies-top-brand-luxury-creative-steel-women-bracelet-watches-female-quartz-waterproof-watch",
    ruleId: "traditional-watch",
    approved: true,
    reason: "GSC semantic repair: product is a women's quartz bracelet watch, not a shirt.",
  },
  {
    id: "gsc-semantic-repair-megir-womens-watch",
    handle: "megir-ladies-watch-chronograph-quartz-watches-women-top-brand-luxury-rose-gold-wristwatch-relogio-feminino-часы-женские-2057",
    ruleId: "traditional-watch",
    approved: true,
    reason: "GSC semantic repair: product is a women's quartz chronograph watch, not a shirt.",
  },
  {
    id: "gsc-semantic-repair-womens-gold-bracelet-watch",
    handle: "women-watches-top-brand-luxury-wristwatches-ladies-fashion-gold-bracelet-watch-female-elegant-clock-women-montre-femme",
    ruleId: "traditional-watch",
    approved: true,
    reason: "GSC semantic repair: product is a women's bracelet watch, not a shirt.",
  },
  {
    id: "gsc-semantic-repair-luxury-womens-leather-watch",
    handle: "luxury-watch-for-women-black-leather-oval-waterproof-exquisite-quartz-handwatch-girl-vintage-top-brand-ladies-watch-gold",
    ruleId: "traditional-watch",
    approved: true,
    reason: "GSC semantic repair: product is a women's quartz watch, not a shirt.",
  },
  {
    id: "gsc-semantic-repair-womens-transparent-strap-watch",
    handle: "women-watches-top-brand-luxury-hollow-ladies-wrist-watches-women-transparent-leather-strap-watch-for-female-relogio-feminino-hot",
    ruleId: "traditional-watch",
    approved: true,
    reason: "GSC semantic repair: product is a women's leather-strap watch, not a shirt.",
  },
  {
    id: "gsc-semantic-repair-womens-electronic-watch",
    handle: "top-brand-fashion-sport-electronic-watch-wristwatch-simple-digital-girls-watches-waterproof-pu-strap-alarm-clock-gift-for-women",
    ruleId: "traditional-watch",
    approved: true,
    reason: "GSC semantic repair: product is a women's digital wristwatch, not a shirt.",
  },
  {
    id: "gsc-semantic-repair-mens-quartz-watch",
    handle: "2026-new-luxury-mens-sport-watch-fashion-top-waterproof-luminous-leather-date-quartz-wristwatch-mans-clock",
    ruleId: "traditional-watch",
    approved: true,
    reason: "GSC semantic repair: product is a men's quartz wristwatch, not a shirt.",
  },
  {
    id: "gsc-semantic-repair-smael-mens-watch",
    handle: "smael-top-men-military-watches-clock-for-man-sport-watch-mens-brand-luxury-analog-digital-quartz-wristwatch-waterproof",
    ruleId: "traditional-watch",
    approved: true,
    reason: "GSC semantic repair: product is a men's analog-digital watch, not a shirt.",
  },
  {
    id: "gsc-semantic-repair-mens-mechanical-watch",
    handle: "2023-mens-watches-top-brand-luxury-wristwatch-mechanical-automatic-sport-watch-men-business-stainless-steel-watch-for-men-nh35",
    ruleId: "mechanical-watches",
    approved: true,
    reason: "GSC semantic repair: product is a men's automatic mechanical watch, not a shirt.",
  },
  {
    id: "gsc-semantic-repair-table-runner",
    handle: "soft-table-runner-blush-dust-pink-gauze-rustic-boho-natural-wedding-party-baby-shower-dinning-ornament-decoration",
    ruleId: "table-linens",
    approved: true,
    reason: "GSC semantic repair: product is a table runner, not a makeup product.",
  },
]);

export const CATALOG_TAXONOMY_OVERRIDES = Object.freeze([
  ...MANUAL_CATALOG_TAXONOMY_OVERRIDES,
  ...CATALOG_TAXONOMY_IMAGE_OVERRIDES,
]);

function normalizeHandle(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeId(value) {
  const id = String(value || "").trim();
  return id || "";
}

export function getCatalogTaxonomyOverride(product) {
  const productId = normalizeId(product?.id);
  const handle = normalizeHandle(product?.handle);
  return CATALOG_TAXONOMY_OVERRIDES.find((override) => {
    if (!override?.approved || !override?.ruleId) return false;
    if (productId && normalizeId(override.productId) === productId) return true;
    return handle && normalizeHandle(override.handle) === handle;
  }) || null;
}
