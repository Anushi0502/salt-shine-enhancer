import { compareAt, minPrice, savingsPercent, productImage, stripHtml } from "@/lib/formatters";
import { buildCanonicalUrl } from "@/lib/canonical-url";
import { getMinimumProductQuantity } from "@/lib/minimum-quantity-rules";
import type {
  CollectionProductsPayload,
  ShopifyCollection,
  ShopifyProduct,
  ShopifyShop,
} from "@/types/shopify";

type MerchandisingContext = {
  query?: string | null;
  focusTerms?: string[];
};

type RelationshipContext = {
  collectionIndex?: Map<number, Set<string>>;
  excludedIds?: Iterable<number>;
  limit?: number;
};

type RatingSummaryLike = {
  rating?: number | null;
  reviewCount?: number | null;
};

type StructuredData = Record<string, unknown>;

function asText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value == null) {
    return "";
  }

  return String(value);
}

function normalizeText(value: unknown): string {
  return asText(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildProductStructuredDataSku(product: ShopifyProduct): string {
  const productId = asText(product.id).replace(/[^a-z0-9]/gi, "");
  if (productId) {
    return `salt-${productId}`.slice(0, 70);
  }

  const fallbackHandle = asText(product.handle)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 60);
  return fallbackHandle ? `salt-${fallbackHandle}` : "salt-product";
}

function tokenize(value: unknown): string[] {
  return normalizeText(value)
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function logBoost(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.round(Math.log10(value + 1) * 22);
}

function getProductRating(product: ShopifyProduct): number {
  const customRating = Number(product.customData?.rating ?? 0);
  const fallbackRating = Number(product.average_rating ?? 0);

  if (Number.isFinite(customRating) && customRating > 0) {
    return clamp(customRating, 0, 5);
  }

  if (Number.isFinite(fallbackRating) && fallbackRating > 0) {
    return clamp(fallbackRating, 0, 5);
  }

  return 0;
}

function getProductReviewCount(product: ShopifyProduct): number {
  const customCount = Number(product.customData?.ratingCount ?? 0);
  const fallbackCount = Number(product.total_reviews ?? 0);

  if (Number.isFinite(customCount) && customCount > 0) {
    return Math.floor(customCount);
  }

  if (Number.isFinite(fallbackCount) && fallbackCount > 0) {
    return Math.floor(fallbackCount);
  }

  return 0;
}

function shortenSeoText(value: string, maxLength = 160): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }

  const truncated = text.slice(0, maxLength + 1);
  const boundary = truncated.lastIndexOf(" ");
  const cutAt = boundary > Math.floor(maxLength * 0.65) ? boundary : maxLength;

  return truncated
    .slice(0, cutAt)
    .replace(/[\s,;:|/-]+$/g, "")
    .trim();
}

export function buildProductMetaDescription(
  product: ShopifyProduct,
  selectedVariant?: ShopifyProduct["variants"][number] | null,
  currencyCode = "USD",
): string {
  const title = asText(product.title).trim() || "SALT product";
  const variantLabel = selectedVariant && !/^default\s+title$/i.test(String(selectedVariant.title || ""))
    ? String(selectedVariant.title).trim()
    : "";
  const productType = asText(product.product_type).trim();
  const bodyText = stripHtml(product.body_html).replace(/\s+/g, " ").trim();
  const context = [productType, bodyText]
    .filter(Boolean)
    .join(". ")
    .replace(/[.!?]+$/g, "");
  const normalizedCurrency = /^[A-Z]{3}$/.test(currencyCode.trim().toUpperCase())
    ? currencyCode.trim().toUpperCase()
    : "USD";
  const price = selectedVariant ? Number(selectedVariant.price || 0) : minPrice(product);
  const priceText = Number.isFinite(price) && price > 0 ? ` Available for ${price.toFixed(2)} ${normalizedCurrency}.` : "";

  return shortenSeoText(
    `Shop ${title}${variantLabel ? ` in the ${variantLabel} option` : ""}${context ? `. ${context}` : ""}.${priceText}`,
  );
}

