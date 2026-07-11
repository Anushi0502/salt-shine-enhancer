import {
  buildMediaUpdateTargets as buildLegacyMediaUpdateTargets,
  formatMoneyValue,
  normalizeHandleValue,
  normalizeHtmlValue,
  normalizePlainText,
  normalizeUrlForMatch,
  parseMoneyValue,
  toShopifyGid,
} from "./shopify-seo-batch.js";

const GENERIC_TITLE_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "of",
  "on",
  "or",
  "our",
  "the",
  "this",
  "to",
  "with",
  "your",
  "daily",
  "everyday",
  "practical",
  "product",
  "products",
  "item",
  "items",
  "listing",
  "shop",
  "shopify",
  "sale",
  "best",
  "new",
  "popular",
  "premium",
  "featured",
  "feature",
  "bundle",
  "bundles",
  "set",
  "sets",
  "home",
  "use",
  "usable",
  "style",
  "styles",
  "fashion",
  "fashionable",
  "women",
  "woman",
  "men",
  "man",
  "girls",
  "girl",
  "boys",
  "boy",
  "kids",
  "child",
  "children",
  "baby",
  "adult",
  "unisex",
]);

const GENERIC_TITLE_PHRASES = [
  /home product/i,
  /everyday home use/i,
  /practical everyday/i,
  /best seller/i,
  /new arrival/i,
  /product listing/i,
  /shop now/i,
];

const FAMILY_PRIORITY_WORDS = new Set([
  "apron",
  "bib",
  "headband",
  "earring",
  "earrings",
  "necklace",
  "bracelet",
  "ring",
  "watch",
  "charger",
  "case",
  "cover",
  "light",
  "lamp",
  "pillow",
  "blanket",
  "towel",
  "organizer",
  "organiser",
  "bag",
  "bottle",
  "bowl",
  "mat",
  "rug",
  "dress",
  "shirt",
  "pants",
  "skirt",
  "shorts",
  "shoes",
  "socks",
  "sandals",
  "hat",
  "bonnet",
  "beanie",
  "wig",
  "bracelet",
  "strap",
  "protector",
  "screen",
  "diaper",
  "pad",
  "pullup",
  "pullups",
  "briefs",
  "brief",
  "hoodie",
  "toy",
  "toys",
]);

function asText(value) {
  if (typeof value === "string") {
    return value;
  }

  if (value == null) {
    return "";
  }

  return String(value);
}

function uniqueValues(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeComparableText(value) {
  return normalizePlainText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeText(value) {
  return normalizeComparableText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function titleCase(value) {
  return tokenizeText(value)
    .map((token) => {
      if (/^[a-z0-9]+$/i.test(token) && token === token.toUpperCase()) {
        return token;
      }

      return token.charAt(0).toUpperCase() + token.slice(1);
    })
    .join(" ");
}

function stripHtml(value) {
  return asText(value)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return normalizePlainText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (normalizePlainText(value)) {
      return value;
    }
  }

  return "";
}

const ROW_LOOKUP_CACHE = new WeakMap();

function getRowValue(row, candidates) {
  let lookup = ROW_LOOKUP_CACHE.get(row);
  if (!lookup) {
    lookup = new Map(Object.entries(row || {}).map(([key, value]) => [normalizeComparableText(key), value]));
    if (row && typeof row === "object") {
      ROW_LOOKUP_CACHE.set(row, lookup);
    }
  }

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeComparableText(candidate);
    if (lookup.has(normalizedCandidate)) {
      return lookup.get(normalizedCandidate);
    }
  }

  return "";
}

function splitTags(input) {
  const raw = normalizePlainText(input);
  if (!raw) {
    return [];
  }

  const result = [];
  const seen = new Set();

  for (const entry of raw.split(/[,;\n|]+/g)) {
    const text = normalizePlainText(entry);
    if (!text) {
      continue;
    }

    const key = text.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(text);
  }

  return result;
}

function buildTokenSet(...values) {
  return new Set(values.flatMap((value) => tokenizeText(value)).filter(Boolean));
}

function countOverlap(left, right) {
  let count = 0;
  for (const token of left) {
    if (right.has(token)) {
      count += 1;
    }
  }
  return count;
}

function scoreToken(token, signals) {
  let score = 0;

  if (!token) {
    return score;
  }

  if (signals.handleTokens.has(token)) {
    score += 5;
  }
  if (signals.sourceTitleTokens.has(token)) {
    score += 4;
  }
  if (signals.catalogTitleTokens.has(token)) {
    score += 4;
  }
  if (signals.productTypeTokens.has(token)) {
    score += 5;
  }
  if (signals.tagTokens.has(token)) {
    score += 4;
  }
  if (signals.collectionTokens.has(token)) {
    score += 4;
  }
  if (signals.bodyTokens.has(token)) {
    score += 2;
  }
  if (FAMILY_PRIORITY_WORDS.has(token)) {
    score += 3;
  }
  if (GENERIC_TITLE_WORDS.has(token)) {
    score -= 6;
  }
  if (/^\d+$/.test(token)) {
    score -= 4;
  }

  return score;
}

function buildPhraseCandidates(tokens, { maxLength = 3 } = {}) {
  const result = [];
  const windowSize = Math.min(maxLength, Math.max(1, tokens.length));

  for (let length = 1; length <= windowSize; length += 1) {
    for (let index = 0; index <= tokens.length - length; index += 1) {
      result.push(tokens.slice(index, index + length).join(" "));
    }
  }

  if (tokens.length <= 5) {
    result.push(tokens.join(" "));
  }

  return uniqueValues(
    result
      .map((entry) => normalizeComparableText(entry))
      .filter((entry) => entry && entry.length >= 2),
  );
}

function scorePhraseCandidate(phrase, signals) {
  const tokens = tokenizeText(phrase);
  if (!tokens.length) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;
  for (const token of tokens) {
    score += scoreToken(token, signals);
  }

  if (tokens.length === 1) {
    score += 3;
  } else if (tokens.length === 2) {
    score += 7;
  } else if (tokens.length === 3) {
    score += 6;
  } else {
    score -= (tokens.length - 3) * 3;
  }

  if (phrase.length <= 54) {
    score += 4;
  } else if (phrase.length <= 72) {
    score += 1;
  } else {
    score -= 10;
  }

  if (GENERIC_TITLE_PHRASES.some((pattern) => pattern.test(phrase))) {
    score -= 10;
  }

  return score;
}

function selectHandleFamilyPhrase(signals) {
  const candidates = buildPhraseCandidates([...signals.handleTokens]);
  if (!candidates.length) {
    return "";
  }

  let bestCandidate = "";
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const score = scorePhraseCandidate(candidate, signals);
    if (score > bestScore || (score === bestScore && candidate.length < bestCandidate.length)) {
      bestCandidate = candidate;
      bestScore = score;
    }
  }

  return bestScore > Number.NEGATIVE_INFINITY ? titleCase(bestCandidate) : "";
}

