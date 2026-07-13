const QUIRKY_GIFT_LIMIT = 12;

const QUIRKY_GIFT_TERMS = [
  ["quirky", 12],
  ["unique", 10],
  ["novelty", 10],
  ["gift", 9],
  ["gadget", 8],
  ["fun", 8],
  ["toy", 7],
  ["game", 7],
  ["party", 6],
  ["candle", 5],
  ["fountain", 5],
  ["light", 4],
  ["lamp", 4],
  ["glow", 4],
  ["decor", 3],
  ["ornament", 3],
  ["diy", 2],
];

const GIFT_CATEGORIES = [
  ["gifts", ["gift", "present", "surprise"]],
  ["novelty", ["quirky", "unique", "novelty", "fun"]],
  ["play", ["toy", "game", "party", "diy"]],
  ["ambience", ["candle", "aroma", "diffuser", "light", "lamp", "glow"]],
  ["decor", ["decor", "ornament", "fountain", "vase", "flower"]],
  ["gadgets", ["gadget", "opener", "electronic", "smart"]],
];

// These handles are resolved from products.json at build time—not rendered as
// hardcoded cards. They keep the storefront mix genuinely giftable while the
// fallback scorer fills any slot if a catalog item is retired.
const QUIRKY_GIFT_HANDLE_PREFERENCES = [
  "graduation-money-box-gift-holder-pull-out-cash-surprise",
  "square-ball-shaped-scented-candle-handcrafted-colorful-birthday-gift",
  "luminous-sand-glow-in-dark-pebbles-stone-garden-yard-outdoor-path-lawn-decorations",
  "desktop-fountain-home-decor-mini-water-black-resin-indoor-fountains-waterfalls-relaxation-desk-small-tabletop-feature",
  "floating-teapot-water-fountain-ornament-indoor-tabletop-waterfall-decoration-with-led-light-stones-home-office-table-decor",
  "star-shaped-telescopic-pointer-wand-extendable-teacher-party-prop",
  "6-in-1-bottle-opener-multifunctional-screw-cap-jar-can-openers-lid-grip-opener-home-camping-safety-can-opener-kitchen-gadgets",
  "3d-geometric-pillar-candle-mold-diy-aromatherapy-resin-mold",
  "2m-20-led-artificial-ivy-string-lights-green-leaf-vine-fairy-lights-home-decorative-garland-lamp-for-christmas-living-room-decor",
  "3pcs-dollhouse-diy-miniature-model-home-decor-flower-pot-ornament-living-room-decoration-table-flowers-hydroponic-vase",
  "2pcs-electric-grinder-salt-pepper-mill-sets-with-led-light-one-hand-automatic-operation-adjustable-coarseness-kitchen-gadget",
  "mini-train-shape-aromatherapy-diffuser-with-led-lamp",
];

const EXCLUDED_GIFT_TERMS = [
  "baby",
  "bath",
  "toddler",
  "belt",
  "deodorant",
  "lint",
  "hair remover",
  "garden",
  "shovel",
  "hoe",
  "personal care",
  "underwear",
  "bra ",
  "shoe ",
];

function normalizedText(input) {
  return String(input || "")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function finitePrice(input) {
  const price = Number(input);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function cheapestVariant(variants) {
  return (Array.isArray(variants) ? variants : [])
    .map((variant) => ({
      variant,
      price: finitePrice(variant?.price),
    }))
    .filter((entry) => entry.price !== null)
    .sort((left, right) => left.price - right.price)[0]?.variant || null;
}

function giftCategory(searchText) {
  for (const [category, terms] of GIFT_CATEGORIES) {
    if (terms.some((term) => searchText.includes(term))) {
      return category;
    }
  }

  return "other";
}

function buildCandidate(product) {
  const id = Number(product?.id || 0);
  const title = String(product?.title || "").replace(/\s+/g, " ").trim();
  const handle = String(product?.handle || "").trim();
  const image = String(product?.image?.src || product?.images?.[0]?.src || "").trim();
  const cheapest = cheapestVariant(product?.variants);
  const price = finitePrice(cheapest?.price);

  if (!id || !title || !handle || !image || price === null) {
    return null;
  }

  const tags = Array.isArray(product?.tags) ? product.tags.join(" ") : String(product?.tags || "");
  const searchText = normalizedText(`${title} ${handle} ${product?.product_type || ""} ${tags}`);
  const score = QUIRKY_GIFT_TERMS.reduce(
    (total, [term, weight]) => total + (searchText.includes(term) ? weight : 0),
    0,
  );

  if (!score) {
    return null;
  }

  const compareAtPrice = finitePrice(cheapest?.compare_at_price);
  const savings = compareAtPrice && compareAtPrice > price ? (compareAtPrice - price) / compareAtPrice : 0;

  return {
    id,
    title,
    handle,
    image,
    price,
    compareAtPrice: compareAtPrice && compareAtPrice > price ? compareAtPrice : null,
    score,
    savings,
    category: giftCategory(searchText),
    titleKey: normalizedText(title),
    excluded: EXCLUDED_GIFT_TERMS.some((term) => searchText.includes(term)),
  };
}

function byGiftPriority(left, right) {
  return (
    right.score - left.score ||
    right.savings - left.savings ||
    left.price - right.price ||
    right.id - left.id
  );
}

function selectQuirkyGiftPicks(products, limit = QUIRKY_GIFT_LIMIT) {
  const candidates = (Array.isArray(products) ? products : [])
    .map(buildCandidate)
    .filter(Boolean)
    .sort(byGiftPriority);
  const candidatesByHandle = new Map(candidates.map((candidate) => [candidate.handle, candidate]));
  const selected = [];
  const selectedIds = new Set();
  const selectedTitles = new Set();
  const categoryCounts = new Map();

  const addCandidate = (candidate, enforceCategoryLimit) => {
    if (
      selected.length >= limit ||
      selectedIds.has(candidate.id) ||
      selectedTitles.has(candidate.titleKey) ||
      (enforceCategoryLimit && (categoryCounts.get(candidate.category) || 0) >= 2)
    ) {
      return;
    }

    selected.push(candidate);
    selectedIds.add(candidate.id);
    selectedTitles.add(candidate.titleKey);
    categoryCounts.set(candidate.category, (categoryCounts.get(candidate.category) || 0) + 1);
  };

  QUIRKY_GIFT_HANDLE_PREFERENCES.forEach((handle) => {
    const candidate = candidatesByHandle.get(handle);
    if (candidate) {
      addCandidate(candidate, false);
    }
  });

  candidates.filter((candidate) => !candidate.excluded).forEach((candidate) => addCandidate(candidate, true));
  candidates.filter((candidate) => !candidate.excluded).forEach((candidate) => addCandidate(candidate, false));

  return selected.map(({ score, savings, category, titleKey, excluded, ...product }) => product);
}

export function buildHomeFeaturedProductsPayload(productsPayload) {
  const quirkyGiftPicks = selectQuirkyGiftPicks(productsPayload?.products);

  return {
    generatedAt: productsPayload?.generatedAt || new Date().toISOString(),
    source: productsPayload?.source || "/data/products.json",
    total: quirkyGiftPicks.length,
    quirkyGiftPicks,
  };
}

export { QUIRKY_GIFT_HANDLE_PREFERENCES, QUIRKY_GIFT_LIMIT, selectQuirkyGiftPicks };
