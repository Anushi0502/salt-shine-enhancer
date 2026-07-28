import { useQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type {
  AboutPagePayload,
  BlogPost,
  BlogPostsPayload,
  CollectionProductsPayload,
  CollectionsPayload,
  ProductsPayload,
  ShopPayload,
  ShopifyCollectionCustomData,
  ShopifyCollection,
  ShopifyImage,
  ShopifyPolicyPayload,
  ShopifyProduct,
  ShopifyVariant,
  ShopifyShop,
  ShopifyShopCustomData,
} from "@/types/shopify";
import { firstImageSrcFromHtml, polishPlainText, stripHtml } from "@/lib/formatters";
import {
  getEditorialPageContent,
  type EditorialPagePayload,
} from "@/lib/editorial-pages";
import { getMergedCollectionHandles } from "@/lib/site-navigation";
import {
  getRuntimeContext,
  getShopBaseOrigin,
  normalizeShopifyAssetUrl,
  resolveThemeAsset,
} from "@/lib/theme-assets";
import {
  mergeProductCustomData,
  normalizeCollectionCustomData,
  normalizeProductCustomData,
  normalizeShopCustomData,
} from "@/lib/product-custom-data.js";
import {
  isProductCatalogManifest,
  mergeProductShardPayloads,
} from "@/lib/product-catalog-shards.js";
import { isNativeApp } from "@/lib/mobile";
import { buildLiveShopifyBaseCandidates } from "@/lib/shopify-live-bases";
import { SHOPIFY_POLICY_ARCHIVE, type ShopifyPolicyKey } from "@/lib/shopify-policy-archive";

const runtimeContext = getRuntimeContext();
const SHOP_BASE_ORIGIN = getShopBaseOrigin();
const DEFAULT_CANONICAL_SHOP_BASE = "https://0309d3-72.myshopify.com";
const DATA_MODE = "live" as const;
const PAGE_LIMIT = Number(import.meta.env.VITE_SALT_PAGE_LIMIT || 250);
const ABOUT_HANDLE = runtimeContext.aboutHandle || import.meta.env.VITE_ABOUT_PAGE_HANDLE || "about-us";
const BLOG_HANDLE_INPUT = runtimeContext.blogHandle || import.meta.env.VITE_BLOG_HANDLE || "posts";
const BLOG_HANDLES = Array.from(
  new Set(
    BLOG_HANDLE_INPUT
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ),
);
const BLOG_HANDLE = BLOG_HANDLES[0] || "posts";
const PRODUCTS_DATA_PATH = "/data/products.json";
const PRODUCT_SEARCH_DATA_PATH = "/data/product-search.json";
const COLLECTIONS_DATA_PATH = "/data/collections.json";
const COLLECTION_PRODUCTS_DATA_PATH = "/data/collection-products.json";
const ABOUT_DATA_PATH = "/data/about.json";
const BLOG_POSTS_DATA_PATH = "/data/blog-posts.json";
const SHOP_DATA_PATH = "/data/shop.json";
// Theme data assets use Shopify's versioned asset URLs. Treat them as stable for
// the current browser session instead of repeatedly rebuilding the full catalog.
const CATALOG_STALE_TIME_MS = isNativeApp() ? 10 * 60 * 1000 : 30 * 60 * 1000;
// Merchandisers set collection order in Shopify. Do not keep that order behind
// the longer catalog snapshot cache: refresh it on every collection page visit.
const COLLECTION_ORDER_STALE_TIME_MS = 0;
const LIVE_QUERY_MAX_RETRIES = 4;
const LIVE_QUERY_BASE_RETRY_DELAY_MS = 700;
const LIVE_QUERY_MAX_RETRY_DELAY_MS = 9_000;

export const LIVE_SHOPIFY_QUERY_PREFIXES = [
  "products",
  "product-search",
  "collections",
  "collection-products",
  "collection-products-by-handle",
  "about-page",
  "blog-posts",
  "shop",
  "policy-page",
] as const;

type LiveShopifyPrimeQuery = {
  queryKey: readonly unknown[];
  queryFn: () => Promise<unknown>;
};

export const LIVE_SHOPIFY_PRIME_QUERIES = [
  {
    queryKey: ["collections", DATA_MODE],
    queryFn: loadCollections,
  },
  {
    queryKey: ["shop", DATA_MODE],
    queryFn: loadShop,
  },
] satisfies ReadonlyArray<LiveShopifyPrimeQuery>;

type CollectionProductIdsPayload = {
  generatedAt: string;
  source: string;
  handle: string;
  total: number;
  productIds: number[];
  complete?: boolean;
};

type HeadPreloadedCollection = {
  handle?: string;
  generatedAt?: string;
  complete?: boolean;
  currentPage?: number;
  total?: number;
  productIds?: number[];
  products?: Array<Record<string, unknown>>;
};

type SaltPreloadWindow = Window & {
  __SALT_PRODUCT_PREFETCH__?: {
    handle?: string;
    raw?: Record<string, unknown> | null;
    payload?: Promise<Record<string, unknown>>;
  };
  __SALT_COLLECTION_PREFETCH__?: HeadPreloadedCollection;
};

let normalizedHeadCollectionSource: HeadPreloadedCollection | null = null;
let normalizedHeadCollectionProducts: ShopifyProduct[] = [];

function normalizeBaseUrl(input: string | undefined | null): string | null {
  const raw = String(input || "").trim();
  if (!raw) {
    return null;
  }

  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProtocol);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

export async function primeLiveShopifyData(queryClient: Pick<QueryClient, "fetchQuery">): Promise<void> {
  const results = await Promise.allSettled(
    LIVE_SHOPIFY_PRIME_QUERIES.map((query) =>
      queryClient.fetchQuery({
        queryKey: query.queryKey,
        queryFn: query.queryFn,
        staleTime: CATALOG_STALE_TIME_MS,
      }),
    ),
  );

  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length > 0) {
    console.warn(`Live Shopify priming finished with ${failures.length} failed request(s)`);
  }
}

function isMyShopifyBase(input: string | null): boolean {
  if (!input) {
    return false;
  }

  try {
    const hostname = new URL(input).hostname.toLowerCase();
    return hostname.endsWith(".myshopify.com");
  } catch {
    return false;
  }
}

const SHOP_API_BASE = (() => {
  const candidates = [
    runtimeContext.shopDomain,
    import.meta.env.VITE_SHOPIFY_STOREFRONT_URL,
    runtimeContext.shopBaseUrl,
    SHOP_BASE_ORIGIN,
    DEFAULT_CANONICAL_SHOP_BASE,
  ]
    .map((candidate) => normalizeBaseUrl(candidate))
    .filter((candidate): candidate is string => Boolean(candidate));

  const canonicalCandidate = candidates.find((candidate) => isMyShopifyBase(candidate));
  return canonicalCandidate || candidates[0] || "";
})();

const SHOP_BASE = SHOP_API_BASE || SHOP_BASE_ORIGIN;

function requireShopBase(): string {
  if (!SHOP_BASE) {
    throw new Error("Shop base URL is unavailable in runtime context");
  }

  return SHOP_BASE;
}

function isLikelyLocalRuntimeHost(hostname: string): boolean {
  const normalized = String(hostname || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".lan")
  ) {
    return true;
  }

  if (normalized.startsWith("10.")) {
    return true;
  }

  if (normalized.startsWith("192.168.")) {
    return true;
  }

  const match172 = normalized.match(/^172\.(\d{1,3})\./);
  if (match172) {
    const secondOctet = Number(match172[1]);
    return secondOctet >= 16 && secondOctet <= 31;
  }

  return false;
}

