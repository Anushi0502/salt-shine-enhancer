import { useQuery } from "@tanstack/react-query";
import { isNativeApp } from "@/lib/mobile";
import { buildLiveShopifyBaseCandidates } from "@/lib/shopify-live-bases";
import { getRuntimeContext, getShopBaseOrigin } from "@/lib/theme-assets";
import type { ShopifyImage, ShopifyProduct, ShopifyVariant } from "@/types/shopify";

export const LIVE_PRODUCT_PAGE_SIZE = 36;
const DEFAULT_CANONICAL_SHOP_BASE = "https://0309d3-72.myshopify.com";
const LIVE_LISTING_STALE_TIME_MS = 60 * 1000;
const PREDICTIVE_SEARCH_STALE_TIME_MS = 30 * 1000;

export type LiveProductListingParams = {
  collectionHandle?: string;
  query?: string;
  page?: number;
  sort?: string;
  productType?: string;
  minPrice?: number | null;
  maxPrice?: number | null;
};

export type LiveProductListingPayload = {
  generatedAt: string;
  source: string;
  kind: "collection" | "search";
  handle: string;
  query: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  productTypes: string[];
  products: ShopifyProduct[];
};

type ListingPreloadWindow = Window & {
  __SALT_COLLECTION_PREFETCH__?: {
    handle?: string;
    generatedAt?: string;
    currentPage?: number;
    total?: number;
    products?: Array<Record<string, unknown>>;
  };
  __SALT_SEARCH_PREFETCH__?: Partial<LiveProductListingPayload>;
};

type PredictiveSearchPayload = {
  resources?: {
    results?: {
      products?: Array<Record<string, unknown>>;
    };
  };
};

type ListingPayloadInput = Omit<Partial<LiveProductListingPayload>, "products"> & {
  products?: unknown[];
};

function normalizeBaseUrl(input: string | null | undefined): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;

  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.origin;
  } catch {
    return null;
  }
}

function isLocalRuntimeHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.endsWith(".local") ||
    normalized.startsWith("10.") ||
    normalized.startsWith("192.168.") ||
    /^172\.(?:1[6-9]|2\d|3[01])\./.test(normalized)
  );
}

function getLiveBases(): string[] {
  const runtime = getRuntimeContext();
  const shopBaseOrigin = getShopBaseOrigin();
  const shopApiBase =
    normalizeBaseUrl(runtime.shopDomain) ||
    normalizeBaseUrl(import.meta.env.VITE_SHOPIFY_STOREFRONT_URL) ||
    normalizeBaseUrl(runtime.shopBaseUrl) ||
    DEFAULT_CANONICAL_SHOP_BASE;

  if (typeof window === "undefined") {
    return [shopApiBase];
  }

  return buildLiveShopifyBaseCandidates({
    browserOrigin: window.location.origin,
    shopBaseOrigin,
    shopApiBase,
    native: isNativeApp(),
    localHost: isLocalRuntimeHost(window.location.hostname),
  });
}

function normalizeMoney(value: unknown): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

function normalizeImage(value: unknown, fallbackId: number): ShopifyImage | null {
  if (typeof value === "string" && value.trim()) {
    return { id: fallbackId, src: value.trim(), alt: null };
  }

  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const src = String(record.src || record.url || "").trim();
  if (!src) return null;

  return {
    id: Number(record.id) || fallbackId,
    src,
    alt: String(record.alt || record.altText || "") || null,
    width: Number(record.width) || undefined,
    height: Number(record.height) || undefined,
  };
}

function normalizeVariant(value: unknown, index: number): ShopifyVariant | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = Number(record.id) || -(index + 1);
  const price = normalizeMoney(record.price);
  const compareAtPrice = Number(record.compare_at_price);
  const image = normalizeImage(record.featured_image || record.image, -(index + 1));

  return {
    id,
    title: String(record.title || "Default Title"),
    price,
    compare_at_price:
      Number.isFinite(compareAtPrice) && compareAtPrice > Number(price)
        ? compareAtPrice.toFixed(2)
        : null,
    available: record.available !== false,
    sku: String(record.sku || "") || undefined,
    requires_shipping: record.requires_shipping !== false,
    featured_image: image,
  };
}

