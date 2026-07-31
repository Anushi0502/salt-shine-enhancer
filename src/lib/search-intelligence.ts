import {
  filterProducts,
  isIngEningFuzzyMismatch,
  isLightFamilyMismatch,
  matchesSearchConstraints,
  normalizeProductType,
  parseSearchQuery,
  searchableText,
} from "@/lib/catalog";
import type { ParsedQuery, SearchIntentSignal } from "@/lib/catalog";
import { classifyProductKnowledge } from "@/lib/product-knowledge-base.js";
import { minPrice } from "@/lib/formatters";
import type { ShopifyCollection, ShopifyProduct } from "@/types/shopify";

export type SearchQuerySuggestion = {
  label: string;
  query: string;
};

export type SearchCategorySuggestion = {
  label: string;
  to: string;
};

export type SearchIntentSummary = {
  label: string;
  matchedPhrase: string;
  familyLabel: string;
  mode: "keyword" | "catalog-intent";
  priceLabel: string;
  availabilityLabel: string;
};

export type SearchRefinement = {
  label: string;
  query: string;
  reason: string;
};

export type SearchMatchExplanation = {
  productId: number;
  reasons: string[];
};

export type SearchIntelligence = {
  exactProducts: ShopifyProduct[];
  predictedProducts: ShopifyProduct[];
  querySuggestions: SearchQuerySuggestion[];
  categorySuggestions: SearchCategorySuggestion[];
  intent: SearchIntentSummary | null;
  refinements: SearchRefinement[];
  matchExplanations: SearchMatchExplanation[];
  resultMode: "exact" | "catalog-intent" | "predicted";
};

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
  "the",
  "to",
  "with",
]);

const QUERY_ALIASES: Record<string, string[]> = {
  tshirt: ["t-shirt", "tee", "shirt"],
  "t-shirt": ["tshirt", "tee", "shirt"],
  tshirts: ["t-shirt", "tee", "shirt"],
  lighting: ["lamp"],
  gift: ["gifts", "present", "presents"],
  gifts: ["gift", "present", "presents"],
  present: ["gift", "gifts", "present"],
  decor: ["decorative", "decoration", "decor"],
  lamp: ["light", "lighting", "lamps"],
  light: ["lamp", "lighting", "lights"],
  kitchen: ["cookware", "kitchenware", "cook"],
  cookware: ["kitchen", "cook", "kitchenware"],
  organizer: ["storage", "organizer", "organize"],
  storage: ["organizer", "storage", "organize"],
  travel: ["portable", "trip", "road"],
  pet: ["animal", "dog", "cat"],
  planner: ["organizer", "tracker", "calendar"],
  bottle: ["flask", "water bottle", "hydration"],
  mat: ["pad", "liner", "rug"],
  mask: ["face mask", "sleep mask"],
  wellness: ["health", "self-care", "care"],
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
  sneakers: ["trainers", "shoes"],
  trainers: ["sneakers", "shoes"],
};