function getProductSearchCorpus(product: ShopifyProduct): string {
  const tags = Array.isArray(product.tags) ? product.tags.join(" ") : asText(product.tags);
  const highlights = Array.isArray(product.customData?.highlights) ? product.customData.highlights.join(" ") : "";
  const searchBoosts = Array.isArray(product.customData?.searchProductBoosts)
    ? product.customData.searchProductBoosts.join(" ")
    : "";

  return normalizeText(
    [
      product.title,
      product.vendor,
      product.product_type,
      tags,
      product.handle,
      product.customData?.subtitle,
      product.customData?.badgeText,
      product.customData?.collectionSignal,
      highlights,
      searchBoosts,
      stripHtml(product.body_html),
    ].join(" "),
  );
}

function getProductTokens(product: ShopifyProduct): Set<string> {
  return new Set(tokenize(getProductSearchCorpus(product)));
}

function getCollectionHandlesForProduct(
  product: ShopifyProduct,
  collectionIndex?: Map<number, Set<string>>,
): string[] {
  return Array.from(collectionIndex?.get(product.id) || []);
}

function getIntersectionSize(a: Iterable<string>, b: Iterable<string>): number {
  const left = new Set(Array.from(a));
  let count = 0;

  for (const value of b) {
    if (left.has(value)) {
      count += 1;
    }
  }

  return count;
}

