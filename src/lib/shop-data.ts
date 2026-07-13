import { useQuery } from "@tanstack/react-query";
import type { ShopPayload, ShopifyShop } from "@/types/shopify";
import { resolveThemeAsset } from "@/lib/theme-assets";

const SHOP_DATA_PATH = "/data/shop.json";
const SHOP_QUERY_KEY = ["shop", "live"] as const;
const SHOP_STALE_TIME_MS = 30 * 60 * 1000;

function normalizeName(input: unknown): string {
  return String(input || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeShop(shop: ShopifyShop | null | undefined): ShopifyShop {
  return {
    ...(shop || {}),
    id: String(shop?.id || "shop"),
    name: normalizeName(shop?.name) || "SALT",
    customData: shop?.customData || null,
  };
}

async function fetchThemeJson<T>(path: string): Promise<T> {
  const url = resolveThemeAsset(path);
  const response = await fetch(url, { cache: "force-cache" });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!/json/i.test(contentType)) {
    throw new Error(`Expected JSON but received ${contentType || "unknown content type"} for ${url}`);
  }

  return (await response.json()) as T;
}

export async function loadShop(): Promise<ShopPayload> {
  try {
    const payload = await fetchThemeJson<ShopPayload>(SHOP_DATA_PATH);
    if (!payload?.shop?.name) {
      throw new Error("Cached shop payload is empty");
    }

    return {
      generatedAt: payload.generatedAt || new Date().toISOString(),
      source: `cache:${payload.source || SHOP_DATA_PATH}`,
      shop: normalizeShop(payload.shop),
    };
  } catch {
    return {
      generatedAt: new Date().toISOString(),
      source: `cache:${SHOP_DATA_PATH}`,
      shop: normalizeShop(null),
    };
  }
}

export function useShop(enabled = true) {
  return useQuery({
    queryKey: SHOP_QUERY_KEY,
    queryFn: loadShop,
    enabled,
    staleTime: SHOP_STALE_TIME_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    retry: false,
  });
}
