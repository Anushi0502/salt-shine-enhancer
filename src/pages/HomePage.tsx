import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import Reveal from "@/components/storefront/Reveal";
import ResilientImage from "@/components/storefront/ResilientImage";
import SeoMetadata from "@/components/storefront/SeoMetadata";
import GiftBanner from "@/components/salt/GiftBanner";
import { formatMoney, minPrice, polishPlainText, productImage } from "@/lib/formatters";
import { useCollections } from "@/lib/collections-data";
import { useHomeCollectionProducts } from "@/lib/home-collection-products";
import { useHomeFeaturedProducts } from "@/lib/home-featured-products";
import { useRecentlyOrderedProducts } from "@/lib/recently-ordered-products";
import { isBestSellerCollectionHandle } from "@/lib/homepage-merchandising";
import { normalizeShopifyAssetUrl } from "@/lib/theme-assets";
import collectionApparel from "@/assets/collection-apparel.jpg";
import collectionDecor from "@/assets/collection-decor.jpg";
import giftCollectionImage from "@/assets/gift-collection-v2.jpg";
import giftHomeDecorImage from "@/assets/gift-home-decor-v2.jpg";
import giftUniqueFindsImage from "@/assets/gift-unique-finds-v2.jpg";
import heroEverydayEssentials from "@/assets/hero-everyday-essentials.jpg";
import heroPortableGadgets from "@/assets/hero-portable-gadgets.jpg";
import heroTravelOutdoor from "@/assets/hero-travel-outdoor.jpg";
import heroWomensBeauty from "@/assets/hero-womens-beauty.jpg";
import heroMain from "@/assets/hero-main.jpg";
import productDock from "@/assets/product-dock.jpg";
import productLaptopStand from "@/assets/product-laptop-stand.jpg";
import productPortableStand from "@/assets/product-portable-stand.jpg";
import productTripod from "@/assets/product-tripod.jpg";
import recentlyOrderedRibbon from "@/assets/recently-ordered-ribbon.png";
import type { ShopifyCollection, ShopifyProduct } from "@/types/shopify";

type ImageTile = {
  title: string;
  image: string;
  to: string;
  alt?: string;
};

type ProductTile = ImageTile & {
  price: string;
  productId?: number;
};

type HeroSpotlightTile = ImageTile & {
  price?: string;
  ribbonLabel?: string;
};

type ReviewTile = {
  key: string;
  quote: string;
  author: string;
  rating: number;
  verifiedBuyer: boolean;
};

const HERO_BANNER_ROTATE_MS = 3500;
const HOME_REVIEW_SCROLL_PX_PER_MS = 0.035;
const showExclusiveBooks = false;

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
  {
    title: "The Living Legacy Planner 2nd Edition",
    price: "$74.99",
    image: "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/7.png?v=1775419181",
    to: "/products/the-living-legacy-planner-2nd-edition",
  },
  {
    title: "The Living Legacy Planner 1st Edition",
    price: "$79.99",
    image: "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/61NdkykyfIL.jpg?v=1744878864",
    to: "/products/the-living-legacy-planner",
  },
  {
    title: "Artificial Peony & Rose Bouquet",
    price: "$27.99",
    image: "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/S4ad3a49ff40f43c0a52369044c915242Z.webp?v=1755072030",
    to: "/products/artificial-peony-rose-bouquet-silk-flowers-for-home-wedding-decor",
  },
  {
    title: "Crystal Healing Chakra Stones Pillar Set",
    price: "$14.99",
    image: "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/Sc81f5c21220c4cf3bcffd4f8ffb11774q.webp?v=1741261264",
    to: "/products/crystal-healing-chakra-stones-pillar-set-yoga-energy-home-decor-gift",
  },
];

