import { stripHtml } from "@/lib/formatters";
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
  "the",
  "to",
  "with",
]);

const TOKEN_ALIASES: Record<string, string[]> = {
  tshirt: ["t-shirt", "tee", "shirt"],
  "t-shirt": ["tshirt", "tee", "shirt"],
  tshirts: ["t-shirt", "tee", "shirt"],
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

function includeToken(haystack: string, needle: string): boolean {
  if (!needle) {
    return true;
  }

  return haystack.includes(needle);
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

type ParsedQuery = {
  normalized: string;
  termGroups: string[][];
  excludedGroups: string[][];
  quotedPhrases: string[];
};

function parseQuery(input?: string): ParsedQuery {
  const source = normalize(input || "");
  const quotedPhrases = Array.from(source.matchAll(/"([^"]+)"/g))
    .map((match) => normalize(match[1]))
    .map((phrase) => phrase.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const withoutQuotes = source.replace(/"([^"]+)"/g, " ");
  const rawParts = withoutQuotes.split(/\s+/).filter(Boolean);

  const requiredTerms: string[] = [];
  const excludedTerms: string[] = [];

  for (const part of rawParts) {
    if (part.startsWith("-") && part.length > 1) {
      excludedTerms.push(...tokenize(part.slice(1)));
      continue;
    }

    if (part.startsWith("+") && part.length > 1) {
      requiredTerms.push(...tokenize(part.slice(1)));
      continue;
    }

    requiredTerms.push(...tokenize(part));
  }

  return {
    normalized: uniqueTokens(requiredTerms).join(" "),
    termGroups: uniqueTokens(requiredTerms).map((term) => expandToken(term)),
    excludedGroups: uniqueTokens(excludedTerms).map((term) => expandToken(term)),
    quotedPhrases,
  };
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

  if (term.length >= 4 && candidate.startsWith(term)) {
    return Math.round(baseWeight * 0.86);
  }

  if (term.length >= 6 && candidate.includes(term)) {
    return Math.round(baseWeight * 0.7);
  }

  if (!allowFuzzy || term.length < 5 || candidate.length < 4) {
    return 0;
  }

  if (!isLikelyFuzzyCandidate(term, candidate)) {
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
  const coreTokens = tokenize([title, handle, productType, tags].join(" "));

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
  };

  searchIndexCache.set(product, index);
  return index;
}

function phraseBonus(query: string, index: ProductSearchIndex): number {
  if (query.length < 4) {
    return 0;
  }

  if (index.title === query || index.handle === query) {
    return 180;
  }

  if (index.title.includes(query) || index.handle.includes(query)) {
    return 110;
  }

  if (index.productType.includes(query) || index.tags.includes(query)) {
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
    const coreScores = [
      scoreTermAgainstField(term, index.title, index.titleTokens, Math.round(44 * coreWeightScale)),
      scoreTermAgainstField(term, index.handle, index.handleTokens, Math.round(38 * coreWeightScale)),
      scoreTermAgainstField(term, index.productType, index.productTypeTokens, Math.round(30 * coreWeightScale)),
      scoreTermAgainstField(term, index.tags, index.tagTokens, Math.round(28 * coreWeightScale)),
    ];
    const secondaryScores = [
      scoreTermAgainstField(term, index.vendor, index.vendorTokens, 18, false),
      scoreTermAgainstField(term, index.body, index.bodyTokens, 10, false),
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
    group.some((token) => index.coreTokenSet.has(token) || (token.length >= 6 && index.coreText.includes(token))),
  );
}

function scoreProductForQuery(product: ShopifyProduct, parsedQuery: ParsedQuery): number {
  const { normalized, termGroups, excludedGroups, quotedPhrases } = parsedQuery;
  if (!normalized && !quotedPhrases.length && !excludedGroups.length) {
    return 1;
  }

  const index = buildSearchIndex(product);

  if (excludedGroups.length && matchesAnyTokenGroup(index, excludedGroups)) {
    return 0;
  }

  for (const phrase of quotedPhrases) {
    if (!phrase || !index.coreText.includes(phrase)) {
      return 0;
    }
  }

  if (!termGroups.length && !quotedPhrases.length) {
    return 1;
  }

  if (!termGroups.length && quotedPhrases.length) {
    return quotedPhrases.length * 180;
  }

  if (!termGroups.length) {
    return 0;
  }

  let score = phraseBonus(normalized, index);
  score += quotedPhrases.length * 110;
  let matchedTerms = 0;
  let matchedCoreTerms = 0;

  for (const termGroup of termGroups) {
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

  const requiredMatches =
    termGroups.length <= 2
      ? termGroups.length
      : Math.max(2, termGroups.length - 1);
  const requiredCoreMatches =
    termGroups.length <= 2
      ? termGroups.length
      : Math.max(2, termGroups.length - 1);

  if (matchedTerms < requiredMatches) {
    return 0;
  }

  if (matchedCoreTerms < requiredCoreMatches) {
    return 0;
  }

  score += matchedTerms === termGroups.length ? 42 : 18;
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
      stripHtml(product.body_html),
      product.handle,
    ].join(" "),
  );
}

export function matchesCollection(
  product: ShopifyProduct,
  collectionHandle: string,
  collections: ShopifyCollection[],
): boolean {
  const handle = normalize(collectionHandle);

  if (!handle) {
    return true;
  }

  const collection = collections.find((entry) => normalize(entry.handle) === handle);
  const collectionTitle = normalize(collection?.title).replace(/\s+/g, "-");

  const productSpace = normalize(
    `${product.product_type} ${product.tags} ${product.title} ${product.handle}`,
  );

  return (
    includeToken(productSpace, handle) ||
    includeToken(productSpace, handle.replace(/-/g, " ")) ||
    includeToken(productSpace, collectionTitle) ||
    includeToken(productSpace, normalize(collection?.title))
  );
}

export function filterProducts(
  products: ShopifyProduct[],
  options: {
    query?: string;
    collection?: string;
    productType?: string;
    collections?: ShopifyCollection[];
  },
): ShopifyProduct[] {
  const parsedQuery = parseQuery(options.query);
  const type = normalize(options.productType);
  const collectionHandle = normalize(options.collection);
  const collections = options.collections || [];

  const baseFiltered = products.filter((product) => {
    if (type && normalize(product.product_type) !== type) {
      return false;
    }

    if (collectionHandle && !matchesCollection(product, collectionHandle, collections)) {
      return false;
    }

    return true;
  });

  if (!parsedQuery.normalized && !parsedQuery.quotedPhrases.length && !parsedQuery.excludedGroups.length) {
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
    new Set(products.map((product) => normalize(product.product_type)).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
}
