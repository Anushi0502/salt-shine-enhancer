import weekendSaleBannerImage from "@/assets/weekend-sale-banner.png";
import { buildSubcollectionRoute } from "@/lib/site-navigation";

const WEEKEND_SALE_COLLECTION_HANDLE = "winter-wear";
const WEEKEND_SALE_SUBCOLLECTION_HANDLE = "under-35";

function normalizeHandle(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export const WEEKEND_SALE_BANNER_IMAGE = weekendSaleBannerImage;
export const WEEKEND_SALE_BANNER_ALT = "Friday Flash Sale weekend sale banner promoting limited-time deals.";
export const WEEKEND_SALE_ROUTE = buildSubcollectionRoute(
  WEEKEND_SALE_COLLECTION_HANDLE,
  WEEKEND_SALE_SUBCOLLECTION_HANDLE,
);

export function isWeekendSaleRoute(collectionHandle: string | null | undefined, subcollectionHandle?: string | null): boolean {
  return (
    normalizeHandle(collectionHandle) === WEEKEND_SALE_COLLECTION_HANDLE &&
    normalizeHandle(subcollectionHandle) === WEEKEND_SALE_SUBCOLLECTION_HANDLE
  );
}
