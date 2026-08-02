import { stripHtml } from "@/lib/formatters";
import { getCollectionByHandle, getMergedCollectionHandles, resolveCollectionRouteHandle } from "@/lib/site-navigation";
import { classifyProductKnowledge } from "@/lib/product-knowledge-base.js";
import type { ShopifyCollection, ShopifyProduct } from "@/types/shopify";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "anything",
  "best",
  "can",
  "get",
  "give",
  "good",
  "help",
  "ideal",
  "find",
  "looking",
  "me",
  "my",
  "need",
  "please",
  "recommend",
  "recommendation",
  "recommendations",
  "search",
  "searching",
  "show",
  "something",
  "the",
  "to",
  "want",
  "with",
]);

const TOKEN_ALIASES: Record<string, string[]> = {
  tshirt: ["t-shirt", "tee", "shirt"],
  "t-shirt": ["tshirt", "tee", "shirt"],
  tshirts: ["t-shirt", "tee", "shirt"],
  lighting: ["lamp"],
  trouser: ["trousers", "pants"],
  trousers: ["trouser", "pants"],
  pant: ["pants", "trouser"],
  pants: ["pant", "trouser", "trousers"],
  womens: ["women", "woman"],
  women: ["womens", "woman"],
  mens: ["men", "man"],
  men: ["mens", "man"],
  kid: ["kids", "children"],
  kids: ["kid", "children"],
  phone: ["mobile", "cell", "smartphone"],
  mobile: ["phone", "cell", "smartphone"],
  smartphone: ["phone", "mobile", "cell"],
  case: ["cover", "shell"],
  cover: ["case", "shell"],
  headphones: ["earphones", "earbuds", "headset"],
  earphones: ["headphones", "earbuds", "headset"],
  earbuds: ["headphones", "earphones", "headset"],
  charger: ["charging", "power adapter"],
  charging: ["charger", "power adapter"],
  backpack: ["rucksack", "daypack"],
  rucksack: ["backpack", "daypack"],
  sneakers: ["trainers", "shoes"],
  trainers: ["sneakers", "shoes"],
};

type SearchIntentRule = {
  key: string;
  label: string;
  patterns: RegExp[];
  terms: string[];
  familyIds: string[];
  contextTerms: string[];
  triggerTerms: string[];
};

const SEARCH_INTENT_RULES: SearchIntentRule[] = [
  {
    key: "lighting",
    label: "Lighting for your space",
    patterns: [
      /\b(?:brighten|illuminate|light up|set the mood|ambient lighting|room lighting|reading light|desk light|bedside light)\b/i,
    ],
    terms: ["lamp", "lighting", "led", "night light", "table lamp"],
    familyIds: ["home-lighting"],
    contextTerms: ["desk", "table", "room", "bedside", "reading", "office", "space"],
    triggerTerms: ["brighten", "illuminate", "light", "lighting", "mood", "ambient"],
  },
  {
    key: "phone-power",
    label: "Power for your devices",
    patterns: [
      /\b(?:charge|power)\s+(?:my|a|the)?\s*(?:phone|mobile|device)\b/i,
      /\bkeep\s+(?:my|a|the)?\s*(?:phone|mobile|device)\s+charged\b/i,
    ],
    terms: ["charger", "charging", "power bank", "usb", "power adapter"],
    familyIds: ["electronics"],
    contextTerms: ["phone", "mobile", "device", "travel", "car"],
    triggerTerms: ["charge", "power", "keep", "charged"],
  },
  {
    key: "audio",
    label: "Audio for listening and calls",
    patterns: [
      /\b(?:listen to music|music on the go|take calls|better sound|noise cancelling|noise canceling)\b/i,
    ],
    terms: ["headphones", "earbuds", "earphones", "headset", "speaker"],
    familyIds: ["electronics"],
    contextTerms: ["music", "calls", "sound", "listening", "travel", "commute"],
    triggerTerms: ["listen", "music", "calls", "sound", "listening", "noise", "cancelling", "canceling"],
  },
  {
    key: "organization",
    label: "Organization for your space",
    patterns: [
      /\b(?:organize|organise|tidy|declutter|sort)\s+(?:my|the|a)?\s*(?:home|room|desk|kitchen|space|things|stuff)?\b/i,
    ],
    terms: ["organizer", "storage", "box", "basket", "shelf", "container"],
    familyIds: ["home-storage-decor", "stationery-office"],
    contextTerms: ["home", "room", "desk", "kitchen", "space", "things", "stuff"],
    triggerTerms: ["organize", "organise", "tidy", "declutter", "sort"],
  },
  {
    key: "travel",
    label: "Travel-ready essentials",
    patterns: [
      /\b(?:going on (?:a )?trip|packing for|on the go|commuting|commute|traveling|travelling)\b/i,
    ],
    terms: ["travel", "backpack", "portable", "luggage", "organizer", "bottle"],
    familyIds: ["travel-outdoor", "electronics", "kitchen-dining"],
    contextTerms: ["trip", "packing", "travel", "commute", "portable", "road"],
    triggerTerms: ["going", "trip", "packing", "traveling", "travelling", "commuting", "commute"],
  },
  {
    key: "kitchen",
    label: "Kitchen and meal-prep essentials",
    patterns: [
      /\b(?:cook|cooking|meal prep|store leftovers|pack lunch|make meals)\b/i,
    ],
    terms: ["kitchen", "cookware", "storage container", "lunch box", "bottle", "utensil"],
    familyIds: ["kitchen-dining"],
    contextTerms: ["food", "meals", "lunch", "leftovers", "cooking", "kitchen"],
    triggerTerms: ["cook", "cooking", "meal", "prep", "store", "leftovers", "pack", "lunch", "make"],
  },
  {
    key: "beauty",
    label: "Beauty and self-care essentials",
    patterns: [
      /\b(?:skincare|skin care|beauty routine|glow up|hydrate my skin|care for my skin)\b/i,
    ],
    terms: ["skincare", "serum", "moisturizer", "lotion", "cleanser", "cosmetic"],
    familyIds: ["beauty-care"],
    contextTerms: ["skin", "beauty", "glow", "routine", "self care"],
    triggerTerms: ["skincare", "skin", "beauty", "routine", "glow", "hydrate", "care"],
  },
  {
    key: "fitness",
    label: "Fitness and active-lifestyle gear",
    patterns: [
      /\b(?:workout|exercise|gym|yoga|train at home|fitness routine)\b/i,
    ],
    terms: ["fitness", "exercise", "yoga", "workout", "sports", "training"],
    familyIds: ["sports-fitness"],
    contextTerms: ["workout", "exercise", "gym", "yoga", "training", "active"],
    triggerTerms: ["workout", "exercise", "gym", "yoga", "train", "fitness", "routine"],
  },
];