function selectBestTitleCandidate(candidates, signals, sourceTitle) {
  let bestCandidate = "";
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const normalizedCandidate = normalizePlainText(candidate);
    if (!normalizedCandidate) {
      continue;
    }

    const tokens = tokenizeText(normalizedCandidate);
    let score = 0;
    for (const token of tokens) {
      score += scoreToken(token, signals);
    }

    if (tokens.length <= 2) {
      score += 3;
    } else if (tokens.length <= 4) {
      score += 6;
    } else if (tokens.length <= 6) {
      score += 2;
    } else {
      score -= (tokens.length - 6) * 2;
    }

    if (normalizedCandidate.length <= 54) {
      score += 7;
    } else if (normalizedCandidate.length <= 70) {
      score += 3;
    } else {
      score -= 12;
    }

    if (signals.handlePhrase && normalizedCandidate.includes(normalizeComparableText(signals.handlePhrase))) {
      score += 5;
    }

    if (normalizeComparableText(candidate) === normalizeComparableText(sourceTitle)) {
      score += 4;
    }

    if (GENERIC_TITLE_PHRASES.some((pattern) => pattern.test(normalizedCandidate))) {
      score -= 12;
    }

    if (score > bestScore || (score === bestScore && normalizedCandidate.length < bestCandidate.length)) {
      bestScore = score;
      bestCandidate = normalizedCandidate;
    }
  }

  return {
    candidate: bestCandidate ? titleCase(bestCandidate) : "",
    score: bestScore,
  };
}

function buildSearchPhrases(signals) {
  const sources = [
    [...signals.handleTokens],
    [...signals.sourceTitleTokens],
    [...signals.catalogTitleTokens],
    [...signals.productTypeTokens],
    [...signals.tagTokens],
    [...signals.collectionTokens],
    [...(signals.catalogSearchBoosts || [])],
  ];

  const phrases = [];
  for (const tokens of sources) {
    phrases.push(...buildPhraseCandidates(tokens, { maxLength: 3 }));
  }

  return uniqueValues(
    phrases
      .map((phrase) => normalizePlainText(phrase).toLowerCase())
      .filter((phrase) => phrase && phrase.length >= 3)
      .filter((phrase) => !GENERIC_TITLE_PHRASES.some((pattern) => pattern.test(phrase)))
      .sort((left, right) => scorePhraseCandidate(right, signals) - scorePhraseCandidate(left, signals))
      .slice(0, 5),
  );
}

function buildSeoDescription(title, signals, searchPhrases) {
  const parts = [];
  const titleText = normalizePlainText(title);
  const typeText = normalizePlainText(signals.productTypeText);
  const collectionText = signals.collectionTitles.length
    ? signals.collectionTitles.slice(0, 2).join(" and ")
    : "";

  if (titleText) {
    parts.push(
      `${titleText}${typeText ? ` is presented as a ${typeText.toLowerCase()}` : " is presented as a product"} listing${collectionText ? ` with context from ${collectionText}` : ""}`,
    );
  }

  if (signals.reviewSummary) {
    parts.push(
      `${signals.reviewSummary.rating.toFixed(1)} stars from ${signals.reviewSummary.ratingCount} trusted reviews`,
    );
  }

  if (searchPhrases.length) {
    parts.push(`Search phrases: ${searchPhrases.slice(0, 4).join(", ")}`);
  }

  const sentence = parts.join(". ");
  return shortenAtWordBoundary(sentence || titleText, 155);
}

function buildDescriptionHtml(title, signals, searchPhrases) {
  const titleText = normalizePlainText(title);
  const typeText = normalizePlainText(signals.productTypeText);
  const collectionText = signals.collectionTitles.length
    ? signals.collectionTitles.slice(0, 2).join(" and ")
    : "";

  const paragraphs = [];
  if (titleText) {
    paragraphs.push(
      `<p><strong>${escapeHtml(titleText)}</strong>${typeText ? ` is presented as a ${escapeHtml(typeText.toLowerCase())}` : " is presented as a product"} listing${collectionText ? ` with context from ${escapeHtml(collectionText)}` : ""}.</p>`,
    );
  }

  if (signals.reviewSummary) {
    paragraphs.push(
      `<p>Customer review data shows a ${escapeHtml(signals.reviewSummary.rating.toFixed(1))}-star average from ${escapeHtml(String(signals.reviewSummary.ratingCount))} trusted reviews.</p>`,
    );
  }

  if (searchPhrases.length) {
    paragraphs.push(`<p>Search phrases: ${searchPhrases.map((phrase) => escapeHtml(phrase)).join(", ")}.</p>`);
  }

  if (!paragraphs.length) {
    return "";
  }

  return paragraphs.join("\n");
}

function shortenAtWordBoundary(value, maxLength) {
  const text = normalizePlainText(value);
  if (text.length <= maxLength) {
    return text;
  }

  const truncated = text.slice(0, maxLength).trim();
  const lastSpace = truncated.lastIndexOf(" ");
  const cut = lastSpace > 18 ? truncated.slice(0, lastSpace).trim() : truncated;
  return cut.replace(/[,-]+$/g, "");
}

function roundPsychologicalPrice(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }

  if (value < 10) {
    return (Math.max(0.99, Math.round(value * 100) / 100)).toFixed(2);
  }

  if (value < 25) {
    return (Math.floor(value) + 0.99).toFixed(2);
  }

  if (value < 100) {
    return (Math.floor(value / 5) * 5 + 4.99).toFixed(2);
  }

  return (Math.floor(value / 10) * 10 + 9.99).toFixed(2);
}

function getAnchorPriceFromCatalog(catalogProduct) {
  const variants = Array.isArray(catalogProduct?.variants) ? catalogProduct.variants : [];
  const prices = variants
    .map((variant) => parseMoneyValue(variant?.price))
    .filter((price) => Number.isFinite(price) && price > 0);

  if (prices.length) {
    return Math.min(...prices);
  }

  return null;
}