export function normalizeLiveListingProduct(value: unknown): ShopifyProduct | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = Number(record.id);
  const handle = String(record.handle || "").trim();
  const title = String(record.title || "").replace(/\s+/g, " ").trim();
  if (!id || !handle || !title) return null;

  const images = (Array.isArray(record.images) ? record.images : [])
    .map((image, index) => normalizeImage(image, -(index + 1)))
    .filter((image): image is ShopifyImage => Boolean(image));
  const primaryImage = normalizeImage(record.image || record.featured_image, -1);
  if (primaryImage && !images.some((image) => image.src === primaryImage.src)) {
    images.unshift(primaryImage);
  }

  const variants = (Array.isArray(record.variants) ? record.variants : [])
    .map(normalizeVariant)
    .filter((variant): variant is ShopifyVariant => Boolean(variant));

  // Predictive search returns top-level prices even when variants are omitted.
  if (!variants.length && Number(record.price) > 0) {
    variants.push({
      id,
      title: "Default Title",
      price: normalizeMoney(record.price),
      compare_at_price:
        Number(record.compare_at_price || record.compare_at_price_min) > Number(record.price)
          ? normalizeMoney(record.compare_at_price || record.compare_at_price_min)
          : null,
      available: record.available !== false,
    });
  }

  const averageRating = Number(record.average_rating);
  const totalReviews = Number(record.total_reviews);

  return {
    id,
    title,
    handle,
    body_html: String(record.body_html || record.body || "") || null,
    vendor: String(record.vendor || ""),
    product_type: String(record.product_type || record.type || ""),
    tags: Array.isArray(record.tags) ? record.tags.map(String) : String(record.tags || ""),
    created_at: String(record.created_at || ""),
    published_at: String(record.published_at || "") || null,
    updated_at: String(record.updated_at || ""),
    average_rating:
      Number.isFinite(averageRating) && averageRating > 0
        ? Math.min(5, Math.max(0, averageRating))
        : undefined,
    total_reviews:
      Number.isFinite(totalReviews) && totalReviews > 0
        ? Math.max(0, Math.floor(totalReviews))
        : undefined,
    variants,
    images,
    image: images[0] || null,
  };
}

function normalizeListingPayload(
  input: ListingPayloadInput | null | undefined,
  fallback: LiveProductListingParams,
  source: string,
): LiveProductListingPayload {
  const products = (Array.isArray(input?.products) ? input.products : [])
    .map(normalizeLiveListingProduct)
    .filter((product): product is ShopifyProduct => Boolean(product));
  const page = Math.max(1, Math.floor(Number(input?.page || fallback.page || 1)));
  const pageSize = Math.max(1, Math.floor(Number(input?.pageSize || LIVE_PRODUCT_PAGE_SIZE)));
  const total = Math.max(0, Math.floor(Number(input?.total ?? products.length)));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    generatedAt: String(input?.generatedAt || new Date().toISOString()),
    source: String(input?.source || source),
    kind: fallback.query?.trim() ? "search" : "collection",
    handle: String(input?.handle || fallback.collectionHandle || "all-products").trim().toLowerCase(),
    query: String(input?.query || fallback.query || "").trim(),
    page,
    pageSize,
    total,
    totalPages,
    hasPreviousPage: input?.hasPreviousPage ?? page > 1,
    hasNextPage: input?.hasNextPage ?? page < totalPages,
    productTypes: Array.from(
      new Set(
        (Array.isArray(input?.productTypes) ? input.productTypes : products.map((product) => product.product_type))
          .map((entry) => String(entry || "").trim())
          .filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right)),
    products,
  };
}

function sortValue(sort: string | undefined, isSearch: boolean): string {
  const values: Record<string, string> = {
    "title-asc": "title-ascending",
    "title-desc": "title-descending",
    "price-asc": "price-ascending",
    "price-desc": "price-descending",
    newest: "created-descending",
    featured: isSearch ? "relevance" : "manual",
    discount: isSearch ? "relevance" : "best-selling",
  };
  return values[String(sort || "featured")] || (isSearch ? "relevance" : "manual");
}

function buildListingPath(params: LiveProductListingParams): string {
  const query = String(params.query || "").trim();
  const isSearch = Boolean(query);
  const handle = String(params.collectionHandle || "all-products").trim().toLowerCase();
  const searchParams = new URLSearchParams();

  searchParams.set("section_id", "salt-product-data");
  searchParams.set("page", String(Math.max(1, Math.floor(Number(params.page || 1)))));
  searchParams.set("sort_by", sortValue(params.sort, isSearch));
  if (isSearch) {
    searchParams.set("q", query);
    searchParams.set("type", "product");
  }
  if (params.productType?.trim()) searchParams.set("filter.p.product_type", params.productType.trim());
  if (params.minPrice != null) searchParams.set("filter.v.price.gte", String(params.minPrice));
  if (params.maxPrice != null) searchParams.set("filter.v.price.lte", String(params.maxPrice));

  const route = isSearch ? "/search" : `/collections/${encodeURIComponent(handle)}`;
  return `${route}?${searchParams.toString()}`;
}

