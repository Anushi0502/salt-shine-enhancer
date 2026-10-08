import bestsellersBanner from "@/assets/collection-banners/bestsellers-collection-banner.webp";
import footwearBanner from "@/assets/collection-banners/footwear-collection-banner.webp";
import kidsBanner from "@/assets/collection-banners/kids-collection-banner.webp";
import luxuryFragrancesBanner from "@/assets/collection-banners/luxury-fragrances-collection-banner.webp";
import menBanner from "@/assets/collection-banners/men-collection-banner.webp";
import womenBanner from "@/assets/collection-banners/women-collection-banner.webp";
import type { ShopifyCollection } from "@/types/shopify";

export type WebsiteCollectionBanner = {
  image: string;
  alt: string;
};

const BANNERS_BY_HANDLE: Record<string, WebsiteCollectionBanner> = {
  kids: {
    image: kidsBanner,
    alt: "Kids collection banner",
  },
  footwear: {
    image: footwearBanner,
    alt: "Footwear collection banner",
  },
  "best-sellers": {
    image: bestsellersBanner,
    alt: "Best Sellers collection banner",
  },
  "appplaza-best-sellers": {
    image: bestsellersBanner,
    alt: "Best Sellers collection banner",
  },
  "luxury-fragrances": {
    image: luxuryFragrancesBanner,
    alt: "Luxury Fragrances collection banner",
  },
  men: {
    image: menBanner,
    alt: "Men collection banner",
  },
  "men-collection": {
    image: menBanner,
    alt: "Men collection banner",
  },
  women: {
    image: womenBanner,
    alt: "Women collection banner",
  },
};

function normalizeBannerHandle(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

export function getWebsiteCollectionBanner(
  collectionOrHandle?: ShopifyCollection | string | null,
): WebsiteCollectionBanner | null {
  if (!collectionOrHandle) {
    return null;
  }

  const handle =
    typeof collectionOrHandle === "string" ? collectionOrHandle : collectionOrHandle.handle;
  const byHandle = BANNERS_BY_HANDLE[normalizeBannerHandle(handle)];
  if (byHandle) {
    return byHandle;
  }

  if (typeof collectionOrHandle === "string") {
    return null;
  }

  return BANNERS_BY_HANDLE[normalizeBannerHandle(collectionOrHandle.title)] || null;
}