function getSourceExplicitPrice(rows) {
  const prices = [];
  for (const row of rows) {
    const price = parseMoneyValue(firstNonEmpty(
      getRowValue(row, ["Variant Price"]),
      getRowValue(row, ["Price / International"]),
    ));
    if (Number.isFinite(price) && price > 0) {
      prices.push(price);
    }
  }

  if (!prices.length) {
    return null;
  }

  return Math.min(...prices);
}

function suggestRetailPriceFromSignals({
  cost,
  anchorPrice,
  currentPrice,
  confidence,
}) {
  const numericCost = parseMoneyValue(cost);
  const numericAnchor = Number.isFinite(anchorPrice) && anchorPrice > 0 ? anchorPrice : null;
  const numericCurrent = Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : null;
  const canRaise = Number.isFinite(confidence) && confidence >= 45;

  if (!canRaise) {
    return "";
  }

  const campaignCost = 7;
  let derivedFromCost = null;
  if (Number.isFinite(numericCost) && numericCost > 0) {
    const multiplier = numericCost < 5 ? 4.2 : numericCost < 15 ? 3.25 : numericCost < 30 ? 2.75 : numericCost < 50 ? 2.35 : 1.95;
    derivedFromCost = Math.max(numericCost + campaignCost, numericCost * multiplier);
  }

  const derivedFromAnchor = numericAnchor
    ? numericAnchor * 1.35
    : numericCurrent
      ? numericCurrent * 1.35
      : null;

  let target = derivedFromCost ?? derivedFromAnchor ?? null;
  if (derivedFromCost && derivedFromAnchor) {
    target = Math.max(derivedFromCost, derivedFromAnchor);
  }

  if (!Number.isFinite(target) || target <= 0) {
    return "";
  }

  const reference = numericAnchor || numericCurrent;
  if (reference && target < reference * 1.15) {
    target = reference * 1.15;
  }
  if (reference && target > reference * 1.85) {
    target = reference * 1.85;
  }

  return roundPsychologicalPrice(target);
}

function isEarringProductRow(row) {
  const values = [
    getRowValue(row, ["Handle"]),
    getRowValue(row, ["Title"]),
    getRowValue(row, ["Type", "Product Type"]),
    getRowValue(row, ["Product Category", "Google Shopping / Google Product Category"]),
    getRowValue(row, ["Tags"]),
  ];

  return values.some((value) => /earring/i.test(normalizePlainText(value)));
}

function enforceCompareAtValue(compareAtValue, price, row) {
  const existing = parseMoneyValue(compareAtValue);
  const sellPrice = parseMoneyValue(price);

  if (isEarringProductRow(row)) {
    const minimum = Number.isFinite(sellPrice) && sellPrice > 0 ? Math.max(28.99, sellPrice + 0.01) : 28.99;
    if (!Number.isFinite(existing)) {
      return minimum.toFixed(2);
    }

    return Math.max(existing, minimum).toFixed(2);
  }

  if (!Number.isFinite(existing)) {
    return "";
  }

  if (Number.isFinite(sellPrice) && existing <= sellPrice) {
    return (sellPrice + 0.01).toFixed(2);
  }

  return existing.toFixed(2);
}

function normalizeCatalogProducts(input) {
  const payload = Array.isArray(input?.products)
    ? input.products
    : Array.isArray(input)
      ? input
      : [];

  return payload
    .map((product) => {
      const handle = normalizeHandleValue(product?.handle || "");
      if (!handle) {
        return null;
      }

      return {
        ...product,
        handle,
        title: normalizePlainText(product?.title || ""),
        body_html: normalizeHtmlValue(product?.body_html || product?.bodyHtml || ""),
        product_type: normalizePlainText(product?.product_type || product?.productType || ""),
        tags: Array.isArray(product?.tags)
          ? uniqueValues(product.tags.map((tag) => normalizePlainText(tag)).filter(Boolean))
          : splitTags(product?.tags),
      };
    })
    .filter(Boolean);
}

function normalizeCatalogCollections(input) {
  const payload = Array.isArray(input?.collections)
    ? input.collections
    : Array.isArray(input)
      ? input
      : [];

  return payload
    .map((collection) => {
      const handle = normalizeHandleValue(collection?.handle || "");
      if (!handle) {
        return null;
      }

      return {
        ...collection,
        handle,
        title: normalizePlainText(collection?.title || ""),
        products_count: Number(collection?.products_count || collection?.productsCount || 0) || 0,
      };
    })
    .filter(Boolean);
}

function normalizeCollectionProductsPayload(input) {
  const payload = input?.collections && typeof input.collections === "object" ? input.collections : {};
  const result = {};

  for (const [handle, value] of Object.entries(payload)) {
    const normalizedHandle = normalizeHandleValue(handle);
    if (!normalizedHandle) {
      continue;
    }

    const productIds = Array.isArray(value?.productIds)
      ? value.productIds
          .map((entry) => Number(entry))
          .filter((entry) => Number.isFinite(entry) && entry > 0)
      : [];

    result[normalizedHandle] = {
      ...value,
      title: normalizePlainText(value?.title || ""),
      productIds,
    };
  }

  return result;
}

export function createSeoCatalogContext({
  products = [],
  collections = [],
  collectionProducts = {},
} = {}) {
  const productList = normalizeCatalogProducts(products);
  const collectionList = normalizeCatalogCollections(collections);
  const collectionMap = new Map();
  const productsByHandle = new Map();
  const productsById = new Map();
  const productCollectionTitlesById = new Map();
  const productCollectionHandlesById = new Map();
  const collectionProductsMap = normalizeCollectionProductsPayload(collectionProducts);

  for (const product of productList) {
    const productId = Number(product?.id || 0);
    if (productId > 0) {
      productsById.set(productId, product);
    }
    productsByHandle.set(product.handle, product);
  }

  for (const collection of collectionList) {
    const productIds = Array.isArray(collectionProductsMap[collection.handle]?.productIds)
      ? collectionProductsMap[collection.handle].productIds
      : [];
    const entry = {
      ...collection,
      productIds,
    };

    collectionMap.set(collection.handle, entry);

    for (const productId of productIds) {
      if (!productCollectionTitlesById.has(productId)) {
        productCollectionTitlesById.set(productId, []);
      }
      if (!productCollectionHandlesById.has(productId)) {
        productCollectionHandlesById.set(productId, []);
      }

      productCollectionTitlesById.get(productId).push(collection.title);
      productCollectionHandlesById.get(productId).push(collection.handle);
    }
  }

  for (const [productId, titles] of productCollectionTitlesById.entries()) {
    productCollectionTitlesById.set(productId, uniqueValues(titles));
  }

  for (const [productId, handles] of productCollectionHandlesById.entries()) {
    productCollectionHandlesById.set(productId, uniqueValues(handles));
  }

  return {
    products: productList,
    collections: collectionList,
    collectionMap,
    productsByHandle,
    productsById,
    collectionProducts: collectionProductsMap,
    productCollectionTitlesById,
    productCollectionHandlesById,
  };
}

