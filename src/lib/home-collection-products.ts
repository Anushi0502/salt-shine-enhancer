import { useQuery } from "@tanstack/react-query";
import { compareAt, minPrice, productImage } from "@/lib/formatters";
import { loadCollectionPreviewProducts } from "@/lib/live-product-listings";
import type { ShopifyProduct } from "@/types/shopify";

export type HomeCollectionProduct = {
  id: number;
  title: string;
  handle: string;
  image: string;
  price: number;
  compareAtPrice: number | null;
  averageRating: number | null;
  reviewCount: number | null;
};

export type HomeCollectionSection = {
  title: string;
  handle: string;
  products: HomeCollectionProduct[];
};

export type HomeCollectionProductsPayload = {
  generatedAt: string;
  source: string;
  sections: {
    animeCollectables: HomeCollectionSection;
    creatorEssentials: HomeCollectionSection;
    lipCare: HomeCollectionSection;
    watches: HomeCollectionSection;
    glamEyePalettes: HomeCollectionSection;
  };
};

const EMPTY_SECTION = (title: string, handle: string): HomeCollectionSection => ({
  title,
  handle,
  products: [],
});

const EMPTY_PAYLOAD: HomeCollectionProductsPayload = {
  generatedAt: "",
  source: "",
  sections: {
    animeCollectables: EMPTY_SECTION("Anime Collectables", "anime-collectables"),
    creatorEssentials: EMPTY_SECTION("Creator Essentials", "creator-essentials"),
    lipCare: EMPTY_SECTION("Lip Care", "lips-and-care"),
    watches: EMPTY_SECTION("Watches", "watches"),
    glamEyePalettes: EMPTY_SECTION("Glam Eye Palettes", "glam-eye-palettes"),
  },
};

type SaltHomeCollectionPreloadWindow = Window & {
  __SALT_HOME_COLLECTION_PREFETCH__?: unknown;
};

const HOME_SECTIONS = [
  ["animeCollectables", "Anime Collectables", "anime-collectables"],
  ["creatorEssentials", "Creator Essentials", "creator-essentials"],
  ["lipCare", "Lip Care", "lips-and-care"],
  ["watches", "Watches", "watches"],
  ["glamEyePalettes", "Glam Eye Palettes", "glam-eye-palettes"],
] as const;

function toHomeCollectionProduct(product: ShopifyProduct): HomeCollectionProduct | null {
  const image = productImage(product) || "";
  const price = minPrice(product);
  if (!product.id || !product.handle || !product.title || !image || price <= 0) return null;

  const compareAtPrice = compareAt(product);
  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    image,
    price,
    compareAtPrice: compareAtPrice > price ? compareAtPrice : null,
    averageRating: Number(product.average_rating) > 0 ? Number(product.average_rating) : null,
    reviewCount: Number(product.total_reviews) > 0 ? Number(product.total_reviews) : null,
  };
}

function normalizeHomeCollectionPayload(input: unknown): HomeCollectionProductsPayload {
  if (!input || typeof input !== "object") {
    return EMPTY_PAYLOAD;
  }

  const payload = input as Partial<HomeCollectionProductsPayload>;
  const sections = payload.sections;
  if (!sections || typeof sections !== "object") {
    return EMPTY_PAYLOAD;
  }

  const sectionEntries = Object.entries(EMPTY_PAYLOAD.sections).map(([key, fallback]) => {
    const section = sections[key as keyof typeof sections];
    if (!section || typeof section !== "object") {
      return [key, fallback] as const;
    }

    const products = Array.isArray(section.products)
      ? section.products.filter(
          (product): product is HomeCollectionProduct =>
            Boolean(
              product &&
                typeof product === "object" &&
                Number(product.id) > 0 &&
                String(product.title || "").trim() &&
                String(product.handle || "").trim() &&
                String(product.image || "").trim(),
            ),
        ).map((product) => ({
          ...product,
          averageRating: Number(product.averageRating) > 0 ? Number(product.averageRating) : null,
          reviewCount: Number(product.reviewCount) > 0 ? Math.floor(Number(product.reviewCount)) : null,
        }))
      : [];

    return [
      key,
      {
        title: String(section.title || fallback.title),
        handle: String(section.handle || fallback.handle),
        products,
      },
    ] as const;
  });

  return {
    generatedAt: String(payload.generatedAt || new Date().toISOString()),
    source: String(payload.source || "shopify-liquid:home-collections"),
    sections: Object.fromEntries(sectionEntries) as HomeCollectionProductsPayload["sections"],
  };
}

function getHomeCollectionPrefetch(): HomeCollectionProductsPayload | undefined {
  if (typeof window === "undefined" || window.location.pathname !== "/") {
    return undefined;
  }

  const preload = (window as SaltHomeCollectionPreloadWindow).__SALT_HOME_COLLECTION_PREFETCH__;
  if (!preload || typeof (preload as Promise<unknown>).then === "function") return undefined;
  const normalized = normalizeHomeCollectionPayload(preload);
  return Object.values(normalized.sections).some((section) => section.products.length) ? normalized : undefined;
}

async function loadHomeCollectionProducts(): Promise<HomeCollectionProductsPayload> {
  const sectionEntries = await Promise.all(
    HOME_SECTIONS.map(async ([key, title, handle]) => {
      const products = (await loadCollectionPreviewProducts(handle, 12))
        .map(toHomeCollectionProduct)
        .filter((product): product is HomeCollectionProduct => Boolean(product));
      return [key, { title, handle, products }] as const;
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    source: "shopify-live:home-collections",
    sections: Object.fromEntries(sectionEntries) as HomeCollectionProductsPayload["sections"],
  };
}

export function useHomeCollectionProducts() {
  const prefetch = getHomeCollectionPrefetch();

  return useQuery({
    queryKey: ["home-collection-products", "catalog"],
    queryFn: loadHomeCollectionProducts,
    initialData: prefetch,
    initialDataUpdatedAt: prefetch ? Date.now() : undefined,
    staleTime: 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