function extractSectionPayload(markup: string): Partial<LiveProductListingPayload> | null {
  let html = markup;
  try {
    const parsed = JSON.parse(markup) as Record<string, unknown>;
    const sectionHtml = parsed["salt-product-data"];
    if (typeof sectionHtml === "string") html = sectionHtml;
  } catch {
    // A singular section request returns HTML directly.
  }

  const match = html.match(
    /<script[^>]+id=["']salt-product-listing-data["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!match?.[1]) return null;

  try {
    return JSON.parse(match[1]) as Partial<LiveProductListingPayload>;
  } catch {
    return null;
  }
}

function getInlineListing(params: LiveProductListingParams): LiveProductListingPayload | undefined {
  if (typeof window === "undefined") return undefined;
  const page = Math.max(1, Math.floor(Number(params.page || 1)));
  const query = String(params.query || "").trim();
  const hasFilters = Boolean(
    params.productType?.trim() || params.minPrice != null || params.maxPrice != null || (params.sort && params.sort !== "featured"),
  );
  const preloadWindow = window as ListingPreloadWindow;

  if (query) {
    const inline = preloadWindow.__SALT_SEARCH_PREFETCH__;
    if (
      hasFilters ||
      !inline ||
      String(inline.query || "").trim() !== query ||
      Number(inline.page || 1) !== page
    ) {
      return undefined;
    }
    return normalizeListingPayload(inline, params, "shopify-liquid:search");
  }

  const inline = preloadWindow.__SALT_COLLECTION_PREFETCH__;
  const handle = String(params.collectionHandle || "all-products").trim().toLowerCase();
  if (
    !inline ||
    hasFilters ||
    String(inline.handle || "").trim().toLowerCase() !== handle ||
    Number(inline.currentPage || 1) !== page
  ) {
    return undefined;
  }

  return normalizeListingPayload(
    {
      generatedAt: inline.generatedAt,
      source: `shopify-liquid:${handle}`,
      kind: "collection",
      handle,
      page,
      pageSize: LIVE_PRODUCT_PAGE_SIZE,
      total: Number(inline.total || 0),
      products: inline.products,
    },
    params,
    `shopify-liquid:${handle}`,
  );
}

async function fetchCollectionFallback(base: string, params: LiveProductListingParams): Promise<LiveProductListingPayload> {
  const handle = String(params.collectionHandle || "all-products").trim().toLowerCase();
  const page = Math.max(1, Math.floor(Number(params.page || 1)));
  const productsUrl = `${base}/collections/${encodeURIComponent(handle)}/products.json?limit=${LIVE_PRODUCT_PAGE_SIZE}&page=${page}&sort_by=${encodeURIComponent(sortValue(params.sort, false))}`;
  const [productsResponse, collectionResponse] = await Promise.all([
    fetch(productsUrl, { cache: "no-store", credentials: "omit" }),
    fetch(`${base}/collections/${encodeURIComponent(handle)}.json`, { cache: "no-store", credentials: "omit" }),
  ]);
  if (!productsResponse.ok) throw new Error(`Collection products request failed (${productsResponse.status})`);

  const productsBody = (await productsResponse.json()) as { products?: ShopifyProduct[] };
  const collectionBody = collectionResponse.ok
    ? ((await collectionResponse.json()) as { collection?: { products_count?: number } })
    : null;
  const products = (productsBody.products || [])
    .map(normalizeLiveListingProduct)
    .filter((product): product is ShopifyProduct => Boolean(product));
  const total = Number(collectionBody?.collection?.products_count) || products.length;

  return normalizeListingPayload(
    { handle, page, total, products },
    params,
    `${base}/collections/${handle}/products.json`,
  );
}

export async function loadPredictiveProducts(query: string, limit = 6): Promise<ShopifyProduct[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) return [];
  const errors: string[] = [];

  for (const base of getLiveBases()) {
    const searchParams = new URLSearchParams({ q: normalizedQuery });
    searchParams.set("resources[type]", "product");
    searchParams.set("resources[limit]", String(Math.max(1, Math.min(10, Math.floor(limit)))));
    searchParams.set("resources[options][unavailable_products]", "hide");

    try {
      const response = await fetch(`${base}/search/suggest.json?${searchParams.toString()}`, {
        cache: "no-store",
        credentials: "omit",
      });
      if (!response.ok) throw new Error(`predictive search failed (${response.status})`);
      const payload = (await response.json()) as PredictiveSearchPayload;
      return (payload.resources?.results?.products || [])
        .map(normalizeLiveListingProduct)
        .filter((product): product is ShopifyProduct => Boolean(product));
    } catch (error) {
      errors.push(`${base}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  throw new Error(`Live predictive search unavailable. ${errors.slice(0, 3).join(" | ")}`);
}

export async function loadLiveProductListing(
  params: LiveProductListingParams,
): Promise<LiveProductListingPayload> {
  const normalizedParams = {
    ...params,
    collectionHandle: String(params.collectionHandle || "all-products").trim().toLowerCase(),
    query: String(params.query || "").trim(),
    page: Math.max(1, Math.floor(Number(params.page || 1))),
  };
  const path = buildListingPath(normalizedParams);
  const errors: string[] = [];
  const shouldRequestThemeSection =
    typeof window === "undefined" ||
    import.meta.env.MODE === "test" ||
    !isLocalRuntimeHost(window.location.hostname);

  if (shouldRequestThemeSection) {
    for (const base of getLiveBases()) {
      try {
        const response = await fetch(`${base}${path}`, { cache: "no-store", credentials: "omit" });
        if (!response.ok) {
          errors.push(`${base}: section request failed (${response.status})`);
          // A 404 means the currently published theme does not contain this
          // section yet. Cross-origin retries cannot fix that and only create
          // noisy CORS errors, so move directly to the public JSON fallback.
          if (response.status === 404) break;
          continue;
        }
        const payload = extractSectionPayload(await response.text());
        if (!payload) throw new Error("dynamic product section is unavailable");
        return normalizeListingPayload(payload, normalizedParams, `${base}${path}`);
      } catch (error) {
        errors.push(`${base}: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
  }

  if (!normalizedParams.query) {
    for (const base of getLiveBases()) {
      try {
        return await fetchCollectionFallback(base, normalizedParams);
      } catch (error) {
        errors.push(`${base}: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
  } else {
    const products = await loadPredictiveProducts(normalizedParams.query, 10);
    return normalizeListingPayload(
      { query: normalizedParams.query, page: 1, total: products.length, products },
      normalizedParams,
      "shopify-predictive-search-fallback",
    );
  }

  throw new Error(`Live Shopify listing unavailable. ${errors.slice(0, 5).join(" | ")}`);
}

export async function loadCollectionPreviewProducts(handle: string, limit = 12): Promise<ShopifyProduct[]> {
  const safeLimit = Math.max(1, Math.min(36, Math.floor(limit)));
  const errors: string[] = [];

  for (const base of getLiveBases()) {
    try {
      const response = await fetch(
        `${base}/collections/${encodeURIComponent(handle)}/products.json?limit=${safeLimit}&page=1&sort_by=manual`,
        { cache: "no-store", credentials: "omit" },
      );
      if (!response.ok) throw new Error(`collection preview failed (${response.status})`);
      const payload = (await response.json()) as { products?: ShopifyProduct[] };
      return (payload.products || [])
        .map(normalizeLiveListingProduct)
        .filter((product): product is ShopifyProduct => Boolean(product));
    } catch (error) {
      errors.push(`${base}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  throw new Error(`Collection preview unavailable for ${handle}. ${errors.slice(0, 3).join(" | ")}`);
}

export function useLiveProductListing(params: LiveProductListingParams, enabled = true) {
  const inline = getInlineListing(params);
  return useQuery({
    queryKey: [
      "live-product-listing",
      String(params.collectionHandle || "all-products").trim().toLowerCase(),
      String(params.query || "").trim().toLowerCase(),
      Math.max(1, Math.floor(Number(params.page || 1))),
      params.sort || "featured",
      params.productType || "",
      params.minPrice ?? null,
      params.maxPrice ?? null,
    ],
    queryFn: () => loadLiveProductListing(params),
    enabled,
    initialData: inline,
    initialDataUpdatedAt: inline ? Date.now() : undefined,
    staleTime: LIVE_LISTING_STALE_TIME_MS,
    placeholderData: (previousData) => previousData,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 2,
  });
}

export function usePredictiveProducts(query: string, limit = 6, enabled = true) {
  const normalizedQuery = query.trim();
  return useQuery({
    queryKey: ["predictive-products", normalizedQuery.toLowerCase(), limit],
    queryFn: () => loadPredictiveProducts(normalizedQuery, limit),
    enabled: enabled && normalizedQuery.length >= 2,
    staleTime: PREDICTIVE_SEARCH_STALE_TIME_MS,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