function getProductFreshness(product: ShopifyProduct): number {
  const timestamp = new Date(product.published_at || product.created_at || product.updated_at || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getProductQualityScore(product: ShopifyProduct): number {
  const rating = getProductRating(product);
  const reviewCount = getProductReviewCount(product);
  const savings = savingsPercent(product);
  const hasImage = Boolean(productImage(product));
  const badge = Boolean(product.customData?.badgeText?.trim());
  const subtitle = Boolean(product.customData?.subtitle?.trim());
  const highlights = Array.isArray(product.customData?.highlights) ? product.customData.highlights.filter(Boolean).length : 0;
  const searchBoosts = Array.isArray(product.customData?.searchProductBoosts)
    ? product.customData.searchProductBoosts.filter(Boolean).length
    : 0;
  const collectionSignal = Boolean(product.customData?.collectionSignal?.trim());

  return (
    Math.round(rating * 16) +
    logBoost(reviewCount) +
    savings * 2 +
    (hasImage ? 6 : 0) +
    (badge ? 8 : 0) +
    (subtitle ? 4 : 0) +
    Math.min(highlights * 4, 12) +
    Math.min(searchBoosts * 3, 12) +
    (collectionSignal ? 6 : 0)
  );
}

function getShopChannelPriorityFloor(product: ShopifyProduct): number {
  const explicitFloor = Number(product.customData?.shopChannelMinimumQuantity ?? 0);
  if (Number.isFinite(explicitFloor) && explicitFloor > 0) {
    return Math.max(1, Math.floor(explicitFloor));
  }

  return getMinimumProductQuantity(product.handle, minPrice(product));
}

function scoreTermMatch(term: string, corpus: string): number {
  if (!term || !corpus) {
    return 0;
  }

  if (corpus.includes(term)) {
    return Math.max(18, term.length * 4);
  }

  const compactCorpus = corpus.replace(/\s+/g, "");
  const compactTerm = term.replace(/\s+/g, "");
  if (compactTerm.length > 3 && compactCorpus.includes(compactTerm)) {
    return Math.max(12, term.length * 3);
  }

  return 0;
}

export function scoreProductForMerchandising(
  product: ShopifyProduct,
  context: MerchandisingContext = {},
): number {
  const corpus = getProductSearchCorpus(product);
  const terms = uniqueStrings([
    ...tokenize(context.query),
    ...(context.focusTerms || []).flatMap((term) => tokenize(term)),
  ]);

  const termScore = terms.reduce((score, term) => score + scoreTermMatch(term, corpus), 0);
  const baseScore = getProductQualityScore(product);
  const price = minPrice(product);
  const compare = compareAt(product);
  const priceBandScore = price > 0 && price <= 25 ? 18 : price <= 50 ? 12 : price <= 100 ? 6 : 0;
  const discountScore = compare > price ? Math.min(savingsPercent(product) * 2, 120) : 0;
  const freshnessScore = Math.round(getProductFreshness(product) / 1_000_000_000);

  return baseScore + termScore + priceBandScore + discountScore + freshnessScore;
}

export function rankProductsForMerchandising(
  products: ShopifyProduct[],
  context: MerchandisingContext = {},
): ShopifyProduct[] {
  return [...products]
    .map((product) => ({
      product,
      score: scoreProductForMerchandising(product, context),
      freshness: getProductFreshness(product),
      price: minPrice(product) || Number.MAX_SAFE_INTEGER,
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const savingsDiff = savingsPercent(right.product) - savingsPercent(left.product);
      if (savingsDiff !== 0) {
        return savingsDiff;
      }

      const priceDiff = left.price - right.price;
      if (priceDiff !== 0) {
        return priceDiff;
      }

      return right.freshness - left.freshness;
    })
    .map((entry) => entry.product);
}

function scoreProductForShopChannel(
  product: ShopifyProduct,
  context: MerchandisingContext = {},
): number {
  const baseScore = scoreProductForMerchandising(product, context);
  const price = minPrice(product);
  const floor = getShopChannelPriorityFloor(product);
  const lowPriceBoost = price > 0 && price < 25 ? 42 : price <= 40 ? 14 : 0;
  const floorBoost = floor > 1 ? 18 + floor * 4 : 0;
  const collectionSignalBoost = product.customData?.collectionSignal?.trim() ? 6 : 0;

  return baseScore + lowPriceBoost + floorBoost + collectionSignalBoost;
}

export function rankProductsForShopChannel(
  products: ShopifyProduct[],
  context: MerchandisingContext = {},
): ShopifyProduct[] {
  return [...products]
    .map((product) => ({
      product,
      score: scoreProductForShopChannel(product, context),
      freshness: getProductFreshness(product),
      price: minPrice(product) || Number.MAX_SAFE_INTEGER,
      floor: getShopChannelPriorityFloor(product),
      priorityTier: (() => {
        const price = minPrice(product);
        return price > 0 && price < 25 ? 0 : price <= 50 ? 1 : 2;
      })(),
    }))
    .sort((left, right) => {
      if (left.priorityTier !== right.priorityTier) {
        return left.priorityTier - right.priorityTier;
      }

      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (right.floor !== left.floor) {
        return right.floor - left.floor;
      }

      const savingsDiff = savingsPercent(right.product) - savingsPercent(left.product);
      if (savingsDiff !== 0) {
        return savingsDiff;
      }

      const priceDiff = left.price - right.price;
      if (priceDiff !== 0) {
        return priceDiff;
      }

      return right.freshness - left.freshness;
    })
    .map((entry) => entry.product);
}

export function buildProductCollectionIndex(
  payload?: CollectionProductsPayload | null,
): Map<number, Set<string>> {
  const index = new Map<number, Set<string>>();
  const collections = payload?.collections || {};

  for (const [handle, entry] of Object.entries(collections)) {
    const normalizedHandle = normalizeText(handle);
    const productIds = Array.isArray(entry?.productIds) ? entry.productIds : [];

    for (const rawId of productIds) {
      const productId = Number(rawId);
      if (!Number.isFinite(productId) || productId <= 0) {
        continue;
      }

      const current = index.get(productId) || new Set<string>();
      if (normalizedHandle) {
        current.add(normalizedHandle);
      }
      index.set(productId, current);
    }
  }

  return index;
}

function scoreProductRelationship(
  sourceProduct: ShopifyProduct,
  candidate: ShopifyProduct,
  collectionIndex?: Map<number, Set<string>>,
): number {
  if (candidate.id === sourceProduct.id) {
    return Number.NEGATIVE_INFINITY;
  }

  const sourceTitleTokens = getProductTokens(sourceProduct);
  const candidateTitleTokens = getProductTokens(candidate);
  const sharedTitleTokens = getIntersectionSize(sourceTitleTokens, candidateTitleTokens);
  const sourceCollections = getCollectionHandlesForProduct(sourceProduct, collectionIndex);
  const candidateCollections = getCollectionHandlesForProduct(candidate, collectionIndex);
  const sharedCollections = getIntersectionSize(sourceCollections, candidateCollections);
  const sourceType = normalizeText(sourceProduct.product_type);
  const candidateType = normalizeText(candidate.product_type);
  const sourcePrice = minPrice(sourceProduct);
  const candidatePrice = minPrice(candidate);
  const priceDifference = Math.abs(sourcePrice - candidatePrice);
  const priceRatio = sourcePrice > 0 && candidatePrice > 0 ? Math.max(sourcePrice, candidatePrice) / Math.min(sourcePrice, candidatePrice) : 0;
  const qualityScore = getProductQualityScore(candidate);

  let score = qualityScore;
  score += sharedCollections * 36;
  score += Math.min(sharedTitleTokens * 8, 40);

  if (sourceType && candidateType && sourceType === candidateType) {
    score += 12;
  } else if (sourceType && candidateType) {
    score += 5;
  }

  if (sourcePrice > 0 && candidatePrice > 0) {
    if (priceDifference <= 15) {
      score += 22;
    } else if (priceDifference <= 35) {
      score += 14;
    } else if (priceDifference <= 75) {
      score += 8;
    }

    if (priceRatio > 0 && priceRatio <= 1.35) {
      score += 8;
    }
  }

  if (candidate.customData?.collectionSignal && sourceProduct.customData?.collectionSignal) {
    const sourceSignal = normalizeText(sourceProduct.customData.collectionSignal);
    const candidateSignal = normalizeText(candidate.customData.collectionSignal);
    if (sourceSignal && candidateSignal && sourceSignal === candidateSignal) {
      score += 18;
    }
  }

  return score;
}

function dedupeById(products: ShopifyProduct[]): ShopifyProduct[] {
  const seen = new Set<number>();
  return products.filter((product) => {
    if (seen.has(product.id)) {
      return false;
    }

    seen.add(product.id);
    return true;
  });
}

function buildRecommendedProducts(
  sourceProduct: ShopifyProduct,
  products: ShopifyProduct[],
  collectionIndex: Map<number, Set<string>> | undefined,
  mode: "related" | "complementary",
  limit = 5,
  blockedIds: Iterable<number> = [],
): ShopifyProduct[] {
  const blocked = new Set<number>([sourceProduct.id, ...blockedIds]);

  const ranked = products
    .filter((product) => !blocked.has(product.id))
    .map((candidate) => {
      const baseScore = scoreProductRelationship(sourceProduct, candidate, collectionIndex);
      if (!Number.isFinite(baseScore) || baseScore === Number.NEGATIVE_INFINITY) {
        return null;
      }

      const sourceType = normalizeText(sourceProduct.product_type);
      const candidateType = normalizeText(candidate.product_type);
      const sameType = sourceType && candidateType && sourceType === candidateType;

      const complementaryAdjustment =
        mode === "complementary"
          ? (sameType ? -18 : 10) +
            (savingsPercent(candidate) > 0 ? 6 : 0) +
            (minPrice(candidate) < minPrice(sourceProduct) ? 4 : 0)
          : 0;

      return {
        product: candidate,
        score: baseScore + complementaryAdjustment,
        freshness: getProductFreshness(candidate),
        price: minPrice(candidate) || Number.MAX_SAFE_INTEGER,
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        product: ShopifyProduct;
        score: number;
        freshness: number;
        price: number;
      } => Boolean(entry) && entry.score > 0,
    )
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const savingsDiff = savingsPercent(right.product) - savingsPercent(left.product);
      if (savingsDiff !== 0) {
        return savingsDiff;
      }

      const priceDiff = left.price - right.price;
      if (priceDiff !== 0) {
        return priceDiff;
      }

      return right.freshness - left.freshness;
    })
    .map((entry) => entry.product);

  return dedupeById(ranked).slice(0, limit);
}

export function pickRelatedProducts(
  sourceProduct: ShopifyProduct,
  products: ShopifyProduct[],
  options: RelationshipContext = {},
): ShopifyProduct[] {
  return buildRecommendedProducts(
    sourceProduct,
    products,
    options.collectionIndex,
    "related",
    options.limit ?? 5,
    options.excludedIds || [],
  );
}

export function pickComplementaryProducts(
  sourceProduct: ShopifyProduct,
  products: ShopifyProduct[],
  options: RelationshipContext = {},
): ShopifyProduct[] {
  return buildRecommendedProducts(
    sourceProduct,
    products,
    options.collectionIndex,
    "complementary",
    options.limit ?? 5,
    options.excludedIds || [],
  );
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildItemList(products: ShopifyProduct[], origin: string): StructuredData {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: products.slice(0, 10).map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${origin}/products/${product.handle}`,
      name: product.title,
    })),
  };
}

export function buildOrganizationStructuredData(shop: ShopifyShop | null | undefined, origin: string): StructuredData {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: shop?.name || "SALT",
    url: origin,
    sameAs: [
      "https://instagram.com/saltonlinestore",
      "https://www.facebook.com/profile.php?id=61573199456052",
      "https://youtube.com/@saltonlinestore",
    ],
  };
}

export function buildWebsiteStructuredData(shop: ShopifyShop | null | undefined, origin: string): StructuredData {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: shop?.name || "SALT",
    url: origin,
    potentialAction: {
      "@type": "SearchAction",
      target: `${origin}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function buildBreadcrumbStructuredData(
  items: Array<{ name: string; url: string }> | null | undefined,
): StructuredData | null {
  const cleanItems = (items || []).filter((item) => item?.name && item?.url);
  if (!cleanItems.length) {
    return null;
  }

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: cleanItems.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function buildProductStructuredData(
  product: ShopifyProduct,
  origin: string,
  ratingSummary?: RatingSummaryLike | null,
  currencyCode = "USD",
  selectedVariant?: ShopifyProduct["variants"][number] | null,
): StructuredData {
  const rating = ratingSummary?.rating ?? getProductRating(product);
  const reviewCount = ratingSummary?.reviewCount ?? getProductReviewCount(product);
  const availability = product.variants.some((variant) => variant.available) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
  const currentPrice = selectedVariant ? Number(selectedVariant.price || 0) : minPrice(product);
  const comparePrice = selectedVariant ? Number(selectedVariant.compare_at_price || 0) || compareAt(product) : compareAt(product);
  const image = selectedVariant?.featured_image?.src || productImage(product);
  const description = stripHtml(product.body_html).slice(0, 500);
  const variantLabel = selectedVariant && !/^default\s+title$/i.test(String(selectedVariant.title || ""))
    ? String(selectedVariant.title).trim()
    : "";
  const productName = variantLabel ? `${product.title} - ${variantLabel}` : product.title;
  const normalizedCurrency = /^[A-Z]{3}$/.test(currencyCode.trim().toUpperCase())
    ? currencyCode.trim().toUpperCase()
    : "USD";
  const canonicalProductUrl = buildCanonicalUrl(`/products/${product.handle}`);
  const imageUrl = image
    ? (() => {
        try {
          return new URL(image, origin || canonicalProductUrl).toString();
        } catch {
          return image;
        }
      })()
    : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${canonicalProductUrl}#product`,
    name: productName,
    description,
    image: imageUrl ? [imageUrl] : undefined,
    brand: {
      "@type": "Brand",
      name: product.vendor || "SALT",
    },
    // Supplier SKUs can contain `#`, `:`, and very long option strings that
    // fail Google's Merchant listing validation. A short Shopify product-ID
    // SKU is stable, ASCII-safe, and stays within Google's length limit.
    sku: buildProductStructuredDataSku(product),
    url: canonicalProductUrl,
    offers: {
      "@type": "Offer",
      priceCurrency: normalizedCurrency,
      price: asNumber(currentPrice),
      availability,
      url: canonicalProductUrl,
      itemCondition: "https://schema.org/NewCondition",
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: {
          "@type": "MonetaryAmount",
          value: 0,
          currency: normalizedCurrency,
        },
        shippingDestination: {
          "@type": "DefinedRegion",
          addressCountry: "US",
        },
      },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "US",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 30,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: "https://schema.org/FreeReturn",
      },
      ...(comparePrice > currentPrice
        ? {
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              priceCurrency: normalizedCurrency,
              price: asNumber(comparePrice),
            },
          }
        : {}),
    },
    ...(reviewCount > 0 && rating > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: Number(rating.toFixed(1)),
            reviewCount,
          },
        }
      : {}),
  };
}

