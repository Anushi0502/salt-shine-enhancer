import { normalizeShopifyAssetUrl } from "@/lib/theme-assets";
import type { ShopifyCollection } from "@/types/shopify";

export type ShopBannerImageSelectionSource =
  | "selected-collection"
  | "matched-category"
  | "all-products"
  | "none";

export type ShopBannerImageSelection = {
  collection: ShopifyCollection | null;
  image: string | null;
  source: ShopBannerImageSelectionSource;
};

function normalizeText(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bassocerries\b/g, "accessories")
    .replace(/\bassoceries\b/g, "accessories")
    .replace(/\bmens\b/g, "men")
    .replace(/\bwomens\b/g, "women")
    .replace(/\s+/g, " ")
    .trim();
}

function expandTokens(value: string): string[] {
  const expanded = new Set<string>();

  normalizeText(value)
    .split(" ")
    .filter(Boolean)
    .forEach((token) => {
      expanded.add(token);

      if (token.endsWith("ies") && token.length > 3) {
        expanded.add(`${token.slice(0, -3)}y`);
      }

      if (token.endsWith("s") && token.length > 3) {
        expanded.add(token.slice(0, -1));
      }
    });

  return Array.from(expanded);
}

function getCollectionImage(collection: ShopifyCollection | null | undefined): string | null {
  return normalizeShopifyAssetUrl(collection?.image?.src);
}

function isAllProductsCollection(collection: ShopifyCollection): boolean {
  const normalizedHandle = normalizeText(collection.handle).replace(/\s+/g, "-");
  const normalizedTitle = normalizeText(collection.title);

  return normalizedHandle === "all-products" || normalizedTitle === "all products";
}

export function findAllProductsCollection(collections: ShopifyCollection[]): ShopifyCollection | null {
  return (
    collections.find((collection) => normalizeText(collection.handle).replace(/\s+/g, "-") === "all-products") ||
    collections.find((collection) => normalizeText(collection.title) === "all products") ||
    null
  );
}

export function findBestCollectionForCategory(
  collections: ShopifyCollection[],
  categoryValue: string,
): ShopifyCollection | null {
  const normalizedCategory = normalizeText(categoryValue);
  if (!normalizedCategory) {
    return null;
  }

  const categoryTokens = expandTokens(categoryValue);
  const coreTokens = normalizedCategory.split(" ").filter(Boolean);

  const rankedMatch = collections
    .map((collection) => {
      const image = getCollectionImage(collection);
      if (!image || isAllProductsCollection(collection)) {
        return null;
      }

      const handleText = normalizeText(collection.handle);
      const titleText = normalizeText(collection.title);
      const descriptionText = normalizeText(collection.description);
      const combinedText = [handleText, titleText, descriptionText].filter(Boolean).join(" ").trim();
      if (!combinedText) {
        return null;
      }

      const collectionTokens = new Set(expandTokens(combinedText));
      const exactHandleMatch = handleText === normalizedCategory;
      const exactTitleMatch = titleText === normalizedCategory;
      const exactCombinedMatch = combinedText === normalizedCategory;
      const handleContainsMatch = handleText.includes(normalizedCategory);
      const titleContainsMatch = titleText.includes(normalizedCategory);
      const combinedContainsMatch = combinedText.includes(normalizedCategory);
      const coreMatches = coreTokens.filter((token) => collectionTokens.has(token)).length;
      const tokenMatches = categoryTokens.filter((token) => collectionTokens.has(token)).length;

      let score = 0;

      if (exactHandleMatch || exactTitleMatch) {
        score += 120;
      }

      if (exactCombinedMatch) {
        score += 96;
      }

      if (handleContainsMatch || titleContainsMatch) {
        score += 56;
      }

      if (combinedContainsMatch) {
        score += 34;
      }

      if (coreTokens.length > 0 && coreMatches === coreTokens.length) {
        score += 28;
      }

      score += tokenMatches * 9;

      if (score <= 0) {
        return null;
      }

      return { collection, score };
    })
    .filter((entry): entry is { collection: ShopifyCollection; score: number } => Boolean(entry))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (right.collection.products_count !== left.collection.products_count) {
        return right.collection.products_count - left.collection.products_count;
      }

      return left.collection.title.localeCompare(right.collection.title);
    })[0];

  return rankedMatch?.collection || null;
}

export function resolveShopBannerImageSelection(input: {
  collections: ShopifyCollection[];
  selectedCollection?: ShopifyCollection | null;
  categoryValue?: string | null;
  routeCollectionHandle?: string | null;
  routeSubcollectionHandle?: string | null;
}): ShopBannerImageSelection {
  const selectedCollection = input.selectedCollection || null;

  if (selectedCollection) {
    const selectedImage = getCollectionImage(selectedCollection);
    if (selectedImage) {
      return {
        collection: selectedCollection,
        image: selectedImage,
        source: "selected-collection",
      };
    }
  }

  const normalizedCategory = normalizeText(input.categoryValue);
  if (!selectedCollection && normalizedCategory) {
    const matchedCollection = findBestCollectionForCategory(input.collections, normalizedCategory);
    const matchedImage = getCollectionImage(matchedCollection);

    if (matchedCollection && matchedImage) {
      return {
        collection: matchedCollection,
        image: matchedImage,
        source: "matched-category",
      };
    }
  }

  const allProductsCollection = findAllProductsCollection(input.collections);
  const allProductsImage = getCollectionImage(allProductsCollection);

  if (allProductsCollection && allProductsImage) {
    return {
      collection: allProductsCollection,
      image: allProductsImage,
      source: "all-products",
    };
  }

  return {
    collection: selectedCollection,
    image: null,
    source: "none",
  };
}
