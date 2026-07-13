import weekendSaleBannerImage from "@/assets/weekend-sale-banner.jpg";
import { buildSubcollectionRoute } from "@/lib/site-navigation";
import { resolveThemeAsset } from "@/lib/theme-assets";

const WEEKEND_SALE_COLLECTION_HANDLE = "deals-sale";
const WEEKEND_SALE_SUBCOLLECTION_HANDLE = "under-35";

function normalizeHandle(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function appendQueryParam(url: string, key: string, value: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

// Vite emits root-relative asset paths. Resolve them through the Shopify theme
// asset base so the banner works from every storefront route after bundling.
export const WEEKEND_SALE_BANNER_IMAGE = resolveThemeAsset(weekendSaleBannerImage);
export const WEEKEND_SALE_BANNER_ALT = "Friday Flash Sale weekend sale banner promoting limited-time deals.";
const weekendSaleBaseRoute = buildSubcollectionRoute(
  WEEKEND_SALE_COLLECTION_HANDLE,
  WEEKEND_SALE_SUBCOLLECTION_HANDLE,
);
export const WEEKEND_SALE_ROUTE = appendQueryParam(weekendSaleBaseRoute, "promo", "weekend-sale");

export function isWeekendSaleRoute(collectionHandle: string | null | undefined, subcollectionHandle?: string | null): boolean {
  return (
    normalizeHandle(collectionHandle) === WEEKEND_SALE_COLLECTION_HANDLE &&
    normalizeHandle(subcollectionHandle) === WEEKEND_SALE_SUBCOLLECTION_HANDLE
  );
}
