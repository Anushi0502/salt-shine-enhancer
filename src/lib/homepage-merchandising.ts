import { minPrice, savingsPercent } from "@/lib/formatters";
import type { ShopifyProduct } from "@/types/shopify";

type PriorityRule = {
  handleIncludes: readonly string[];
  titleIncludes: readonly string[];
};

type KeywordRule = {
  keywords: readonly string[];
  weight: number;
};

export const BEST_SELLER_COLLECTION_HANDLES = [
  "appplaza-best-sellers",
  "best-sellers",
  "best-seller",
  "bestsellers",
  "bestseller",
] as const;

const BEST_SELLER_PRIORITY_RULES: readonly PriorityRule[] = [
  {
    handleIncludes: ["the-living-legacy-planner-2nd-edition"],
    titleIncludes: ["organizer for planning", "daily routines"],
  },
  {
    handleIncludes: ["the-living-legacy-planner"],
    titleIncludes: ["organizer for planning", "daily routines"],
  },
  {
    handleIncludes: ["7-day-mood-mindfulness-tracker"],
    titleIncludes: ["mood mindfulness tracker", "mood tracker"],
  },
  {
    handleIncludes: ["7-day-health-medication-tracker"],
    titleIncludes: ["health medication tracker", "medication tracker"],
  },
  {
    handleIncludes: ["scented-decorative-candle-aromatherapy-nordic-room-decor"],
    titleIncludes: ["scented decorative candle", "candle for home decor"],
  },
  {
    handleIncludes: ["square-ball-shaped-scented-candle-handcrafted-colorful-birthday-gift"],
    titleIncludes: ["scented candle", "birthday gift"],
  },
  {
    handleIncludes: ["clear-acrylic-3-wick-flameless-led-candles-battery-operated"],
    titleIncludes: ["flameless led candles", "battery operated candles"],
  },
  {
    handleIncludes: [
      "green-leaf-string-lights-artificial-ivy-vine-fairy-light-garland-wedding-party-decoration-christmas-home-room-wall-hanging-plant",
    ],
    titleIncludes: ["string lights", "fairy light"],
  },
  {
    handleIncludes: [
      "led-solar-vine-string-lights-outdoor-waterproof-artificial-ivy-leaves-decor-fairy-lights-8-modes-for-christmas-garden-wedding",
    ],
    titleIncludes: ["string lights", "fairy lights"],
  },
  {
    handleIncludes: ["jute-gift-pouches-small-drawstring-sachet-bags-for-jewelry-gifts"],
    titleIncludes: ["gift pouches", "drawstring sachet"],
  },
  {
    handleIncludes: [
      "10pcs-natural-cotton-burlap-jute-canvas-gift-bags-for-jewelry-necklace-earring-ring-soap-organizer-pouch-christmas-wedding-favor",
    ],
    titleIncludes: ["gift bags", "organizer pouch"],
  },
  {
    handleIncludes: ["burlap-jute-tote-bag-vintage-reusable-grocery-gift-bag"],
    titleIncludes: ["tote bag", "gift bag"],
  },
  {
    handleIncludes: ["light-creative-sleep-with-small-night-lamp"],
    titleIncludes: ["night lamp", "small night lamp"],
  },
  {
    handleIncludes: ["mini-gps-tracker-find-my-app-smart-tag-for-pets-keys"],
    titleIncludes: ["smart tag", "gps tracker"],
  },
  {
    handleIncludes: [
      "smart-wifi-weather-clock-featuring-wireless-charging-for-watches-digital-table-clock-real-time-weather-display-touch-control",
    ],
    titleIncludes: ["weather clock", "wireless charging"],
  },
];

