import { useQuery } from "@tanstack/react-query";
import { resolveThemeAsset } from "@/lib/theme-assets";

export type HomeCollectionProduct = {
  id: number;
  title: string;
  handle: string;
  image: string;
  price: number;
  compareAtPrice: number | null;
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
  __SALT_HOME_COLLECTION_PREFETCH__?: Promise<unknown>;
};

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
        )
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
    source: String(payload.source || HOME_COLLECTION_PRODUCTS_PATH),
    sections: Object.fromEntries(sectionEntries) as HomeCollectionProductsPayload["sections"],
  };
}

function getHomeCollectionPrefetch(): Promise<HomeCollectionProductsPayload> | undefined {
  if (typeof window === "undefined" || window.location.pathname !== "/") {
    return undefined;
  }

  const preload = (window as SaltHomeCollectionPreloadWindow).__SALT_HOME_COLLECTION_PREFETCH__;
  return preload?.then(normalizeHomeCollectionPayload).catch(() => loadHomeCollectionProducts());
}

async function loadHomeCollectionProducts(): Promise<HomeCollectionProductsPayload> {
  try {
    const response = await fetch(resolveThemeAsset("/data/home-collection-products.json"), {
      // Theme assets are versioned on publish. Reuse the browser/CDN response
      // during a short browsing session instead of revalidating on every mount.
      cache: "force-cache",
    });
    if (!response.ok) throw new Error("Homepage collection products are unavailable");
    return normalizeHomeCollectionPayload(await response.json());
  } catch {
    return EMPTY_PAYLOAD;
  }
}

export function useHomeCollectionProducts() {
  const prefetch = getHomeCollectionPrefetch();

  return useQuery({
    queryKey: ["home-collection-products", "catalog"],
    queryFn: () => prefetch || loadHomeCollectionProducts(),
    staleTime: 5 * 60 * 1000,
    // The request is cached for the current browsing session, so navigation
    // back to the homepage does not refetch the same merchandising payload.
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
