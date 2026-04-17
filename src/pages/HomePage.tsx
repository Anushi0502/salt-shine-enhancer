import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import Reveal from "@/components/storefront/Reveal";
import ResilientImage from "@/components/storefront/ResilientImage";
import ProductCard from "@/components/storefront/ProductCard";
import { formatMoney, minPrice, productImage, savingsPercent } from "@/lib/formatters";
import { useJudgeMeTestimonials } from "@/lib/judgeme";
import { useCollectionProductIds, useCollections, useProducts } from "@/lib/shopify-data";
import { normalizeShopifyAssetUrl } from "@/lib/theme-assets";
import collectionApparel from "@/assets/collection-apparel.jpg";
import collectionDecor from "@/assets/collection-decor.jpg";
import heroMain from "@/assets/hero-main.jpg";
import productDock from "@/assets/product-dock.jpg";
import productLaptopStand from "@/assets/product-laptop-stand.jpg";
import productPortableStand from "@/assets/product-portable-stand.jpg";
import productTripod from "@/assets/product-tripod.jpg";
import type { ShopifyCollection, ShopifyProduct } from "@/types/shopify";

type ImageTile = {
  title: string;
  image: string;
  to: string;
};

type ProductTile = ImageTile & {
  price: string;
};

type ReviewTile = {
  key: string;
  quote: string;
  author: string;
  rating: number;
  verifiedBuyer: boolean;
};

const HERO_BANNER_ROTATE_MS = 3500;

const categoryTileConfigs = [
  {
    title: "Kitchen",
    to: "/collections/cookware",
    collectionHandles: ["cookware", "kitchen"],
    productKeywords: ["kitchen", "cookware", "pan", "pot"],
  },
  {
    title: "Home",
    to: "/collections/home-decor",
    collectionHandles: ["home-decor", "home", "decor"],
    productKeywords: ["home", "decor", "candle"],
  },
  {
    title: "Gifts",
    to: "/collections/gifts",
    collectionHandles: ["gifts", "gift"],
    productKeywords: ["gift", "present", "planner"],
  },
  {
    title: "Wellness",
    to: "/collections/personal-care",
    collectionHandles: ["personal-care", "wellness", "health"],
    productKeywords: ["wellness", "care", "health", "essential"],
  },
];

const fallbackBestSellerTiles: ProductTile[] = [
  {
    title: "Ceramic Cookware Set",
    price: "$80.99",
    image: "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/Ceramic_Cookware_Set.webp?v=1756373479",
    to: "/products/13-piece-ceramic-cookware-set-nonstick-detachable-handles",
  },
  {
    title: "Aroma Diffuser",
    price: "$35.99",
    image: "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/S4b2af5f653b447a580f6b1509d15acd6I.webp?v=1741589663",
    to: "/products/mini-train-shape-aromatherapy-diffuser-with-led-lamp-1",
  },
  {
    title: "Cozy Home Layer",
    price: "$29.99",
    image: collectionApparel,
    to: "/shop?q=robe",
  },
  {
    title: "Ceramic Bowl Set",
    price: "$40.99",
    image: "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/S8652b5fe8d4042aba9342aef6e7b8468m.webp?v=1755687078",
    to: "/products/japanese-ramen-bowl-set-310ml-cereal-salad-bowl-serving-set-2-4-6-pcs-ceramic-table-wear-oven-safe",
  },
  {
    title: "Portable LED Night Light",
    price: "$25.99",
    image: productTripod,
    to: "/shop?q=night+light",
  },
  {
    title: "Laptop Phone Mount",
    price: "$16.99",
    image: productLaptopStand,
    to: "/shop?q=laptop+mount",
  },
  {
    title: "Living Legacy Planner",
    price: "$55.99",
    image: productPortableStand,
    to: "/shop?q=planner",
  },
  {
    title: "Daily Bloom Journal",
    price: "$49.99",
    image: productDock,
    to: "/shop?q=journal",
  },
];

const giftTileConfigs = [
  {
    title: "Home Decor",
    to: "/collections/home-decor",
    collectionHandles: ["home-decor", "home", "decor"],
    productKeywords: ["home", "decor", "candle", "wall", "vase"],
  },
  {
    title: "Gifts",
    to: "/collections/gifts",
    collectionHandles: ["gifts", "gift"],
    productKeywords: ["gift", "present", "planner", "set"],
  },
  {
    title: "Fun & Unique Finds",
    to: "/shop?q=unique+gift",
    collectionHandles: ["home-decor", "gifts", "gift"],
    productKeywords: ["unique", "home", "decor", "gift"],
  },
];

