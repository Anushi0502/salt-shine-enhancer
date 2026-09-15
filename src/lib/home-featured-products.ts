import { useQuery } from "@tanstack/react-query";
import { compareAt, minPrice, productImage } from "@/lib/formatters";
import { loadCollectionPreviewProducts } from "@/lib/live-product-listings";
import type { ShopifyProduct } from "@/types/shopify";

export type HomeFeaturedProduct = {
  id: number;
  title: string;
  handle: string;
  image: string;
  price: number;
  compareAtPrice: number | null;
  averageRating: number | null;
  reviewCount: number | null;
};

export type HomeFeaturedProductsPayload = {
  generatedAt: string;
  source: string;
  total: number;
  sources?: {
    bestSellerProducts?: string;
    quirkyGiftPicks?: string;
    everydayEssentialProducts?: string;
    giftFinderProducts?: string;
  };
  bestSellerProducts: HomeFeaturedProduct[];
  quirkyGiftPicks: HomeFeaturedProduct[];
  everydayEssentialProducts: HomeFeaturedProduct[];
  giftFinderProducts: HomeFeaturedProduct[];
};

type SaltHomePreloadWindow = Window & {
  __SALT_HOME_PREFETCH__?: Partial<HomeFeaturedProductsPayload>;
};

const HOME_FEATURED_PRODUCTS_QUERY_KEY = ["home-featured-products", "catalog"] as const;
const HOME_FEATURED_PRODUCTS_STALE_TIME_MS = 60 * 1000;

function toHomeFeaturedProduct(product: ShopifyProduct): HomeFeaturedProduct | null {
  const image = productImage(product) || "";
  const price = minPrice(product);
  if (!product.id || !product.title || !product.handle || !image || price <= 0) return null;

  const compareAtPrice = compareAt(product);
  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    image,
    price,
    compareAtPrice: compareAtPrice > price ? compareAtPrice : null,
    averageRating: Number(product.average_rating) > 0 ? Number(product.average_rating) : null,
    reviewCount: Number(product.total_reviews) > 0 ? Number(product.total_reviews) : null,
  };
}

function normalizeProduct(input: Partial<HomeFeaturedProduct> | null | undefined): HomeFeaturedProduct | null {
  const id = Number(input?.id || 0);
  const title = String(input?.title || "").replace(/\s+/g, " ").trim();
  const handle = String(input?.handle || "").trim();
  const image = String(input?.image || "").trim();
  const price = Number(input?.price);
  const compareAtPrice = Number(input?.compareAtPrice);
  const averageRating = Number(input?.averageRating);
  const reviewCount = Number(input?.reviewCount);

  if (!id || !title || !handle || !image || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  return {
    id,
    title,
    handle,
    image,
    price,
    compareAtPrice: Number.isFinite(compareAtPrice) && compareAtPrice > price ? compareAtPrice : null,
    averageRating: Number.isFinite(averageRating) && averageRating > 0 ? averageRating : null,
    reviewCount: Number.isFinite(reviewCount) && reviewCount > 0 ? Math.floor(reviewCount) : null,
  };
}

function normalizeProducts(input: unknown): HomeFeaturedProduct[] {
  return Array.isArray(input)
    ? input.map(normalizeProduct).filter((product): product is HomeFeaturedProduct => Boolean(product))
    : [];
}

function dedupeProducts(products: HomeFeaturedProduct[]): HomeFeaturedProduct[] {
  const seen = new Set<string>();

  return products.filter((product) => {
    const key = `${product.id}:${product.handle}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getInlineHomeProducts(): HomeFeaturedProductsPayload | undefined {
  if (typeof window === "undefined" || window.location.pathname !== "/") {
    return undefined;
  }

  const payload = (window as SaltHomePreloadWindow).__SALT_HOME_PREFETCH__;
  if (!payload) {
    return undefined;
  }

  const bestSellerProducts = normalizeProducts(payload.bestSellerProducts);
  const quirkyGiftPicks = normalizeProducts(payload.quirkyGiftPicks);
  const everydayEssentialProducts = normalizeProducts(payload.everydayEssentialProducts);
  const giftFinderProducts = dedupeProducts(normalizeProducts(payload.giftFinderProducts));
  if (
    !bestSellerProducts.length &&
    !quirkyGiftPicks.length &&
    !everydayEssentialProducts.length &&
    !giftFinderProducts.length
  ) {
    return undefined;
  }

  return {
    generatedAt: payload.generatedAt || new Date().toISOString(),
    source: payload.source || "shopify-liquid:home",
    total: bestSellerProducts.length,
    sources: payload.sources,
    bestSellerProducts,
    quirkyGiftPicks,
    everydayEssentialProducts,
    giftFinderProducts,
  };
}

export async function loadHomeFeaturedProducts(): Promise<HomeFeaturedProductsPayload> {
  const [bestSellerResult, underFiftyResult, giftCollectionResult] = await Promise.allSettled([
    loadCollectionPreviewProducts("best-sellers", 12),
    loadCollectionPreviewProducts("under-50", 24),
    loadCollectionPreviewProducts("gifts", 12),
  ]);
  const toHomeProducts = (result: PromiseSettledResult<ShopifyProduct[]>): HomeFeaturedProduct[] =>
    result.status === "fulfilled"
      ? result.value.map(toHomeFeaturedProduct).filter((product): product is HomeFeaturedProduct => Boolean(product))
      : [];
  const bestSellerProducts = toHomeProducts(bestSellerResult);
  const underFiftyProducts = toHomeProducts(underFiftyResult);
  const giftCollectionProducts = toHomeProducts(giftCollectionResult);
  const giftFinderProducts = dedupeProducts([
    ...underFiftyProducts,
    ...giftCollectionProducts,
    ...bestSellerProducts,
  ]);

  return {
    generatedAt: new Date().toISOString(),
    source: "shopify-live:best-sellers+under-50+gifts",
    total: bestSellerProducts.length,
    sources: {
      bestSellerProducts: "best-sellers",
      giftFinderProducts: "under-50+gifts+best-sellers",
    },
    bestSellerProducts,
    quirkyGiftPicks: [],
    everydayEssentialProducts: [],
    giftFinderProducts,
  };
}

export function useHomeFeaturedProducts(enabled = true) {
  const inlineProducts = getInlineHomeProducts();

  return useQuery({
    queryKey: HOME_FEATURED_PRODUCTS_QUERY_KEY,
    queryFn: loadHomeFeaturedProducts,
    enabled,
    initialData: inlineProducts,
    staleTime: HOME_FEATURED_PRODUCTS_STALE_TIME_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    retry: false,
  });
}