function buildSignalsFromGroup(rows, handle, catalogContext) {
  const sourceTitle = normalizePlainText(firstNonEmpty(...rows.map((row) => getRowValue(row, ["Title"]))));
  const sourceBodyHtml = normalizeHtmlValue(firstNonEmpty(...rows.map((row) => getRowValue(row, ["Body (HTML)"]))));
  const sourceProductType = normalizePlainText(firstNonEmpty(...rows.map((row) => getRowValue(row, ["Type", "Product Type"]))));
  const sourceSeoTitle = normalizePlainText(firstNonEmpty(...rows.map((row) => getRowValue(row, ["SEO Title"]))));
  const sourceSeoDescription = normalizePlainText(firstNonEmpty(...rows.map((row) => getRowValue(row, ["SEO Description"]))));
  const sourceTags = uniqueValues(rows.flatMap((row) => splitTags(getRowValue(row, ["Tags"]))));
  const categoryQuery = normalizePlainText(
    firstNonEmpty(
      ...rows.map((row) =>
        firstNonEmpty(
          getRowValue(row, ["Google Shopping / Google Product Category"]),
          getRowValue(row, ["Google Shopping Category"]),
          getRowValue(row, ["Product Category"]),
        ),
      ),
    ),
  );
  const rowProductId = firstNonEmpty(...rows.map((row) => getRowValue(row, ["Product ID", "ID"])));
  const numericProductId = Number(normalizePlainText(rowProductId).match(/\d+/)?.[0] || 0) || 0;
  const catalogProduct = normalizeHandleValue(handle)
    ? catalogContext.productsByHandle.get(normalizeHandleValue(handle)) || null
    : null;
  const catalogProductType = normalizePlainText(catalogProduct?.product_type || "");
  const catalogTitle = normalizePlainText(catalogProduct?.title || "");
  const catalogBodyHtml = normalizeHtmlValue(catalogProduct?.body_html || "");
  const catalogTags = uniqueValues(
    Array.isArray(catalogProduct?.tags) ? catalogProduct.tags.map((tag) => normalizePlainText(tag)).filter(Boolean) : [],
  );
  const catalogSubtitle = normalizePlainText(catalogProduct?.customData?.subtitle || "");
  const catalogHighlights = uniqueValues(
    Array.isArray(catalogProduct?.customData?.highlights)
      ? catalogProduct.customData.highlights.map((entry) => normalizePlainText(entry)).filter(Boolean)
      : [],
  );
  const catalogSearchBoosts = uniqueValues(
    Array.isArray(catalogProduct?.customData?.searchProductBoosts)
      ? catalogProduct.customData.searchProductBoosts.map((entry) => normalizePlainText(entry)).filter(Boolean)
      : [],
  );
  const catalogReviewRating = parseMoneyValue(
    firstNonEmpty(catalogProduct?.customData?.rating, catalogProduct?.average_rating, catalogProduct?.rating),
  );
  const catalogReviewCount = parseMoneyValue(
    firstNonEmpty(catalogProduct?.customData?.ratingCount, catalogProduct?.total_reviews, catalogProduct?.reviewCount),
  );
  const sourceReviewRating = parseMoneyValue(
    firstNonEmpty(...rows.map((row) => getRowValue(row, ["Product rating", "Rating", "reviews.rating"]))),
  );
  const sourceReviewCount = parseMoneyValue(
    firstNonEmpty(...rows.map((row) => getRowValue(row, ["Product rating count", "Rating count", "reviews.rating_count"]))),
  );
  const reviewSummary =
    Number.isFinite(catalogReviewRating) &&
    catalogReviewRating > 0 &&
    Number.isFinite(catalogReviewCount) &&
    catalogReviewCount > 0
      ? {
          rating: catalogReviewRating,
          ratingCount: catalogReviewCount,
          source: "catalog",
        }
      : Number.isFinite(sourceReviewRating) &&
          sourceReviewRating > 0 &&
          Number.isFinite(sourceReviewCount) &&
          sourceReviewCount > 0
        ? {
            rating: sourceReviewRating,
            ratingCount: sourceReviewCount,
            source: "sheet",
          }
        : null;
  const anchorPrice = getAnchorPriceFromCatalog(catalogProduct);
  const effectiveProductId = numericProductId || Number(catalogProduct?.id || 0) || 0;
  const collectionTitles = effectiveProductId
    ? catalogContext.productCollectionTitlesById.get(effectiveProductId) || []
    : [];
  const collectionHandles = effectiveProductId
    ? catalogContext.productCollectionHandlesById.get(effectiveProductId) || []
    : [];
  const collectionSignal = normalizePlainText(
    firstNonEmpty(
      catalogProduct?.customData?.collectionSignal,
      collectionTitles.join(", "),
      categoryQuery,
    ),
  );

  const handleTokens = buildTokenSet(handle);
  const sourceTitleTokens = buildTokenSet(sourceTitle);
  const catalogTitleTokens = buildTokenSet(catalogTitle);
  const productTypeTokens = buildTokenSet(sourceProductType, catalogProductType);
  const tagTokens = buildTokenSet(...sourceTags, ...catalogTags);
  const collectionTokens = buildTokenSet(...collectionTitles, collectionSignal);
  const bodyTokens = buildTokenSet(
    stripHtml(sourceBodyHtml),
    stripHtml(catalogBodyHtml),
    catalogSubtitle,
    ...catalogHighlights,
    ...catalogSearchBoosts,
  );
  const handlePhrase = selectHandleFamilyPhrase({
    handleTokens,
    sourceTitleTokens,
    catalogTitleTokens,
    productTypeTokens,
    tagTokens,
    collectionTokens,
    bodyTokens,
  });

  return {
    handle: normalizeHandleValue(handle),
    rowCount: rows.length,
    sourceRows: rows,
    sourceTitle,
    sourceBodyHtml,
    sourceProductType,
    sourceSeoTitle,
    sourceSeoDescription,
    sourceTags,
    categoryQuery,
    rowProductId: numericProductId || null,
    catalogProduct,
    catalogTitle,
    catalogBodyHtml,
    catalogProductType,
    catalogTags,
    catalogSubtitle,
    catalogHighlights,
    catalogSearchBoosts,
    reviewSummary,
    anchorPrice,
    collectionTitles,
    collectionHandles,
    collectionSignal,
    handleTokens,
    sourceTitleTokens,
    catalogTitleTokens,
    productTypeTokens,
    tagTokens,
    collectionTokens,
    bodyTokens,
    handlePhrase,
  };
}