export type SearchIntentSignal = {
  key: string;
  label: string;
  terms: string[];
  familyIds: string[];
  contextTerms: string[];
  triggerTerms: string[];
  matchedPhrase: string;
};

function detectSearchIntent(input: string): SearchIntentSignal | null {
  const normalized = normalize(input);

  for (const rule of SEARCH_INTENT_RULES) {
    const match = rule.patterns.map((pattern) => normalized.match(pattern)).find(Boolean);
    if (!match) {
      continue;
    }

    return {
      key: rule.key,
      label: rule.label,
      terms: rule.terms,
      familyIds: rule.familyIds,
      contextTerms: rule.contextTerms,
      triggerTerms: rule.triggerTerms,
      matchedPhrase: match[0],
    };
  }

  return null;
}

const PRODUCT_TYPE_ALIASES: Record<string, string> = {
  "pet assocerries": "pet accessories",
  "pet assoceries": "pet accessories",
  "pet accesories": "pet accessories",
  "pet accessory": "pet accessories",
  "pet gear": "pet accessories",
  "home and living": "home living",
  "home and decor": "home decor",
  "wellness care": "wellness",
  "everyday support": "wellness",
};

function normalize(input?: unknown): string {
  const normalized = (() => {
    if (typeof input === "string") {
      return input.trim().toLowerCase();
    }

    if (Array.isArray(input)) {
      return input
        .map((entry) => (entry == null ? "" : String(entry).trim().toLowerCase()))
        .filter(Boolean)
        .join(" ");
    }

    if (input == null) {
      return "";
    }

    return String(input).trim().toLowerCase();
  })();

  // Remove accents so searches like "cafe" can match "café".
  return normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeProductType(input?: unknown): string {
  const normalized = normalize(input).replace(/[/&]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  return PRODUCT_TYPE_ALIASES[normalized] || normalized;
}

function includeToken(haystack: string, needle: string): boolean {
  if (!needle) {
    return true;
  }

  return haystack.includes(needle);
}

function normalizeScopeText(input: string): string {
  return normalize(input)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scopeTextMatchesTerm(haystack: string, term: string): boolean {
  const normalizedTerm = normalizeScopeText(term);
  if (!normalizedTerm) {
    return false;
  }

  if (haystack.includes(normalizedTerm)) {
    return true;
  }

  const compactHaystack = haystack.replace(/\s+/g, "");
  const compactTerm = normalizedTerm.replace(/\s+/g, "");
  return compactTerm.length > 2 && compactHaystack.includes(compactTerm);
}

type CollectionScopeRule = {
  include: string[];
  exclude: string[];
};

function productScopeText(product: ShopifyProduct): string {
  return normalizeScopeText(
    `${product.product_type} ${product.tags} ${product.title} ${product.handle}`,
  );
}

function collectionScopeMatches(productText: string, scope?: CollectionScopeRule | null): boolean {
  if (!scope) {
    return true;
  }

  if (scope.exclude.some((term) => scopeTextMatchesTerm(productText, term))) {
    return false;
  }

  if (!scope.include.length) {
    return true;
  }

  return scope.include.some((term) => scopeTextMatchesTerm(productText, term));
}

function tokenize(input: string): string[] {
  return normalize(input)
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => token.length > 1 || /\d/.test(token))
    .filter((token) => !STOP_WORDS.has(token));
}

function uniqueTokens(tokens: string[]): string[] {
  return Array.from(new Set(tokens.filter(Boolean)));
}

function hasTokenSequence(haystackTokens: string[], needleTokens: string[]): boolean {
  if (!needleTokens.length || needleTokens.length > haystackTokens.length) {
    return false;
  }

  for (let start = 0; start <= haystackTokens.length - needleTokens.length; start += 1) {
    let matches = true;

    for (let offset = 0; offset < needleTokens.length; offset += 1) {
      if (haystackTokens[start + offset] !== needleTokens[offset]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return true;
    }
  }

  return false;
}

const LIGHT_FALSE_FRIENDS = new Set([
  "brightening",
  "highlighting",
  "lighten",
  "lightens",
  "lightening",
  "lightning",
  "lifting",
  "misting",
  "whitening",
]);

export function isLightFamilyMismatch(term: string, candidate: string): boolean {
  const normalizedTerm = normalize(term);
  const normalizedCandidate = normalize(candidate);

  if (!normalizedTerm.startsWith("light")) {
    return false;
  }

  if (normalizedTerm === normalizedCandidate) {
    return false;
  }

  const termIsCoreLight = normalizedTerm === "light" || normalizedTerm === "lights" || normalizedTerm === "lighting";
  const candidateIsCoreLight =
    normalizedCandidate === "light" || normalizedCandidate === "lights" || normalizedCandidate === "lighting";
  const termIsFalseFriend = LIGHT_FALSE_FRIENDS.has(normalizedTerm);
  const candidateIsFalseFriend = LIGHT_FALSE_FRIENDS.has(normalizedCandidate);

  if (termIsCoreLight && candidateIsFalseFriend) {
    return true;
  }

  if (!normalizedCandidate.startsWith("light")) {
    return false;
  }

  return (
    (termIsCoreLight && candidateIsFalseFriend) ||
    (candidateIsCoreLight && termIsFalseFriend) ||
    (termIsFalseFriend && candidateIsFalseFriend)
  );
}

function maxAllowedDistance(token: string): number {
  if (token.length <= 6) {
    return 1;
  }

  return 2;
}

function boundedLevenshtein(a: string, b: string, maxDistance: number): number {
  const lengthDifference = Math.abs(a.length - b.length);
  if (lengthDifference > maxDistance) {
    return maxDistance + 1;
  }

  const previous = new Array(b.length + 1);
  const current = new Array(b.length + 1);

  for (let j = 0; j <= b.length; j += 1) {
    previous[j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowMinimum = current[0];

    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost,
      );

      if (current[j] < rowMinimum) {
        rowMinimum = current[j];
      }
    }

    if (rowMinimum > maxDistance) {
      return maxDistance + 1;
    }

    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}

function isLikelyFuzzyCandidate(term: string, candidate: string): boolean {
  if (!term || !candidate) {
    return false;
  }

  if (term[0] !== candidate[0]) {
    return false;
  }

  if (term.length >= 5 && candidate.length >= 5 && term.slice(0, 2) !== candidate.slice(0, 2)) {
    return false;
  }

  return true;
}

export function isIngEningFuzzyMismatch(term: string, candidate: string): boolean {
  const normalizedTerm = normalize(term);
  const normalizedCandidate = normalize(candidate);

  if (normalizedTerm.length < 6 || normalizedCandidate.length < 7) {
    return false;
  }

  const termEndsWithIng = normalizedTerm.endsWith("ing");
  const candidateEndsWithIng = normalizedCandidate.endsWith("ing");
  const termEndsWithEning = normalizedTerm.endsWith("ening");
  const candidateEndsWithEning = normalizedCandidate.endsWith("ening");

  return (
    (termEndsWithIng && candidateEndsWithEning && normalizedTerm.slice(0, -3) === normalizedCandidate.slice(0, -5)) ||
    (candidateEndsWithIng && termEndsWithEning && normalizedCandidate.slice(0, -3) === normalizedTerm.slice(0, -5))
  );
}

function isSingleAdjacentSwap(term: string, candidate: string): boolean {
  if (term.length !== candidate.length || term.length < 2) {
    return false;
  }

  let firstMismatch = -1;
  let mismatchCount = 0;

  for (let i = 0; i < term.length; i += 1) {
    if (term[i] !== candidate[i]) {
      mismatchCount += 1;
      if (firstMismatch === -1) {
        firstMismatch = i;
      }
    }
  }

  if (mismatchCount !== 2 || firstMismatch < 0 || firstMismatch >= term.length - 1) {
    return false;
  }

  return (
    term[firstMismatch] === candidate[firstMismatch + 1] &&
    term[firstMismatch + 1] === candidate[firstMismatch]
  );
}

function singularize(token: string): string {
  if (token.endsWith("ies") && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.endsWith("es") && token.length > 4 && !token.endsWith("ses")) {
    return token.slice(0, -2);
  }

  if (token.endsWith("s") && token.length > 3 && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }

  return token;
}

function tokensEquivalent(term: string, candidate: string): boolean {
  if (term === candidate) {
    return true;
  }

  return singularize(term) === singularize(candidate);
}

function expandToken(token: string): string[] {
  const normalized = normalize(token);
  if (!normalized) {
    return [];
  }

  const singular = singularize(normalized);
  const aliasTokens = [
    ...(TOKEN_ALIASES[normalized] || []),
    ...(TOKEN_ALIASES[singular] || []),
  ].map((entry) => normalize(entry));

  return uniqueTokens([normalized, singular, ...aliasTokens]);
}

export type ParsedQuery = {
  normalized: string;
  termGroups: string[][];
  excludedGroups: string[][];
  quotedPhrases: string[];
  priceRange: { min?: number; max?: number } | null;
  availableOnly: boolean;
  intent: SearchIntentSignal | null;
};

function parsePriceConstraint(source: string): { range: { min?: number; max?: number } | null; text: string } {
  let text = source;
  let range: { min?: number; max?: number } | null = null;
  const numberPattern = "\\$?\\d+(?:\\.\\d{1,2})?";
  const betweenPattern = new RegExp(`\\b(?:between|from)\\s+(${numberPattern})\\s+(?:and|to)\\s+(${numberPattern})\\b`, "i");
  const betweenMatch = text.match(betweenPattern);

  if (betweenMatch) {
    const first = Number(betweenMatch[1].replace("$", ""));
    const second = Number(betweenMatch[2].replace("$", ""));
    range = { min: Math.min(first, second), max: Math.max(first, second) };
    text = text.replace(betweenMatch[0], " ");
  } else {
    const maxPattern = new RegExp(`\\b(?:under|below|upto|up to|less than|max(?:imum)?)\\s+(${numberPattern})\\b|\\b(${numberPattern})\\s+(?:or less|and under)\\b`, "i");
    const minPattern = new RegExp(`\\b(?:over|above|more than|min(?:imum)?)\\s+(${numberPattern})\\b`, "i");
    const maxMatch = text.match(maxPattern);
    const minMatch = text.match(minPattern);

    if (maxMatch) {
      const value = Number((maxMatch[1] || maxMatch[2]).replace("$", ""));
      range = { max: value };
      text = text.replace(maxMatch[0], " ");
    } else if (minMatch) {
      const value = Number(minMatch[1].replace("$", ""));
      range = { min: value };
      text = text.replace(minMatch[0], " ");
    }
  }

  return { range, text };
}

function productPrice(product: ShopifyProduct): number {
  const prices = (Array.isArray(product.variants) ? product.variants : [])
    .map((variant) => Number(variant?.price))
    .filter((price) => Number.isFinite(price));
  return prices.length ? Math.min(...prices) : Number.POSITIVE_INFINITY;
}

function matchesPriceRange(product: ShopifyProduct, range: ParsedQuery["priceRange"]): boolean {
  if (!range) {
    return true;
  }

  const price = productPrice(product);
  return Number.isFinite(price) &&
    (range.min == null || price >= range.min) &&
    (range.max == null || price <= range.max);
}

function isAvailable(product: ShopifyProduct): boolean {
  return (Array.isArray(product.variants) ? product.variants : []).some((variant) => variant?.available !== false);
}

export function parseSearchQuery(input?: string): ParsedQuery {
  const source = normalize(input || "");
  const priceConstraint = parsePriceConstraint(source);
  const intent = detectSearchIntent(priceConstraint.text);
  const availableOnly = /\b(?:in[ -]?stock|available|ready[ -]?to[ -]?ship)\b/i.test(priceConstraint.text);
  const quotedPhrases = Array.from(priceConstraint.text.matchAll(/"([^"]+)"/g))
    .map((match) => normalize(match[1]))
    .map((phrase) => phrase.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const withoutQuotes = priceConstraint.text.replace(/\b(?:in[ -]?stock|available|ready[ -]?to[ -]?ship)\b/gi, " ").replace(/"([^"]+)"/g, " ");
  const rawParts = withoutQuotes.split(/\s+/).filter(Boolean);

  const requiredTerms: string[] = [];
  const excludedTerms: string[] = [];
  const intentTriggerTerms = new Set((intent?.triggerTerms || []).map((term) => normalize(term)));

  for (const part of rawParts) {
    if (part.startsWith("-") && part.length > 1) {
      excludedTerms.push(...tokenize(part.slice(1)).filter((term) => !intentTriggerTerms.has(term)));
      continue;
    }

    if (part.startsWith("+") && part.length > 1) {
      requiredTerms.push(...tokenize(part.slice(1)).filter((term) => !intentTriggerTerms.has(term)));
      continue;
    }

    requiredTerms.push(...tokenize(part).filter((term) => !intentTriggerTerms.has(term)));
  }

  return {
    normalized: uniqueTokens(requiredTerms).join(" "),
    termGroups: uniqueTokens(requiredTerms).map((term) => expandToken(term)),
    excludedGroups: uniqueTokens(excludedTerms).map((term) => expandToken(term)),
    quotedPhrases,
    priceRange: priceConstraint.range,
    availableOnly,
    intent,
  };
}

const HOME_LIGHTING_QUERY_TERMS = new Set(["light", "lights", "lighting", "lamp", "lamps"]);
const HOME_LIGHTING_QUERY_MODIFIERS = new Set([
  "ambient",
  "bedroom",
  "bedside",
  "bulb",
  "bulbs",
  "ceiling",
  "decor",
  "desk",
  "dimmable",
  "floor",
  "garden",
  "indoor",
  "led",
  "night",
  "outdoor",
  "portable",
  "reading",
  "room",
  "solar",
  "string",
  "strip",
  "table",
  "wall",
]);
const NON_HOME_LIGHTING_QUERY_TERMS = new Set([
  "battery",
  "beauty",
  "car",
  "charger",
  "charging",
  "cosmetic",
  "device",
  "flash",
  "makeup",
  "mobile",
  "nail",
  "phone",
  "ring",
  "serum",
  "vehicle",
]);

function isHomeLightingQuery(parsedQuery: ParsedQuery): boolean {
  if (parsedQuery.intent?.familyIds.includes("home-lighting")) {
    return true;
  }

  const tokens = tokenize([parsedQuery.normalized, ...parsedQuery.quotedPhrases].join(" "));
  if (!tokens.some((token) => HOME_LIGHTING_QUERY_TERMS.has(token))) {
    return false;
  }

  if (tokens.some((token) => NON_HOME_LIGHTING_QUERY_TERMS.has(token))) {
    return false;
  }

  return tokens.every(
    (token) => HOME_LIGHTING_QUERY_TERMS.has(token) || HOME_LIGHTING_QUERY_MODIFIERS.has(token),
  );
}

function tokenMatchScore(
  term: string,
  candidate: string,
  baseWeight: number,
  allowFuzzy = true,
): number {
  if (!candidate || !term) {
    return 0;
  }

  if (tokensEquivalent(term, candidate)) {
    return baseWeight;
  }

  if (isLightFamilyMismatch(term, candidate)) {
    return 0;
  }

  if (term.length >= 4 && candidate.startsWith(term)) {
    return Math.round(baseWeight * 0.86);
  }

  if (!allowFuzzy || term.length < 5 || candidate.length < 4) {
    return 0;
  }

  if (!isLikelyFuzzyCandidate(term, candidate)) {
    return 0;
  }

  if (isIngEningFuzzyMismatch(term, candidate)) {
    return 0;
  }

  if (isSingleAdjacentSwap(term, candidate)) {
    return Math.round(baseWeight * 0.62);
  }

  const maxDistance = maxAllowedDistance(term);
  const distance = boundedLevenshtein(term, candidate, maxDistance);

  if (distance > maxDistance) {
    return 0;
  }

  if (distance === 1) {
    return Math.round(baseWeight * 0.52);
  }

  return Math.round(baseWeight * 0.36);
}

function scoreTermAgainstField(
  term: string,
  fieldText: string,
  fieldTokens: string[],
  baseWeight: number,
  allowFuzzy = true,
): number {
  if (!fieldText) {
    return 0;
  }

  const termTokens = tokenize(term);
  if (termTokens.length > 1 && hasTokenSequence(fieldTokens, termTokens)) {
    return baseWeight;
  }

  let best = 0;

  for (const fieldToken of fieldTokens) {
    const tokenScore = tokenMatchScore(term, fieldToken, baseWeight, allowFuzzy);
    if (tokenScore > best) {
      best = tokenScore;
    }
  }

  return best;
}

type ProductSearchIndex = {
  coreText: string;
  coreTokenSet: Set<string>;
  title: string;
  titleTokens: string[];
  handle: string;
  handleTokens: string[];
  vendor: string;
  vendorTokens: string[];
  productType: string;
  productTypeTokens: string[];
  tags: string;
  tagTokens: string[];
  body: string;
  bodyTokens: string[];
  searchBoostTerms: string[];
  searchBoosts: string;
  searchBoostTokens: string[];
  knowledgeText: string;
  knowledgeTokens: string[];
  knowledgeNegativeTokens: string[];
  isLightingProduct: boolean;
};

const searchIndexCache = new WeakMap<ShopifyProduct, ProductSearchIndex>();

function buildSearchIndex(product: ShopifyProduct): ProductSearchIndex {
  const cached = searchIndexCache.get(product);
  if (cached) {
    return cached;
  }

  const title = normalize(product.title);
  const handle = normalize(product.handle).replace(/-/g, " ");
  const vendor = normalize(product.vendor);
  const productType = normalize(product.product_type);
  const tags = normalize(product.tags);
  const body = normalize(stripHtml(product.body_html)).slice(0, 500);
  const searchBoostValues = Array.isArray(product.customData?.searchProductBoosts)
    ? Array.from(
        new Set(
          product.customData.searchProductBoosts
            .map((value) => normalizeScopeText(value))
            .filter(Boolean),
        ),
      )
    : [];
  const searchBoostTerms = searchBoostValues;
  const searchBoosts = searchBoostTerms.join(" ");
  const searchBoostTokens = tokenize(searchBoosts);
  // Search payloads carry this record. Legacy full-catalog payloads intentionally
  // avoid an eager reclassification pass during an interactive search.
  const knowledge = product.knowledge || null;
  const knowledgeAttributeValues = knowledge?.attributes
    ? Object.values(knowledge.attributes).flat()
    : [];
  const relatedCategoryValues = knowledge?.relatedCategories
    ? knowledge.relatedCategories.flatMap((category) => [
        category.departmentLabel,
        category.categoryLabel,
        category.subcategoryLabel || "",
        category.relationship || "",
      ])
    : [];
  const knowledgeText = normalize([
    knowledge?.searchTerms || [],
    knowledge?.specificType || "",
    knowledge?.familyId || "",
    knowledge?.familyLabel || "",
    knowledgeAttributeValues,
    relatedCategoryValues,
  ]);
  const knowledgeTokens = tokenize(knowledgeText);
  const knowledgeNegativeTokens = tokenize(knowledge?.negativeTerms || []);
  const coreTokens = uniqueTokens([...tokenize([title, handle, productType, tags].join(" ")), ...knowledgeTokens]);
  const hasResolvedTaxonomy = Boolean(
    knowledge &&
      knowledge.familyId &&
      knowledge.familyId !== "other" &&
      knowledge.reviewRequired !== true &&
      (knowledge.confidence ?? 0) >= 72,
  );
  const hasRawLightingSignal =
    /\b(?:lighting|lamp|lamps|lights)\b/i.test(productType) ||
    /\b(?:led|ceiling|wall|table|night|desk|floor)\s+(?:light|lamp)|\b(?:light|lamp)\s+(?:fixture|bulb|shade)\b/i.test(title);
  const hasRawLightingExclusion = /\b(?:charger|charging|power bank|battery charger|nail lamp|ring light)\b/i.test(
    `${title} ${handle} ${productType}`,
  );
  // A verified taxonomy classification outranks imported supplier tags. This
  // prevents a charger or serum tagged "lighting" from entering light results.
  const isLightingProduct =
    knowledge?.familyId === "home-lighting" ||
    (!hasResolvedTaxonomy && hasRawLightingSignal && !hasRawLightingExclusion);

  const index: ProductSearchIndex = {
    coreText: normalize([title, handle, productType, tags].join(" ")),
    coreTokenSet: new Set(coreTokens),
    title,
    titleTokens: tokenize(title),
    handle,
    handleTokens: tokenize(handle),
    vendor,
    vendorTokens: tokenize(vendor),
    productType,
    productTypeTokens: tokenize(productType),
    tags,
    tagTokens: tokenize(tags),
    body,
    bodyTokens: tokenize(body).slice(0, 80),
    searchBoostTerms,
    searchBoosts,
    searchBoostTokens,
    knowledgeText,
    knowledgeTokens,
    knowledgeNegativeTokens,
    isLightingProduct,
  };

  searchIndexCache.set(product, index);
  return index;
}

function phraseBonus(query: string, index: ProductSearchIndex): number {
  if (query.length < 4) {
    return 0;
  }

  const queryTokens = uniqueTokens(tokenize(query));
  if (!queryTokens.length) {
    return 0;
  }

  if (index.title === query || index.handle === query) {
    return 180;
  }

  const titleMatches = hasTokenSequence(index.titleTokens, queryTokens);
  const handleMatches = hasTokenSequence(index.handleTokens, queryTokens);
  const productTypeMatches = hasTokenSequence(index.productTypeTokens, queryTokens);
  const tagMatches = hasTokenSequence(index.tagTokens, queryTokens);

  if (titleMatches || handleMatches) {
    return 110;
  }

  if (productTypeMatches || tagMatches) {
    return 72;
  }

  return 0;
}

function bestGroupScore(
  terms: string[],
  index: ProductSearchIndex,
  coreWeightScale = 1,
): { core: number; secondary: number } {
  let bestCore = 0;
  let bestSecondary = 0;

  for (const term of terms) {
    const lightCandidateTokens = LIGHT_FALSE_FRIENDS;
    const filterLightDescriptor = (tokens: string[]) =>
      !index.isLightingProduct && (term === "light" || term === "lights" || term === "lighting")
        ? tokens.filter((token) => !lightCandidateTokens.has(token) && token !== "light" && token !== "lights" && token !== "lighting")
        : tokens;
    const coreScores = [
      scoreTermAgainstField(term, index.title, filterLightDescriptor(index.titleTokens), Math.round(44 * coreWeightScale)),
      scoreTermAgainstField(term, index.handle, filterLightDescriptor(index.handleTokens), Math.round(38 * coreWeightScale)),
      scoreTermAgainstField(term, index.productType, filterLightDescriptor(index.productTypeTokens), Math.round(30 * coreWeightScale)),
      scoreTermAgainstField(term, index.tags, filterLightDescriptor(index.tagTokens), Math.round(28 * coreWeightScale)),
      scoreTermAgainstField(term, index.knowledgeText, filterLightDescriptor(index.knowledgeTokens), Math.round(24 * coreWeightScale), false),
    ];
    const secondaryScores = [
      scoreTermAgainstField(term, index.vendor, index.vendorTokens, 18, false),
      scoreTermAgainstField(term, index.body, filterLightDescriptor(index.bodyTokens), 10, false),
      scoreTermAgainstField(term, index.knowledgeText, filterLightDescriptor(index.knowledgeTokens), 26, false),
    ];

    const groupCore = Math.max(...coreScores);
    const groupSecondary = Math.max(...secondaryScores);

    if (groupCore > bestCore) {
      bestCore = groupCore;
    }

    if (groupSecondary > bestSecondary) {
      bestSecondary = groupSecondary;
    }
  }

  return { core: bestCore, secondary: bestSecondary };
}

function matchesAnyTokenGroup(index: ProductSearchIndex, groups: string[][]): boolean {
  return groups.some((group) =>
    group.some((token) =>
      index.coreTokenSet.has(token) ||
      index.bodyTokens.includes(token) ||
      (tokenize(token).length > 1 && hasTokenSequence(index.titleTokens, tokenize(token))) ||
      (tokenize(token).length > 1 && hasTokenSequence(index.handleTokens, tokenize(token))),
    ),
  );
}

function groupMatchesIndex(index: ProductSearchIndex, group: string[]): boolean {
  const result = bestGroupScore(group, index);
  return result.core > 0 || result.secondary > 0;
}

function intentMatchScore(index: ProductSearchIndex, intent: SearchIntentSignal): { core: number; secondary: number } {
  return bestGroupScore(intent.terms, index, 1.12);
}

export function matchesSearchConstraints(product: ShopifyProduct, parsedQuery: ParsedQuery): boolean {
  return matchesPriceRange(product, parsedQuery.priceRange) && (!parsedQuery.availableOnly || isAvailable(product));
}

function scoreProductForQuery(product: ShopifyProduct, parsedQuery: ParsedQuery): number {
  const { normalized, termGroups, excludedGroups, quotedPhrases, priceRange, availableOnly } = parsedQuery;
  if (!normalized && !quotedPhrases.length && !excludedGroups.length && !priceRange && !availableOnly && !parsedQuery.intent) {
    return 1;
  }

  const index = buildSearchIndex(product);

  if (!matchesSearchConstraints(product, parsedQuery)) {
    return 0;
  }

  // A root/category lighting query is a taxonomy query, not a keyword query.
  // Supplier copy can mention a lamp while the product itself is a charger,
  // controller, beauty item, or another family. Only verified home-lighting
  // records are allowed through this boundary.
  if (isHomeLightingQuery(parsedQuery) && !index.isLightingProduct) {
    return 0;
  }

  if (excludedGroups.length && matchesAnyTokenGroup(index, excludedGroups)) {
    return 0;
  }

  for (const phrase of quotedPhrases) {
    if (!phrase || !index.coreText.includes(phrase)) {
      return 0;
    }
  }

  if (!termGroups.length && !quotedPhrases.length && !parsedQuery.intent) {
    return 1;
  }

  if (!termGroups.length && quotedPhrases.length) {
    return quotedPhrases.length * 180;
  }

  if (!termGroups.length && !parsedQuery.intent) {
    return 0;
  }

  const intent = parsedQuery.intent;
  const productKnowledge = intent ? (product.knowledge || classifyProductKnowledge(product)) : null;
  if (intent?.familyIds.length && productKnowledge && !intent.familyIds.includes(productKnowledge.familyId)) {
    return 0;
  }

  const intentContextTokens = new Set((intent?.contextTerms || []).flatMap((term) => tokenize(term)));
  const requiredTermGroups = termGroups.filter(
    (group) => !intent || !group.some((term) => intentContextTokens.has(term)),
  );
  const contextTermGroups = intent
    ? termGroups.filter((group) => group.some((term) => intentContextTokens.has(term)))
    : [];
  const intentMatch = intent ? intentMatchScore(index, intent) : { core: 0, secondary: 0 };

  if (intent && intentMatch.core <= 0) {
    return 0;
  }

  let score = phraseBonus(normalized, index);
  if (intent) {
    score += intentMatch.core + Math.round(intentMatch.secondary * 0.35) + 72;
  }
  score += quotedPhrases.length * 110;
  let matchedTerms = 0;
  let matchedCoreTerms = 0;

  for (const termGroup of requiredTermGroups) {
    const scale = termGroup.some((term) => term.length <= 3) ? 1.14 : 1;
    const group = bestGroupScore(termGroup, index, scale);
    const bestCore = group.core;
    const bestSecondary = group.secondary;
    const best = Math.max(bestCore, bestSecondary);

    if (best > 0) {
      matchedTerms += 1;

      if (bestCore > 0) {
        matchedCoreTerms += 1;
        score += bestCore;
      } else {
        score += Math.round(bestSecondary * 0.5);
      }
    }
  }

  if (contextTermGroups.some((group) => groupMatchesIndex(index, group))) {
    score += 24;
  }

  const requiredMatches =
    requiredTermGroups.length <= 2
      ? requiredTermGroups.length
      : Math.max(2, requiredTermGroups.length - 1);
  const requiredCoreMatches =
    requiredTermGroups.length <= 2
      ? requiredTermGroups.length
      : Math.max(2, requiredTermGroups.length - 1);

  if (matchedTerms < requiredMatches) {
    return 0;
  }

  if (matchedCoreTerms < requiredCoreMatches) {
    return 0;
  }

  score += matchedTerms === requiredTermGroups.length ? 42 : 18;
  return score;
}

function sortableTimestamp(product: ShopifyProduct): number {
  const timestamp = new Date(
    product.updated_at || product.published_at || product.created_at,
  ).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function searchableText(product: ShopifyProduct): string {
  return normalize(
    [
      product.title,
      product.vendor,
      product.product_type,
      product.tags,
      product.customData?.searchProductBoosts || [],
      stripHtml(product.body_html),
      product.handle,
    ].join(" "),
  );
}

export function matchesCollection(
  product: ShopifyProduct,
  collectionHandle: string,
  collections: ShopifyCollection[],
  collectionProductIds?: number[] | null,
): boolean {
  const handle = normalize(collectionHandle);

  if (!handle) {
    return true;
  }

  const collection = collections.find((entry) => normalize(entry.handle) === handle);
  const registryCollection = getCollectionByHandle(handle) || getCollectionByHandle(resolveCollectionRouteHandle(handle));
  const scope = registryCollection?.scope || null;
  const collectionTitle = normalize(collection?.title).replace(/\s+/g, "-");
  const mergedHandles = getMergedCollectionHandles(handle);
  const canonicalHandle = resolveCollectionRouteHandle(handle);

  const productSpace = productScopeText(product);
  const scopeMatches = collectionScopeMatches(productSpace, scope);

  if (Array.isArray(collectionProductIds)) {
    return collectionProductIds.includes(product.id) && scopeMatches;
  }

  return (
    scopeMatches &&
    (
      includeToken(productSpace, handle) ||
      includeToken(productSpace, handle.replace(/-/g, " ")) ||
      includeToken(productSpace, canonicalHandle) ||
      includeToken(productSpace, canonicalHandle.replace(/-/g, " ")) ||
      mergedHandles.some(
        (mergedHandle) =>
          includeToken(productSpace, mergedHandle) ||
          includeToken(productSpace, mergedHandle.replace(/-/g, " ")),
      ) ||
      includeToken(productSpace, collectionTitle) ||
      includeToken(productSpace, normalize(collection?.title))
    )
  );
}

export function filterProducts(
  products: ShopifyProduct[],
  options: {
    query?: string;
    collection?: string;
    productType?: string;
    collections?: ShopifyCollection[];
    collectionProductIds?: number[] | null;
  },
): ShopifyProduct[] {
  const parsedQuery = parseSearchQuery(options.query);
  const type = normalizeProductType(options.productType);
  const collectionHandle = normalize(options.collection);
  const collections = options.collections || [];
  const collectionProductIds = options.collectionProductIds ?? null;

  const baseFiltered = products.filter((product) => {
    if (type && normalizeProductType(product.product_type) !== type) {
      return false;
    }

    if (collectionHandle && !matchesCollection(product, collectionHandle, collections, collectionProductIds)) {
      return false;
    }

    return true;
  });

  if (!parsedQuery.normalized && !parsedQuery.quotedPhrases.length && !parsedQuery.excludedGroups.length && !parsedQuery.intent) {
    return baseFiltered;
  }

  return baseFiltered
    .map((product) => ({
      product,
      score: scoreProductForQuery(product, parsedQuery),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return sortableTimestamp(right.product) - sortableTimestamp(left.product);
    })
    .map((entry) => entry.product);
}

export function uniqueProductTypes(products: ShopifyProduct[]): string[] {
  return Array.from(
    new Set(products.map((product) => normalizeProductType(product.product_type)).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
}
