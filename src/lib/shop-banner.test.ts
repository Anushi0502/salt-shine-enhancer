import { describe, expect, it } from "vitest";
import {
  findBestCollectionForCategory,
  resolveShopBannerImageSelection,
} from "@/lib/shop-banner";
import type { ShopifyCollection } from "@/types/shopify";

function makeCollection(input: {
  id: number;
  title: string;
  handle: string;
  image?: string | null;
  description?: string;
  productsCount?: number;
}): ShopifyCollection {
  return {
    id: input.id,
    title: input.title,
    handle: input.handle,
    description: input.description || "",
    published_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    image: input.image
      ? {
          id: input.id * 10,
          src: input.image,
          alt: input.title,
        }
      : null,
    products_count: input.productsCount ?? 0,
  };
}

const collections: ShopifyCollection[] = [
  makeCollection({
    id: 1,
    title: "All Products",
    handle: "all-products",
    image: "https://cdn.shopify.com/all-products.webp",
    productsCount: 700,
  }),
  makeCollection({
    id: 2,
    title: "COOKWARE",
    handle: "cookware",
    image: "https://cdn.shopify.com/cookware.webp",
    productsCount: 64,
  }),
  makeCollection({
    id: 3,
    title: "PET ACCESSORIES",
    handle: "pet-assocerries",
    image: "https://cdn.shopify.com/pet-accessories.webp",
    productsCount: 35,
  }),
  makeCollection({
    id: 4,
    title: "Cooking Essential",
    handle: "cooking-essential",
    image: null,
    productsCount: 6,
  }),
];

describe("shop banner image selection", () => {
  it("uses the active Shopify collection image when a collection is selected", () => {
    const selection = resolveShopBannerImageSelection({
      collections,
      selectedCollection: collections[1],
      categoryValue: "pet accessories",
    });

    expect(selection.source).toBe("selected-collection");
    expect(selection.collection?.handle).toBe("cookware");
    expect(selection.image).toBe("https://cdn.shopify.com/cookware.webp");
  });

  it("matches a category filter against the best Shopify collection image", () => {
    const matchedCollection = findBestCollectionForCategory(collections, "pet accessories");
    const selection = resolveShopBannerImageSelection({
      collections,
      categoryValue: "pet accessories",
    });

    expect(matchedCollection?.handle).toBe("pet-assocerries");
    expect(selection.source).toBe("matched-category");
    expect(selection.collection?.handle).toBe("pet-assocerries");
    expect(selection.image).toBe("https://cdn.shopify.com/pet-accessories.webp");
  });

  it("falls back to the all-products image when no specific match exists", () => {
    const selection = resolveShopBannerImageSelection({
      collections,
      categoryValue: "office supplies",
    });

    expect(selection.source).toBe("all-products");
    expect(selection.collection?.handle).toBe("all-products");
    expect(selection.image).toBe("https://cdn.shopify.com/all-products.webp");
  });

  it("falls back to all-products when the selected collection has no Shopify image", () => {
    const selection = resolveShopBannerImageSelection({
      collections,
      selectedCollection: collections[3],
      categoryValue: "cooking essential",
    });

    expect(selection.source).toBe("all-products");
    expect(selection.collection?.handle).toBe("all-products");
    expect(selection.image).toBe("https://cdn.shopify.com/all-products.webp");
  });
});