const giftTileConfigs = [
  {
    title: "Home Decor",
    image: giftHomeDecorImage,
    to: "/collections/home-decor",
    collectionHandles: ["home-decor", "home", "decor"],
    productKeywords: ["home", "decor", "candle", "wall", "vase"],
  },
  {
    title: "Gifts",
    image: giftCollectionImage,
    to: "/collections/gifts",
    collectionHandles: ["gifts", "gift"],
    productKeywords: ["gift", "present", "planner", "set"],
  },
  {
    title: "Fun & Unique Finds",
    image: giftUniqueFindsImage,
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
  {
    key: "fallback-review-4",
    quote: "Quality felt better than expected and delivery updates were clear throughout.",
    author: "SALT customer",
    rating: 5,
    verifiedBuyer: true,
  },
];

const stars = Array.from({ length: 5 }, (_, index) => index);
const featuredBookPriority = [
  {
    key: "mood-mindfulness-tracker",
    titleIncludes: ["mood mindfulness tracker", "mood tracker"],
    handleIncludes: ["7-day-mood-mindfulness-tracker", "mood-mindfulness-tracker"],
  },
  {
    key: "the-living-legacy-planner-2nd-edition",
    titleIncludes: ["living legacy planner", "second edition"],
    handleIncludes: ["the-living-legacy-planner-2nd-edition", "planner-second-edition", "second-edition"],
  },
] as const;

const featuredCourtneyBookHandles = [
  "the-living-legacy-planner-2nd-edition",
  "the-living-legacy-planner",
  "7-day-mood-mindfulness-tracker",
  "7-day-health-medication-tracker",
] as const;

const featuredCourtneyBookFallbackMeta = [
  {
    handle: "7-day-mood-mindfulness-tracker",
    title: "7 Day Mood Mindfulness Tracker",
    price: "$4.99",
  },
  {
    handle: "the-living-legacy-planner",
    title: "The Living Legacy Planner 1st Edition",
    price: "$28.99",
  },
  {
    handle: "the-living-legacy-planner-2nd-edition",
    title: "The Living Legacy Planner 2nd Edition",
    price: "$55.99",
  },
  {
    handle: "7-day-health-medication-tracker",
    title: "7 Day Health & Medication Tracker",
    price: "$4.99",
  },
] as const;

const HERO_EXTRA_BANNERS: ImageTile[] = [
  {
    title: "Everyday Essentials",
    image: heroEverydayEssentials,
    to: "/collections/everyday-essentials",
    alt: "Everyday Essentials collection banner featuring practical home, kitchen, organization, and daily-use products.",
  },
  {
    title: "Women's Beauty Essentials",
    image: heroWomensBeauty,
    to: "/collections/womens-beauty-essentials",
    alt: "Women's Beauty Essentials collection banner featuring skincare, makeup, and beauty tools.",
  },
  {
    title: "Portable Gadgets",
    image: heroPortableGadgets,
    to: "/collections/portable-gadgets",
    alt: "Portable Gadgets collection banner featuring compact smart technology for everyday travel.",
  },
  {
    title: "Travel & Outdoor",
    image: heroTravelOutdoor,
    to: "/collections/travel-outdoor",
    alt: "Travel and Outdoor collection banner featuring camping, road-trip, and journey essentials.",
  },
];

const fallbackEverydayEssentialTiles: ProductTile[] = [
  {
    title: "Mini Soil Moisture Meter",
    price: "$40.99",
    image: "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/S0176d58c74d34f50afa5a85504cabab7R.webp?v=1741351238",
    to: "/products/mini-soil-moisture-meter-gardening-water-analyzer-tool",
  },
  {
    title: "Stainless Steel Garden Trowel",
    price: "$24.99",
    image: "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/Sa4903cd34f2d4065a0126d44b58be35dd.webp?v=1741351238",
    to: "/products/stainless-steel-garden-trowel-heavy-duty-hand-shovel",
  },
  {
    title: "Professional Grafting Shears",
    price: "$34.99",
    image: "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/S5eb8f84cdefb43b4879bff3612c27e51e.webp?v=1741347257",
    to: "/products/professional-grafting-shears-fruit-tree-pruning-tool-set",
  },
  {
    title: "High-Pressure Foam Lance Water Gun",
    price: "$34.99",
    image: "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/Sf57de253c9f64fb0a3583594df791d061.webp?v=1741094049",
    to: "/products/portable-auto-foam-lance-water-gun-high-pressure-3-grade-nozzle-jet-car-washer-sprayer-cleaning-tool-automobile-garden-wash-tool",
  },
  {
    title: "8-in-1 Dog Shower Sprayer",
    price: "$39.99",
    image: "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/S08b63989913d4ad19d98062e9e54cebfS.webp?v=1741065549",
    to: "/products/8-in-1-dog-shower-sprayer-high-pressure-pet-bath-garden-tool",
  },
  {
    title: "Hollow Hoe Handheld Weeding Rake",
    price: "$29.99",
    image: "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/Sda66216eefe84eeabb7ccc13ffd220235.webp?v=1741347256",
    to: "/products/hollow-hoe-handheld-weeding-rake-perfect-for-planting-loosening-soil",
  },
  {
    title: "Adjustable Beverage Bottle Sprayer",
    price: "$24.99",
    image: "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/Sd8c5e214b90c4a41adf8d0456f809670p.webp?v=1741070097",
    to: "/products/adjustable-beverage-bottle-sprayer-gardening-watering-tool",
  },
  {
    title: "Garden Water Nozzle",
    price: "$29.99",
    image: "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/S389aefb33b994d24b48805e9ed82ea34s.webp?v=1741065546",
    to: "/products/garden-water-nozzle-car-wash-yard-sprayer-multifunctional-tool",
  },
  {
    title: "Mini Soil Moisture Meter",
    price: "$40.99",
    image: "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/S0176d58c74d34f50afa5a85504cabab7R.webp?v=1741351238",
    to: "/products/mini-soil-moisture-meter-gardening-water-analyzer-tool",
  },
  {
    title: "13-Piece Ceramic Cookware Set",
    price: "$80.99",
    image: "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/Ceramic_Cookware_Set.webp?v=1756373479",
    to: "/products/13-piece-ceramic-cookware-set-nonstick-detachable-handles",
  },
  {
    title: "Silicone Cookware Set",
    price: "$22.99",
    image: "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/Se8d03ac0ad7640748e0f998372a876fe0.webp?v=1740734869",
    to: "/products/silicone-cookware-set-shovel-spoon-scraper-for-kitchen-baking",
  },
  {
    title: "Small Hoe with Wooden Handle",
    price: "$18.99",
    image: "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/S308b0a0d778a4dbe9edb7a366d560081H.webp?v=1741347254",
    to: "/products/small-hoe-with-short-wooden-handle-handheld-garden-tool-for-loosening-weeding-soil",
  },
];

function SectionTitle({ title, to }: { title: string; to?: string }) {
  return (
    <div className="grid grid-cols-[minmax(1rem,1fr)_auto_minmax(1rem,1fr)] items-center gap-2.5 sm:gap-4">
      <span className="h-px bg-[#bfd4fb]" />
      <h2 className="font-display text-[clamp(1.12rem,3.15vw,1.65rem)] leading-none text-[#1c4b96]">
        {to ? <Link to={to} className="transition hover:text-[#0d3578] hover:underline">{title}</Link> : title}
      </h2>
      <span className="h-px bg-[#bfd4fb]" />
    </div>
  );
}

function OverlayProductCard({
  title,
  image,
  to,
  price,
  productId,
  fallbackImage,
  className = "",
  imageAlt,
  compact = false,
  tight = false,
}: {
  title: string;
  image: string;
  to: string;
  price: string;
  productId?: number;
  fallbackImage: string;
  className?: string;
  imageAlt?: string;
  compact?: boolean;
  tight?: boolean;
}) {
  const imageSrc = normalizeShopifyAssetUrl(image) || image || fallbackImage;
  const fallbackSrc = normalizeShopifyAssetUrl(fallbackImage) || fallbackImage;
  const resolvedAlt = imageAlt || `${title} product image from SALT Online Store`;
  const shellClass = tight || compact
    ? "border border-[#d2e4ff] bg-[#f4f8ff] shadow-[0_12px_26px_-22px_rgba(14,48,109,0.28)]"
    : "border border-[#d2e4ff] bg-[#eef5ff] shadow-[0_14px_30px_-24px_rgba(14,48,109,0.35)]";
  const mediaClass = tight
    ? "h-[13.5rem] overflow-hidden bg-[#f7fbff] sm:h-[14.25rem] lg:h-[15rem]"
    : compact
      ? "aspect-[1.08/0.82] overflow-hidden"
      : "aspect-[1.04/0.93] overflow-hidden sm:aspect-[1/1.2]";
  const overlayClass = tight
    ? "absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(8,30,73,0.06),rgba(8,30,73,0.86)_50%,rgba(8,30,73,0.98))] px-2 py-1.5 text-center text-white sm:px-2.5 sm:py-2"
    : compact
      ? "absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(8,30,73,0.08),rgba(8,30,73,0.88)_45%,rgba(8,30,73,0.98))] px-2 py-2 text-center text-white sm:px-2.5 sm:py-2.5"
    : "absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(8,30,73,0.12),rgba(8,30,73,0.9)_40%,rgba(8,30,73,0.98))] px-3 py-2.5 text-center text-white sm:px-3.5 sm:py-3";
  const titleClass = tight
    ? "line-clamp-2 font-display text-[0.74rem] font-semibold leading-[1.05] drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)] sm:text-[0.84rem]"
    : compact
      ? "line-clamp-2 font-display text-[0.82rem] font-semibold leading-[1.08] drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)] sm:text-[0.92rem]"
    : "line-clamp-2 font-display text-[0.96rem] font-semibold leading-[1.15] drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)] sm:text-[1.08rem]";
  const priceClass = tight
    ? "text-[0.92rem] font-black leading-none tracking-[0.01em] text-[#ffe36b] [text-shadow:0_2px_8px_rgba(0,0,0,0.45)] sm:text-[1rem]"
    : compact
      ? "text-[1rem] font-black leading-none tracking-[0.01em] text-[#ffe36b] [text-shadow:0_2px_8px_rgba(0,0,0,0.45)] sm:text-[1.1rem]"
    : "text-[1.24rem] font-black leading-none tracking-[0.01em] text-[#ffe36b] [text-shadow:0_2px_8px_rgba(0,0,0,0.45)] sm:text-[1.38rem]";
  const imageClass = tight
    ? "h-full w-full object-fill transition duration-700 group-hover:scale-[1.01]"
    : "h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]";

  return (
    <Link
      to={to}
      className={`group relative block overflow-hidden ${shellClass} ${className}`.trim()}
    >
      <div className={mediaClass}>
        <ResilientImage
          src={imageSrc}
          alt={resolvedAlt}
          loading="lazy"
          decoding="async"
          deferUntilNearViewport
          className={imageClass}
          fallback={
            <img
              src={fallbackSrc}
              alt={resolvedAlt}
              loading="lazy"
              decoding="async"
              className={imageClass}
            />
          }
        />
      </div>
      <div className={overlayClass}>
        <p className={titleClass}>
          {title}
        </p>
        <div className={tight ? "mt-0.5 flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 text-[0.62rem] font-semibold text-white/92 sm:text-[0.7rem]" : compact ? "mt-1 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-[0.68rem] font-semibold text-white/92 sm:text-[0.76rem]" : "mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[0.78rem] font-semibold text-white/92 sm:text-[0.88rem]"}>
          <span className={priceClass}>
            {price}
          </span>
        </div>
      </div>
    </Link>
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
  const byHandle = collections.find((collection) =>
    isBestSellerCollectionHandle(collection.handle),
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

function buildCollectionImageAltText(title: string, contextLabel: string): string {
  const normalizedTitle = polishPlainText(title) || "Collection";
  const normalizedContext = polishPlainText(contextLabel).toLowerCase();
  return `${normalizedTitle} collection image featured in SALT ${normalizedContext}.`;
}

function buildProductImageAltText(title: string, contextLabel: string): string {
  const normalizedTitle = polishPlainText(title) || "Product";
  const normalizedContext = polishPlainText(contextLabel).toLowerCase();
  return `${normalizedTitle} product photo featured in SALT ${normalizedContext}.`;
}

function buildBannerImageAltText(tile: ImageTile): string {
  if (tile.alt) {
    return tile.alt;
  }

  return `${polishPlainText(tile.title) || "SALT"} homepage banner image.`;
}

function getProductTileKey(tile: ProductTile): string {
  return [
    String(tile.productId || ""),
    tile.to,
    tile.title,
    tile.price,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .join("|");
}

function padProductTiles(primary: ProductTile[], fallback: ProductTile[], targetCount = 10): ProductTile[] {
  const result: ProductTile[] = [];
  const seen = new Set<string>();

  for (const tile of [...primary, ...fallback]) {
    const key = getProductTileKey(tile);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(tile);

    if (result.length >= targetCount) {
      break;
    }
  }

  return result;
}

const HomePage = () => {
  // Do not download the full 6k-product catalog just to render curated homepage cards.
  // Full catalog loading remains on search, collection, and product routes.
  const { data: collectionsPayload } = useCollections();
  const { data: homeFeaturedProductsPayload } = useHomeFeaturedProducts();
  const { data: homeCollectionProductsPayload } = useHomeCollectionProducts();
  const { data: recentlyOrderedProductsPayload } = useRecentlyOrderedProducts();
  const products: ShopifyProduct[] = [];
  const collections = useMemo(() => collectionsPayload?.collections ?? [], [collectionsPayload]);
  const bestSellerCollection = useMemo(
    () => findBestSellerCollection(collections),
    [collections],
  );
  const bestSellerProducts: ShopifyProduct[] = [];
  const featuredCourtneyBooks = useMemo(() => {
    if (!products.length) {
      return [];
    }

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
    [...prioritizedByHandle, ...keywordFallback].forEach((product) => {
      if (seenProductIds.has(product.id)) {
        return;
      }

      seenProductIds.add(product.id);
      uniqueBooks.push(product);
    });

    return uniqueBooks.slice(0, 4);
  }, [products]);
  const featuredCourtneyBookFallbackImage = useMemo(() => {
    const firstBook = featuredCourtneyBooks[0];
    if (!firstBook) {
      return collectionDecor;
    }

    return productImage(firstBook) || collectionDecor;
  }, [featuredCourtneyBooks]);
  const featuredCourtneyBookCards = useMemo(() => {
    const cards = featuredCourtneyBooks.slice(0, 4).map((product) => ({
      key: `featured-courtney-book-${product.id}`,
      productId: product.id,
      title: product.title,
      to: `/products/${product.handle}`,
      price: formatMoney(minPrice(product)),
      image: productImage(product) || featuredCourtneyBookFallbackImage,
    }));
    const seenPaths = new Set(cards.map((card) => card.to));

    featuredCourtneyBookFallbackMeta.forEach((fallbackBook) => {
      if (cards.length >= 4) {
        return;
      }

      const preferredPath = `/products/${fallbackBook.handle}`;
      const preferredProduct = products.find((product) =>
        normalizeHandle(product.handle).includes(normalizeHandle(fallbackBook.handle)),
      );

      if (preferredProduct) {
        const preferredProductPath = `/products/${preferredProduct.handle}`;
        if (seenPaths.has(preferredProductPath)) {
          return;
        }

        seenPaths.add(preferredProductPath);
        cards.push({
          key: `featured-courtney-book-${preferredProduct.id}`,
          productId: preferredProduct.id,
          title: preferredProduct.title,
          to: preferredProductPath,
          price: formatMoney(minPrice(preferredProduct)),
          image: productImage(preferredProduct) || featuredCourtneyBookFallbackImage,
        });
        return;
      }

      if (seenPaths.has(preferredPath)) {
        return;
      }

      seenPaths.add(preferredPath);
      cards.push({
        key: `featured-courtney-book-fallback-${fallbackBook.handle}`,
        title: fallbackBook.title,
        to: preferredPath,
        price: fallbackBook.price,
        image: featuredCourtneyBookFallbackImage,
      });
    });

    return cards.slice(0, 4);
  }, [featuredCourtneyBookFallbackImage, featuredCourtneyBooks, products]);
  const mindfulnessTrackerFeatureCard = useMemo(() => {
    const matchedCard = featuredCourtneyBookCards.find(
      (card) =>
        /mood mindfulness|mindfulness tracker/i.test(card.title) ||
        card.to.includes("7-day-mood-mindfulness-tracker"),
    );

    if (matchedCard) {
      return matchedCard;
    }

    return {
      key: "featured-courtney-book-mindfulness-tracker-fallback",
      title: "7 Day Mood Mindfulness Tracker",
      to: "/products/7-day-mood-mindfulness-tracker",
      price: "$4.99",
      image: featuredCourtneyBookFallbackImage,
    };
  }, [featuredCourtneyBookCards, featuredCourtneyBookFallbackImage]);
  const bestSellerTiles = useMemo<ProductTile[]>(() => {
    return (homeFeaturedProductsPayload?.bestSellerProducts || []).slice(0, 12).map((product) => ({
      productId: product.id,
      title: product.title,
      price: formatMoney(product.price),
      image: product.image,
      to: `/products/${product.handle}`,
    }));
  }, [homeFeaturedProductsPayload?.bestSellerProducts]);
  const bestSellerDisplayTiles = useMemo(
    () => bestSellerTiles.slice(0, 12),
    [bestSellerTiles],
  );
  const bestSellerHeroImage =
    normalizeShopifyAssetUrl(bestSellerCollection?.image?.src) || heroMain;
  const everydayEssentialProducts = useMemo(() => {
    if (!products.length) {
      return [];
    }

    const excludedProductIds = new Set<number>([
      ...bestSellerProducts.map((product) => product.id),
      ...featuredCourtneyBooks.map((product) => product.id),
    ]);

    const practicalTokens = [
      "garden",
      "tool",
      "tools",
      "watering",
      "water",
      "sprayer",
      "shower",
      "pruning",
      "shears",
      "soil",
      "moisture",
      "clean",
      "cleaner",
      "kitchen",
      "cookware",
      "storage",
      "organizer",
      "bottle",
      "pet",
      "home",
      "care",
    ];
    const blockedTokens = [
      "book",
      "books",
      "journal",
      "planner",
      "legacy",
      "bloom",
      "relics",
      "gift",
      "gifts",
      "dress",
      "shirt",
      "apparel",
      "fashion",
    ];

    const rankedProducts = products
      .map((product) => {
        if (excludedProductIds.has(product.id)) {
          return null;
        }

        const search = productSearchText(product);
        if (!search) {
          return null;
        }

        const matchesBlockedToken = blockedTokens.some((token) => search.includes(token));
        if (matchesBlockedToken) {
          return null;
        }

        const practicalScore = practicalTokens.reduce(
          (score, token) => (search.includes(token) ? score + 1 : score),
          0,
        );
        const price = minPrice(product);
        const priceScore = price > 0 && price <= 50 ? 2 : price > 0 && price <= 90 ? 1 : 0;
        const imageScore = productImage(product) ? 1 : 0;
        const freshnessScore = new Date(product.published_at || product.created_at || "1970-01-01").getTime();

        return {
          product,
          practicalScore,
          rankScore: practicalScore * 3 + priceScore + imageScore,
          price: price > 0 ? price : Number.MAX_SAFE_INTEGER,
          freshnessScore,
        };
      })
      .filter(
        (
          entry,
        ): entry is {
          product: ShopifyProduct;
          practicalScore: number;
          rankScore: number;
          price: number;
          freshnessScore: number;
        } => Boolean(entry) && entry.practicalScore > 0,
      )
      .sort((left, right) => {
        const scoreDiff = right.rankScore - left.rankScore;
        if (scoreDiff !== 0) {
          return scoreDiff;
        }

        const priceDiff = left.price - right.price;
        if (priceDiff !== 0) {
          return priceDiff;
        }

        return right.freshnessScore - left.freshnessScore;
      });

    return rankedProducts.slice(0, 12).map((entry) => entry.product);
  }, [bestSellerProducts, featuredCourtneyBooks, products]);
  const everydayEssentialsTiles = useMemo<ProductTile[]>(() => {
    const curatedProducts = homeCollectionProductsPayload?.sections.everydayEssentials.products || [];
    if (curatedProducts.length) {
      return curatedProducts.slice(0, 12).map((product) => ({
        productId: product.id,
        title: product.title,
        price: formatMoney(product.price),
        image: product.image,
        to: `/products/${product.handle}`,
      }));
    }

    return (homeFeaturedProductsPayload?.everydayEssentialProducts || []).slice(0, 12).map((product) => ({
      productId: product.id,
      title: product.title,
      price: formatMoney(product.price),
      image: product.image,
      to: `/products/${product.handle}`,
    }));
  }, [homeCollectionProductsPayload?.sections.everydayEssentials.products, homeFeaturedProductsPayload?.everydayEssentialProducts]);
  const quirkyGiftTiles = useMemo<ProductTile[]>(() => {
    return (homeFeaturedProductsPayload?.quirkyGiftPicks || []).slice(0, 12).map((product) => ({
      productId: product.id,
      title: product.title,
      price: formatMoney(product.price),
      image: product.image,
      to: `/products/${product.handle}`,
    }));
  }, [homeFeaturedProductsPayload?.quirkyGiftPicks]);
  const quirkyGiftDisplayTiles = useMemo(
    () => quirkyGiftTiles.slice(0, 12),
    [quirkyGiftTiles],
  );
  const everydayEssentialsDisplayTiles = useMemo(
    () => everydayEssentialsTiles.slice(0, 12),
    [everydayEssentialsTiles],
  );
  const homeCollectionSections = useMemo(
    () =>
      homeCollectionProductsPayload
        ? [
            homeCollectionProductsPayload.sections.womensBeautyEssentials,
            homeCollectionProductsPayload.sections.portableGadgets,
            homeCollectionProductsPayload.sections.travelOutdoor,
          ].map((section) => ({
            title: section.title,
            to: `/collections/${section.handle}`,
            tiles: section.products.slice(0, 12).map((product) => ({
              productId: product.id,
              title: product.title,
              price: formatMoney(product.price),
              image: product.image,
              to: `/products/${product.handle}`,
            })),
          }))
        : [],
    [homeCollectionProductsPayload],
  );
  const reviewCarouselRef = useRef<HTMLDivElement | null>(null);
  // Homepage must not fan out to one external review request per product. Static
  // testimonials keep the section instant; full Judge.me detail remains on product pages.
  const reviewTiles = fallbackReviewTiles;
  const reviewLoopCopies = useMemo(() => {
    if (reviewTiles.length >= 10) {
      return 2;
    }

    if (reviewTiles.length >= 5) {
      return 3;
    }

    return 4;
  }, [reviewTiles.length]);
  const reviewTrackTiles = useMemo<ReviewTile[]>(() => {
    if (!reviewTiles.length) {
      return [];
    }

    return Array.from({ length: reviewLoopCopies }, (_, copyIndex) =>
      reviewTiles.map((tile, tileIndex) => ({
        ...tile,
        key: `${tile.key}-loop-${copyIndex}-${tileIndex}`,
      })),
    ).flat();
  }, [reviewLoopCopies, reviewTiles]);
  const homeDescription = polishPlainText(
    products.length
      ? `Shop ${products.length.toLocaleString()} products across ${collections.length.toLocaleString()} collections with smarter merchandising, clearer discovery, and gift-ready finds.`
      : "Shop curated essentials and gift-ready finds with clearer discovery and faster checkout.",
  );
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
  const giftTiles = useMemo<ImageTile[]>(() => {
    const usedGiftProductIds = new Set<number>();

    const tiles = giftTileConfigs.map((tile) => {
      const curatedImage = tile.image || null;
      const imageFromProduct = findProductImageByKeywords(tile.productKeywords, usedGiftProductIds);
      const imageFromCollection =
        tile.collectionHandles
          .map((handle) => collectionImageByHandle.get(normalizeHandle(handle)) || null)
          .find(Boolean) || null;

      return {
        title: tile.title,
        to: tile.to,
        image:
          curatedImage ||
          imageFromProduct ||
          imageFromCollection ||
          bestSellerHeroImage,
      };
    });

    return tiles;
  }, [bestSellerHeroImage, collectionImageByHandle, findProductImageByKeywords]);
  const heroSpotlightCards = useMemo<HeroSpotlightTile[]>(() => {
    const recentlyOrdered = recentlyOrderedProductsPayload?.products.slice(0, 4) || [];
    if (recentlyOrdered.length === 4) {
      return recentlyOrdered.map((product) => ({
        title: product.title,
        image: product.image,
        alt: product.imageAlt,
        price: product.price ? formatMoney(product.price) : undefined,
        ribbonLabel: "Buy 2 get one free",
        to: `/products/${product.handle}`,
      }));
    }

    return [
      {
        title: "Best Sellers",
        image: bestSellerHeroImage,
        to: bestSellerCollection ? `/collections/${bestSellerCollection.handle}` : "/collections",
      },
      {
        title: "Books & Planners",
        image: featuredCourtneyBookFallbackImage,
        to: "/collections/books",
      },
      {
        title: "Under $35",
        image: collectionImageByHandle.get("under-35") || bestSellerHeroImage,
        to: "/collections/under-35",
      },
      {
        title: "Gift Ideas",
        image: giftTiles[0]?.image || collectionDecor,
        to: "/collections/gifts",
      },
    ];
  }, [
      bestSellerCollection,
      bestSellerHeroImage,
      collectionImageByHandle,
      featuredCourtneyBookFallbackImage,
      giftTiles,
      recentlyOrderedProductsPayload?.products,
    ]);

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

  useEffect(() => {
    const carousel = reviewCarouselRef.current;
    if (!carousel || reviewTiles.length <= 1 || typeof window === "undefined") {
      return;
    }

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionQuery.matches) {
      return;
    }

    let animationFrameId = 0;
    let lastFrameAt = 0;
    let isPaused = false;

    const handleMouseEnter = () => {
      isPaused = true;
    };

    const handleMouseLeave = () => {
      isPaused = false;
    };

    const tick = (frameAt: number) => {
      if (!lastFrameAt) {
        lastFrameAt = frameAt;
      }

      const elapsed = frameAt - lastFrameAt;
      lastFrameAt = frameAt;

      if (!isPaused) {
        const maxScrollLeft = carousel.scrollWidth - carousel.clientWidth;
        const loopWidth = reviewLoopCopies > 1 ? carousel.scrollWidth / reviewLoopCopies : maxScrollLeft;
        if (maxScrollLeft > 0 && loopWidth > 0) {
          const nextScrollLeft = carousel.scrollLeft + elapsed * HOME_REVIEW_SCROLL_PX_PER_MS;
          carousel.scrollLeft = nextScrollLeft >= loopWidth ? nextScrollLeft - loopWidth : nextScrollLeft;
        }
      }

      animationFrameId = window.requestAnimationFrame(tick);
    };

    carousel.addEventListener("mouseenter", handleMouseEnter);
    carousel.addEventListener("mouseleave", handleMouseLeave);
    animationFrameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      carousel.removeEventListener("mouseenter", handleMouseEnter);
      carousel.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [reviewLoopCopies, reviewTiles.length]);

  return (
    <section className="mt-1 w-full px-3 pb-3 sm:mt-3 sm:px-4 sm:pb-5 lg:px-5 lg:pb-6 xl:px-6">
      <SeoMetadata
        title="SALT Online Store | Curated essentials and giftable finds"
        description={homeDescription}
        canonicalPath="/"
        image={heroMain}
      />
      <div className="overflow-hidden rounded-[1.1rem] border border-[#c5dbff] bg-[#f8fbff] shadow-[0_28px_80px_-56px_rgba(22,77,160,0.24)] sm:rounded-[1.4rem] lg:rounded-[1.6rem]">
        <Reveal>
          <section className="border-b border-[#dce9ff] p-3 sm:p-4 lg:p-6">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.18fr)_minmax(280px,0.82fr)] lg:items-stretch">
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
                      aria-label={buildBannerImageAltText(tile)}
                    >
                      <div className="overflow-hidden bg-[#eaf3ff]">
                        <ResilientImage
                          src={tile.image}
                          alt={buildBannerImageAltText(tile)}
                          loading={index === 0 ? "eager" : "lazy"}
                          decoding="async"
                          className="block h-auto w-full transition duration-700 ease-out group-hover:scale-[1.01]"
                          fallback={
                            <img
                              src={bestSellerHeroImage}
                              alt={buildBannerImageAltText(tile)}
                              loading={index === 0 ? "eager" : "lazy"}
                              decoding="async"
                              className="block h-auto w-full transition duration-700 ease-out group-hover:scale-[1.01]"
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

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-2">
                {heroSpotlightCards.map((tile, index) => (
                  <Link
                    key={`${tile.to}-${index}`}
                    to={tile.to}
                    className="group relative block overflow-hidden rounded-[1.02rem] border border-[#d2e4ff] bg-[#eef5ff] shadow-[0_14px_36px_-30px_rgba(22,77,160,0.24)]"
                    aria-label={buildCollectionImageAltText(tile.title, "hero spotlight")}
                  >
                    <div className="aspect-[1.08/0.8] overflow-hidden">
                      <ResilientImage
                        src={tile.image}
                        alt={tile.alt || buildCollectionImageAltText(tile.title, "hero spotlight")}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                        fallback={
                          <img
                            src={bestSellerHeroImage}
                            alt={tile.alt || buildCollectionImageAltText(tile.title, "hero spotlight")}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                          />
                        }
                      />
                    </div>
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,30,73,0.1),rgba(8,30,73,0.2)_44%,rgba(8,30,73,0.88))]" />
                    {tile.ribbonLabel ? (
                      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden="true">
                        <div className="absolute -left-[18%] -top-[24%] w-[68%]">
                          <img
                            src={normalizeShopifyAssetUrl(recentlyOrderedRibbon) || recentlyOrderedRibbon}
                            alt=""
                            className="h-auto w-full drop-shadow-[0_8px_12px_rgba(91,10,10,0.28)]"
                          />
                          <span className="absolute left-1/2 top-1/2 w-[76%] -translate-x-1/2 -translate-y-1/2 -rotate-45 text-center font-sans text-[clamp(0.42rem,1.1vw,0.62rem)] font-black uppercase leading-none tracking-[0.035em] text-white [text-shadow:0_1px_2px_rgba(75,0,0,0.9)]">
                            {tile.ribbonLabel}
                          </span>
                        </div>
                      </div>
                    ) : null}
                    <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
                      <p className="line-clamp-2 font-display text-[0.92rem] font-semibold leading-[1.12] text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)] sm:text-[1rem]">
                        {tile.title}
                      </p>
                      {tile.price ? (
                        <p className="mt-1 text-[0.72rem] font-bold text-[#ffd761] drop-shadow-[0_2px_5px_rgba(0,0,0,0.55)] sm:text-[0.78rem]">
                          {tile.price}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </Reveal>

        {bestSellerDisplayTiles.length > 0 ? <Reveal delayMs={80}>
          <section className="border-t border-[#dce9ff] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
            <SectionTitle title="Best Sellers" />
            <div className="mt-5 grid grid-cols-2 gap-3 sm:mt-6 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5 lg:gap-5 xl:grid-cols-6 xl:gap-6">
              {bestSellerDisplayTiles.map((tile, index) => (
                <Reveal key={`${tile.to}-${tile.title}-${index}`} delayMs={120 + index * 50}>
                  <OverlayProductCard
                    title={tile.title}
                    image={tile.image}
                    to={tile.to}
                    price={tile.price}
                    productId={tile.productId}
                    fallbackImage={bestSellerHeroImage}
                    imageAlt={buildProductImageAltText(tile.title, "best sellers")}
                    compact
                    className="w-full max-w-[11rem] justify-self-center"
                  />
                </Reveal>
              ))}
            </div>
          </section>
        </Reveal> : null}

        {homeCollectionSections.map((section, sectionIndex) =>
          section.tiles.length > 0 ? (
            <Reveal key={section.to} delayMs={100 + sectionIndex * 20}>
              <section className="border-t border-[#dce9ff] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
                <SectionTitle title={section.title} to={section.to} />
                <div className="mt-5 grid grid-cols-2 gap-3 sm:mt-6 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5 lg:gap-5 xl:grid-cols-6 xl:gap-6">
                  {section.tiles.map((tile, index) => (
                    <Reveal key={`${tile.to}-${tile.title}-${index}`} delayMs={120 + index * 50}>
                      <OverlayProductCard
                        title={tile.title}
                        image={tile.image}
                        to={tile.to}
                        price={tile.price}
                        productId={tile.productId}
                        fallbackImage={bestSellerHeroImage}
                        imageAlt={buildProductImageAltText(tile.title, section.title)}
                        compact
                        className="w-full max-w-[11rem] justify-self-center"
                      />
                    </Reveal>
                  ))}
                </div>
              </section>
            </Reveal>
          ) : null,
        )}

        <Reveal delayMs={110}>
          <section className="border-t border-[#dce9ff] px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6">
            <GiftBanner />
          </section>
        </Reveal>

        <Reveal delayMs={120}>
          <section className="border-t border-[#dce9ff] px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6">
            <SectionTitle title="Gift Ideas For Loved Ones" />
            <div className="mt-4 grid grid-cols-3 gap-2 sm:mt-5 sm:gap-5">
              {giftTiles.map((tile, index) => (
                <Reveal key={tile.title} delayMs={200 + index * 80}>
                  <Link
                    to={tile.to}
                    className="group block overflow-hidden border border-[#d2e4ff] bg-white shadow-[0_14px_40px_-32px_rgba(22,77,160,0.24)] transition hover:-translate-y-0.5"
                  >
                    <div className="aspect-[1.4/0.82] overflow-hidden bg-[#edf5ff]">
                      <ResilientImage
                        src={tile.image}
                        alt={buildCollectionImageAltText(tile.title, "gift ideas")}
                        loading="lazy"
                        decoding="async"
                        deferUntilNearViewport
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                        fallback={
                          <img
                            src={bestSellerHeroImage}
                            alt={buildCollectionImageAltText(tile.title, "gift ideas")}
                            className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                          />
                        }
                      />
                    </div>
                    <div className="px-2 py-2 text-center sm:px-4 sm:py-3">
                      <p className="font-display text-[0.76rem] leading-[1.08] text-[#1c4b96] sm:text-[1rem] sm:leading-normal">
                        {tile.title}
                      </p>
                      <span className="mt-2 inline-flex h-7 items-center justify-center bg-[#f2b600] px-2.5 text-[0.52rem] font-semibold uppercase tracking-[0.1em] text-white transition group-hover:bg-[#d7a200] sm:mt-3 sm:h-9 sm:px-5 sm:text-[0.68rem] sm:tracking-[0.14em]">
                        Shop Now
                      </span>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </section>
        </Reveal>

        {quirkyGiftDisplayTiles.length > 0 ? (
          <Reveal delayMs={140}>
            <section className="border-t border-[#dce9ff] px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6">
              <SectionTitle title="Quirky Gift Picks" />
              <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6 lg:gap-4">
                {quirkyGiftDisplayTiles.map((tile, index) => (
                  <Reveal key={`${tile.to}-${tile.title}-${index}`} delayMs={140 + index * 50}>
                    <OverlayProductCard
                      title={tile.title}
                      image={tile.image}
                      to={tile.to}
                      price={tile.price}
                      productId={tile.productId}
                      fallbackImage={bestSellerHeroImage}
                      imageAlt={buildProductImageAltText(tile.title, "quirky gift picks")}
                      compact
                      className="w-full"
                    />
                  </Reveal>
                ))}
              </div>
            </section>
          </Reveal>
        ) : null}

        {showExclusiveBooks && (
        <Reveal delayMs={220}>
          <section className="border-t border-[#dce9ff] px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.08fr_0.92fr] lg:gap-5 lg:items-start">
              <div className="space-y-3.5 sm:space-y-4">
                <h2 className="text-left font-display text-[clamp(1.18rem,2vw,1.62rem)] leading-[1.06] text-[#183f84]">
                  Our Exclusive Book Collection
                </h2>
                <div className="grid grid-cols-2 gap-2 sm:gap-3.5 lg:gap-4">
                  {featuredCourtneyBookCards.map((bookCard, index) => (
                    <Reveal key={bookCard.key} delayMs={240 + index * 60}>
                      <OverlayProductCard
                        title={bookCard.title}
                        image={bookCard.image}
                        to={bookCard.to}
                        price={bookCard.price}
                        productId={bookCard.productId}
                        fallbackImage={featuredCourtneyBookFallbackImage}
                        imageAlt={buildProductImageAltText(bookCard.title, "exclusive book collection")}
                        tight
                      />
                    </Reveal>
                  ))}
                </div>
              </div>

              <Reveal delayMs={320}>
                <Link
                  to={mindfulnessTrackerFeatureCard.to}
                  className="group relative hidden overflow-hidden rounded-[1rem] border border-[#d2e4ff] bg-[#eef5ff] shadow-[0_14px_30px_-24px_rgba(14,48,109,0.35)] lg:block lg:h-[34rem] lg:self-start"
                >
                  <ResilientImage
                    src={mindfulnessTrackerFeatureCard.image}
                    alt={buildProductImageAltText(mindfulnessTrackerFeatureCard.title, "featured product spotlight")}
                    loading="lazy"
                    decoding="async"
                    deferUntilNearViewport
                    className="h-full w-full object-fill transition duration-700 group-hover:scale-[1.01]"
                    fallback={
                      <img
                        src={featuredCourtneyBookFallbackImage}
                        alt={buildProductImageAltText(mindfulnessTrackerFeatureCard.title, "featured product spotlight")}
                        className="h-full w-full object-fill transition duration-700 group-hover:scale-[1.01]"
                      />
                    }
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(8,30,73,0.12),rgba(8,30,73,0.9)_40%,rgba(8,30,73,0.98))] px-4 py-2 text-center text-white sm:px-5 sm:py-2.5">
                    <p className="line-clamp-2 font-display text-[0.9rem] font-semibold leading-[1.06] drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)] sm:text-[1rem]">
                      {mindfulnessTrackerFeatureCard.title}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[0.7rem] font-semibold text-white/92 sm:text-[0.78rem]">
                      <span className="text-[0.98rem] font-black leading-none tracking-[0.01em] text-[#ffe36b] [text-shadow:0_2px_8px_rgba(0,0,0,0.45)] sm:text-[1.08rem]">
                        {mindfulnessTrackerFeatureCard.price}
                      </span>
                    </div>
                  </div>
                </Link>
              </Reveal>
            </div>
          </section>
        </Reveal>
        )}

        {everydayEssentialsDisplayTiles.length > 0 ? <Reveal delayMs={180}>
          <section className="border-t border-[#dce9ff] px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6">
            <SectionTitle title="Everyday Essentials" to="/collections/everyday-essentials" />
            <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5 lg:gap-4 xl:grid-cols-6">
              {everydayEssentialsDisplayTiles.map((tile, index) => (
                <Reveal key={`${tile.to}-${tile.title}-${index}`} delayMs={180 + index * 50}>
                  <OverlayProductCard
                    title={tile.title}
                    image={tile.image}
                    to={tile.to}
                    price={tile.price}
                    productId={tile.productId}
                    fallbackImage={bestSellerHeroImage}
                    imageAlt={buildProductImageAltText(tile.title, "everyday essentials")}
                    compact
                    className="w-full"
                  />
                </Reveal>
              ))}
            </div>
          </section>
        </Reveal> : null}

        <Reveal delayMs={280}>
          <section className="border-t border-[#dce9ff] px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6">
            <SectionTitle title="What Our Customers Are Saying" />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[#2b5fae] sm:mt-5">
              <p className="inline-flex items-center rounded-full border border-[#cfe0ff] bg-white/70 px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.12em]">
                {reviewTiles.length} reviews
              </p>
            </div>

            <div className="mt-4 rounded-[1.25rem] border border-[#d2e4ff] bg-[linear-gradient(160deg,#fbfdff,#f1f7ff)] p-3 shadow-[0_18px_40px_-34px_rgba(22,77,160,0.24)] sm:mt-5 sm:p-4">
              <div ref={reviewCarouselRef} className="salt-review-carousel">
                <div className="salt-review-carousel-track gap-3.5 sm:gap-4 lg:gap-5">
                  {reviewTrackTiles.map((tile, index) => (
                    <article
                      key={`${tile.key}-${index}`}
                      className="flex h-[13.75rem] w-[16rem] shrink-0 flex-col rounded-[1.05rem] border border-[#d2e4ff] bg-[#ffffff] p-4 text-[#1c4b96] shadow-[0_14px_36px_-30px_rgba(22,77,160,0.2)] sm:h-[14rem] sm:w-[17rem] lg:h-[14.25rem] lg:w-[18rem]"
                    >
                      <div className="flex items-center gap-1 text-[#f2c100]">
                        {stars.map((starIndex) => (
                          <Star
                            key={starIndex}
                            className={`h-4 w-4 ${starIndex < tile.rating ? "fill-current" : "text-[#bfd4fb]"}`}
                          />
                        ))}
                      </div>
                      <p className="mt-3 line-clamp-4 flex-1 text-sm leading-6 text-[#2f5fa9]">
                        "{tile.quote}"
                      </p>
                      <p className="mt-3 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[#1c4b96]/75">
                        {tile.author}
                        {tile.verifiedBuyer ? " - Verified Buyer" : ""}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </Reveal>
      </div>
    </section>
  );
};

export default HomePage;