function normalizeText(input?: unknown): string {
  if (Array.isArray(input)) {
    return input
      .map((entry) => normalizeText(entry))
      .filter(Boolean)
      .join(" ");
  }

  return String(input || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizePhrase(input: string): string {
  return normalizeText(input).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(input: string): string[] {
  return normalizePhrase(input)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => token.length > 1 || /\d/.test(token))
    .filter((token) => !STOP_WORDS.has(token));
}

function compactText(input: string): string {
  return normalizePhrase(input).replace(/\s+/g, "");
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
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

function expandToken(token: string): string[] {
  const normalized = normalizePhrase(token);
  if (!normalized) {
    return [];
  }

  const singular = singularize(normalized);
  const aliasTokens = [
    ...(QUERY_ALIASES[normalized] || []),
    ...(QUERY_ALIASES[singular] || []),
  ].map((entry) => normalizePhrase(entry));

  return unique([normalized, singular, ...aliasTokens].filter(Boolean));
}

function maxAllowedDistance(token: string): number {
  if (token.length <= 5) {
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

  if (isIngEningFuzzyMismatch(term, candidate)) {
    return false;
  }

  return true;
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

function tokenMatchScore(term: string, candidate: string): number {
  if (!term || !candidate) {
    return 0;
  }

  if (term === candidate) {
    return 20;
  }

  if (isLightFamilyMismatch(term, candidate)) {
    return 0;
  }

  if (candidate.startsWith(term)) {
    return Math.max(14, 18 - Math.max(0, candidate.length - term.length));
  }

  if (term.length < 4 || candidate.length < 4 || !isLikelyFuzzyCandidate(term, candidate)) {
    return 0;
  }

  if (isSingleAdjacentSwap(term, candidate)) {
    return 11;
  }

  const maxDistance = maxAllowedDistance(term);
  const distance = boundedLevenshtein(term, candidate, maxDistance);
  if (distance > maxDistance) {
    return 0;
  }

  if (distance === 1) {
    return 8;
  }

  return 5;
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

function scorePhrase(query: string, candidate: string): number {
  const normalizedQuery = normalizePhrase(query);
  const normalizedCandidate = normalizePhrase(candidate);
  if (!normalizedQuery || !normalizedCandidate) {
    return 0;
  }

  const queryTokens = unique(tokenize(normalizedQuery));
  if (!queryTokens.length) {
    return 0;
  }

  const candidateTokens = unique(tokenize(normalizedCandidate));
  const compactQuery = compactText(normalizedQuery);
  const compactCandidate = compactText(normalizedCandidate);
  let score = 0;

  if (normalizedCandidate === normalizedQuery || compactCandidate === compactQuery) {
    score += 36;
  }

  if (hasTokenSequence(candidateTokens, queryTokens)) {
    score += 24;
  }

  let matchedTokens = 0;

  for (const queryToken of queryTokens) {
    const expandedTokens = expandToken(queryToken);
    let bestScore = 0;

    for (const expandedToken of expandedTokens) {
      const expandedPhraseTokens = tokenize(expandedToken);
      if (expandedPhraseTokens.length > 1 && hasTokenSequence(candidateTokens, expandedPhraseTokens)) {
        bestScore = Math.max(bestScore, 17);
        continue;
      }

      for (const candidateToken of candidateTokens) {
        const tokenScore = tokenMatchScore(expandedToken, candidateToken);
        if (tokenScore > bestScore) {
          bestScore = tokenScore;
        }
      }
    }

    if (bestScore > 0) {
      matchedTokens += 1;
      score += bestScore;
    }
  }

  if (matchedTokens === queryTokens.length) {
    score += 18;
  } else if (matchedTokens > 0) {
    score += 8;
  }

  if (queryTokens.length > 1 && hasTokenSequence(candidateTokens, queryTokens)) {
    score += 12;
  }

  return score;
}

type QueryCoverage = {
  matched: number;
  coreMatched: number;
  secondaryMatched: number;
  total: number;
};

function queryTokenMatches(token: string, candidateTokens: string[]): boolean {
  return expandToken(token).some((expandedToken) => {
    const expandedPhraseTokens = tokenize(expandedToken);
    if (expandedPhraseTokens.length > 1) {
      return hasTokenSequence(candidateTokens, expandedPhraseTokens);
    }

    return candidateTokens.some((candidateToken) => tokenMatchScore(expandedToken, candidateToken) > 0);
  });
}

function queryCoverage(product: ShopifyProduct, query: string, intent: SearchIntentSignal | null = null): QueryCoverage {
  const contextTokens = new Set((intent?.contextTerms || []).flatMap((term) => tokenize(term)));
  const queryTokens = unique(tokenize(query)).filter((token) => !contextTokens.has(token));
  if (!queryTokens.length) {
    return { matched: 0, coreMatched: 0, secondaryMatched: 0, total: 0 };
  }

  const knowledge = product.knowledge || classifyProductKnowledge(product);
  const rawCoreTokens = tokenize([
    product.title,
    product.handle,
    product.product_type,
    Array.isArray(product.tags) ? product.tags.join(" ") : String(product.tags || ""),
    knowledge.leafType,
    knowledge.familyLabel,
    ...(knowledge.aliases || []),
  ].join(" "));
  const isLightingProduct = knowledge.familyId === "home-lighting" ||
    /\b(?:lighting|lamp|lamps|lights)\b/i.test(`${product.product_type} ${Array.isArray(product.tags) ? product.tags.join(" ") : String(product.tags || "")}`) ||
    /\b(?:led|ceiling|wall|table|night|desk|floor)\s+(?:light|lamp)|\b(?:light|lamp)\s+(?:fixture|bulb|shade)\b/i.test(product.title);
  const coreTokens = isLightingProduct
    ? rawCoreTokens
    : rawCoreTokens.filter((token) => !["light", "lights", "lighting", "lamp", "lamps"].includes(token));
  const secondaryTokens = tokenize([
    Array.isArray(product.customData?.searchProductBoosts) ? product.customData.searchProductBoosts.join(" ") : "",
    product.customData?.collectionSignal || "",
    String(product.body_html || "").replace(/<[^>]+>/g, " "),
  ].join(" "));
  let coreMatched = 0;
  let secondaryMatched = 0;

  queryTokens.forEach((token) => {
    if (queryTokenMatches(token, coreTokens)) {
      coreMatched += 1;
    } else if (queryTokenMatches(token, secondaryTokens)) {
      secondaryMatched += 1;
    }
  });

  return {
    matched: coreMatched + secondaryMatched,
    coreMatched,
    secondaryMatched,
    total: queryTokens.length,
  };
}

function formatSuggestionLabel(input: string, maxLength = 36): string {
  const cleaned = String(input || "").trim().replace(/\s+/g, " ").toLowerCase();
  if (!cleaned) {
    return "";
  }

  const titled = cleaned.replace(/(^|[\s-])([a-z0-9])/g, (match, prefix: string, character: string) => `${prefix}${character.toUpperCase()}`);
  if (titled.length <= maxLength) {
    return titled;
  }

  return `${titled.slice(0, maxLength - 1).trimEnd()}…`;
}

function productSearchText(product: ShopifyProduct): string {
  const tags = Array.isArray(product.tags) ? product.tags.join(" ") : String(product.tags || "");
  const boosts = Array.isArray(product.customData?.searchProductBoosts)
    ? product.customData.searchProductBoosts.join(" ")
    : "";
  const knowledge = product.knowledge || classifyProductKnowledge(product);

  return [
    product.title,
    product.product_type,
    tags,
    boosts,
    product.customData?.collectionSignal || "",
    knowledge.leafType,
    knowledge.familyLabel,
    knowledge.aliases.join(" "),
    searchableText(product),
  ]
    .filter(Boolean)
    .join(" ");
}

function scoreIntentAgainstProduct(product: ShopifyProduct, intent: SearchIntentSignal): number {
  const knowledge = product.knowledge || classifyProductKnowledge(product);
  if (intent.familyIds.length && !intent.familyIds.includes(knowledge.familyId)) {
    return 0;
  }

  const candidate = productSearchText(product);
  return Math.max(...intent.terms.map((term) => scorePhrase(term, candidate)), 0);
}

function scoreContextAgainstProduct(product: ShopifyProduct, intent: SearchIntentSignal): number {
  const candidate = productSearchText(product);
  return Math.max(...intent.contextTerms.map((term) => scorePhrase(term, candidate)), 0);
}

function sortableTimestamp(product: ShopifyProduct): number {
  const timestamp = new Date(product.updated_at || product.published_at || product.created_at || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function scoreProductForQuery(product: ShopifyProduct, query: string, parsedQuery = parseSearchQuery(query)): number {
  const normalizedQuery = normalizePhrase([parsedQuery.normalized, ...parsedQuery.quotedPhrases].join(" "));
  if (!normalizedQuery && !parsedQuery.intent) {
    return 0;
  }

  if (!matchesSearchConstraints(product, parsedQuery)) {
    return 0;
  }

  const searchText = productSearchText(product);
  const titleScore = scorePhrase(normalizedQuery, product.title) * 2.4;
  const typeScore = scorePhrase(normalizedQuery, normalizeProductType(product.product_type)) * 1.8;
  const tagScore = scorePhrase(normalizedQuery, Array.isArray(product.tags) ? product.tags.join(" ") : String(product.tags || "")) * 1.4;
  const boostScore = scorePhrase(
    normalizedQuery,
    Array.isArray(product.customData?.searchProductBoosts) ? product.customData.searchProductBoosts.join(" ") : "",
  ) * 2.2;
  const collectionScore = scorePhrase(normalizedQuery, product.customData?.collectionSignal || "") * 1.9;
  const knowledge = product.knowledge || classifyProductKnowledge(product);
  const knowledgeScore = scorePhrase(normalizedQuery, [knowledge.leafType, knowledge.familyLabel, ...knowledge.aliases].join(" ")) * 1.6;
  const bodyScore = scorePhrase(normalizedQuery, String(product.body_html || "").replace(/<[^>]+>/g, " ")) * 0.4;
  const searchableScore = scorePhrase(normalizedQuery, searchText) * 0.3;
  const intentScore = parsedQuery.intent ? scoreIntentAgainstProduct(product, parsedQuery.intent) : 0;
  const contextScore = parsedQuery.intent ? scoreContextAgainstProduct(product, parsedQuery.intent) : 0;
  if (parsedQuery.intent && intentScore <= 0) {
    return 0;
  }

  const coverage = queryCoverage(product, normalizedQuery, parsedQuery.intent);
  const requiredCoverage = coverage.total <= 1 ? 1 : coverage.total;

  if (coverage.total > 0 && coverage.matched < requiredCoverage) {
    return 0;
  }

  return titleScore + typeScore + tagScore + boostScore + collectionScore + knowledgeScore + bodyScore + searchableScore + intentScore * 1.7 + contextScore * 0.55 + coverage.coreMatched * 18 + coverage.secondaryMatched * 8;
}

function scoreCollectionForQuery(collection: ShopifyCollection, query: string): number {
  const queryText = normalizePhrase(query);
  if (!queryText) {
    return 0;
  }

  return scorePhrase(
    queryText,
    [
      collection.title,
      collection.handle,
      collection.description,
      collection.customData?.heroKicker || "",
      collection.customData?.heroSummary || "",
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function buildQuerySuggestions(
  query: string,
  products: ShopifyProduct[],
  collections: ShopifyCollection[],
  queryLimit: number,
): SearchQuerySuggestion[] {
  const queryText = normalizePhrase(query);
  if (!queryText) {
    return [];
  }

  const candidates = new Map<string, { query: string; label: string; score: number }>();

  const addCandidate = (value: string, sourceScore: number) => {
    const normalized = normalizePhrase(value);
    if (!normalized || normalized === queryText) {
      return;
    }

    const label = formatSuggestionLabel(value);
    const relevance = scorePhrase(queryText, value);
    if (relevance <= 0) {
      return;
    }

    const existing = candidates.get(normalized);
    const score = relevance * 100 + sourceScore;

    if (!existing || score > existing.score) {
      candidates.set(normalized, { query: value.trim(), label, score });
    }
  };

  products.slice(0, 12).forEach((product, index) => {
    addCandidate(product.title, 32 - index);
    addCandidate(normalizeProductType(product.product_type), 18 - index);
    const knowledge = product.knowledge || classifyProductKnowledge(product);
    addCandidate(knowledge.leafType, 20 - index);

    const boosts = Array.isArray(product.customData?.searchProductBoosts)
      ? product.customData.searchProductBoosts
      : [];

    boosts.slice(0, 3).forEach((boost, boostIndex) => {
      addCandidate(boost, 16 - index - boostIndex);
    });

    if (product.customData?.collectionSignal) {
      addCandidate(product.customData.collectionSignal, 14 - index);
    }
  });

  collections.slice(0, 12).forEach((collection, index) => {
    addCandidate(collection.title, 26 - index);
  });

  return [...candidates.values()]
    .sort((left, right) => right.score - left.score || left.label.length - right.label.length)
    .slice(0, queryLimit)
    .map((entry) => ({ label: entry.label, query: entry.query }));
}

function buildCategorySuggestions(
  query: string,
  products: ShopifyProduct[],
  collections: ShopifyCollection[],
  categoryLimit: number,
): SearchCategorySuggestion[] {
  const queryText = normalizePhrase(query);
  if (!queryText) {
    return [];
  }

  const candidates: Array<{ label: string; to: string; score: number }> = [];

  collections.forEach((collection, index) => {
    const score = scoreCollectionForQuery(collection, queryText);
    if (score <= 0) {
      return;
    }

    candidates.push({
      label: collection.title,
      to: `/collections/${collection.handle}`,
      score: score + Math.max(0, 10 - index),
    });
  });

  const typeCounts = new Map<string, number>();
  products.forEach((product) => {
    const type = normalizeProductType(product.product_type);
    if (!type) {
      return;
    }

    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  });

  [...typeCounts.entries()].forEach(([type, count]) => {
    const score = scorePhrase(queryText, type);
    if (score <= 0) {
      return;
    }

    candidates.push({
      label: formatSuggestionLabel(type),
      to: `/shop?type=${encodeURIComponent(type)}`,
      score: score + Math.min(count, 12),
    });
  });

  return candidates
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
    .slice(0, categoryLimit)
    .map(({ label, to }) => ({ label, to }));
}

function priceLabel(range: ParsedQuery["priceRange"]): string {
  if (!range) {
    return "";
  }

  if (range.min != null && range.max != null) {
    return `$${range.min}-$${range.max}`;
  }

  if (range.max != null) {
    return `Under $${range.max}`;
  }

  if (range.min != null) {
    return `Over $${range.min}`;
  }

  return "";
}

function isProductAvailable(product: ShopifyProduct): boolean {
  return (Array.isArray(product.variants) ? product.variants : []).some((variant) => variant?.available !== false);
}

function dominantFamilyLabel(products: ShopifyProduct[]): string {
  const counts = new Map<string, number>();

  products.forEach((product) => {
    const familyLabel = String((product.knowledge || classifyProductKnowledge(product)).familyLabel || "").trim();
    if (familyLabel) {
      counts.set(familyLabel, (counts.get(familyLabel) || 0) + 1);
    }
  });

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || "";
}

function buildIntentSummary(parsedQuery: ParsedQuery, products: ShopifyProduct[]): SearchIntentSummary | null {
  const familyLabel = dominantFamilyLabel(products);
  if (!parsedQuery.intent && !familyLabel) {
    return null;
  }

  return {
    label: parsedQuery.intent?.label || `Catalog match in ${familyLabel}`,
    matchedPhrase: parsedQuery.intent?.matchedPhrase || parsedQuery.normalized,
    familyLabel,
    mode: parsedQuery.intent ? "catalog-intent" : "keyword",
    priceLabel: priceLabel(parsedQuery.priceRange),
    availabilityLabel: parsedQuery.availableOnly ? "In stock" : "",
  };
}

function buildSearchRefinements(
  query: string,
  parsedQuery: ParsedQuery,
  products: ShopifyProduct[],
  limit: number,
): SearchRefinement[] {
  const baseQuery = query.trim();
  if (!baseQuery || !products.length) {
    return [];
  }

  const refinements: SearchRefinement[] = [];
  const seen = new Set<string>();
  const add = (label: string, suffix: string, reason: string) => {
    const normalizedLabel = normalizePhrase(label);
    if (!normalizedLabel || seen.has(normalizedLabel) || baseQuery.toLowerCase().includes(normalizedLabel)) {
      return;
    }

    seen.add(normalizedLabel);
    refinements.push({ label, query: `${baseQuery} ${suffix}`.trim(), reason });
  };

  if (!parsedQuery.priceRange) {
    const prices = products.map((product) => minPrice(product)).filter((value) => Number.isFinite(value) && value > 0);
    if (prices.some((value) => value <= 25)) {
      add("Under $25", "under $25", "Keep the best matches within a smaller budget");
    }
    if (prices.some((value) => value <= 50)) {
      add("Under $50", "under $50", "Show affordable matches from the same intent");
    }
  }

  if (!parsedQuery.availableOnly && products.some((product) => !isProductAvailable(product))) {
    add("In stock", "in stock", "Remove unavailable items from the shortlist");
  }

  const families = [...new Set(products.map((product) => String((product.knowledge || classifyProductKnowledge(product)).familyLabel || "").trim()).filter(Boolean))];
  families.slice(0, 2).forEach((family) => add(family, family, "Focus the catalog knowledge layer on this product family"));

  const types = [...new Set(products.map((product) => String((product.knowledge || classifyProductKnowledge(product)).leafType || product.product_type || "").trim()).filter(Boolean))];
  types.slice(0, 2).forEach((type) => add(formatSuggestionLabel(type), type, "Narrow to the most specific product type"));

  parsedQuery.intent?.contextTerms.slice(0, 2).forEach((context) => {
    add(formatSuggestionLabel(context), context, "Use your space or use-case context");
  });

  return refinements.slice(0, limit);
}

function buildMatchExplanations(
  products: ShopifyProduct[],
  parsedQuery: ParsedQuery,
  exactProducts: ShopifyProduct[],
): SearchMatchExplanation[] {
  const exactIds = new Set(exactProducts.map((product) => product.id));
  const queryTokens = unique(tokenize(parsedQuery.normalized));

  return products.map((product) => {
    const knowledge = product.knowledge || classifyProductKnowledge(product);
    const candidate = productSearchText(product);
    const reasons: string[] = [];

    if (parsedQuery.intent) {
      reasons.push(parsedQuery.intent.label);
    }

    const matchedTerms = queryTokens
      .filter((term) => scorePhrase(term, candidate) > 0)
      .slice(0, 2)
      .map((term) => formatSuggestionLabel(term, 22));
    if (matchedTerms.length) {
      reasons.push(`Matches ${matchedTerms.join(" + ")}`);
    }

    if (knowledge.familyLabel && !reasons.some((reason) => reason.includes(knowledge.familyLabel))) {
      reasons.push(knowledge.familyLabel);
    }

    const constraintLabels = [priceLabel(parsedQuery.priceRange), parsedQuery.availableOnly ? "In stock" : ""].filter(Boolean);
    reasons.push(...constraintLabels);

    if (!exactIds.has(product.id)) {
      reasons.push("Catalog prediction");
    }

    return { productId: product.id, reasons: reasons.slice(0, 3) };
  });
}

function buildPredictiveProducts(
  products: ShopifyProduct[],
  query: string,
  limit: number,
  exactProducts: ShopifyProduct[],
  parsedQuery = parseSearchQuery(query),
): ShopifyProduct[] {
  const queryText = normalizePhrase([parsedQuery.normalized, ...parsedQuery.quotedPhrases].join(" "));
  if (!queryText) {
    return [];
  }

  const exactIds = new Set(exactProducts.map((product) => product.id));
  const ranked = products
    .filter((product) => !exactIds.has(product.id))
    .map((product) => ({
      product,
      score: scoreProductForQuery(product, queryText, parsedQuery),
      freshness: sortableTimestamp(product),
      price: minPrice(product) || Number.MAX_SAFE_INTEGER,
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (right.freshness !== left.freshness) {
        return right.freshness - left.freshness;
      }

      return left.price - right.price;
    });

  return ranked.slice(0, limit).map((entry) => entry.product);
}

export function buildSearchIntelligence(
  products: ShopifyProduct[],
  collections: ShopifyCollection[],
  query: string,
  options?: {
    limit?: number;
    querySuggestionLimit?: number;
    categorySuggestionLimit?: number;
  },
): SearchIntelligence {
  const limit = options?.limit ?? 4;
  const querySuggestionLimit = options?.querySuggestionLimit ?? 6;
  const categorySuggestionLimit = options?.categorySuggestionLimit ?? 6;
  const parsedQuery = parseSearchQuery(query);
  const normalizedQuery = normalizePhrase([parsedQuery.normalized, ...parsedQuery.quotedPhrases].join(" "));

  if (!normalizedQuery && !parsedQuery.intent) {
    return {
      exactProducts: [],
      predictedProducts: [],
      querySuggestions: [],
      categorySuggestions: [],
      intent: null,
      refinements: [],
      matchExplanations: [],
      resultMode: "predicted",
    };
  }

  const exactProducts = filterProducts(products, { query }).slice(0, limit);
  const predictedProducts = [
    ...exactProducts,
    ...buildPredictiveProducts(products, query, Math.max(0, limit - exactProducts.length), exactProducts, parsedQuery),
  ].slice(0, limit);
  const suggestionQuery = normalizePhrase([
    normalizedQuery,
    ...(parsedQuery.intent?.terms || []),
  ].join(" "));
  const intent = buildIntentSummary(parsedQuery, predictedProducts);
  const resultMode = parsedQuery.intent
    ? "catalog-intent"
    : exactProducts.length
      ? "exact"
      : "predicted";

  return {
    exactProducts,
    predictedProducts,
    querySuggestions: buildQuerySuggestions(suggestionQuery, predictedProducts.length ? predictedProducts : products, collections, querySuggestionLimit),
    categorySuggestions: buildCategorySuggestions(suggestionQuery, products, collections, categorySuggestionLimit),
    intent,
    refinements: buildSearchRefinements(query, parsedQuery, predictedProducts.length ? predictedProducts : products, 6),
    matchExplanations: buildMatchExplanations(predictedProducts, parsedQuery, exactProducts),
    resultMode,
  };
}