function computeConfidence(signals) {
  const handleTokenCount = signals.handleTokens.size;
  const sourceOverlap =
    countOverlap(signals.handleTokens, signals.sourceTitleTokens) +
    countOverlap(signals.handleTokens, signals.productTypeTokens) +
    countOverlap(signals.handleTokens, signals.tagTokens) +
    countOverlap(signals.handleTokens, signals.collectionTokens) +
    countOverlap(signals.handleTokens, signals.bodyTokens);
  const catalogOverlap =
    countOverlap(signals.handleTokens, signals.catalogTitleTokens) +
    (signals.catalogProduct ? 6 : 0) +
    (signals.collectionTitles.length ? 5 : 0) +
    (signals.collectionSignal ? 3 : 0);
  const sourceQuality =
    (signals.sourceTitle ? 6 : 0) +
    (signals.sourceBodyHtml ? 3 : 0) +
    (signals.sourceProductType ? 4 : 0) +
    (signals.sourceTags.length ? 4 : 0) +
    (signals.reviewSummary ? 4 : 0);

  const genericPenalty = [
    signals.sourceTitle,
    signals.catalogTitle,
    signals.handlePhrase,
  ].reduce((score, value) => {
    const normalized = normalizeComparableText(value);
    if (!normalized) {
      return score - 2;
    }

    if (GENERIC_TITLE_PHRASES.some((pattern) => pattern.test(normalized))) {
      return score - 12;
    }

    const tokens = tokenizeText(normalized);
    const genericCount = tokens.filter((token) => GENERIC_TITLE_WORDS.has(token)).length;
    if (!tokens.length) {
      return score - 6;
    }

    const genericRatio = genericCount / tokens.length;
    if (genericRatio >= 0.65) {
      return score - 14;
    }

    if (genericRatio >= 0.45) {
      return score - 8;
    }

    return score;
  }, 0);

  const titlePreference = Math.max(
    scorePhraseCandidate(signals.handlePhrase || "", signals),
    selectBestTitleCandidate(
      uniqueValues([
        signals.sourceTitle,
        signals.catalogTitle,
        signals.handlePhrase,
        signals.handlePhrase && signals.sourceProductType ? `${signals.handlePhrase} - ${signals.sourceProductType}` : "",
        signals.handlePhrase && signals.catalogProductType ? `${signals.handlePhrase} - ${signals.catalogProductType}` : "",
        signals.sourceTitle && signals.sourceProductType ? `${signals.sourceTitle} - ${signals.sourceProductType}` : "",
        signals.catalogTitle && signals.catalogProductType ? `${signals.catalogTitle} - ${signals.catalogProductType}` : "",
      ]),
      signals,
      signals.sourceTitle,
    ).score,
  );

  const rawScore = 14 + handleTokenCount * 2 + sourceOverlap * 4 + catalogOverlap * 3 + sourceQuality + titlePreference + genericPenalty;

  return clamp(Math.round(rawScore), 0, 100);
}

function selectCanonicalTitle(signals) {
  const candidates = uniqueValues([
    signals.sourceTitle,
    signals.catalogTitle,
    signals.handlePhrase,
    signals.handlePhrase && signals.sourceProductType ? `${signals.handlePhrase} - ${signals.sourceProductType}` : "",
    signals.handlePhrase && signals.catalogProductType ? `${signals.handlePhrase} - ${signals.catalogProductType}` : "",
    signals.sourceTitle && signals.sourceProductType ? `${signals.sourceTitle} - ${signals.sourceProductType}` : "",
    signals.catalogTitle && signals.catalogProductType ? `${signals.catalogTitle} - ${signals.catalogProductType}` : "",
  ]);

  return selectBestTitleCandidate(candidates, signals, signals.sourceTitle);
}

function buildCanonicalAltText(signals, canonicalTitle) {
  const titleText = normalizePlainText(canonicalTitle || signals.sourceTitle || signals.catalogTitle);
  if (!titleText) {
    return "";
  }

  const typeText = normalizePlainText(signals.productTypeText);
  if (typeText && !normalizeComparableText(titleText).includes(normalizeComparableText(typeText))) {
    return `${titleText} ${typeText.toLowerCase()}`.trim();
  }

  return titleText;
}

