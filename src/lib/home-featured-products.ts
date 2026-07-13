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
  quirkyGiftPicks: HomeFeaturedProduct[];
};

const HOME_FEATURED_PRODUCTS_PATH = "/data/home-featured-products.json";
const HOME_FEATURED_PRODUCTS_QUERY_KEY = ["home-featured-products", "catalog"] as const;
const HOME_FEATURED_PRODUCTS_STALE_TIME_MS = 30 * 60 * 1000;

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

export async function loadHomeFeaturedProducts(): Promise<HomeFeaturedProductsPayload> {
  try {
    const url = resolveThemeAsset(HOME_FEATURED_PRODUCTS_PATH);
    const response = await fetch(url, { cache: "force-cache" });

    if (!response.ok || !/json/i.test(response.headers.get("content-type") || "")) {
      throw new Error("Catalog-backed home products are unavailable");
    }

    const payload = (await response.json()) as Partial<HomeFeaturedProductsPayload>;
    const quirkyGiftPicks = Array.isArray(payload.quirkyGiftPicks)
      ? payload.quirkyGiftPicks.map(normalizeProduct).filter((product): product is HomeFeaturedProduct => Boolean(product))
      : [];

    return {
      generatedAt: payload.generatedAt || new Date().toISOString(),
      source: `cache:${payload.source || HOME_FEATURED_PRODUCTS_PATH}`,
      total: quirkyGiftPicks.length,
      quirkyGiftPicks,
    };
  } catch {
    return {
      generatedAt: new Date().toISOString(),
      source: `cache:${HOME_FEATURED_PRODUCTS_PATH}`,
      total: 0,
      quirkyGiftPicks: [],
    };
  }
}

export function useHomeFeaturedProducts(enabled = true) {
  return useQuery({
    queryKey: HOME_FEATURED_PRODUCTS_QUERY_KEY,
    queryFn: loadHomeFeaturedProducts,
    enabled,
    staleTime: HOME_FEATURED_PRODUCTS_STALE_TIME_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    retry: false,
  });
}
