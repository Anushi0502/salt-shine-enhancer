export const PRODUCT_KNOWLEDGE_BASE_VERSION = "2026-07-31.3";

const STOP_WORDS = new Set([
  "a", "an", "and", "at", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with",
  "our", "your", "new", "best", "sale", "shop", "product", "products", "item", "items", "set", "sets",
]);

const GENERIC_TOKENS = new Set([
  ...STOP_WORDS,
  "daily", "everyday", "premium", "quality", "fashion", "style", "stylish", "modern", "portable", "small",
  "large", "mini", "new", "latest", "unisex", "women", "woman", "men", "man", "kids", "child", "children",
]);

// These are broad, stable concepts. Product types and extracted noun phrases supply the long tail.
const TAXONOMY_RULES = Object.freeze([
  {
    id: "electronics",
    label: "Electronics & Accessories",
    terms: [
      "charger", "charging cable", "usb", "type c", "lightning cable", "power bank", "battery", "inverter",
      "phone case", "iphone", "screen protector", "computer mouse", "keyboard", "keypad", "webcam", "earbuds",
      "earphones", "headphones", "smart watch", "watch band", "remote control", "circuit board", "bluetooth",
    ],
    aliases: ["tech accessories", "device accessories", "phone accessories", "computer accessories"],
    negativeTerms: ["lightening", "skin lightening", "highlighting"],
  },
  {
    id: "home-lighting",
    label: "Home Lighting",
    terms: ["lighting", "lamp", "led lamp", "wall lamp", "table lamp", "ceiling light", "night light", "lantern", "chandelier"],
    aliases: ["home lights", "room lighting", "decorative lights"],
    negativeTerms: [
      "lightening",
      "skin lightening",
      "lightning charger",
      "lightning cable",
      "highlighting",
      "light up toy",
      "bath toy",
      "baby toy",
      "kids toy",
      "toy",
    ],
  },
  {
    id: "beauty-care",
    label: "Beauty & Personal Care",
    terms: [
      "skincare", "skin care", "serum", "moisturizer", "lotion", "cleanser", "face mask", "makeup", "lipstick",
      "lip gloss", "lip balm", "blush", "mascara", "eyeliner", "eyelash", "false lashes", "hair oil", "shampoo",
      "conditioner", "hair comb", "nail", "manicure", "pedicure", "perfume", "cosmetic",
    ],
    aliases: ["beauty products", "personal care", "self care"],
    negativeTerms: [],
  },
  {
    id: "kitchen-dining",
    label: "Kitchen & Dining",
    terms: [
      "cookware", "kitchen", "frying pan", "saucepan", "pot", "pan", "bowl", "plate", "cup", "mug", "bottle",
      "water bottle", "utensil", "spoon", "fork", "knife", "cutting board", "storage container", "lunch box", "apron",
    ],
    aliases: ["kitchenware", "cooking accessories", "dining accessories"],
    negativeTerms: [],
  },
  {
    id: "home-storage-decor",
    label: "Home Storage & Decor",
    terms: [
      "home decor", "decoration", "vase", "mirror", "pillow", "cushion", "blanket", "rug", "mat", "curtain",
      "organizer", "organiser", "storage", "shelf", "basket", "box", "wall art", "clock", "candle", "flower",
    ],
    aliases: ["home organization", "home accessories", "decorative accents"],
    negativeTerms: [],
  },
  {
    id: "apparel",
    label: "Apparel & Fashion",
    terms: [
      "dress", "shirt", "t shirt", "tshirt", "top", "trousers", "trouser", "pants", "jeans", "skirt", "shorts",
      "hoodie", "sweatshirt", "jacket", "coat", "shoes", "sandals", "socks", "hat", "cap", "belt", "suit", "outfit",
    ],
    aliases: ["clothing", "fashion accessories", "wearables"],
    negativeTerms: [],
  },
  {
    id: "travel-outdoor",
    label: "Travel & Outdoor",
    terms: [
      "travel bag", "luggage", "suitcase", "backpack", "duffle bag", "camping", "hiking", "outdoor", "picnic",
      "tactical", "tent", "sleeping bag", "travel organizer", "car accessory", "car charger", "bike", "bicycle",
    ],
    aliases: ["travel essentials", "outdoor gear", "on the go"],
    negativeTerms: [],
  },
  {
    id: "sports-fitness",
    label: "Sports & Fitness",
    terms: ["fitness", "gym", "exercise", "yoga", "workout", "sports", "training", "resistance band", "dumbbell", "sports bottle"],
    aliases: ["active lifestyle", "exercise accessories"],
    negativeTerms: [],
  },
  {
    id: "pet-care",
    label: "Pet Care",
    terms: ["pet", "dog", "cat", "puppy", "kitten", "pet feeding", "pet bed", "pet toy", "leash", "collar", "pet grooming"],
    aliases: ["pet accessories", "pet supplies", "animal care"],
    negativeTerms: [],
  },
  {
    id: "baby-family",
    label: "Baby & Family",
    terms: ["baby", "infant", "toddler", "diaper", "bib", "stroller", "feeding bottle", "nursery", "kids toy", "children"],
    aliases: ["baby care", "family essentials", "kids accessories"],
    negativeTerms: [],
  },
  {
    id: "stationery-office",
    label: "Stationery & Office",
    terms: ["pencil", "pen", "notebook", "planner", "stationery", "whiteboard", "desk organizer", "office", "keyboard stand", "document holder"],
    aliases: ["school supplies", "office supplies", "desk accessories"],
    negativeTerms: [],
  },
  {
    id: "jewelry-accessories",
    label: "Jewelry & Accessories",
    terms: ["jewelry", "jewellery", "necklace", "earring", "bracelet", "ring", "brooch", "wallet", "card holder", "handbag", "tote bag"],
    aliases: ["fashion accessories", "personal accessories"],
    negativeTerms: [],
  },
  {
    id: "toys-hobbies",
    label: "Toys & Hobbies",
    terms: ["toy", "puzzle", "fidget", "game", "craft", "diy", "musical instrument", "piano", "keyboard instrument", "collectible"],
    aliases: ["games and hobbies", "creative play"],
    negativeTerms: [],
  },
  {
    id: "automotive",
    label: "Automotive",
    terms: ["car", "vehicle", "motorcycle", "auto", "tire", "tyre", "car charger", "car key", "dashboard", "windshield"],
    aliases: ["car accessories", "vehicle accessories", "auto parts"],
    negativeTerms: [],
  },
]);