function buildProductProfile(signals) {
  const confidence = computeConfidence(signals);
  const rewriteLevel = confidence >= 70 ? "high" : confidence >= 45 ? "medium" : "low";
  const canonicalTitle = normalizePlainText(selectCanonicalTitle(signals).candidate || signals.sourceTitle || signals.catalogTitle);
  const searchPhrases = buildSearchPhrases(signals);
  const seoTitle = canonicalTitle ? shortenAtWordBoundary(canonicalTitle, 70) : "";
  const seoDescription = buildSeoDescription(canonicalTitle, signals, searchPhrases);
  const descriptionHtml = buildDescriptionHtml(canonicalTitle, signals, searchPhrases);
  const altText = buildCanonicalAltText(signals, canonicalTitle);

  const productType = normalizePlainText(firstNonEmpty(signals.sourceProductType, signals.catalogProductType));
  const tags = uniqueValues([
    ...signals.sourceTags,
    ...(signals.sourceTags.length ? [] : signals.catalogTags),
  ]);

  const reasons = [];
  if (signals.handlePhrase) {
    reasons.push(`handle:${signals.handlePhrase}`);
  }
  if (signals.catalogProduct) {
    reasons.push("catalog-anchor");
  }
  if (signals.reviewSummary) {
    reasons.push(`reviews:${signals.reviewSummary.rating.toFixed(1)}/${signals.reviewSummary.ratingCount}`);
  }
  if (signals.collectionTitles.length) {
    reasons.push(`collections:${signals.collectionTitles.slice(0, 2).join(" / ")}`);
  }
  if (searchPhrases.length) {
    reasons.push(`search:${searchPhrases.slice(0, 3).join(", ")}`);
  }

  const changedFields = [];
  const skippedFields = [];

  const productInput = {
    title: "",
    descriptionHtml: "",
    productType,
    tags,
    seo: {
      title: "",
      description: "",
    },
  };

  if (rewriteLevel === "high" && canonicalTitle) {
    if (normalizeComparableText(canonicalTitle) !== normalizeComparableText(signals.sourceTitle)) {
      productInput.title = canonicalTitle;
      changedFields.push("title");
    } else {
      skippedFields.push({ field: "title", reason: "already aligned" });
    }

    if (descriptionHtml && normalizeComparableText(stripHtml(descriptionHtml)) !== normalizeComparableText(stripHtml(signals.sourceBodyHtml))) {
      productInput.descriptionHtml = descriptionHtml;
      changedFields.push("body");
    } else {
      skippedFields.push({ field: "body", reason: "already aligned or empty" });
    }

    if (altText && normalizeComparableText(altText) !== normalizeComparableText(signals.sourceSeoTitle || signals.sourceTitle)) {
      changedFields.push("alt");
    } else {
      skippedFields.push({ field: "alt", reason: "already aligned" });
    }
  } else {
    skippedFields.push({ field: "title", reason: rewriteLevel === "high" ? "already aligned" : "confidence below high threshold" });
    skippedFields.push({ field: "body", reason: rewriteLevel === "high" ? "already aligned" : "confidence below high threshold" });
    skippedFields.push({ field: "alt", reason: "confidence below high threshold" });
  }

  if (rewriteLevel !== "low") {
    if (seoTitle && normalizeComparableText(seoTitle) !== normalizeComparableText(signals.sourceSeoTitle)) {
      productInput.seo.title = seoTitle;
      changedFields.push("seo-title");
    } else {
      skippedFields.push({ field: "seo-title", reason: "already aligned or empty" });
    }

    if (seoDescription && normalizeComparableText(seoDescription) !== normalizeComparableText(signals.sourceSeoDescription)) {
      productInput.seo.description = seoDescription;
      changedFields.push("seo-description");
    } else {
      skippedFields.push({ field: "seo-description", reason: "already aligned or empty" });
    }
  } else {
    skippedFields.push({ field: "seo-title", reason: "confidence below medium threshold" });
    skippedFields.push({ field: "seo-description", reason: "confidence below medium threshold" });
  }

  const price = suggestRetailPriceFromSignals({
    cost: signals.sourceCost,
    anchorPrice: signals.anchorPrice,
    currentPrice: signals.sourcePrice,
    confidence,
  });

  return {
    handle: signals.handle,
    confidence,
    rewriteLevel,
    canonicalTitle,
    canonicalDescriptionHtml: descriptionHtml,
    canonicalSeoTitle: seoTitle,
    canonicalSeoDescription: seoDescription,
    canonicalAltText: altText,
    productType,
    tags,
    reviewSummary: signals.reviewSummary || null,
    searchPhrases,
    reasons,
    changedFields,
    skippedFields,
    pricing: {
      sourceCost: formatMoneyValue(signals.sourceCost),
      anchorPrice: formatMoneyValue(signals.anchorPrice),
      sourcePrice: formatMoneyValue(signals.sourcePrice),
      price,
      compareAtPrice: "",
      rationale:
        price && signals.sourceCost
          ? `Cost ${formatMoneyValue(signals.sourceCost)} plus $7 campaign cost, with a 35%+ uplift guarded by the current catalog anchor`
          : price && signals.anchorPrice
            ? `Current catalog anchor lifted by 35% with psychological rounding`
            : price
              ? "Handle-first pricing heuristic"
              : "No reliable pricing signal",
    },
    productInput,
    mediaTargets: [],
  };
}

function buildVariantPlanFromRow(row, profile) {
  const variantId = toShopifyGid("ProductVariant", getRowValue(row, ["Variant ID", "ID"]));
  const sku = normalizePlainText(getRowValue(row, ["Variant SKU"]));
  const optionValues = [
    normalizePlainText(getRowValue(row, ["Option1 Value"])),
    normalizePlainText(getRowValue(row, ["Option2 Value"])),
    normalizePlainText(getRowValue(row, ["Option3 Value"])),
  ].filter(Boolean);
  const variantTitle = normalizePlainText(getRowValue(row, ["Variant Title"]));
  const label =
    optionValues.join(" / ") ||
    variantTitle ||
    sku ||
    normalizePlainText(getRowValue(row, ["Title"]));
  const hasVariantIdentity = Boolean(variantId || sku || optionValues.length || variantTitle);
  const explicitPrice = parseMoneyValue(firstNonEmpty(getRowValue(row, ["Variant Price"]), getRowValue(row, ["Price / International"])));
  const explicitCompareAt = parseMoneyValue(
    firstNonEmpty(getRowValue(row, ["Variant Compare At Price"]), getRowValue(row, ["Compare At Price / International"])),
  );
  const sourceCost = parseMoneyValue(getRowValue(row, ["Cost per item"]));
  const price = suggestRetailPriceFromSignals({
    cost: sourceCost,
    anchorPrice: profile?.pricing?.anchorPrice ? parseMoneyValue(profile.pricing.anchorPrice) : null,
    currentPrice: explicitPrice,
    confidence: profile?.confidence ?? 0,
  });

  if (!hasVariantIdentity || !price) {
    return null;
  }

  const compareAtPrice =
    explicitCompareAt != null
      ? enforceCompareAtValue(explicitCompareAt, price, row)
      : "";
  const normalizedExplicitPrice = formatMoneyValue(explicitPrice);
  const normalizedPrice = formatMoneyValue(price);
  const normalizedCompareAt = formatMoneyValue(compareAtPrice);

  if (normalizedPrice && normalizedPrice === normalizedExplicitPrice && (!normalizedCompareAt || normalizedCompareAt === formatMoneyValue(explicitCompareAt))) {
    return null;
  }

  return {
    variantId,
    sku,
    label,
    optionValues,
    price: normalizedPrice,
    compareAtPrice: normalizedCompareAt,
    sourceCost: formatMoneyValue(sourceCost),
  };
}

