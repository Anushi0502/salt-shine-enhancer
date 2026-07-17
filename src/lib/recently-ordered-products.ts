import { useQuery } from "@tanstack/react-query";
import { resolveThemeAsset } from "@/lib/theme-assets";

export type RecentlyOrderedProduct = {
  id: string;
  title: string;
  handle: string;
  image: string;
  imageAlt: string;
  price: number | null;
};

export type RecentlyOrderedProductsPayload = {
  generatedAt: string;
  source: string;
  total: number;
  products: RecentlyOrderedProduct[];
};

const DATA_PATH = "/data/recently-ordered-products.json";
const EMPTY_PAYLOAD: RecentlyOrderedProductsPayload = {
  generatedAt: "",
  source: "unavailable",
  total: 0,
  products: [],
};

function isPayload(value: unknown): value is RecentlyOrderedProductsPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RecentlyOrderedProductsPayload>;
  return Array.isArray(candidate.products);
}

async function fetchPayload(url: string): Promise<RecentlyOrderedProductsPayload | null> {
  try {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    return isPayload(payload) ? payload : null;
  } catch {
    return null;
  }
}

async function loadRecentlyOrderedProducts(): Promise<RecentlyOrderedProductsPayload> {
  const themeAsset = resolveThemeAsset(DATA_PATH);
  const isShopifyTheme =
    typeof window !== "undefined" && Boolean(window.SALT_THEME_ASSETS?.[DATA_PATH]);
  const sources = isShopifyTheme
    ? [themeAsset]
    : ["/api/shopify/recently-ordered-products", themeAsset];

  for (const source of sources) {
    const payload = await fetchPayload(source);
    if (payload?.products.length) return payload;
  }

  return EMPTY_PAYLOAD;
}

export function useRecentlyOrderedProducts() {
  return useQuery({
    queryKey: ["recently-ordered-products", "shopify"],
    queryFn: loadRecentlyOrderedProducts,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
