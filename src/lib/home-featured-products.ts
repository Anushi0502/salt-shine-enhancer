import { useQuery } from "@tanstack/react-query";
import { resolveThemeAsset } from "@/lib/theme-assets";

export type HomeFeaturedProduct = {
  id: number;
  title: string;
  handle: string;
  image: string;
  price: number;
  compareAtPrice: number | null;
};

export type HomeFeaturedProductsPayload = {
  generatedAt: string;
  source: string;
  total: number;
  sources?: {
    bestSellerProducts?: string;
    quirkyGiftPicks?: string;
    everydayEssentialProducts?: string;
  };
  bestSellerProducts: HomeFeaturedProduct[];
  quirkyGiftPicks: HomeFeaturedProduct[];
  everydayEssentialProducts: HomeFeaturedProduct[];
};

type SaltHomePreloadWindow = Window & {
  __SALT_HOME_PREFETCH__?: Partial<HomeFeaturedProductsPayload>;
};

const HOME_FEATURED_PRODUCTS_PATH = "/data/home-featured-products.json";
const HOME_FEATURED_PRODUCTS_QUERY_KEY = ["home-featured-products", "catalog"] as const;
const HOME_FEATURED_PRODUCTS_STALE_TIME_MS = 5 * 60 * 1000;

function normalizeProduct(input: Partial<HomeFeaturedProduct> | null | undefined): HomeFeaturedProduct | null {
  const id = Number(input?.id || 0);
  const title = String(input?.title || "").replace(/\s+/g, " ").trim();
  const handle = String(input?.handle || "").trim();
  const image = String(input?.image || "").trim();
  const price = Number(input?.price);
  const compareAtPrice = Number(input?.compareAtPrice);

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
  };
}

function normalizeProducts(input: unknown): HomeFeaturedProduct[] {
  return Array.isArray(input)
    ? input.map(normalizeProduct).filter((product): product is HomeFeaturedProduct => Boolean(product))
    : [];
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
  if (!bestSellerProducts.length && !quirkyGiftPicks.length && !everydayEssentialProducts.length) {
    return undefined;
  }

  return {
    generatedAt: payload.generatedAt || new Date().toISOString(),
    source: payload.source || "shopify-liquid:home",
    total: quirkyGiftPicks.length,
    sources: payload.sources,
    bestSellerProducts,
    quirkyGiftPicks,
    everydayEssentialProducts,
  };
}

export async function loadHomeFeaturedProducts(): Promise<HomeFeaturedProductsPayload> {
  try {
    const url = resolveThemeAsset(HOME_FEATURED_PRODUCTS_PATH);
    // Theme assets are versioned on publish. Reuse the browser/CDN response
    // during a short browsing session instead of revalidating on every mount.
    const response = await fetch(url, { cache: "force-cache" });

    if (!response.ok || !/json/i.test(response.headers.get("content-type") || "")) {
      throw new Error("Catalog-backed home products are unavailable");
    }

    const payload = (await response.json()) as Partial<HomeFeaturedProductsPayload>;
    const bestSellerProducts = normalizeProducts(payload.bestSellerProducts);
    const quirkyGiftPicks = normalizeProducts(payload.quirkyGiftPicks);
    const everydayEssentialProducts = normalizeProducts(payload.everydayEssentialProducts);

    return {
      generatedAt: payload.generatedAt || new Date().toISOString(),
      source: `cache:${payload.source || HOME_FEATURED_PRODUCTS_PATH}`,
      total: quirkyGiftPicks.length,
      sources: payload.sources,
      bestSellerProducts,
      quirkyGiftPicks,
      everydayEssentialProducts,
    };
  } catch {
    return {
      generatedAt: new Date().toISOString(),
      source: `cache:${HOME_FEATURED_PRODUCTS_PATH}`,
      total: 0,
      bestSellerProducts: [],
      quirkyGiftPicks: [],
      everydayEssentialProducts: [],
    };
  }
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