function buildMediaPlanFromRow(row, profile) {
  if ((profile?.rewriteLevel || "low") !== "high") {
    return null;
  }

  const imageSrc = normalizeUrlForMatch(getRowValue(row, ["Image Src"]));
  if (!imageSrc) {
    return null;
  }

  const alt = normalizePlainText(profile?.canonicalAltText || getRowValue(row, ["Image Alt Text"]));
  if (!alt) {
    return null;
  }

  const existingAlt = normalizePlainText(getRowValue(row, ["Image Alt Text"]));
  if (existingAlt && normalizeComparableText(existingAlt) === normalizeComparableText(alt)) {
    return null;
  }

  return {
    imageSrc,
    alt,
  };
}

function dedupeByKey(values, keyFn) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const key = keyFn(value);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);
  }

  return result;
}

function resolveCategoryQueryFromRows(rows) {
  return normalizePlainText(
    firstNonEmpty(
      ...rows.map((row) =>
        firstNonEmpty(
          getRowValue(row, ["Google Shopping / Google Product Category"]),
          getRowValue(row, ["Google Shopping Category"]),
          getRowValue(row, ["Product Category"]),
        ),
      ),
    ),
  );
}

async function resolveCategoryIdWithHandler(categoryQuery, resolveCategoryId, cache) {
  const raw = normalizePlainText(categoryQuery);
  const normalized = raw.toLowerCase();
  if (!normalized) {
    return null;
  }

  if (/^gid:\/\/shopify\/[a-z0-9_]+\/\d+$/i.test(normalized)) {
    return raw;
  }

  if (cache.has(normalized)) {
    return cache.get(normalized);
  }

  const resolved = await resolveCategoryId(raw);
  cache.set(normalized, resolved || null);
  return resolved || null;
}

function summarizeProductPlan(productPlan) {
  const changedFields = [
    productPlan.productInput?.title ? "title" : "",
    productPlan.productInput?.descriptionHtml ? "body" : "",
    productPlan.productInput?.seo?.title ? "seo-title" : "",
    productPlan.productInput?.seo?.description ? "seo-description" : "",
    productPlan.categoryId ? "category" : "",
    productPlan.mediaTargets?.length ? "image-alt" : "",
    productPlan.variantUpdates?.length ? "price" : "",
  ].filter(Boolean);

  return {
    handle: productPlan.handle,
    confidence: productPlan.confidence,
    rewriteLevel: productPlan.rewriteLevel,
    rowCount: productPlan.rowCount,
    changedFields,
    skippedFields: productPlan.intelligence?.skippedFields || [],
    changeReasons: productPlan.intelligence?.reasons || [],
    pricing: productPlan.intelligence?.pricing || null,
    writeCount: changedFields.length + (productPlan.variantUpdates?.length || 0) + (productPlan.mediaTargets?.length || 0),
  };
}

export async function buildSeoBatchPlan(
  rows,
  {
    resolveCategoryId,
    suppressCategoryWarnings = false,
    catalogContext: inputCatalogContext,
    products,
    collections,
    collectionProducts,
  } = {},
) {
  const warnings = [];
  const resolveCategory =
    typeof resolveCategoryId === "function"
      ? resolveCategoryId
      : async () => null;
  const catalogContext =
    inputCatalogContext ||
    createSeoCatalogContext({
      products,
      collections,
      collectionProducts,
    });

  const groups = new Map();
  rows.forEach((row, index) => {
    const handle = normalizeHandleValue(getRowValue(row, ["Handle"]));
    if (!handle) {
      warnings.push(`Row ${index + 1} is missing a handle and was skipped.`);
      return;
    }

    if (!groups.has(handle)) {
      groups.set(handle, {
        handle,
        rows: [],
        firstRowIndex: index,
      });
    }

    const group = groups.get(handle);
    group.rows.push({ row, index });
    group.firstRowIndex = Math.min(group.firstRowIndex, index);
  });

  const categoryCache = new Map();
  const productsOut = [];

  for (const group of groups.values()) {
    const signals = buildSignalsFromGroup(
      group.rows.map((entry) => entry.row),
      group.handle,
      catalogContext,
    );
    signals.productTypeText = signals.sourceProductType || signals.catalogProductType;
    signals.sourcePrice = getSourceExplicitPrice(group.rows.map((entry) => entry.row));
    const profile = buildProductProfile(signals);
    const rowProductId = signals.rowProductId || signals.catalogProduct?.id || null;
    const productId = toShopifyGid("Product", rowProductId);
    const productInput = {
      id: productId,
    };

    if (profile.productType) {
      productInput.productType = profile.productType;
    }

    if (profile.tags.length) {
      productInput.tags = profile.tags;
    }

    if (profile.productInput.title) {
      productInput.title = profile.productInput.title;
    }

    if (profile.productInput.descriptionHtml) {
      productInput.descriptionHtml = profile.productInput.descriptionHtml;
    }

    if (profile.productInput.seo?.title || profile.productInput.seo?.description) {
      productInput.seo = {
        title: profile.productInput.seo.title || "",
        description: profile.productInput.seo.description || "",
      };
    }

    if (signals.categoryQuery) {
      const resolvedCategoryId = await resolveCategoryIdWithHandler(signals.categoryQuery, resolveCategory, categoryCache);
      if (resolvedCategoryId) {
        productInput.category = resolvedCategoryId;
      } else if (!suppressCategoryWarnings) {
        warnings.push(`Could not resolve category "${signals.categoryQuery}" for ${group.handle}.`);
      }
    }

    const variantUpdates = dedupeByKey(
      group.rows
        .map((entry) => buildVariantPlanFromRow(entry.row, profile))
        .filter(Boolean),
      (entry) => [
        entry.variantId || "",
        entry.sku || "",
        entry.label || "",
        entry.price || "",
        entry.compareAtPrice || "",
      ].join("|"),
    );

    const mediaTargets = dedupeByKey(
      group.rows
        .map((entry) => buildMediaPlanFromRow(entry.row, profile))
        .filter(Boolean),
      (entry) => entry.imageSrc,
    );

    const writeCount =
      (profile.productInput.title ? 1 : 0) +
      (profile.productInput.descriptionHtml ? 1 : 0) +
      (profile.productInput.seo?.title ? 1 : 0) +
      (profile.productInput.seo?.description ? 1 : 0) +
      (productInput.category ? 1 : 0) +
      variantUpdates.length +
      mediaTargets.length;

    productsOut.push({
      handle: group.handle,
      productId,
      rowCount: group.rows.length,
      firstRowIndex: group.firstRowIndex,
      confidence: profile.confidence,
      rewriteLevel: profile.rewriteLevel,
      productInput,
      variantUpdates,
      mediaTargets,
      categoryQuery: signals.categoryQuery,
      categoryId: productInput.category || "",
      intelligence: profile,
      reasons: profile.reasons,
      skipped: profile.skippedFields,
      writeCount,
    });
  }

  const summary = {
    sourceRows: rows.length,
    handleGroups: productsOut.length,
    highConfidence: productsOut.filter((entry) => entry.rewriteLevel === "high").length,
    mediumConfidence: productsOut.filter((entry) => entry.rewriteLevel === "medium").length,
    lowConfidence: productsOut.filter((entry) => entry.rewriteLevel === "low").length,
    totalProductWrites: productsOut.reduce(
      (count, entry) =>
        count +
        (entry.productInput?.title ? 1 : 0) +
        (entry.productInput?.descriptionHtml ? 1 : 0) +
        (entry.productInput?.seo?.title ? 1 : 0) +
        (entry.productInput?.seo?.description ? 1 : 0) +
        (entry.categoryId ? 1 : 0),
      0,
    ),
    totalVariantWrites: productsOut.reduce((count, entry) => count + entry.variantUpdates.length, 0),
    totalMediaWrites: productsOut.reduce((count, entry) => count + entry.mediaTargets.length, 0),
    totalWrites: productsOut.reduce((count, entry) => count + entry.writeCount, 0),
  };

  return {
    products: productsOut,
    warnings,
    summary,
    catalogContext,
  };
}

