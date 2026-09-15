import { normalizeCatalogText } from "./catalog-taxonomy.js";

// These are label aliases, not a free-form classifier. Each alias points to a
// checked-in taxonomy rule and is used only after the normal evidence gates
// have run. Keep phrases conservative so a product accessory is not promoted
// by a broad noun such as "shirt" or "bottle".
const VISUAL_TAXONOMY_HINTS = Object.freeze([
  { ruleId: "anime-figures-standees", all: ["anime", "figurine"] },
  { ruleId: "anime-figures-standees", all: ["anime", "collectible"] },
  { ruleId: "anime-figures-standees", any: ["figurine"] },
  { ruleId: "soft-toys", any: ["plush toy", "stuffed toy"] },
  { ruleId: "key-ring", any: ["keychain", "keychains"] },
  { ruleId: "decorative-stickers", any: ["sticker sheets", "stationery/craft supplies"] },
  { ruleId: "pet-general", any: ["pet costume", "pet travel box", "pet carrier"] },
  { ruleId: "home-lighting", any: ["decorative lights", "string lights"] },
  { ruleId: "home-decor", any: ["model village", "holiday decor", "wreath", "garland"] },
  { ruleId: "stationery-gift-sets", any: ["greeting card", "greeting cards"] },
  { ruleId: "gift-packaging", any: ["gift box", "gift bag", "packaging"] },
  { ruleId: "home-decor", any: ["gift plaque", "keepsake gift"] },
  {
    ruleId: "merchant-electronics-fallback",
    any: ["portable projector", "smart projector", "mini portable projector", "projector screen", "projector"],
  },
  { ruleId: "watch-band", any: ["watch strap", "watchband"] },
  { ruleId: "electronic-adapter", any: ["sd card adapter", "docking station", "zigbee gateway"] },
  { ruleId: "camera-accessory", any: ["photography accessories", "camera cleaning kit"] },
  { ruleId: "jumpsuits", any: ["women jumpsuit", "womens jumpsuit", "ladies jumpsuit", "women romper", "jumpsuit", "rompers"] },
  { ruleId: "shirts", any: ["long-sleeved shirt", "long sleeve shirt"] },
]);

function matchesHint(text, hint) {
  const required = (hint.all || []).map(normalizeCatalogText).filter(Boolean);
  const alternatives = (hint.any || []).map(normalizeCatalogText).filter(Boolean);
  return required.every((term) => text.includes(term)) &&
    (!alternatives.length || alternatives.some((term) => text.includes(term)));
}

export const VISUAL_TAXONOMY_HINT_RULE_IDS = Object.freeze(
  [...new Set(VISUAL_TAXONOMY_HINTS.map((hint) => hint.ruleId))],
);

export function resolveVisualTaxonomyHint(content = null, product = null) {
  const text = normalizeCatalogText([
    content?.productName,
    content?.productCategory,
    ...(Array.isArray(content?.visibleAttributes) ? content.visibleAttributes : []),
    product?.title,
    product?.handle,
  ].filter(Boolean).join(" "));
  if (!text) return null;
  return VISUAL_TAXONOMY_HINTS.find((hint) => matchesHint(text, hint))?.ruleId || null;
}