const COMPILED_TAXONOMY_RULES = TAXONOMY_RULES.map((rule) => ({
  ...rule,
  normalizedTerms: rule.terms.map(normalizeKnowledgeText),
  normalizedAliases: rule.aliases.map(normalizeKnowledgeText),
  normalizedNegativeTerms: rule.negativeTerms.map(normalizeKnowledgeText),
}));

const ATTRIBUTE_GROUPS = Object.freeze({
  materials: ["aluminum", "bamboo", "canvas", "ceramic", "cotton", "glass", "leather", "metal", "nylon", "plastic", "silicone", "stainless steel", "wood", "wooden"],
  features: ["adjustable", "automatic", "bluetooth", "foldable", "insulated", "magnetic", "portable", "rechargeable", "reusable", "wireless", "waterproof", "usb", "led", "rgb", "non slip", "quick dry"],
  audiences: ["women", "men", "kids", "children", "baby", "adults", "pets", "dogs", "cats", "beginners", "professional"],
});

const PRODUCT_KNOWLEDGE_CACHE = new WeakMap();

function asText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(" ");
  return value == null ? "" : String(value);
}

export function normalizeKnowledgeText(value) {
  return asText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function tokenize(value) {
  return unique(normalizeKnowledgeText(value).split(" ").filter((token) => token.length > 1 || /\d/.test(token)));
}

function singularize(token) {
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("ses") && token.length > 5) return token.slice(0, -2);
  if (token.endsWith("s") && token.length > 3 && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

function slugify(value) {
  return normalizeKnowledgeText(value).replace(/\s+/g, "-").slice(0, 120);
}

function containsPhrase(text, phrase) {
  const normalizedPhrase = normalizeKnowledgeText(phrase);
  if (!normalizedPhrase) return false;
  const textTokens = ` ${normalizeKnowledgeText(text)} `;
  return textTokens.includes(` ${normalizedPhrase} `);
}

function containsNormalizedPhrase(text, normalizedPhrase) {
  return normalizedPhrase && (` ${text} `).includes(` ${normalizedPhrase} `);
}

function phraseScore(text, phrase) {
  const normalizedPhrase = normalizeKnowledgeText(phrase);
  if (!normalizedPhrase || !containsPhrase(text, normalizedPhrase)) return 0;
  const tokenCount = normalizedPhrase.split(" ").length;
  return tokenCount * 24 + normalizedPhrase.length;
}

function phraseScoreNormalized(text, normalizedPhrase) {
  if (!containsNormalizedPhrase(text, normalizedPhrase)) return 0;
  const tokenCount = normalizedPhrase.split(" ").length;
  return tokenCount * 24 + normalizedPhrase.length;
}

function sourceText(product) {
  const tags = Array.isArray(product?.tags) ? product.tags.join(" ") : product?.tags || "";
  const customData = product?.customData || {};
  return [
    product?.title,
    product?.handle,
    product?.product_type || product?.productType,
    tags,
    customData.collectionSignal,
    Array.isArray(customData.searchProductBoosts) ? customData.searchProductBoosts.join(" ") : "",
    product?.body_html,
  ].filter(Boolean).join(" ");
}

function canonicalType(product, text) {
  const explicit = normalizeKnowledgeText(product?.product_type || product?.productType);
  if (explicit) return explicit;

  const titleTokens = tokenize(product?.title).filter((token) => !GENERIC_TOKENS.has(token));
  const noun = titleTokens.find((token) => TAXONOMY_RULES.some((rule) => rule.terms.some((term) => tokenize(term).includes(token))));
  const start = noun ? Math.max(0, titleTokens.indexOf(noun) - 1) : 0;
  return titleTokens.slice(start, start + 4).join(" ") || tokenize(text).slice(0, 4).join(" ") || "unclassified product";
}

function classifyFamily(text) {
  let best = null;
  let bestScore = 0;

  for (const rule of COMPILED_TAXONOMY_RULES) {
    const positiveScore = Math.max(...rule.normalizedTerms.map((term) => phraseScoreNormalized(text, term)), 0);
    const aliasScore = Math.max(...rule.normalizedAliases.map((term) => phraseScoreNormalized(text, term)), 0);
    const negativeScore = Math.max(...rule.normalizedNegativeTerms.map((term) => phraseScoreNormalized(text, term)), 0);
    const score = Math.max(positiveScore, Math.round(aliasScore * 0.8)) - negativeScore;
    if (score > bestScore) {
      best = rule;
      bestScore = score;
    }
  }

  return { rule: best || { id: "other", label: "Other Products", terms: [], aliases: [], negativeTerms: [] }, score: bestScore };
}

function extractAttributes(text) {
  const normalized = normalizeKnowledgeText(text);
  const attributes = {};

  for (const [group, values] of Object.entries(ATTRIBUTE_GROUPS)) {
    const matches = values.filter((value) => containsNormalizedPhrase(normalized, normalizeKnowledgeText(value)));
    if (matches.length) attributes[group] = unique(matches).slice(0, 8);
  }

  const measurements = normalized.match(/\b\d+(?:\.\d+)?\s?(?:ml|l|mg|g|kg|mm|cm|m|inch|in|ft|v|w|mah|gb|tb|pcs?|pieces?|pack|pairs?)\b/g) || [];
  if (measurements.length) attributes.measurements = unique(measurements).slice(0, 8);

  const compatibility = normalized.match(/\b(?:iphone(?:\s+\d+)?(?:\s+(?:pro|max|plus|mini))?|android|usb\s+c|type\s+c|bluetooth|airpods?(?:\s+pro)?|ipad|laptop|car|motorcycle|ps5|psp|sram|dji)\b/g) || [];
  if (compatibility.length) attributes.compatibility = unique(compatibility).slice(0, 8);

  return attributes;
}

function buildAliases(product, family, type, text) {
  const tags = Array.isArray(product?.tags) ? product.tags : String(product?.tags || "").split(/[,;|]+/g);
  const typeTokens = tokenize(type);
  const aliases = [
    type,
    ...typeTokens.map(singularize),
    ...family.terms.filter((term) => phraseScoreNormalized(text, normalizeKnowledgeText(term)) > 0),
    ...family.aliases.filter((term) => phraseScoreNormalized(text, normalizeKnowledgeText(term)) > 0),
    ...tags.map(normalizeKnowledgeText),
  ];
  return unique(aliases.map(normalizeKnowledgeText)).filter((value) => value.length >= 2).slice(0, 24);
}

function confidenceFor(familyScore, type, product) {
  const hasExplicitType = Boolean(normalizeKnowledgeText(product?.product_type || product?.productType));
  const score = 35 + Math.min(35, familyScore) + (hasExplicitType ? 20 : 0) + (product?.title ? 8 : 0);
  return Math.max(20, Math.min(99, Math.round(score)));
}

export function classifyProductKnowledge(product) {
  if (product && typeof product === "object") {
    const cached = PRODUCT_KNOWLEDGE_CACHE.get(product);
    if (cached) return cached;
  }

  const text = normalizeKnowledgeText(sourceText(product));
  const coreText = [
    product?.title,
    product?.handle,
    product?.product_type || product?.productType,
    Array.isArray(product?.tags) ? product.tags.join(" ") : product?.tags || "",
    product?.customData?.collectionSignal,
    Array.isArray(product?.customData?.searchProductBoosts) ? product.customData.searchProductBoosts.join(" ") : "",
  ].filter(Boolean).join(" ");
  const normalizedCoreText = normalizeKnowledgeText(coreText);
  const type = canonicalType(product, text);
  // Family classification must use merchant-owned core fields. Generated body copy
  // can contain generic SEO phrases that describe a product inaccurately.
  const familyResult = classifyFamily(normalizedCoreText);
  const attributes = extractAttributes(text);
  const aliases = buildAliases(product, familyResult.rule, type, normalizedCoreText);
  const searchTerms = unique([
    ...tokenize(product?.title),
    ...tokenize(product?.handle),
    ...tokenize(type),
    ...aliases.flatMap(tokenize),
  ]).filter((token) => !GENERIC_TOKENS.has(token)).slice(0, 72);
  const negativeTerms = unique(familyResult.rule.negativeTerms.map(normalizeKnowledgeText)).slice(0, 16);
  const familyId = familyResult.rule.id;
  const typeKey = slugify(type) || "unclassified-product";

  const knowledge = {
    version: PRODUCT_KNOWLEDGE_BASE_VERSION,
    typeKey,
    leafType: type,
    familyId,
    familyLabel: familyResult.rule.label,
    taxonomyPath: [familyId, typeKey],
    aliases,
    searchTerms,
    negativeTerms,
    attributes,
    confidence: confidenceFor(familyResult.score, type, product),
  };

  if (product && typeof product === "object") {
    PRODUCT_KNOWLEDGE_CACHE.set(product, knowledge);
  }

  return knowledge;
}

export function compactProductKnowledge(productKnowledge) {
  if (!productKnowledge) return null;
  return {
    typeKey: productKnowledge.typeKey,
    leafType: productKnowledge.leafType,
    familyId: productKnowledge.familyId,
    familyLabel: productKnowledge.familyLabel,
    aliases: productKnowledge.aliases.slice(0, 4),
    searchTerms: productKnowledge.searchTerms.slice(0, 32),
    negativeTerms: productKnowledge.negativeTerms.slice(0, 8),
    attributes: Object.fromEntries(
      Object.entries(productKnowledge.attributes || {}).map(([group, values]) => [group, values.slice(0, 4)]),
    ),
    confidence: productKnowledge.confidence,
  };
}

export function buildProductKnowledgePayload(productsPayload) {
  const products = Array.isArray(productsPayload?.products) ? productsPayload.products : [];
  const typeMap = new Map();
  const records = products
    .map((product) => {
      const knowledge = classifyProductKnowledge(product);
      if (!typeMap.has(knowledge.typeKey)) {
        typeMap.set(knowledge.typeKey, {
          typeKey: knowledge.typeKey,
          leafType: knowledge.leafType,
          familyId: knowledge.familyId,
          familyLabel: knowledge.familyLabel,
          taxonomyPath: knowledge.taxonomyPath,
          aliases: knowledge.aliases,
        });
      }
      return {
        id: Number(product?.id) || 0,
        handle: String(product?.handle || "").trim(),
        typeKey: knowledge.typeKey,
        familyId: knowledge.familyId,
        confidence: knowledge.confidence,
        attributes: knowledge.attributes,
        searchTerms: knowledge.searchTerms,
        negativeTerms: knowledge.negativeTerms,
      };
    })
    .filter((record) => record.id && record.handle);

  return {
    version: PRODUCT_KNOWLEDGE_BASE_VERSION,
    generatedAt: productsPayload?.generatedAt || new Date().toISOString(),
    source: productsPayload?.source || "/data/products.json",
    totalProducts: records.length,
    uniqueProductTypes: typeMap.size,
    families: TAXONOMY_RULES.map(({ id, label }) => ({ id, label })),
    types: [...typeMap.values()].sort((left, right) => left.typeKey.localeCompare(right.typeKey)),
    products: records,
  };
}