function getLiveBlogBases(): string[] {
  if (typeof window === "undefined") {
    return [requireShopBase()];
  }

  return buildLiveShopifyBaseCandidates({
    browserOrigin: window.location.origin,
    shopBaseOrigin: SHOP_BASE_ORIGIN,
    shopApiBase: SHOP_API_BASE,
    native: isNativeApp(),
    localHost: isLikelyLocalRuntimeHost(window.location.hostname),
  });
}

function getLiveCatalogBases(): string[] {
  if (typeof window === "undefined") {
    return [requireShopBase()];
  }

  return buildLiveShopifyBaseCandidates({
    browserOrigin: window.location.origin,
    shopBaseOrigin: SHOP_BASE_ORIGIN,
    shopApiBase: SHOP_API_BASE,
    native: isNativeApp(),
    localHost: isLikelyLocalRuntimeHost(window.location.hostname),
  });
}

function getHeadPreloadedCollection(base?: string): HeadPreloadedCollection | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (base) {
    const isCurrentStore = new URL(base, window.location.origin).origin === window.location.origin;
    if (!isCurrentStore) {
      return null;
    }
  }

  const prefetch = (window as SaltPreloadWindow).__SALT_COLLECTION_PREFETCH__;
  const prefetchedHandle = String(prefetch?.handle || "").trim().toLowerCase();
  const routeMatch = window.location.pathname.match(/^\/collections\/([^/?#]+)\/?$/i);
  const routeHandle = routeMatch ? decodeURIComponent(routeMatch[1]).trim().toLowerCase() : "";
  const isShopBootstrap = window.location.pathname === "/shop" && prefetchedHandle === "all-products";

  // A collection bootstrap belongs to the Shopify document that rendered it.
  // Reject it after client-side navigation so a previous route can never leak
  // its ordering or operational product data into the next collection.
  if (!prefetch || !prefetchedHandle || (!isShopBootstrap && routeHandle !== prefetchedHandle)) {
    return null;
  }

  return prefetch;
}

function getHeadPreloadedProduct(handle: string, base: string): Promise<Record<string, unknown>> | null {
  if (typeof window === "undefined") {
    return null;
  }

  // The Shopify theme starts this request in the document head on PDPs. Reuse
  // the exact in-flight payload so the React route does not create a second
  // request after its module has loaded.
  const prefetch = (window as SaltPreloadWindow).__SALT_PRODUCT_PREFETCH__;
  const isCurrentStore = new URL(base, window.location.origin).origin === window.location.origin;

  if (!isCurrentStore) {
    return null;
  }

  if (prefetch?.handle === handle && prefetch.payload) {
    return prefetch.payload;
  }

  // Collection pages already carry the current Shopify records for the first
  // viewport. Product cards reuse those records instead of issuing one
  // `/products/:handle.js` request per visible card.
  const collectionProduct = getHeadPreloadedCollection(base)?.products?.find(
    (product) => String(product.handle || "").trim().toLowerCase() === handle,
  );

  return collectionProduct ? Promise.resolve(collectionProduct) : null;
}

function getHeadPreloadedProductRecord(handle: string): ShopifyProduct | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const prefetch = (window as SaltPreloadWindow).__SALT_PRODUCT_PREFETCH__;
  const routeMatch = window.location.pathname.match(/^\/products?\/([^/?#]+)\/?$/i);
  const routeHandle = routeMatch ? decodeURIComponent(routeMatch[1]).trim().toLowerCase() : "";
  const prefetchedHandle = String(prefetch?.handle || "").trim().toLowerCase();

  if (!prefetch?.raw || !prefetchedHandle || prefetchedHandle !== handle || routeHandle !== handle) {
    return undefined;
  }

  try {
    return normalizeProductRecord(normalizeStorefrontProductPayload(prefetch.raw));
  } catch {
    return undefined;
  }
}

function getLivePolicyBases(): string[] {
  if (typeof window === "undefined") {
    return [requireShopBase()];
  }

  return buildLiveShopifyBaseCandidates({
    browserOrigin: window.location.origin,
    shopBaseOrigin: SHOP_BASE_ORIGIN,
    shopApiBase: SHOP_API_BASE,
    native: isNativeApp(),
    localHost: isLikelyLocalRuntimeHost(window.location.hostname),
  });
}

function normalizePolicyRoute(input: string): string {
  const route = String(input || "").trim().toLowerCase();
  if (!route) {
    return "/";
  }

  return route.startsWith("/") ? route : `/${route}`;
}

function getArchivedPolicyRecord(path: string) {
  const normalizedPath = normalizePolicyRoute(path);
  const keyByPath: Partial<Record<string, ShopifyPolicyKey>> = {
    "/policies/privacy-policy": "privacy",
    "/privacy-policy": "privacy",
    "/policies/refund-policy": "refund",
    "/refund-policy": "refund",
    "/policies/shipping-policy": "shipping",
    "/shipping-policy": "shipping",
    "/policies/contact-information": "contact",
  };

  const key = keyByPath[normalizedPath];
  return key ? SHOPIFY_POLICY_ARCHIVE[key] : null;
}

function buildArchivedPolicyPayload(path: string, fallbackTitle: string): ShopifyPolicyPayload | null {
  const record = getArchivedPolicyRecord(path);
  if (!record?.bodyHtml) {
    return null;
  }

  return {
    generatedAt: new Date().toISOString(),
    source: `archive:${record.sourceUrl}`,
    path: normalizePolicyRoute(path),
    title: record.title || fallbackTitle,
    bodyHtml: record.bodyHtml,
  };
}

function extractPolicyContent(rawHtml: string, fallbackTitle: string): { title: string; bodyHtml: string } {
  const parsed = new DOMParser().parseFromString(rawHtml, "text/html");

  const title =
    polishPlainText(parsed.querySelector(".shopify-policy__title h1, h1")?.textContent?.trim()) ||
    fallbackTitle;

  const bodyNode =
    parsed.querySelector("[data-shopify-policy-body]") ||
    parsed.querySelector(".shopify-policy__body") ||
    parsed.querySelector(".shopify-policy__container .rte") ||
    parsed.querySelector("main .shopify-policy__container") ||
    parsed.querySelector("main .rte") ||
    parsed.querySelector("main article") ||
    parsed.querySelector("main");

  const bodyHtml = normalizeRichHtml(bodyNode?.innerHTML || "");
  return { title, bodyHtml };
}

function shouldRetryLiveQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= LIVE_QUERY_MAX_RETRIES) {
    return false;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";

  // A missing page/endpoint is not transient and should not hammer retries.
  if (message.includes(" 404") || message.includes("-> 404") || message.includes("(404)")) {
    return false;
  }

  return true;
}

function liveQueryRetryDelay(attemptIndex: number): number {
  const exponentialDelay = LIVE_QUERY_BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attemptIndex);
  const jitter = Math.floor(Math.random() * 260);
  return Math.min(exponentialDelay + jitter, LIVE_QUERY_MAX_RETRY_DELAY_MS);
}

async function fetchJson<T>(url: string, cache: RequestCache = "no-store"): Promise<T> {
  const resolvedUrl = resolveThemeAsset(url);
  const response = await fetch(resolvedUrl, { cache });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${resolvedUrl}`);
  }

  const contentType = response.headers.get("content-type") || "";
  // Shopify's `/products/:handle.js` endpoint returns a JSON body with a
  // `text/javascript` MIME type. Treat that documented response shape as JSON
  // so PDPs use the direct product payload instead of falling back to the
  // large catalog cache.
  if (!/(json|(?:java|ecma)script)/i.test(contentType)) {
    throw new Error(`Expected JSON but received ${contentType || "unknown content type"} for ${resolvedUrl}`);
  }

  return (await response.json()) as T;
}

function fetchThemeJson<T>(path: string): Promise<T> {
  // Shopify asset URLs already carry a version query. Let the browser reuse
  // that immutable response instead of bypassing its cache on every query.
  return fetchJson<T>(path, "force-cache");
}

async function fetchAllProductsFromLive(base: string): Promise<ShopifyProduct[]> {
  const allProducts: ShopifyProduct[] = [];
  let page = 1;

  while (true) {
    const url = `${base}/products.json?limit=${PAGE_LIMIT}&page=${page}`;
    const payload = await fetchJson<{ products: ShopifyProduct[] }>(url);

    allProducts.push(...payload.products);

    if (payload.products.length < PAGE_LIMIT) {
      break;
    }

    page += 1;
  }

  return allProducts;
}

function normalizeStorefrontProductPayload(product: Record<string, unknown>): ShopifyProduct {
  const imageRecord = (value: unknown, index: number): ShopifyImage | null => {
    if (typeof value === "string" && value.trim()) {
      return { id: -(index + 1), src: value, alt: null };
    }

    if (value && typeof value === "object" && typeof (value as ShopifyImage).src === "string") {
      return value as ShopifyImage;
    }

    return null;
  };
  const images = Array.isArray(product.images)
    ? product.images
        .map((image, index) => imageRecord(image, index))
        .filter((image): image is ShopifyImage => Boolean(image))
    : [];
  const primaryImage = imageRecord(product.image ?? product.featured_image ?? images[0], 0);
  const formatStorefrontMoney = (value: unknown): string => {
    const raw = String(value ?? "").trim();
    const numeric = Number(value);
    if (!raw || !Number.isFinite(numeric)) {
      return "0.00";
    }

    // Shopify product JSON uses integer cents, while some Liquid snapshots
    // and catalog exports contain already-formatted decimal strings.
    const amount = typeof value === "string" && raw.includes(".") ? numeric : numeric / 100;
    return amount.toFixed(2);
  };
  const variants = Array.isArray(product.variants)
    ? product.variants.map((variant) => {
        const record = variant as Record<string, unknown>;
        return {
          ...record,
          price: formatStorefrontMoney(record.price),
          compare_at_price:
            record.compare_at_price == null ? null : formatStorefrontMoney(record.compare_at_price),
        };
      })
    : [];

  // `.js` uses storefront field names (`description`, `type`, URL images),
  // while the app's richer catalog format uses `body_html`, `product_type`,
  // and ShopifyImage records.
  return {
    ...product,
    body_html: typeof product.body_html === "string" ? product.body_html : String(product.description || ""),
    product_type: typeof product.product_type === "string" ? product.product_type : String(product.type || ""),
    images,
    image: primaryImage,
    variants,
  } as ShopifyProduct;
}

async function fetchProductByHandleFromLive(base: string, handle: string): Promise<ShopifyProduct> {
  const normalizedHandle = String(handle || "").trim();
  if (!normalizedHandle) {
    throw new Error("Product handle is required");
  }

  // Shopify's product JSON route contains the complete product, including all
  // variants and media, without making a product page wait for the catalogue
  // snapshot used by search and merchandising.
  const product = await (getHeadPreloadedProduct(normalizedHandle, base) ?? fetchJson<Record<string, unknown>>(
    `${base}/products/${encodeURIComponent(normalizedHandle)}.js`,
    // Revalidate the product response so an Admin price change is not hidden
    // behind a long-lived document or browser cache entry.
    "no-cache",
  ));

  return normalizeStorefrontProductPayload(product);
}

async function fetchAllCollectionsFromLive(base: string): Promise<ShopifyCollection[]> {
  const allCollections: ShopifyCollection[] = [];
  let page = 1;

  while (true) {
    const url = `${base}/collections.json?limit=${PAGE_LIMIT}&page=${page}`;
    const payload = await fetchJson<{ collections: ShopifyCollection[] }>(url);

    allCollections.push(...payload.collections);

    if (payload.collections.length < PAGE_LIMIT) {
      break;
    }

    page += 1;
  }

  return allCollections;
}

async function fetchCollectionProductIdsFromLive(base: string, handle: string): Promise<number[]> {
  const productIds = new Set<number>();
  const mergedHandles = getMergedCollectionHandles(handle);
  const handlesToFetch = mergedHandles.length ? mergedHandles : [String(handle || "").trim().toLowerCase()].filter(Boolean);

  for (const currentHandle of handlesToFetch) {
    let page = 1;

    while (true) {
      const url = `${base}/collections/${encodeURIComponent(currentHandle)}/products.json?limit=${PAGE_LIMIT}&page=${page}&sort_by=manual`;

      try {
        const payload = await fetchJson<{ products: ShopifyProduct[] }>(url);

        payload.products.forEach((product) => {
          productIds.add(product.id);
        });

        if (payload.products.length < PAGE_LIMIT) {
          break;
        }

        page += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("404")) {
          break;
        }

        throw error;
      }
    }
  }

  return Array.from(productIds);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  const runNext = async (): Promise<void> => {
    const current = index;
    if (current >= items.length) {
      return;
    }

    index += 1;
    results[current] = await worker(items[current]);
    await runNext();
  };

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => runNext()));
  return results;
}

function excerptFromHtml(input: string, maxChars = 200): string {
  const text = stripHtml(input);
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

function normalizeRichHtml(input: string | null | undefined): string {
  const raw = typeof input === "string" ? input : "";

  return raw
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<meta[^>]*>/gi, "")
    .replace(/\s(?:bis_size|data-mce-fragment|contenteditable|data-mce-style)=("[^"]*"|'[^']*')/gi, "")
    .replace(/<img([^>]+)>/gi, (_full, attrs: string) => {
      let nextAttrs = attrs
        .replace(/\s(?:srcset|sizes)=("[^"]*"|'[^']*')/gi, "")
        .replace(/\s(?:bis_size|data-mce-fragment|contenteditable|data-mce-style)=("[^"]*"|'[^']*')/gi, "");

      const srcMatch = nextAttrs.match(/\ssrc=(["'])([^"']+)\1/i);
      if (srcMatch) {
        const normalizedSrc = normalizeShopifyAssetUrl(srcMatch[2]) || srcMatch[2];
        nextAttrs = nextAttrs.replace(srcMatch[0], ` src="${normalizedSrc}"`);
      }

      return `<img${nextAttrs}>`;
    })
    .trim();
}

function normalizeImageRecord(image: ShopifyImage): ShopifyImage {
  return {
    ...image,
    alt: image.alt == null ? image.alt : polishPlainText(image.alt),
  };
}

function normalizeVariantRecord(variant: ShopifyVariant): ShopifyVariant {
  return {
    ...variant,
    title: polishPlainText(variant.title),
    ...(variant.sku !== undefined ? { sku: polishPlainText(variant.sku) } : {}),
  };
}

function normalizeProductRecord(product: ShopifyProduct): ShopifyProduct {
  const customData = normalizeProductCustomData(product.customData);
  return {
    ...product,
    average_rating: product.average_rating ?? customData?.rating ?? undefined,
    total_reviews: product.total_reviews ?? customData?.ratingCount ?? undefined,
    customData,
    title: polishPlainText(product.title),
    handle: String(product.handle || "").trim(),
    vendor: polishPlainText(product.vendor),
    product_type: polishPlainText(product.product_type),
    body_html: product.body_html ? normalizeRichHtml(product.body_html) : "",
    tags: Array.isArray(product.tags)
      ? product.tags.map((tag) => polishPlainText(tag)).filter(Boolean)
      : polishPlainText(product.tags),
    variants: Array.isArray(product.variants) ? product.variants.map(normalizeVariantRecord) : [],
    images: Array.isArray(product.images) ? product.images.map(normalizeImageRecord) : [],
    image: product.image ? normalizeImageRecord(product.image) : product.image,
  };
}

function mergeProductRecords(primary: ShopifyProduct, overlay?: ShopifyProduct | null): ShopifyProduct {
  const mergedCustomData = mergeProductCustomData(overlay?.customData ?? null, primary.customData ?? null);
  return normalizeProductRecord({
    ...(overlay || {}),
    ...primary,
    customData: mergedCustomData,
    average_rating: primary.average_rating ?? overlay?.average_rating,
    total_reviews: primary.total_reviews ?? overlay?.total_reviews,
  });
}

function getNormalizedHeadPreloadedCollectionProducts(): ShopifyProduct[] {
  const prefetch = getHeadPreloadedCollection();
  if (!prefetch) {
    return [];
  }

  if (prefetch === normalizedHeadCollectionSource) {
    return normalizedHeadCollectionProducts;
  }

  const rawProducts = Array.isArray(prefetch.products) ? prefetch.products : [];
  normalizedHeadCollectionProducts = rawProducts.flatMap((product) => {
    try {
      const normalized = normalizeProductRecord(normalizeStorefrontProductPayload(product));
      return normalized.id && normalized.handle ? [normalized] : [];
    } catch {
      return [];
    }
  });
  normalizedHeadCollectionSource = prefetch;
  return normalizedHeadCollectionProducts;
}

function getHeadPreloadedProductsPayload(): ProductsPayload | undefined {
  const prefetch = getHeadPreloadedCollection();
  const products = getNormalizedHeadPreloadedCollectionProducts();
  if (!prefetch || !products.length) {
    return undefined;
  }

  return {
    generatedAt: prefetch.generatedAt || new Date().toISOString(),
    source: `shopify-liquid:${prefetch.handle || "collection"}`,
    total: products.length,
    products,
  };
}

function mergeHeadPreloadedCollectionProducts(payload: ProductsPayload): ProductsPayload {
  const prefetch = getHeadPreloadedCollection();
  const liveProducts = getNormalizedHeadPreloadedCollectionProducts();
  if (!liveProducts.length) {
    return payload;
  }
  const liveById = new Map(liveProducts.map((product) => [String(product.id), product]));
  const liveByHandle = new Map(
    liveProducts.map((product) => [String(product.handle || "").trim().toLowerCase(), product]),
  );
  const mergedIds = new Set<string>();
  const mergedHandles = new Set<string>();

  const products = payload.products.map((cachedProduct) => {
    const normalizedHandle = String(cachedProduct.handle || "").trim().toLowerCase();
    const liveProduct = liveById.get(String(cachedProduct.id)) || liveByHandle.get(normalizedHandle);
    if (!liveProduct) {
      return cachedProduct;
    }

    mergedIds.add(String(liveProduct.id));
    mergedHandles.add(String(liveProduct.handle || "").trim().toLowerCase());
    return mergeProductRecords(liveProduct, cachedProduct);
  });

  // A product added in Shopify after the static index was built should still
  // appear immediately on its collection page. Collection ordering below will
  // place the appended live record in the correct merchandiser-defined slot.
  liveProducts.forEach((liveProduct) => {
    const normalizedHandle = String(liveProduct.handle || "").trim().toLowerCase();
    if (mergedIds.has(String(liveProduct.id)) || mergedHandles.has(normalizedHandle)) {
      return;
    }

    products.push(liveProduct);
    mergedIds.add(String(liveProduct.id));
    mergedHandles.add(normalizedHandle);
  });

  return normalizeProductsPayload({
    ...payload,
    generatedAt: prefetch?.generatedAt || payload.generatedAt,
    source: `shopify-liquid:${prefetch?.handle || "collection"}+${payload.source}`,
    total: products.length,
    products,
  });
}

function mergeCollectionRecords(primary: ShopifyCollection, overlay?: ShopifyCollection | null): ShopifyCollection {
  return normalizeCollectionRecord({
    ...(overlay || {}),
    ...primary,
    customData: primary.customData ?? overlay?.customData ?? null,
  });
}

function normalizeCollectionRecord(collection: ShopifyCollection): ShopifyCollection {
  return {
    ...collection,
    title: polishPlainText(collection.title),
    handle: String(collection.handle || "").trim(),
    description: polishPlainText(collection.description),
    image: collection.image ? normalizeImageRecord(collection.image) : collection.image,
    customData: normalizeCollectionCustomData(collection.customData),
  };
}

function normalizeShopRecord(shop: ShopifyShop): ShopifyShop {
  return {
    ...shop,
    name: polishPlainText(shop.name) || "SALT",
    customData: normalizeShopCustomData(shop.customData),
  };
}

function normalizeProductsPayload(payload: ProductsPayload): ProductsPayload {
  const products = Array.isArray(payload.products) ? payload.products.map(normalizeProductRecord) : [];
  return {
    ...payload,
    total: payload.total || products.length,
    products,
  };
}

function normalizeCollectionsPayload(payload: CollectionsPayload): CollectionsPayload {
  const collections = Array.isArray(payload.collections) ? payload.collections.map(normalizeCollectionRecord) : [];
  return {
    ...payload,
    total: payload.total || collections.length,
    collections,
  };
}

function normalizeShopPayload(payload: ShopPayload): ShopPayload {
  return {
    ...payload,
    shop: normalizeShopRecord(payload.shop),
  };
}

async function fetchShopFromCache(): Promise<ShopPayload> {
  try {
    const payload = await fetchThemeJson<ShopPayload>(SHOP_DATA_PATH);
    if (!payload?.shop?.name) {
      throw new Error("Cached shop payload is empty");
    }

    return normalizeShopPayload({
      generatedAt: payload.generatedAt || new Date().toISOString(),
      source: `cache:${payload.source || SHOP_DATA_PATH}`,
      shop: payload.shop,
    });
  } catch {
    return normalizeShopPayload({
      generatedAt: new Date().toISOString(),
      source: `cache:${SHOP_DATA_PATH}`,
      shop: {
        id: "shop",
        name: "SALT",
        customData: null,
      },
    });
  }
}

function normalizeAboutPayload(payload: AboutPagePayload): AboutPagePayload {
  return {
    ...payload,
    page: {
      ...payload.page,
      title: polishPlainText(payload.page.title) || "About SALT",
      bodyHtml: normalizeRichHtml(payload.page.bodyHtml || ""),
    },
  };
}

function normalizePolicyPayload(payload: ShopifyPolicyPayload): ShopifyPolicyPayload {
  return {
    ...payload,
    title: polishPlainText(payload.title) || payload.title,
    bodyHtml: normalizeRichHtml(payload.bodyHtml || ""),
  };
}

function parseBlogEntriesFromAtom(atomXml: string): BlogPost[] {
  const parsed = new DOMParser().parseFromString(atomXml, "application/xml");
  const parserErrors = parsed.getElementsByTagName("parsererror");
  if (parserErrors.length > 0) {
    throw new Error("Received invalid Atom XML");
  }

  const feedNodes = parsed.getElementsByTagName("feed");
  if (feedNodes.length === 0) {
    throw new Error("Atom feed root not found");
  }

  const entries = Array.from(parsed.getElementsByTagName("entry"));

  return entries
    .map((entry) => {
      const id = entry.getElementsByTagName("id")[0]?.textContent?.trim() || "";
      const publishedAt = entry.getElementsByTagName("published")[0]?.textContent?.trim() || "";
      const updatedAt = entry.getElementsByTagName("updated")[0]?.textContent?.trim() || "";
      const title = polishPlainText(entry.getElementsByTagName("title")[0]?.textContent?.trim() || "");
      const author = polishPlainText(entry.getElementsByTagName("name")[0]?.textContent?.trim() || "SALT");
      const contentRaw = entry.getElementsByTagName("content")[0]?.textContent || "";
      const contentHtml = normalizeRichHtml(contentRaw);
      const linkNode = Array.from(entry.getElementsByTagName("link")).find(
        (node) => node.getAttribute("rel") === "alternate",
      );
      const url = normalizeShopifyAssetUrl(linkNode?.getAttribute("href") || id) || id;
      const handle = url.split("/").filter(Boolean).at(-1) || "";
      const linkImageNode = Array.from(entry.getElementsByTagName("link")).find((node) => {
        const rel = node.getAttribute("rel")?.toLowerCase() || "";
        const type = node.getAttribute("type")?.toLowerCase() || "";
        return rel === "enclosure" || type.startsWith("image/");
      });
      const mediaNodes = [
        ...Array.from(entry.getElementsByTagName("media:content")),
        ...Array.from(entry.getElementsByTagName("media:thumbnail")),
        ...Array.from(entry.getElementsByTagName("thumbnail")),
        ...Array.from(entry.getElementsByTagName("image")),
        ...Array.from(entry.getElementsByTagName("enclosure")),
        ...Array.from(entry.getElementsByTagNameNS("*", "content")).filter((node) => {
          const type = node.getAttribute("type")?.toLowerCase() || "";
          const medium = node.getAttribute("medium")?.toLowerCase() || "";
          return type.startsWith("image/") || medium === "image";
        }),
        ...Array.from(entry.getElementsByTagNameNS("*", "thumbnail")),
        ...Array.from(entry.getElementsByTagNameNS("*", "image")),
      ];
      const atomImage =
        normalizeShopifyAssetUrl(linkImageNode?.getAttribute("href")) ||
        mediaNodes
          .map((node) =>
            normalizeShopifyAssetUrl(
              node.getAttribute("url") || node.getAttribute("href") || node.getAttribute("src"),
            ),
          )
          .find(Boolean) ||
        null;

      return {
        id,
        handle,
        url,
        title,
        author,
        publishedAt,
        updatedAt,
        excerpt: excerptFromHtml(contentHtml),
        contentHtml,
        image: atomImage || normalizeShopifyAssetUrl(firstImageSrcFromHtml(contentHtml)),
      } satisfies BlogPost;
    })
    .filter((entry) => Boolean(entry.handle && entry.title && entry.url))
    .sort(
      (a, b) =>
        new Date(b.publishedAt || b.updatedAt || "1970-01-01").getTime() -
        new Date(a.publishedAt || a.updatedAt || "1970-01-01").getTime(),
    );
}

function normalizeBlogPayload(payload: BlogPostsPayload): BlogPostsPayload {
  const stemBlogToken = (token: string): string => {
    let next = token.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (next.length < 4) {
      return "";
    }

    for (const suffix of ["ingly", "edly", "ing", "ers", "ies", "ied", "er", "ed", "es", "s"]) {
      if (next.endsWith(suffix) && next.length - suffix.length >= 4) {
        next = next.slice(0, -suffix.length);
        break;
      }
    }

    return next;
  };

  const blogKeywordSet = (input: string): Set<string> =>
    new Set(
      String(input || "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map(stemBlogToken)
        .filter((token) => token.length >= 4),
    );

  return {
    ...payload,
    total: payload.total || (payload.posts || []).length,
    posts: (() => {
      const normalizedPosts = (payload.posts || []).map((post) => ({
        ...post,
        title: polishPlainText(post.title),
        author: polishPlainText(post.author || "SALT"),
        excerpt: polishPlainText(post.excerpt || excerptFromHtml(post.contentHtml)),
        contentHtml: normalizeRichHtml(post.contentHtml || ""),
        image:
          normalizeShopifyAssetUrl(post.image) ||
          normalizeShopifyAssetUrl(firstImageSrcFromHtml(post.contentHtml)) ||
          null,
      }));

      const inferRelatedBlogImage = (post: BlogPost): string | null => {
        const targetTokens = blogKeywordSet(`${post.title} ${post.excerpt}`);
        if (!targetTokens.size) {
          return null;
        }

        let bestScore = 0;
        let bestImage: string | null = null;

        for (const candidate of normalizedPosts) {
          if (candidate.id === post.id || !candidate.image) {
            continue;
          }

          const candidateTokens = blogKeywordSet(`${candidate.title} ${candidate.excerpt}`);
          let overlap = 0;

          targetTokens.forEach((token) => {
            if (candidateTokens.has(token)) {
              overlap += 1;
            }
          });

          if (overlap > bestScore) {
            bestScore = overlap;
            bestImage = candidate.image;
          }
        }

        return bestScore >= 2 ? bestImage : null;
      };

      return normalizedPosts.map((post) => ({
        ...post,
        image: post.image || inferRelatedBlogImage(post) || null,
      }));
    })(),
  };
}

async function fetchAboutPageFromLive(): Promise<AboutPagePayload> {
  const endpointErrors: string[] = [];

  for (const base of getLiveCatalogBases()) {
    const endpoint = `${base}/pages/${ABOUT_HANDLE}.json`;
    try {
      const response = await fetch(endpoint);
      if (response.status === 404) {
        endpointErrors.push(`${endpoint} -> 404`);
        continue;
      }

      if (!response.ok) {
        endpointErrors.push(`${endpoint} -> ${response.status}`);
        continue;
      }

      const payload = (await response.json()) as {
        page: {
          id: number;
          handle: string;
          title: string;
          body_html: string;
          published_at: string;
          updated_at: string;
        };
      };

      return normalizeAboutPayload({
        generatedAt: new Date().toISOString(),
        source: base,
        page: {
          id: payload.page.id,
          handle: payload.page.handle || ABOUT_HANDLE,
          title: payload.page.title || "About",
          bodyHtml: normalizeRichHtml(payload.page.body_html || ""),
          publishedAt: payload.page.published_at || "",
          updatedAt: payload.page.updated_at || "",
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      endpointErrors.push(`${endpoint} -> ${message}`);
    }
  }

  const details =
    endpointErrors.length > 0
      ? endpointErrors.slice(0, 4).join(" | ")
      : "No reachable live about-page endpoints.";
  throw new Error(`Live about page unavailable for handle "${ABOUT_HANDLE}". ${details}`);
}

async function fetchBlogPostsFromLive(): Promise<BlogPostsPayload> {
  const endpointErrors: string[] = [];

  for (const base of getLiveBlogBases()) {
    for (const handle of BLOG_HANDLES) {
      const endpoint = `${base}/blogs/${handle}.atom`;
      try {
        const response = await fetch(endpoint, { credentials: "omit" });
        if (response.status === 404) {
          continue;
        }

        if (!response.ok) {
          endpointErrors.push(`${endpoint} -> ${response.status}`);
          continue;
        }

        const atom = await response.text();
        const posts = parseBlogEntriesFromAtom(atom);

        return normalizeBlogPayload({
          generatedAt: new Date().toISOString(),
          source: base as string,
          blogHandle: handle as string,
          total: posts.length,
          posts,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        endpointErrors.push(`${endpoint} -> ${message}`);
      }
    }
  }

  if (!BLOG_HANDLES.length) {
    throw new Error("No blog handles configured for live fetch");
  }

  const details =
    endpointErrors.length > 0
      ? endpointErrors.slice(0, 4).join(" | ")
      : "No reachable live blog endpoints.";

  throw new Error(`Live blog feed unavailable. ${details}`);
}

async function fetchBlogPostsFromCache(): Promise<BlogPostsPayload> {
  const payload = await fetchThemeJson<BlogPostsPayload>(BLOG_POSTS_DATA_PATH);
  const posts = Array.isArray(payload.posts) ? payload.posts : [];

  if (!posts.length) {
    throw new Error("Cached blog payload is empty");
  }

  return normalizeBlogPayload({
    generatedAt: payload.generatedAt || new Date().toISOString(),
    source: payload.source || BLOG_POSTS_DATA_PATH,
    blogHandle: payload.blogHandle || BLOG_HANDLE,
    total: payload.total || posts.length,
    posts,
  });
}

async function fetchProductsFromCache(): Promise<ProductsPayload> {
  const payload = await fetchThemeJson<ProductsPayload & { shards?: Array<{ path?: string; file?: string }> }>(PRODUCTS_DATA_PATH);
  const hydratedPayload = isProductCatalogManifest(payload)
    ? mergeProductShardPayloads(
        payload,
        await Promise.all(
          payload.shards.map((shard) =>
            fetchThemeJson<ProductsPayload>(shard.path || `/data/${shard.file || ""}`),
          ),
        ),
      )
    : payload;
  const products = Array.isArray(hydratedPayload.products) ? hydratedPayload.products : [];

  if (!products.length) {
    throw new Error("Cached product payload is empty");
  }

  return normalizeProductsPayload({
    generatedAt: hydratedPayload.generatedAt || new Date().toISOString(),
    source: `cache:${hydratedPayload.source || PRODUCTS_DATA_PATH}`,
    total: hydratedPayload.total || products.length,
    products,
  });
}

async function fetchProductSearchIndexFromCache(): Promise<ProductsPayload> {
  const payload = await fetchThemeJson<ProductsPayload>(PRODUCT_SEARCH_DATA_PATH);
  const products = Array.isArray(payload.products) ? payload.products : [];

  if (!products.length) {
    throw new Error("Cached product search payload is empty");
  }

  return normalizeProductsPayload({
    generatedAt: payload.generatedAt || new Date().toISOString(),
    source: `cache:${payload.source || PRODUCT_SEARCH_DATA_PATH}`,
    total: payload.total || products.length,
    products,
  });
}

async function fetchCollectionsFromCache(): Promise<CollectionsPayload> {
  const payload = await fetchThemeJson<CollectionsPayload>(COLLECTIONS_DATA_PATH);
  const collections = Array.isArray(payload.collections) ? payload.collections : [];

  if (!collections.length) {
    throw new Error("Cached collections payload is empty");
  }

  return normalizeCollectionsPayload({
    generatedAt: payload.generatedAt || new Date().toISOString(),
    source: `cache:${payload.source || COLLECTIONS_DATA_PATH}`,
    total: payload.total || collections.length,
    collections,
  });
}

async function fetchCollectionProductsMapFromCache(): Promise<CollectionProductsPayload> {
  const payload = await fetchThemeJson<CollectionProductsPayload>(COLLECTION_PRODUCTS_DATA_PATH);
  const collections = Object.fromEntries(
    Object.entries(payload.collections || {}).map(([handle, entry]) => [
      handle,
      {
        title: polishPlainText(entry?.title || handle),
        productIds: Array.isArray(entry?.productIds) ? entry.productIds : [],
      },
    ]),
  );
  const totalCollections = Object.keys(collections).length;

  if (!totalCollections) {
    throw new Error("Cached collection products map is empty");
  }

  return {
    generatedAt: payload.generatedAt || new Date().toISOString(),
    source: `cache:${payload.source || COLLECTION_PRODUCTS_DATA_PATH}`,
    totalCollections: payload.totalCollections || totalCollections,
    collections,
  };
}

async function fetchCollectionProductIdsFromCache(handle: string): Promise<CollectionProductIdsPayload> {
  const payload = await fetchCollectionProductsMapFromCache();
  const mergedHandles = getMergedCollectionHandles(handle);
  const handlesToCheck = mergedHandles.length ? mergedHandles : [String(handle || "").trim().toLowerCase()].filter(Boolean);
  const productIds = new Set<number>();
  let matchedHandle = "";

  for (const currentHandle of handlesToCheck) {
    const match = Object.entries(payload.collections || {}).find(
      ([entryHandle]) => entryHandle.trim().toLowerCase() === currentHandle,
    );

    if (!match) {
      continue;
    }

    const [entryHandle, entry] = match;
    if (!matchedHandle) {
      matchedHandle = entryHandle;
    }

    (Array.isArray(entry.productIds) ? entry.productIds : []).forEach((productId) => {
      productIds.add(productId);
    });
  }

  if (!productIds.size) {
    throw new Error(`Cached collection map missing handle "${String(handle || "").trim().toLowerCase()}"`);
  }

  return {
    generatedAt: payload.generatedAt,
    source: payload.source,
    handle: matchedHandle || String(handle || "").trim().toLowerCase(),
    total: productIds.size,
    productIds: Array.from(productIds),
  };
}

async function fetchAboutPageFromCache(): Promise<AboutPagePayload> {
  const payload = await fetchThemeJson<AboutPagePayload>(ABOUT_DATA_PATH);

  if (!payload?.page?.title) {
    throw new Error("Cached about payload is empty");
  }

  return normalizeAboutPayload({
    generatedAt: payload.generatedAt || new Date().toISOString(),
    source: `cache:${payload.source || ABOUT_DATA_PATH}`,
    page: payload.page,
  });
}

async function fetchPolicyPageFromLive(path: string, fallbackTitle: string): Promise<ShopifyPolicyPayload> {
  const endpointErrors: string[] = [];
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  for (const base of getLivePolicyBases()) {
    const endpoint = `${base}${normalizedPath}`;
    try {
      const response = await fetch(endpoint, { credentials: "omit" });
      if (response.status === 404) {
        continue;
      }

      if (!response.ok) {
        endpointErrors.push(`${endpoint} -> ${response.status}`);
        continue;
      }

      const html = await response.text();
      const parsed = extractPolicyContent(html, fallbackTitle);

      if (!parsed.bodyHtml) {
        endpointErrors.push(`${endpoint} -> policy body not found`);
        continue;
      }

      return normalizePolicyPayload({
        generatedAt: new Date().toISOString(),
        source: base,
        path: normalizedPath,
        title: parsed.title || fallbackTitle,
        bodyHtml: parsed.bodyHtml,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      endpointErrors.push(`${endpoint} -> ${message}`);
    }
  }

  const details =
    endpointErrors.length > 0
      ? endpointErrors.slice(0, 4).join(" | ")
      : "No reachable live policy endpoints.";

  throw new Error(`Live policy fetch failed for ${normalizedPath}. ${details}`);
}

export async function loadProducts(): Promise<ProductsPayload> {
  try {
    return await fetchProductsFromCache();
  } catch {
    // A local build or an incomplete theme can be missing the snapshot; use the
    // live Storefront fallback only in that recovery path.
  }

  const endpointErrors: string[] = [];

  for (const base of getLiveCatalogBases()) {
    try {
      const products = await fetchAllProductsFromLive(base);
      const livePayload = normalizeProductsPayload({
        generatedAt: new Date().toISOString(),
        source: base,
        total: products.length,
        products,
      });

      try {
        const cached = await fetchProductsFromCache();
        const cachedById = new Map(cached.products.map((product) => [String(product.id), product]));
        const cachedByHandle = new Map(
          cached.products.map((product) => [String(product.handle || "").trim().toLowerCase(), product]),
        );

        return normalizeProductsPayload({
          ...livePayload,
          products: livePayload.products.map((product) => {
            const cachedMatch =
              cachedById.get(String(product.id)) ||
              cachedByHandle.get(String(product.handle || "").trim().toLowerCase()) ||
              null;

            return mergeProductRecords(product, cachedMatch);
          }),
        });
      } catch {
        return livePayload;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      endpointErrors.push(`${base} -> ${message}`);
    }
  }

  try {
    const cached = await fetchProductsFromCache();
    return cached;
  } catch (cacheError) {
    const details =
      endpointErrors.length > 0
        ? endpointErrors.slice(0, 4).join(" | ")
        : "No reachable live products endpoints.";

    const cacheMessage = cacheError instanceof Error ? cacheError.message : "unknown cache error";
    throw new Error(`Live products fetch failed. ${details}. Cached products fetch failed: ${cacheMessage}`);
  }
}

async function loadProductByHandleFresh(handle: string): Promise<ShopifyProduct> {
  const normalizedHandle = String(handle || "").trim().toLowerCase();
  if (!normalizedHandle) {
    throw new Error("Product handle is required");
  }

  const endpointErrors: string[] = [];

  for (const base of getLiveCatalogBases()) {
    try {
      return normalizeProductRecord(await fetchProductByHandleFromLive(base, normalizedHandle));
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      endpointErrors.push(`${base} -> ${message}`);
    }
  }

  // Keep the versioned theme snapshot as a recovery path for local previews or
  // stores where Shopify's public product endpoint is temporarily unavailable.
  const cached = await fetchProductsFromCache();
  const cachedProduct = cached.products.find((product) => String(product.handle || "").trim().toLowerCase() === normalizedHandle);
  if (cachedProduct) {
    return cachedProduct;
  }

  throw new Error(`Product "${normalizedHandle}" is unavailable. ${endpointErrors.slice(0, 3).join(" | ")}`);
}

const warmedProductRequests = new Map<
  string,
  { startedAt: number; promise: Promise<ShopifyProduct> }
>();
const WARMED_PRODUCT_REQUEST_TTL_MS = 15_000;

export function loadProductByHandle(handle: string): Promise<ShopifyProduct> {
  const normalizedHandle = String(handle || "").trim().toLowerCase();
  if (!normalizedHandle) {
    return Promise.reject(new Error("Product handle is required"));
  }

  const warmed = warmedProductRequests.get(normalizedHandle);
  if (warmed && Date.now() - warmed.startedAt < WARMED_PRODUCT_REQUEST_TTL_MS) {
    return warmed.promise;
  }

  const promise = loadProductByHandleFresh(normalizedHandle);
  warmedProductRequests.set(normalizedHandle, { startedAt: Date.now(), promise });
  promise.catch(() => {
    if (warmedProductRequests.get(normalizedHandle)?.promise === promise) {
      warmedProductRequests.delete(normalizedHandle);
    }
  });
  return promise;
}

export function warmProductByHandle(handle: string): void {
  void loadProductByHandle(handle).catch(() => {
    // Navigation keeps the normal error UI and retry path. Speculative warmups
    // never surface an unhandled rejection.
  });
}

export async function loadProductSearchIndex(): Promise<ProductsPayload> {
  try {
    return mergeHeadPreloadedCollectionProducts(await fetchProductSearchIndexFromCache());
  } catch {
    // Preserve a working search UI if an older local bundle lacks the compact
    // index. Published bundles ship the smaller index instead of this fallback.
    return mergeHeadPreloadedCollectionProducts(await loadProducts());
  }
}

export async function loadCollections(): Promise<CollectionsPayload> {
  try {
    return await fetchCollectionsFromCache();
  } catch {
    // Fall through to live Shopify only when the bundled snapshot is unavailable.
  }

  const endpointErrors: string[] = [];

  for (const base of getLiveCatalogBases()) {
    try {
      const collections = await fetchAllCollectionsFromLive(base);
      const livePayload = normalizeCollectionsPayload({
        generatedAt: new Date().toISOString(),
        source: base,
        total: collections.length,
        collections,
      });

      try {
        const cached = await fetchCollectionsFromCache();
        const cachedById = new Map(cached.collections.map((collection) => [String(collection.id), collection]));
        const cachedByHandle = new Map(
          cached.collections.map((collection) => [String(collection.handle || "").trim().toLowerCase(), collection]),
        );

        return normalizeCollectionsPayload({
          ...livePayload,
          collections: livePayload.collections.map((collection) => {
            const cachedMatch =
              cachedById.get(String(collection.id)) ||
              cachedByHandle.get(String(collection.handle || "").trim().toLowerCase()) ||
              null;

            return mergeCollectionRecords(collection, cachedMatch);
          }),
        });
      } catch {
        return livePayload;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      endpointErrors.push(`${base} -> ${message}`);
    }
  }

  try {
    const cached = await fetchCollectionsFromCache();
    return cached;
  } catch (cacheError) {
    const details =
      endpointErrors.length > 0
        ? endpointErrors.slice(0, 4).join(" | ")
        : "No reachable live collections endpoints.";

    const cacheMessage = cacheError instanceof Error ? cacheError.message : "unknown cache error";
    throw new Error(`Live collections fetch failed. ${details}. Cached collections fetch failed: ${cacheMessage}`);
  }
}

export async function loadShop(): Promise<ShopPayload> {
  return fetchShopFromCache();
}

export async function loadCollectionProductsMap(): Promise<CollectionProductsPayload> {
  try {
    return await fetchCollectionProductsMapFromCache();
  } catch {
    // Fall through to the expensive live crawl only when no snapshot was bundled.
  }

  const endpointErrors: string[] = [];

  for (const base of getLiveCatalogBases()) {
    try {
      const collections = await fetchAllCollectionsFromLive(base);
      const mappedEntries = await mapWithConcurrency(collections, 6, async (collection) => {
        const productIds = await fetchCollectionProductIdsFromLive(base, collection.handle);
        return [
          collection.handle,
          {
            title: polishPlainText(collection.title),
            productIds,
          },
        ] as const;
      });

      return {
        generatedAt: new Date().toISOString(),
        source: base,
        totalCollections: collections.length,
        collections: Object.fromEntries(mappedEntries),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      endpointErrors.push(`${base} -> ${message}`);
    }
  }

  try {
    const cached = await fetchCollectionProductsMapFromCache();
    return cached;
  } catch (cacheError) {
    const details =
      endpointErrors.length > 0
        ? endpointErrors.slice(0, 4).join(" | ")
        : "No reachable live collection products endpoints.";

    const cacheMessage = cacheError instanceof Error ? cacheError.message : "unknown cache error";
    throw new Error(`Live collection products map fetch failed. ${details}. Cached collection map fetch failed: ${cacheMessage}`);
  }
}

function getHeadPreloadedCollectionIdsPayload(
  handle: string,
  allowPartial = false,
): CollectionProductIdsPayload | null {
  const normalizedHandle = String(handle || "").trim();
  if (!normalizedHandle) {
    return null;
  }

  const inlineCollection = getHeadPreloadedCollection();
  const inlineHandle = String(inlineCollection?.handle || "").trim().toLowerCase();
  const mergedHandles = getMergedCollectionHandles(normalizedHandle);
  const matchesInlineCollection =
    Number(inlineCollection?.currentPage || 1) === 1 &&
    inlineHandle === normalizedHandle &&
    mergedHandles.length === 1 &&
    mergedHandles[0] === normalizedHandle;
  const inlineProductIds = Array.isArray(inlineCollection?.productIds)
    ? inlineCollection.productIds.filter((productId) => Number.isFinite(productId) && productId > 0)
    : [];

  if (!matchesInlineCollection || (!allowPartial && inlineCollection?.complete !== true)) {
    return null;
  }

  return {
    generatedAt: inlineCollection?.generatedAt || new Date().toISOString(),
    source: `shopify-liquid${inlineCollection?.complete ? "" : "-partial"}:${normalizedHandle}`,
    handle: normalizedHandle,
    total: inlineProductIds.length,
    productIds: inlineProductIds,
    complete: inlineCollection?.complete === true,
  };
}

export async function loadCollectionProductIds(handle: string): Promise<CollectionProductIdsPayload> {
  const normalizedHandle = String(handle || "").trim();
  if (!normalizedHandle) {
    throw new Error("Collection handle is required");
  }

  const inlinePayload = getHeadPreloadedCollectionIdsPayload(normalizedHandle);
  if (inlinePayload) {
    return inlinePayload;
  }

  const endpointErrors: string[] = [];

  for (const base of getLiveCatalogBases()) {
    try {
      const productIds = await fetchCollectionProductIdsFromLive(base, normalizedHandle);
      return {
        generatedAt: new Date().toISOString(),
        source: base,
        handle: normalizedHandle,
        total: productIds.length,
        productIds,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      endpointErrors.push(`${base} -> ${message}`);
    }
  }

  try {
    return await fetchCollectionProductIdsFromCache(normalizedHandle);
  } catch (cacheError) {
    const details =
      endpointErrors.length > 0
        ? endpointErrors.slice(0, 4).join(" | ")
        : "No reachable live collection products endpoints.";
    const cacheMessage = cacheError instanceof Error ? cacheError.message : "unknown cache error";
    throw new Error(`Live collection products fetch failed for "${normalizedHandle}". ${details}. Cached collection ids fetch failed: ${cacheMessage}`);
  }
}

export async function loadEditorialPage(handle: string): Promise<EditorialPagePayload> {
  const page = getEditorialPageContent(handle);
  const normalizedHandle = String(handle || "").trim().toLowerCase();

  if (!page) {
    throw new Error(`Editorial page content unavailable for handle "${normalizedHandle}"`);
  }

  return {
    generatedAt: new Date().toISOString(),
    source: `workbook:${normalizedHandle}`,
    page,
  };
}

export async function loadAboutPage(): Promise<AboutPagePayload> {
  try {
    return await fetchAboutPageFromCache();
  } catch {
    // Only reach Shopify when a local development build or incomplete bundle
    // does not include the static snapshot.
    return fetchAboutPageFromLive();
  }
}

export async function loadBlogPosts(): Promise<BlogPostsPayload> {
  try {
    return await fetchBlogPostsFromCache();
  } catch {
    return fetchBlogPostsFromLive();
  }
}

export async function loadPolicyPage(path: string, fallbackTitle: string): Promise<ShopifyPolicyPayload> {
  try {
    return await fetchPolicyPageFromLive(path, fallbackTitle);
  } catch (error) {
    const archived = buildArchivedPolicyPayload(path, fallbackTitle);
    if (archived) {
      return normalizePolicyPayload(archived);
    }

    const message = error instanceof Error ? error.message : "Unknown live policy error";
    throw new Error(message);
  }
}

export function useProducts(enabled = true) {
  return useQuery({
    queryKey: ["products", DATA_MODE],
    queryFn: loadProducts,
    enabled,
    staleTime: CATALOG_STALE_TIME_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    retry: shouldRetryLiveQuery,
    retryDelay: liveQueryRetryDelay,
  });
}

export function useProductByHandle(handle: string | undefined, enabled = true, liveRefresh = false) {
  const normalizedHandle = String(handle || "").trim().toLowerCase();
  const inlineProduct = getHeadPreloadedProductRecord(normalizedHandle);

  return useQuery({
    queryKey: ["product", normalizedHandle, DATA_MODE],
    queryFn: () => loadProductByHandle(normalizedHandle),
    enabled: enabled && Boolean(normalizedHandle),
    // Liquid has already serialized the current Shopify product into the head.
    // Supplying it synchronously removes even the Promise microtask that used
    // to flash the product loading state before React Query resolved.
    initialData: inlineProduct,
    initialDataUpdatedAt: inlineProduct ? 0 : undefined,
    staleTime: liveRefresh ? 15_000 : CATALOG_STALE_TIME_MS,
    refetchOnMount: liveRefresh ? "always" : false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    retry: shouldRetryLiveQuery,
    retryDelay: liveQueryRetryDelay,
  });
}

export function useProductSearchIndex(enabled = true) {
  const inlineProducts = getHeadPreloadedProductsPayload();

  return useQuery({
    queryKey: ["product-search", DATA_MODE],
    queryFn: loadProductSearchIndex,
    enabled,
    // Render the current Shopify collection immediately from Liquid, then
    // merge the complete compact catalog in the background. This keeps the
    // first viewport live without delaying search, filters, or later pages.
    initialData: inlineProducts,
    initialDataUpdatedAt: inlineProducts ? 0 : undefined,
    staleTime: inlineProducts ? 0 : CATALOG_STALE_TIME_MS,
    refetchOnMount: inlineProducts ? "always" : false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    retry: shouldRetryLiveQuery,
    retryDelay: liveQueryRetryDelay,
  });
}

export function useCollections(enabled = true) {
  return useQuery({
    queryKey: ["collections", DATA_MODE],
    queryFn: loadCollections,
    enabled,
    staleTime: CATALOG_STALE_TIME_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    retry: shouldRetryLiveQuery,
    retryDelay: liveQueryRetryDelay,
  });
}

export function useShop(enabled = true) {
  return useQuery({
    queryKey: ["shop", DATA_MODE],
    queryFn: loadShop,
    enabled,
    staleTime: 2 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 3 * 60 * 1000,
    retry: shouldRetryLiveQuery,
    retryDelay: liveQueryRetryDelay,
  });
}

export function useCollectionProductsMap(enabled = true) {
  return useQuery({
    queryKey: ["collection-products", DATA_MODE],
    queryFn: loadCollectionProductsMap,
    enabled,
    staleTime: CATALOG_STALE_TIME_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    retry: shouldRetryLiveQuery,
    retryDelay: liveQueryRetryDelay,
  });
}

export function useCollectionProductIds(handle: string, enabled = true) {
  const normalizedHandle = String(handle || "").trim().toLowerCase();
  const inlineCollection = getHeadPreloadedCollectionIdsPayload(normalizedHandle, true) || undefined;
  const hasCompleteInlineCollection = inlineCollection?.complete === true;

  return useQuery({
    queryKey: ["collection-products-by-handle", DATA_MODE, normalizedHandle],
    queryFn: () => loadCollectionProductIds(normalizedHandle),
    enabled: enabled && Boolean(normalizedHandle),
    // The Liquid payload is generated by Shopify for this exact request, so it
    // is both newer and faster than repeating the public collection crawl.
    initialData: inlineCollection,
    initialDataUpdatedAt: inlineCollection ? Date.now() : undefined,
    staleTime: hasCompleteInlineCollection ? CATALOG_STALE_TIME_MS : COLLECTION_ORDER_STALE_TIME_MS,
    refetchOnMount: hasCompleteInlineCollection ? false : "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    retry: shouldRetryLiveQuery,
    retryDelay: liveQueryRetryDelay,
  });
}

export function useAboutPage() {
  return useQuery({
    queryKey: ["about-page", DATA_MODE, ABOUT_HANDLE],
    queryFn: loadAboutPage,
    staleTime: CATALOG_STALE_TIME_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    retry: shouldRetryLiveQuery,
    retryDelay: liveQueryRetryDelay,
  });
}

export function useEditorialPage(handle: string) {
  const normalizedHandle = String(handle || "").trim().toLowerCase();

  return useQuery({
    queryKey: ["editorial-page", DATA_MODE, normalizedHandle],
    queryFn: () => loadEditorialPage(normalizedHandle),
    staleTime: CATALOG_STALE_TIME_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    retry: shouldRetryLiveQuery,
    retryDelay: liveQueryRetryDelay,
  });
}

export function useBlogPosts() {
  return useQuery({
    queryKey: ["blog-posts", DATA_MODE, BLOG_HANDLE],
    queryFn: loadBlogPosts,
    staleTime: CATALOG_STALE_TIME_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    retry: shouldRetryLiveQuery,
    retryDelay: liveQueryRetryDelay,
  });
}

export function usePolicyPage(path: string, fallbackTitle: string) {
  return useQuery({
    queryKey: ["policy-page", DATA_MODE, path],
    queryFn: () => loadPolicyPage(path, fallbackTitle),
    staleTime: CATALOG_STALE_TIME_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    retry: shouldRetryLiveQuery,
    retryDelay: liveQueryRetryDelay,
  });
}