const BEST_SELLER_POSITIVE_KEYWORDS: readonly KeywordRule[] = [
  { keywords: ["planner", "journal", "tracker", "routine", "office"], weight: 420 },
  { keywords: ["candle", "diffuser", "aroma", "wax"], weight: 340 },
  { keywords: ["string light", "fairy light", "night light", "wall light", "lamp"], weight: 320 },
  { keywords: ["gift bag", "gift bags", "pouch", "drawstring", "sachet", "tote bag", "organizer"], weight: 300 },
  { keywords: ["decor", "home decor", "vase", "bouquet", "flower", "artificial", "ivy"], weight: 240 },
  { keywords: ["kitchen", "cookware", "utensil", "bowl", "grinder", "salt", "pepper"], weight: 180 },
  { keywords: ["watch", "clock", "smart watch", "tracker"], weight: 120 },
  { keywords: ["garden", "trowel", "shovel", "plant", "moisture meter"], weight: 100 },
];

const BEST_SELLER_NEGATIVE_KEYWORDS: readonly KeywordRule[] = [
  { keywords: ["baby", "bath", "toy", "toys", "children", "kids"], weight: -1500 },
];

function normalizeText(input: string | null | undefined): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHandle(input: string | null | undefined): string {
  return normalizeText(input);
}

function getProductSearchText(product: ShopifyProduct): string {
  const tags = Array.isArray(product.tags) ? product.tags.join(" ") : String(product.tags || "");
  return normalizeText(`${product.title} ${product.product_type} ${tags}`);
}

function matchesPriorityRule(product: ShopifyProduct, rule: PriorityRule): boolean {
  const title = normalizeText(product.title);
  const handle = normalizeHandle(product.handle);

  return (
    rule.handleIncludes.some((token) => handle.includes(token)) ||
    rule.titleIncludes.some((token) => title.includes(token))
  );
}

function getPriorityRank(product: ShopifyProduct): number {
  for (let index = 0; index < BEST_SELLER_PRIORITY_RULES.length; index += 1) {
    if (matchesPriorityRule(product, BEST_SELLER_PRIORITY_RULES[index])) {
      return index;
    }
  }

  return Number.POSITIVE_INFINITY;
}

function scoreKeywords(searchText: string, rules: readonly KeywordRule[]): number {
  return rules.reduce((score, rule) => {
    return rule.keywords.some((keyword) => searchText.includes(keyword)) ? score + rule.weight : score;
  }, 0);
}

function getBestSellerScore(product: ShopifyProduct): number {
  const searchText = getProductSearchText(product);
  const positiveScore = scoreKeywords(searchText, BEST_SELLER_POSITIVE_KEYWORDS);
  const negativeScore = scoreKeywords(searchText, BEST_SELLER_NEGATIVE_KEYWORDS);

  return positiveScore + negativeScore;
}

export function isBestSellerCollectionHandle(handle: string | null | undefined): boolean {
  const normalized = normalizeHandle(handle);
  return BEST_SELLER_COLLECTION_HANDLES.some((candidate) => candidate === normalized);
}

export function selectBestSellerProducts(products: ShopifyProduct[], limit = 12): ShopifyProduct[] {
  if (!Array.isArray(products) || !products.length || limit <= 0) {
    return [];
  }

  const rankedProducts = [...products]
    .map((product) => {
      const price = minPrice(product);

      return {
        product,
        priorityRank: getPriorityRank(product),
        score: getBestSellerScore(product),
        savings: savingsPercent(product),
        price: Number.isFinite(price) ? price : Number.MAX_SAFE_INTEGER,
        freshness: new Date(product.published_at || product.created_at || product.updated_at || 0).getTime(),
      };
    })
    .sort((left, right) => {
      if (left.priorityRank !== right.priorityRank) {
        return left.priorityRank - right.priorityRank;
      }

      if (left.score !== right.score) {
        return right.score - left.score;
      }

      if (left.savings !== right.savings) {
        return right.savings - left.savings;
      }

      if (left.price !== right.price) {
        return left.price - right.price;
      }

      return right.freshness - left.freshness;
    })
    .map((entry) => entry.product);

  const result: ShopifyProduct[] = [];
  const seenIds = new Set<number>();

  for (const product of rankedProducts) {
    if (seenIds.has(product.id)) {
      continue;
    }

    seenIds.add(product.id);
    result.push(product);

    if (result.length >= limit) {
      break;
    }
  }

  return result;
}
