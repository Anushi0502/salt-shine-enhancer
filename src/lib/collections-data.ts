import { useQuery } from "@tanstack/react-query";
import type { CollectionsPayload, ShopifyCollection } from "@/types/shopify";
import { resolveThemeAsset } from "@/lib/theme-assets";

const COLLECTIONS_DATA_PATH = "/data/collections.json";
const COLLECTIONS_QUERY_KEY = ["collections", "live"] as const;
const COLLECTIONS_STALE_TIME_MS = 30 * 60 * 1000;

function normalizeText(input: unknown): string {
  return String(input || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCollection(collection: ShopifyCollection): ShopifyCollection {
  return {
    ...collection,
    title: normalizeText(collection.title),
    handle: String(collection.handle || "").trim(),
    description: normalizeText(collection.description),
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

export async function loadCollections(): Promise<CollectionsPayload> {
  try {
    const payload = await fetchThemeJson<CollectionsPayload>(COLLECTIONS_DATA_PATH);
    const collections = Array.isArray(payload?.collections)
      ? payload.collections.map(normalizeCollection).filter((collection) => collection.handle && collection.title)
      : [];

    if (!collections.length) {
      throw new Error("Cached collections payload is empty");
    }

    return {
      generatedAt: payload.generatedAt || new Date().toISOString(),
      source: `cache:${payload.source || COLLECTIONS_DATA_PATH}`,
      total: payload.total || collections.length,
      collections,
    };
  } catch {
    // Home and header both have presentation fallbacks. Avoid a live paginated
    // Shopify crawl when a local or older theme bundle lacks this snapshot.
    return {
      generatedAt: new Date().toISOString(),
      source: `cache:${COLLECTIONS_DATA_PATH}`,
      total: 0,
      collections: [],
    };
  }
}

export function useCollections(enabled = true) {
  return useQuery({
    queryKey: COLLECTIONS_QUERY_KEY,
    queryFn: loadCollections,
    enabled,
    staleTime: COLLECTIONS_STALE_TIME_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    retry: false,
  });
}
