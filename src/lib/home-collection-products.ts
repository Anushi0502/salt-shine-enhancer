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

async function loadHomeCollectionProducts(): Promise<HomeCollectionProductsPayload> {
  try {
    const response = await fetch(resolveThemeAsset("/data/home-collection-products.json"), {
      // Keep homepage merchandising realtime, but let unchanged Shopify assets
      // use conditional requests instead of downloading the same JSON again.
      cache: "no-cache",
    });
    if (!response.ok) throw new Error("Homepage collection products are unavailable");
    return (await response.json()) as HomeCollectionProductsPayload;
  } catch {
    return EMPTY_PAYLOAD;
  }
}

export function useHomeCollectionProducts() {
  return useQuery({
    queryKey: ["home-collection-products", "catalog"],
    queryFn: loadHomeCollectionProducts,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    retry: false,
  });
}