const fallbackReviewTiles: ReviewTile[] = [
  {
    key: "fallback-review-1",
    quote: "Creating a warm home feels easier when everything is grouped in one calm place.",
    author: "SALT customer",
    rating: 5,
    verifiedBuyer: true,
  },
  {
    key: "fallback-review-2",
    quote: "The layout feels clean, the categories make sense, and checkout is quick.",
    author: "SALT customer",
    rating: 5,
    verifiedBuyer: true,
  },
  {
    key: "fallback-review-3",
    quote: "Beautiful picks, soft colors, and products that feel giftable right away.",
    author: "SALT customer",
    rating: 5,
    verifiedBuyer: true,
  },
];

const stars = Array.from({ length: 5 }, (_, index) => index);
const featuredBookPriority = [
  {
    key: "daily-bloom",
    titleIncludes: ["daily bloom"],
    handleIncludes: ["daily-bloom", "daily_bloom"],
  },
  {
    key: "living-legacy-planner-second-edition",
    titleIncludes: ["living legacy planner", "second edition"],
    handleIncludes: ["living-legacy-planner", "planner-second-edition", "second-edition"],
  },
] as const;

const featuredCourtneyBookHandles = [
  "relics-of-the-century",
  "the-living-legacy-planner",
  "living-legacy-planner-second-edition",
  "daily-bloom-journal",
] as const;

const HERO_EXTRA_BANNERS: ImageTile[] = [
  {
    title: "SALT Banner",
    image: "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/Salt_Banners_1.png?v=1776335459",
    to: "/collections/garden-tools",
  },
  {
    title: "SALT Banner 2",
    image: "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/Salt_Banners_2.png?v=1776337794",
    to: "/collections/unique-products",
  },
  {
    title: "SALT Banner 3",
    image: "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/Salt_Banners_3.png?v=1776337796",
    to: "/collections/summer-collection",
  },
];

const fallbackQuirkyGiftTiles: ProductTile[] = [
  {
    title: "Portable LED Night Light",
    price: "$25.99",
    image: productTripod,
    to: "/shop?q=quirky+gifts",
  },
  {
    title: "Laptop Phone Mount",
    price: "$16.99",
    image: productLaptopStand,
    to: "/shop?q=unique+products",
  },
  {
    title: "Living Legacy Planner",
    price: "$55.99",
    image: productPortableStand,
    to: "/shop?q=gift+ideas",
  },
  {
    title: "Daily Bloom Journal",
    price: "$49.99",
    image: productDock,
    to: "/shop?q=book+gift",
  },
  {
    title: "Aroma Diffuser",
    price: "$35.99",
    image: "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/S4b2af5f653b447a580f6b1509d15acd6I.webp?v=1741589663",
    to: "/shop?q=home+gift",
  },
  {
    title: "Ceramic Bowl Set",
    price: "$40.99",
    image: "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/S8652b5fe8d4042aba9342aef6e7b8468m.webp?v=1755687078",
    to: "/shop?q=unique+kitchen+gift",
  },
  {
    title: "Cozy Home Layer",
    price: "$29.99",
    image: collectionApparel,
    to: "/shop?q=cozy+gift",
  },
  {
    title: "Ceramic Cookware Set",
    price: "$80.99",
    image: "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/Ceramic_Cookware_Set.webp?v=1756373479",
    to: "/shop?q=gift+set",
  },
];

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="grid grid-cols-[minmax(1rem,1fr)_auto_minmax(1rem,1fr)] items-center gap-2.5 sm:gap-4">
      <span className="h-px bg-[#bfd4fb]" />
      <h2 className="font-display text-[clamp(1.12rem,3.15vw,1.65rem)] leading-none text-[#1c4b96]">
        {title}
      </h2>
      <span className="h-px bg-[#bfd4fb]" />
    </div>
  );
}

function normalizeHandle(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
}

function isPriorityBookMatch(
  product: ShopifyProduct,
  target: (typeof featuredBookPriority)[number],
): boolean {
  const title = normalizeText(product.title);
  const handle = normalizeHandle(product.handle);

  const titleMatches = target.titleIncludes.every((token) => title.includes(token));
  const handleMatches = target.handleIncludes.some((token) => handle.includes(token));

  return titleMatches || handleMatches;
}

function findBestSellerCollection(collections: ShopifyCollection[]): ShopifyCollection | null {
  const priorityHandles = [
    "appplaza-best-sellers",
    "best-sellers",
    "best-seller",
    "bestsellers",
    "bestseller",
  ];

  const byHandle = collections.find((collection) =>
    priorityHandles.includes(normalizeHandle(collection.handle)),
  );
  if (byHandle) {
    return byHandle;
  }

  const byTitle = collections.find((collection) => /best\s*[- ]?\s*sellers?/i.test(collection.title));
  return byTitle || null;
}

function productSearchText(product: ShopifyProduct): string {
  const tags = Array.isArray(product.tags) ? product.tags.join(" ") : String(product.tags || "");
  return normalizeText(`${product.title} ${product.product_type} ${tags}`);
}

