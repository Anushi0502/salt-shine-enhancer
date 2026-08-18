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
    everydayEssentials: HomeCollectionSection;
    womensBeautyEssentials: HomeCollectionSection;
    portableGadgets: HomeCollectionSection;
    travelOutdoor: HomeCollectionSection;
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
    everydayEssentials: EMPTY_SECTION("Everyday Essentials", "everyday-essentials"),
    womensBeautyEssentials: EMPTY_SECTION("Women's Beauty Essentials", "womens-beauty-essentials"),
    portableGadgets: EMPTY_SECTION("Portable Gadgets", "portable-gadgets"),
    travelOutdoor: EMPTY_SECTION("Travel & Outdoor", "travel-outdoor"),
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
      // Keep homepage merchandising realtime, but let unchanged Shopify assets
      // use conditional requests instead of downloading the same JSON again.
      cache: "no-cache",
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
    staleTime: 0,
    // The theme starts the same no-cache request before React evaluates. Do
    // not immediately issue a second request and delay the first usable hero.
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
