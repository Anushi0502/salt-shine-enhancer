import { useQuery } from "@tanstack/react-query";
import type {
  CollectionProductsPayload,
  CollectionsPayload,
  ProductsPayload,
  ShopifyCollection,
  ShopifyProduct,
} from "@/types/shopify";
import { seedCollectionsPayload, seedProductsPayload } from "@/lib/seed-data";

const SHOP_BASE = import.meta.env.VITE_SALT_SHOP_URL || "https://saltonlinestore.com";
const DATA_MODE = (import.meta.env.VITE_DATA_MODE || "snapshot") as
  | "live"
  | "snapshot"
  | "seed"
  | "hybrid";
const PAGE_LIMIT = Number(import.meta.env.VITE_SALT_PAGE_LIMIT || 250);

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return (await response.json()) as T;
}

async function fetchAllProductsFromLive(): Promise<ShopifyProduct[]> {
  const allProducts: ShopifyProduct[] = [];
  let page = 1;

  while (true) {
    const url = `${SHOP_BASE}/products.json?limit=${PAGE_LIMIT}&page=${page}`;
    const payload = await fetchJson<{ products: ShopifyProduct[] }>(url);

    allProducts.push(...payload.products);

    if (payload.products.length < PAGE_LIMIT) {
      break;
    }

    page += 1;
  }

  return allProducts;
}

async function fetchAllCollectionsFromLive(): Promise<ShopifyCollection[]> {
  const allCollections: ShopifyCollection[] = [];
  let page = 1;

  while (true) {
    const url = `${SHOP_BASE}/collections.json?limit=${PAGE_LIMIT}&page=${page}`;
    const payload = await fetchJson<{ collections: ShopifyCollection[] }>(url);

    allCollections.push(...payload.collections);

    if (payload.collections.length < PAGE_LIMIT) {
      break;
    }

    page += 1;
  }

  return allCollections;
}

export async function loadProducts(): Promise<ProductsPayload> {
  if (DATA_MODE === "seed") {
    return seedProductsPayload;
  }

  if (DATA_MODE === "live" || DATA_MODE === "hybrid") {
    try {
      const products = await fetchAllProductsFromLive();
      return {
        generatedAt: new Date().toISOString(),
        source: SHOP_BASE,
        total: products.length,
        products,
      };
    } catch {
      // Fall back to snapshot data when live fetch is blocked by CORS or rate limits.
    }
  }

  if (DATA_MODE === "snapshot" || DATA_MODE === "hybrid" || DATA_MODE === "live") {
    try {
      return await fetchJson<ProductsPayload>("/data/products.json");
    } catch {
      // Fall back to embedded seed catalog when snapshots are unavailable.
    }
  }

  return seedProductsPayload;
}

export async function loadCollections(): Promise<CollectionsPayload> {
  if (DATA_MODE === "seed") {
    return seedCollectionsPayload;
  }

  if (DATA_MODE === "live" || DATA_MODE === "hybrid") {
    try {
      const collections = await fetchAllCollectionsFromLive();
      return {
        generatedAt: new Date().toISOString(),
        source: SHOP_BASE,
        total: collections.length,
        collections,
      };
    } catch {
      // Fall back to snapshot data when live fetch is blocked by CORS or rate limits.
    }
  }

  if (DATA_MODE === "snapshot" || DATA_MODE === "hybrid" || DATA_MODE === "live") {
    try {
      return await fetchJson<CollectionsPayload>("/data/collections.json");
    } catch {
      // Fall back to embedded seed catalog when snapshots are unavailable.
    }
  }

  return seedCollectionsPayload;
}

export async function loadCollectionProductsMap(): Promise<CollectionProductsPayload> {
  try {
    return await fetchJson<CollectionProductsPayload>("/data/collection-products.json");
  } catch {
    return {
      generatedAt: new Date().toISOString(),
      source: SHOP_BASE,
      totalCollections: 0,
      collections: {},
    };
  }
}

export function useProducts() {
  return useQuery({
    queryKey: ["products", DATA_MODE],
    queryFn: loadProducts,
    staleTime: 15 * 60 * 1000,
  });
}

export function useCollections() {
  return useQuery({
    queryKey: ["collections", DATA_MODE],
    queryFn: loadCollections,
    staleTime: 15 * 60 * 1000,
  });
}

export function useCollectionProductsMap() {
  return useQuery({
    queryKey: ["collection-products", DATA_MODE],
    queryFn: loadCollectionProductsMap,
    staleTime: 15 * 60 * 1000,
  });
}