const HomePage = () => {
  const { data: productsPayload } = useProducts();
  const { data: collectionsPayload } = useCollections();
  const products = useMemo(() => productsPayload?.products ?? [], [productsPayload]);
  const collections = useMemo(() => collectionsPayload?.collections ?? [], [collectionsPayload]);
  const bestSellerCollection = useMemo(
    () => findBestSellerCollection(collections),
    [collections],
  );
  const bestSellerCollectionHandle = bestSellerCollection?.handle || "";
  const { data: bestSellerIdsPayload } = useCollectionProductIds(
    bestSellerCollectionHandle,
    Boolean(bestSellerCollectionHandle),
  );
  const { data: homeDecorIdsPayload } = useCollectionProductIds("home-decor", true);
  const { data: giftsIdsPayload } = useCollectionProductIds("gifts", true);
  const { data: giftIdsPayload } = useCollectionProductIds("gift", true);
  const { data: booksIdsPayload } = useCollectionProductIds("books", true);
  const { data: uniqueProductsIdsPayload } = useCollectionProductIds("unique-products", true);
  const { data: uniqueFindsIdsPayload } = useCollectionProductIds("unique-finds", true);
  const bestSellerProductIds = useMemo(
    () => bestSellerIdsPayload?.productIds ?? [],
    [bestSellerIdsPayload],
  );
  const quirkyGiftProductIds = useMemo(
    () =>
      Array.from(
        new Set([
          ...(uniqueProductsIdsPayload?.productIds ?? []),
          ...(uniqueFindsIdsPayload?.productIds ?? []),
          ...(giftsIdsPayload?.productIds ?? []),
          ...(giftIdsPayload?.productIds ?? []),
        ]),
      ),
    [giftIdsPayload, giftsIdsPayload, uniqueFindsIdsPayload, uniqueProductsIdsPayload],
  );
  const collectionProductIdsByHandle = useMemo(() => {
    const map = new Map<string, number[]>();
    map.set("home-decor", homeDecorIdsPayload?.productIds ?? []);
    map.set("gifts", giftsIdsPayload?.productIds ?? []);
    map.set("gift", giftIdsPayload?.productIds ?? []);
    return map;
  }, [giftIdsPayload, giftsIdsPayload, homeDecorIdsPayload]);
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const featuredCourtneyBooks = useMemo(() => {
    if (!products.length) {
      return [];
    }

    const fromBooksCollection = (booksIdsPayload?.productIds ?? [])
      .map((productId) => productById.get(productId))
      .filter((product): product is ShopifyProduct => Boolean(product));

    const prioritizedByHandle = featuredCourtneyBookHandles
      .map((targetHandle) =>
        products.find((product) => normalizeHandle(product.handle).includes(normalizeHandle(targetHandle))) || null,
      )
      .filter((product): product is ShopifyProduct => Boolean(product));

    const keywordFallback = products.filter((product) => {
      const tokens = new Set(productSearchText(product).split(" ").filter(Boolean));
      return (
        tokens.has("book") ||
        tokens.has("books") ||
        tokens.has("journal") ||
        tokens.has("planner") ||
        tokens.has("legacy") ||
        tokens.has("relics") ||
        tokens.has("courtney") ||
        tokens.has("bloom")
      );
    });

    const uniqueBooks: ShopifyProduct[] = [];
    const seenProductIds = new Set<number>();
    [...fromBooksCollection, ...prioritizedByHandle, ...keywordFallback].forEach((product) => {
      if (seenProductIds.has(product.id)) {
        return;
      }

      seenProductIds.add(product.id);
      uniqueBooks.push(product);
    });

    return uniqueBooks.slice(0, 4);
  }, [booksIdsPayload, productById, products]);
  const featuredCourtneyBooksImage = useMemo(() => {
    const firstBook = featuredCourtneyBooks[0];
    if (!firstBook) {
      return collectionDecor;
    }

    return productImage(firstBook) || collectionDecor;
  }, [featuredCourtneyBooks]);
  const testimonialProductIds = useMemo(
    () =>
      Array.from(
        new Set([
          ...featuredCourtneyBooks.map((product) => product.id),
          ...bestSellerProductIds.slice(0, 8),
          ...quirkyGiftProductIds.slice(0, 8),
          ...products.slice(0, 8).map((product) => product.id),
        ]),
      )
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
        .slice(0, 18),
    [bestSellerProductIds, featuredCourtneyBooks, products, quirkyGiftProductIds],
  );
  const testimonialsQuery = useJudgeMeTestimonials(testimonialProductIds, 12);
  const reviewTiles = useMemo<ReviewTile[]>(() => {
    const liveTestimonials = testimonialsQuery.data ?? [];
    if (!liveTestimonials.length) {
      return fallbackReviewTiles;
    }

    return liveTestimonials.slice(0, 3).map((review, index) => ({
      key: `judgeme-home-${review.productId}-${review.id}-${index}`,
      quote: review.body || review.title,
      author: review.author || "Verified shopper",
      rating: Math.max(1, Math.min(5, Math.round(review.rating) || 5)),
      verifiedBuyer: Boolean(review.verifiedBuyer),
    }));
  }, [testimonialsQuery.data]);
  const bestSellerProducts = useMemo(() => {
    if (!products.length) {
      return [];
    }

    const bestSellerCandidates =
      bestSellerProductIds.length > 0
        ? bestSellerProductIds
            .map((productId) => productById.get(productId))
            .filter((product): product is ShopifyProduct => Boolean(product))
        : [];

    const priorityBooks = featuredBookPriority
      .map((target) => products.find((product) => isPriorityBookMatch(product, target)) || null)
      .filter((product): product is ShopifyProduct => Boolean(product));

    const rankedFallback = [...products]
      .sort((left, right) => {
        const savingsDiff = savingsPercent(right) - savingsPercent(left);
        if (savingsDiff !== 0) {
          return savingsDiff;
        }

        return minPrice(left) - minPrice(right);
      });

    const uniqueProducts: ShopifyProduct[] = [];
    const seenProductIds = new Set<number>();
    [...priorityBooks, ...bestSellerCandidates, ...rankedFallback].forEach((product) => {
      if (seenProductIds.has(product.id)) {
        return;
      }

      seenProductIds.add(product.id);
      uniqueProducts.push(product);
    });

    return uniqueProducts.slice(0, 8);
  }, [bestSellerProductIds, productById, products]);
  const bestSellerTiles = useMemo<ProductTile[]>(() => {
    if (!bestSellerProducts.length) {
      return fallbackBestSellerTiles;
    }

    return bestSellerProducts.map((product) => ({
      title: product.title,
      price: formatMoney(minPrice(product)),
      image: productImage(product) || heroMain,
      to: `/products/${product.handle}`,
    }));
  }, [bestSellerProducts]);
  const everydayEssentialsTiles = useMemo(() => bestSellerTiles.slice(0, 8), [bestSellerTiles]);
  const bestSellerHeroImage =
    normalizeShopifyAssetUrl(bestSellerCollection?.image?.src) || heroMain;
  const quirkyGiftProducts = useMemo(() => {
    if (!products.length) {
      return [];
    }

    const uniqueById = new Set<number>();
    const quirkyKeywordTokens = ["quirky", "unique", "gift", "novelty", "fun", "decor", "gadget"];

    const collectionMatches = quirkyGiftProductIds
      .map((productId) => productById.get(productId))
      .filter((product): product is ShopifyProduct => Boolean(product));

    const keywordMatches = [...products]
      .map((product) => {
        const searchText = productSearchText(product);
        const matchScore = quirkyKeywordTokens.reduce(
          (score, token) => (searchText.includes(token) ? score + 1 : score),
          0,
        );
        return matchScore > 0 ? { product, matchScore } : null;
      })
      .filter((entry): entry is { product: ShopifyProduct; matchScore: number } => Boolean(entry))
      .sort((left, right) => {
        const scoreDiff = right.matchScore - left.matchScore;
        if (scoreDiff !== 0) {
          return scoreDiff;
        }
        return savingsPercent(right.product) - savingsPercent(left.product);
      })
      .map((entry) => entry.product);

    const combinedProducts: ShopifyProduct[] = [];
    [...collectionMatches, ...keywordMatches].forEach((product) => {
      if (uniqueById.has(product.id)) {
        return;
      }

      uniqueById.add(product.id);
      combinedProducts.push(product);
    });

    return combinedProducts.slice(0, 8);
  }, [productById, products, quirkyGiftProductIds]);
  const quirkyGiftTiles = useMemo<ProductTile[]>(() => {
    if (!quirkyGiftProducts.length) {
      return fallbackQuirkyGiftTiles;
    }

    return quirkyGiftProducts.map((product) => ({
      title: product.title,
      price: formatMoney(minPrice(product)),
      image: productImage(product) || bestSellerHeroImage,
      to: `/products/${product.handle}`,
    }));
  }, [bestSellerHeroImage, quirkyGiftProducts]);
  const heroPosterTiles = useMemo<ImageTile[]>(() => [...HERO_EXTRA_BANNERS], []);
  const [activeHeroPosterIndex, setActiveHeroPosterIndex] = useState(0);
  const collectionImageByHandle = useMemo(() => {
    const map = new Map<string, string>();

    collections.forEach((collection) => {
      const image = normalizeShopifyAssetUrl(collection.image?.src);
      if (image) {
        map.set(normalizeHandle(collection.handle), image);
      }
    });

    return map;
  }, [collections]);
  const rankedProductsWithImages = useMemo(
    () =>
      [...products]
        .filter((product) => Boolean(productImage(product)))
        .sort(
          (left, right) =>
            new Date(right.published_at || right.created_at || "1970-01-01").getTime() -
            new Date(left.published_at || left.created_at || "1970-01-01").getTime(),
        ),
    [products],
  );

  const findProductImageByKeywords = useCallback(
    (keywords: string[], usedProductIds?: Set<number>): string | null => {
      const normalizedKeywords = keywords.map((keyword) => normalizeText(keyword)).filter(Boolean);
      const matchedProduct = rankedProductsWithImages.find((product) => {
        if (usedProductIds?.has(product.id)) {
          return false;
        }

        const haystack = productSearchText(product);
        return normalizedKeywords.some((keyword) => haystack.includes(keyword));
      });

      if (matchedProduct) {
        usedProductIds?.add(matchedProduct.id);
        return productImage(matchedProduct);
      }

      const fallbackProduct = rankedProductsWithImages.find(
        (product) => !(usedProductIds && usedProductIds.has(product.id)),
      );

      if (fallbackProduct) {
        usedProductIds?.add(fallbackProduct.id);
        return productImage(fallbackProduct);
      }

      return null;
    },
    [rankedProductsWithImages],
  );
  const findCollectionProductImage = useCallback(
    (collectionHandles: string[], usedProductIds?: Set<number>): string | null => {
      const normalizedHandles = collectionHandles.map((handle) => normalizeHandle(handle)).filter(Boolean);

      for (const handle of normalizedHandles) {
        const productIds = collectionProductIdsByHandle.get(handle) || [];
        for (const productId of productIds) {
          if (usedProductIds?.has(productId)) {
            continue;
          }

          const product = productById.get(productId);
          const image = product ? productImage(product) : null;
          if (image) {
            usedProductIds?.add(productId);
            return image;
          }
        }
      }

      for (const handle of normalizedHandles) {
        const productIds = collectionProductIdsByHandle.get(handle) || [];
        const reusedProduct = productIds
          .map((productId) => productById.get(productId))
          .find((product): product is ShopifyProduct => Boolean(product && productImage(product)));
        if (reusedProduct) {
          return productImage(reusedProduct);
        }
      }

      return null;
    },
    [collectionProductIdsByHandle, productById],
  );

  const categoryTiles = useMemo<ImageTile[]>(() => {
    const seenHandles = new Set<string>();
    const liveCollectionTiles = collections.reduce<ImageTile[]>((acc, collection) => {
      const handle = normalizeHandle(collection.handle);
      if (!handle || seenHandles.has(handle)) {
        return acc;
      }

      seenHandles.add(handle);

      const imageFromCollection = normalizeShopifyAssetUrl(collection.image?.src);
      const keywordTokens = normalizeText(`${collection.title} ${collection.handle}`)
        .split(" ")
        .filter(Boolean)
        .slice(0, 5);
      const imageFromProduct = keywordTokens.length ? findProductImageByKeywords(keywordTokens) : null;

      acc.push({
        title: collection.title || "Collection",
        to: `/collections/${collection.handle}`,
        image: imageFromCollection || imageFromProduct || bestSellerHeroImage,
      });

      return acc;
    }, []);

    if (liveCollectionTiles.length) {
      return liveCollectionTiles;
    }

    return categoryTileConfigs.map((tile) => {
      const imageFromCollection =
        tile.collectionHandles
          .map((handle) => collectionImageByHandle.get(normalizeHandle(handle)) || null)
          .find(Boolean) || null;
      const imageFromProduct = findProductImageByKeywords(tile.productKeywords);

      return {
        title: tile.title,
        to: tile.to,
        image: imageFromCollection || imageFromProduct || bestSellerHeroImage,
      };
    });
  }, [bestSellerHeroImage, collectionImageByHandle, collections, findProductImageByKeywords]);
  const categoryCarouselTiles = useMemo(
    () => (categoryTiles.length > 1 ? [...categoryTiles, ...categoryTiles] : categoryTiles),
    [categoryTiles],
  );

  const giftTiles = useMemo<ImageTile[]>(() => {
    const usedGiftProductIds = new Set<number>();

    const tiles = giftTileConfigs.map((tile) => {
      const imageFromCollectionProduct = findCollectionProductImage(tile.collectionHandles, usedGiftProductIds);
      const imageFromProduct = imageFromCollectionProduct
        ? null
        : findProductImageByKeywords(tile.productKeywords, usedGiftProductIds);
      const imageFromCollection =
        tile.collectionHandles
          .map((handle) => collectionImageByHandle.get(normalizeHandle(handle)) || null)
          .find(Boolean) || null;

      return {
        title: tile.title,
        to: tile.to,
        image: imageFromCollectionProduct || imageFromProduct || imageFromCollection || bestSellerHeroImage,
      };
    });

    if (tiles.length >= 3) {
      const swappedTiles = [...tiles];
      const firstImage = swappedTiles[0].image || bestSellerHeroImage;
      const thirdImage = swappedTiles[2].image || bestSellerHeroImage;
      swappedTiles[0] = { ...swappedTiles[0], image: thirdImage };
      swappedTiles[2] = { ...swappedTiles[2], image: firstImage };
      return swappedTiles;
    }

    return tiles;
  }, [bestSellerHeroImage, collectionImageByHandle, findCollectionProductImage, findProductImageByKeywords]);

  useEffect(() => {
    if (heroPosterTiles.length <= 1) {
      setActiveHeroPosterIndex(0);
      return;
    }

    setActiveHeroPosterIndex((currentIndex) => currentIndex % heroPosterTiles.length);

    const rotationInterval = window.setInterval(() => {
      setActiveHeroPosterIndex((currentIndex) => (currentIndex + 1) % heroPosterTiles.length);
    }, HERO_BANNER_ROTATE_MS);

    return () => {
      window.clearInterval(rotationInterval);
    };
  }, [heroPosterTiles.length]);

  return (
    <section className="mt-2 w-full pb-4 sm:mt-4 sm:pb-6 lg:pb-8">
      <div className="overflow-hidden rounded-[1.1rem] border border-[#c5dbff] bg-[#f8fbff] shadow-[0_28px_80px_-56px_rgba(22,77,160,0.24)] sm:rounded-[1.4rem] lg:rounded-[1.6rem]">
        <Reveal>
          <section className="border-b border-[#dce9ff] p-[10px] sm:p-[30px]">
            <div className="relative overflow-hidden rounded-[1.16rem] border border-[#c8dcff] bg-[#eaf3ff] shadow-[0_22px_44px_-38px_rgba(22,77,160,0.42)]">
              <div
                className="flex transition-transform duration-700 ease-in-out"
                style={{ transform: `translateX(-${activeHeroPosterIndex * 100}%)` }}
              >
                {heroPosterTiles.map((tile, index) => (
                  <Link
                    key={`${tile.to}-${index}`}
                    to={tile.to}
                    className="group block w-full shrink-0"
                    aria-label={tile.title}
                  >
                    <div className="overflow-hidden bg-[#eaf3ff]">
                      <ResilientImage
                        src={tile.image}
                        alt={tile.title}
                        className="block w-full h-auto transition duration-700 ease-out group-hover:scale-[1.01]"
                        fallback={
                          <img
                            src={bestSellerHeroImage}
                            alt={tile.title}
                            className="block w-full h-auto transition duration-700 ease-out group-hover:scale-[1.01]"
                          />
                        }
                      /> 
                      
                    </div>
                  </Link>
                ))}
              </div>
              {heroPosterTiles.length > 1 ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex items-center justify-center gap-2">
                  {heroPosterTiles.map((tile, index) => (
                    <span
                      key={`${tile.to}-dot-${index}`}
                      className={`h-1.5 rounded-full transition-all ${
                        index === activeHeroPosterIndex ? "w-6 bg-white/95" : "w-2 bg-white/55"
                      }`}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        </Reveal>

        <Reveal delayMs={80}>
          <section className="px-3 py-6 sm:px-5 sm:py-7 lg:px-8 lg:py-8">
            <SectionTitle title="Shop by Category" />
            <div className="salt-category-carousel mt-4 sm:mt-5">
              <div className="salt-category-carousel-track">
                {categoryCarouselTiles.map((tile, index) => (
                  <Link
                    key={`${tile.to}-${index}`}
                    to={tile.to}
                    className="group relative block w-[15.75rem] shrink-0 overflow-hidden border border-[#d2e4ff] bg-[#eef5ff] sm:w-[17.4rem] lg:w-[19rem]"
                  >
                    <div className="aspect-[1.26/0.85] overflow-hidden sm:aspect-[1.18/0.8]">
                      <div className="salt-category-scroll-track h-full w-full">
                        <ResilientImage
                          src={tile.image}
                          alt={tile.title}
                          className="h-[114%] w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                          fallback={
                            <img
                              src={bestSellerHeroImage}
                              alt={tile.title}
                              className="h-[114%] w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                            />
                          }
                        />
                      </div>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(14,48,109,0),rgba(14,48,109,0.92))] px-3 py-2.5 text-center">
                      <p className="font-display text-[0.98rem] text-white sm:text-[1.08rem]">
                        {tile.title}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal delayMs={120}>
          <section className="border-t border-[#dce9ff] px-3 py-6 sm:px-5 sm:py-7 lg:px-8 lg:py-8">
            <SectionTitle title="Best Sellers" />
            <div className="mt-5 grid grid-cols-1 gap-3.5 min-[430px]:grid-cols-2 sm:mt-6 sm:gap-4 lg:grid-cols-4 lg:gap-5">
              {bestSellerTiles.map((tile, index) => (
                <Reveal key={tile.title} delayMs={160 + index * 70}>
                  <Link
                    to={tile.to}
                    className="group relative mx-auto block w-[calc(100%-15px)] overflow-hidden border border-[#d2e4ff] bg-[#eef5ff] shadow-[0_14px_30px_-24px_rgba(14,48,109,0.35)]"
                  >
                    <div className="aspect-[1.04/0.93] overflow-hidden sm:aspect-[1/0.9]">
                      <ResilientImage
                        src={tile.image}
                        alt={tile.title}
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                        fallback={
                          <img
                            src={bestSellerHeroImage}
                            alt={tile.title}
                            className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                          />
                        }
                      />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(8,30,73,0.12),rgba(8,30,73,0.9)_40%,rgba(8,30,73,0.98))] px-3 py-2.5 text-center text-white sm:px-3.5 sm:py-3">
                      <p className="line-clamp-2 font-display text-[0.96rem] font-semibold leading-[1.15] drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)] sm:text-[1.08rem]">
                        {tile.title}
                      </p>
                      <p className="mt-1.5 text-[1.24rem] font-black leading-none tracking-[0.01em] text-[#ffe36b] [text-shadow:0_2px_8px_rgba(0,0,0,0.45)] sm:text-[1.38rem]">
                        {tile.price}
                      </p>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </section>
        </Reveal>

        <Reveal delayMs={160}>
          <section className="border-t border-[#dce9ff] px-3 py-6 sm:px-5 sm:py-7 lg:px-8 lg:py-8">
            <SectionTitle title="Gift Ideas For Loved Ones" />
            <div className="mt-4 grid grid-cols-1 gap-3.5 min-[620px]:grid-cols-2 sm:mt-5 md:grid-cols-3">
              {giftTiles.map((tile, index) => (
                <Reveal key={tile.title} delayMs={200 + index * 80}>
                  <Link
                    to={tile.to}
                    className="group block overflow-hidden border border-[#d2e4ff] bg-white shadow-[0_14px_40px_-32px_rgba(22,77,160,0.24)] transition hover:-translate-y-0.5"
                  >
                    <div className="aspect-[1.4/0.82] overflow-hidden bg-[#edf5ff]">
                      <ResilientImage
                        src={tile.image}
                        alt={tile.title}
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                        fallback={
                          <img
                            src={bestSellerHeroImage}
                            alt={tile.title}
                            className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                          />
                        }
                      />
                    </div>
                    <div className="px-4 py-3 text-center">
                      <p className="font-display text-[1rem] text-[#1c4b96] sm:text-[1.02rem]">
                        {tile.title}
                      </p>
                      <span className="mt-3 inline-flex h-9 items-center justify-center bg-[#f2b600] px-5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white transition group-hover:bg-[#d7a200]">
                        Shop Now
                      </span>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </section>
        </Reveal>

        <Reveal delayMs={180}>
          <section className="border-t border-[#dce9ff] px-3 py-6 sm:px-5 sm:py-7 lg:px-8 lg:py-8">
            <SectionTitle title="Quirky Gift Picks" />
            <div className="mt-5 grid grid-cols-1 gap-3.5 min-[430px]:grid-cols-2 sm:mt-6 sm:gap-4 lg:grid-cols-4 lg:gap-5">
              {quirkyGiftTiles.slice(0, 8).map((tile, index) => (
                <Reveal key={`${tile.to}-${tile.title}`} delayMs={200 + index * 70}>
                  <Link
                    to={tile.to}
                    className="group relative mx-auto block w-[calc(100%-15px)] overflow-hidden border border-[#d2e4ff] bg-[#eef5ff] shadow-[0_14px_30px_-24px_rgba(14,48,109,0.35)]"
                  >
                    <div className="aspect-[1.04/0.93] overflow-hidden sm:aspect-[1/0.9]">
                      <ResilientImage
                        src={tile.image}
                        alt={tile.title}
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                        fallback={
                          <img
                            src={bestSellerHeroImage}
                            alt={tile.title}
                            className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                          />
                        }
                      />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(8,30,73,0.12),rgba(8,30,73,0.9)_40%,rgba(8,30,73,0.98))] px-3 py-2.5 text-center text-white sm:px-3.5 sm:py-3">
                      <p className="line-clamp-2 font-display text-[0.96rem] font-semibold leading-[1.15] drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)] sm:text-[1.08rem]">
                        {tile.title}
                      </p>
                      <p className="mt-1.5 text-[1.24rem] font-black leading-none tracking-[0.01em] text-[#ffe36b] [text-shadow:0_2px_8px_rgba(0,0,0,0.45)] sm:text-[1.38rem]">
                        {tile.price}
                      </p>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </section>
        </Reveal>

        <Reveal delayMs={220}>
          <section className="border-t border-[#dce9ff] px-3 py-6 sm:px-5 sm:py-7 lg:px-8 lg:py-8">
            <div className="grid gap-4 lg:grid-cols-[1fr_0.95fr] lg:items-stretch">
              <div className="rounded-[1.15rem] border border-[#d2e4ff] bg-[#f8fbff] p-4 sm:rounded-[1.35rem] sm:p-6">
                <h2 className="font-display text-[clamp(1.6rem,3.5vw,2.6rem)] leading-[1.06] text-[#183f84]">
                  Our Exclusive Book Collection
                </h2>

                <div className="mt-5 grid gap-4 sm:mt-6 sm:grid-cols-2">
                  {featuredCourtneyBooks.length > 0
                    ? featuredCourtneyBooks.slice(0, 4).map((product, index) => (
                        <Reveal key={`featured-courtney-book-${product.id}`} delayMs={240 + index * 60}>
                          <ProductCard product={product} variant="dense" />
                        </Reveal>
                      ))
                    : Array.from({ length: 4 }, (_, index) => (
                        <div
                          key={`featured-courtney-book-placeholder-${index}`}
                          className="rounded-[1.1rem] border border-[#c7dcff] bg-[#eef5ff] p-2 shadow-[0_16px_38px_-30px_rgba(22,77,160,0.28)]"
                        >
                          <div className="aspect-square w-full rounded-[0.9rem] bg-[linear-gradient(135deg,#e8f1ff_0%,#dbe9ff_100%)]" />
                          <div className="mt-2 h-4 w-4/5 rounded-full bg-[#d7e6ff]" />
                          <div className="mt-1.5 h-3 w-2/5 rounded-full bg-[#d7e6ff]" />
                          <div className="mt-2.5 h-5 w-1/3 rounded-full bg-[#c0d8ff]" />
                        </div>
                      ))}
                </div>
              </div>

              <div className="overflow-hidden rounded-[1.15rem] border border-[#d2e4ff] bg-[#eef5ff] sm:rounded-[1.35rem]">
                <img
                  src={featuredCourtneyBooksImage}
                  alt="Featured Courtney collection product"
                  className="h-full min-h-[17rem] w-full object-cover sm:min-h-[21rem]"
                />
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal delayMs={240}>
          <section className="border-t border-[#dce9ff] px-3 py-6 sm:px-5 sm:py-7 lg:px-8 lg:py-8">
            <SectionTitle title="Everyday Essentials" />
            <div className="mt-5 grid grid-cols-1 gap-3.5 min-[430px]:grid-cols-2 sm:mt-6 sm:gap-4 lg:grid-cols-4 lg:gap-5">
              {everydayEssentialsTiles.slice(0, 8).map((tile, index) => (
                <Reveal key={`everyday-essential-${tile.to}-${tile.title}`} delayMs={260 + index * 70}>
                  <Link
                    to={tile.to}
                    className="group relative mx-auto block w-[calc(100%-15px)] overflow-hidden border border-[#d2e4ff] bg-[#eef5ff] shadow-[0_14px_30px_-24px_rgba(14,48,109,0.35)]"
                  >
                    <div className="aspect-[1.04/0.93] overflow-hidden sm:aspect-[1/0.9]">
                      <ResilientImage
                        src={tile.image}
                        alt={tile.title}
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                        fallback={
                          <img
                            src={bestSellerHeroImage}
                            alt={tile.title}
                            className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                          />
                        }
                      />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(8,30,73,0.12),rgba(8,30,73,0.9)_40%,rgba(8,30,73,0.98))] px-3 py-2.5 text-center text-white sm:px-3.5 sm:py-3">
                      <p className="line-clamp-2 font-display text-[0.96rem] font-semibold leading-[1.15] drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)] sm:text-[1.08rem]">
                        {tile.title}
                      </p>
                      <p className="mt-1.5 text-[1.24rem] font-black leading-none tracking-[0.01em] text-[#ffe36b] [text-shadow:0_2px_8px_rgba(0,0,0,0.45)] sm:text-[1.38rem]">
                        {tile.price}
                      </p>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </section>
        </Reveal>

        <Reveal delayMs={280}>
          <section className="border-t border-[#dce9ff] px-3 py-6 sm:px-5 sm:py-7 lg:px-8 lg:py-8">
            <SectionTitle title="What Our Customers Are Saying" />
            <div className="mt-5 grid grid-cols-1 gap-3.5 sm:mt-6 md:grid-cols-2 lg:grid-cols-3">
              {reviewTiles.map((tile, index) => (
                <Reveal key={tile.key} delayMs={300 + index * 80}>
                  <article className="h-full border border-[#d2e4ff] bg-[#ffffff] p-5 text-[#1c4b96] shadow-[0_14px_36px_-30px_rgba(22,77,160,0.2)]">
                    <div className="flex items-center gap-1 text-[#f2c100]">
                      {stars.map((starIndex) => (
                        <Star
                          key={starIndex}
                          className={`h-4 w-4 ${starIndex < tile.rating ? "fill-current" : "text-[#bfd4fb]"}`}
                        />
                      ))}
                    </div>
                    <p className="mt-4 text-sm leading-6 text-[#2f5fa9]">
                      "{tile.quote}"
                    </p>
                    <p className="mt-3 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#1c4b96]/70">
                      {tile.author}
                      {tile.verifiedBuyer ? " - Verified Buyer" : ""}
                    </p>
                  </article>
                </Reveal>
              ))}
            </div>
          </section>
        </Reveal>
      </div>
    </section>
  );
};

export default HomePage;