export function buildCollectionStructuredData(
  collection: ShopifyCollection,
  origin: string,
  featuredProducts: ShopifyProduct[] = [],
): StructuredData[] {
  const description = stripHtml(collection.description).slice(0, 300);
  const itemList = buildItemList(featuredProducts, origin);

  return [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: collection.title,
      description,
      url: `${origin}/collections/${collection.handle}`,
    },
    itemList,
  ];
}

type CartItemLike = {
  handle?: string;
  title?: string;
  unitPrice?: number;
  quantity?: number;
  productType?: string;
};

export type CartRecommendationPlan = {
  focusProducts: ShopifyProduct[];
  relatedProducts: ShopifyProduct[];
  complementaryProducts: ShopifyProduct[];
};

function resolveCartProduct(
  item: CartItemLike,
  productsByHandle: Map<string, ShopifyProduct>,
  productsByTitle: Map<string, ShopifyProduct>,
): ShopifyProduct | null {
  const handle = normalizeText(item.handle || "");
  if (handle && productsByHandle.has(handle)) {
    return productsByHandle.get(handle) || null;
  }

  const title = normalizeText(item.title || "");
  if (title && productsByTitle.has(title)) {
    return productsByTitle.get(title) || null;
  }

  return null;
}

export function buildCartRecommendations(
  cartItems: CartItemLike[],
  products: ShopifyProduct[],
  collectionIndex?: Map<number, Set<string>>,
  options: { focusLimit?: number; relatedLimit?: number; complementaryLimit?: number } = {},
): CartRecommendationPlan {
  const productsByHandle = new Map(
    products.map((product) => [normalizeText(product.handle), product] as const).filter(([handle]) => Boolean(handle)),
  );
  const productsByTitle = new Map(
    products.map((product) => [normalizeText(product.title), product] as const).filter(([title]) => Boolean(title)),
  );

  const resolvedItems = (Array.isArray(cartItems) ? cartItems : [])
    .map((item) => {
      const product = resolveCartProduct(item, productsByHandle, productsByTitle);
      if (!product) {
        return null;
      }

      const quantity = Math.max(1, Math.floor(Number(item.quantity || 1)));
      const unitPrice = Number(item.unitPrice || minPrice(product) || 0);
      const lineTotal = unitPrice * quantity;
      const merchandisingScore = scoreProductForMerchandising(product, {
        focusTerms: [item.title || product.title, item.productType || product.product_type],
      });

      return {
        product,
        lineTotal,
        merchandisingScore,
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        product: ShopifyProduct;
        lineTotal: number;
        merchandisingScore: number;
      } => Boolean(entry),
    )
    .sort((left, right) => {
      if (right.lineTotal !== left.lineTotal) {
        return right.lineTotal - left.lineTotal;
      }

      if (right.merchandisingScore !== left.merchandisingScore) {
        return right.merchandisingScore - left.merchandisingScore;
      }

      return right.product.id - left.product.id;
    });

  const focusProducts = resolvedItems.slice(0, options.focusLimit ?? 2).map((entry) => entry.product);
  const blockedIds = new Set<number>(resolvedItems.map((entry) => entry.product.id));
  const relatedLimit = Math.max(1, options.relatedLimit ?? 4);
  const complementaryLimit = Math.max(1, options.complementaryLimit ?? 4);
  const relatedProducts = dedupeById(
    focusProducts.flatMap((product) =>
      pickRelatedProducts(product, products, {
        collectionIndex,
        limit: relatedLimit,
        excludedIds: blockedIds,
      }),
    ),
  ).slice(0, relatedLimit);
  const complementaryProducts = dedupeById(
    focusProducts.flatMap((product) =>
      pickComplementaryProducts(product, products, {
        collectionIndex,
        limit: complementaryLimit,
        excludedIds: new Set<number>([...blockedIds, ...relatedProducts.map((entry) => entry.id)]),
      }),
    ),
  )
    .filter((product) => !relatedProducts.some((related) => related.id === product.id))
    .slice(0, complementaryLimit);

  return {
    focusProducts,
    relatedProducts,
    complementaryProducts,
  };
}
