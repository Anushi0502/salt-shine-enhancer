import type { ShopifyCollection } from "@/types/shopify";

/**
 * Designed SALT banners use an exact alt-text marker set by the guarded
 * collection-artwork upload. Keeping the marker in the collection data lets
 * the storefront distinguish the wide editorial artwork from square legacy
 * collection thumbnails without maintaining a second handle list.
 */
export function isDesignedCollectionBanner(collection?: ShopifyCollection | null): boolean {
  const title = String(collection?.title || "").trim().toLowerCase();
  const alt = String(collection?.image?.alt || "").trim().toLowerCase();

  return Boolean(collection?.image?.src && title && alt === `${title} collection banner`);
}