function setPreferredField(row, candidates, value) {
  if (!value) {
    return;
  }

  for (const candidate of candidates) {
    if (Object.prototype.hasOwnProperty.call(row, candidate)) {
      row[candidate] = value;
      return;
    }
  }

  row[candidates[0]] = value;
}

function buildVariantRowUpdate(row, profile) {
  const variantPlan = buildVariantPlanFromRow(row, profile);
  if (!variantPlan) {
    return null;
  }

  return variantPlan;
}

export function buildSeoBatchExportRows(rows, plan) {
  const planByHandle = new Map((plan?.products || []).map((entry) => [entry.handle, entry]));
  const firstRowIndexByHandle = new Map();

  rows.forEach((row, index) => {
    const handle = normalizeHandleValue(getRowValue(row, ["Handle"]));
    if (!handle) {
      return;
    }

    if (!firstRowIndexByHandle.has(handle)) {
      firstRowIndexByHandle.set(handle, index);
    }
  });

  return rows.map((row, index) => {
    const handle = normalizeHandleValue(getRowValue(row, ["Handle"]));
    const productPlan = planByHandle.get(handle);
    if (!productPlan) {
      return { ...row };
    }

    const nextRow = { ...row };
    const profile = {
      ...productPlan.intelligence,
      sourcePrice: getSourceExplicitPrice([row]),
    };
    const isPrimaryRow = firstRowIndexByHandle.get(handle) === index;

    if (isPrimaryRow && productPlan.rewriteLevel === "high") {
      setPreferredField(nextRow, ["Title"], productPlan.productInput?.title || "");
      setPreferredField(nextRow, ["Body (HTML)"], productPlan.productInput?.descriptionHtml || "");
      setPreferredField(nextRow, ["SEO Title"], productPlan.productInput?.seo?.title || "");
      setPreferredField(nextRow, ["SEO Description"], productPlan.productInput?.seo?.description || "");
    } else if (isPrimaryRow && productPlan.rewriteLevel === "medium") {
      setPreferredField(nextRow, ["SEO Title"], productPlan.productInput?.seo?.title || "");
      setPreferredField(nextRow, ["SEO Description"], productPlan.productInput?.seo?.description || "");
    }

    if (productPlan.productInput?.productType) {
      setPreferredField(nextRow, ["Type", "Product Type"], productPlan.productInput.productType);
    }

    if (Array.isArray(productPlan.productInput?.tags) && productPlan.productInput.tags.length) {
      setPreferredField(nextRow, ["Tags"], productPlan.productInput.tags.join(", "));
    }

    if (productPlan.rewriteLevel === "high") {
      const mediaUpdate = buildMediaPlanFromRow(row, profile);
      if (mediaUpdate) {
        setPreferredField(nextRow, ["Image Alt Text"], mediaUpdate.alt);
      }
    }

    const variantUpdate = buildVariantRowUpdate(row, profile);
    if (variantUpdate) {
      setPreferredField(nextRow, ["Variant Price", "Price / International"], variantUpdate.price);
      if (variantUpdate.compareAtPrice) {
        setPreferredField(
          nextRow,
          ["Variant Compare At Price", "Compare At Price / International"],
          variantUpdate.compareAtPrice,
        );
      }
    }

    return nextRow;
  });
}

export function buildSeoBatchManifest(plan, { inputPath = "", mode = "dry-run" } = {}) {
  return {
    title: "Handle-First Shopify Product Intelligence",
    generatedAt: new Date().toISOString(),
    mode,
    inputPath,
    summary: plan?.summary || {},
    warnings: plan?.warnings || [],
    products: (plan?.products || []).map((entry) => ({
      handle: entry.handle,
      rowCount: entry.rowCount,
      confidence: entry.confidence,
      rewriteLevel: entry.rewriteLevel,
      firstRowIndex: entry.firstRowIndex,
      productId: entry.productId,
      categoryQuery: entry.categoryQuery || "",
      categoryId: entry.categoryId || "",
      changedFields: [
        entry.productInput?.title ? "title" : "",
        entry.productInput?.descriptionHtml ? "body" : "",
        entry.productInput?.seo?.title ? "seo-title" : "",
        entry.productInput?.seo?.description ? "seo-description" : "",
        entry.categoryId ? "category" : "",
        entry.variantUpdates?.length ? "price" : "",
        entry.mediaTargets?.length ? "image-alt" : "",
      ].filter(Boolean),
      skippedFields: entry.skipped || [],
      writeCount: entry.writeCount || 0,
      reasons: entry.reasons || [],
      pricing: entry.intelligence?.pricing || null,
      reviewSummary: entry.intelligence?.reviewSummary || null,
      seo: {
        title: entry.productInput?.seo?.title || "",
        description: entry.productInput?.seo?.description || "",
      },
    })),
  };
}

export { buildLegacyMediaUpdateTargets as buildMediaUpdateTargets };
