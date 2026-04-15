import { useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CreditCard, Headphones, RotateCcw, Sparkles, Star, Truck } from "lucide-react";
import Reveal from "@/components/storefront/Reveal";
import { formatMoney, minPrice, productImage, savingsPercent } from "@/lib/formatters";
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

type TrustTile = {
  title: string;
  copy: string;
  icon: typeof Truck;
};

type ReviewTile = {
  quote: string;
};

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
    title: "Gifts for Her",
    to: "/collections/gifts",
    collectionHandles: ["gifts", "gift"],
    productKeywords: ["women", "her", "gift", "planner"],
  },
  {
    title: "Gifts for Him",
    to: "/shop?q=men",
    collectionHandles: ["gifts", "gift"],
    productKeywords: ["men", "him", "gift", "tool"],
  },
  {
    title: "Fun & Unique Finds",
    to: "/shop?max=25",
    collectionHandles: ["home-decor", "gifts", "gift"],
    productKeywords: ["unique", "home", "decor", "gift"],
  },
];

const trustTiles: TrustTile[] = [
  {
    title: "Fast Shipping",
    copy: "Clear delivery timelines for everyday essentials.",
    icon: Truck,
  },
  {
    title: "Secure Checkout",
    copy: "Trusted payments with a smooth, simple flow.",
    icon: CreditCard,
  },
  {
    title: "Easy Returns",
    copy: "A 30-day return window to shop with confidence.",
    icon: RotateCcw,
  },
  {
    title: "Friendly Support",
    copy: "Quick help when you need product or order guidance.",
    icon: Headphones,
  },
];

const reviewTiles: ReviewTile[] = [
  {
    quote: "Creating a warm home feels easier when everything is grouped in one calm place.",
  },
  {
    quote: "The layout feels clean, the categories make sense, and checkout is quick.",
  },
  {
    quote: "Beautiful picks, soft colors, and products that feel giftable right away.",
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
  const bestSellerProductIds = useMemo(
    () => bestSellerIdsPayload?.productIds ?? [],
    [bestSellerIdsPayload],
  );
  const bestSellerProducts = useMemo(() => {
    if (!products.length) {
      return [];
    }

    const productById = new Map(products.map((product) => [product.id, product]));
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
  }, [bestSellerProductIds, products]);
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
  const bestSellerHeroImage =
    normalizeShopifyAssetUrl(bestSellerCollection?.image?.src) || heroMain;
  const bestSellerCtaLink = bestSellerCollection
    ? `/shop?collection=${bestSellerCollection.handle}`
    : "/shop?sort=discount";
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

  const categoryTiles = useMemo<ImageTile[]>(
    () =>
      categoryTileConfigs.map((tile) => {
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
      }),
    [bestSellerHeroImage, collectionImageByHandle, findProductImageByKeywords],
  );

  const giftTiles = useMemo<ImageTile[]>(() => {
    const usedGiftProductIds = new Set<number>();

    return giftTileConfigs.map((tile) => {
      const imageFromProduct = findProductImageByKeywords(tile.productKeywords, usedGiftProductIds);
      const imageFromCollection =
        tile.collectionHandles
          .map((handle) => collectionImageByHandle.get(normalizeHandle(handle)) || null)
          .find(Boolean) || null;

      return {
        title: tile.title,
        to: tile.to,
        image: imageFromProduct || imageFromCollection || bestSellerHeroImage,
      };
    });
  }, [bestSellerHeroImage, collectionImageByHandle, findProductImageByKeywords]);
  return (
    <section className="mt-2 w-full pb-10 sm:mt-4 sm:pb-14 lg:pb-20">
      <div className="overflow-hidden rounded-[1.1rem] border border-[#c5dbff] bg-[#f8fbff] shadow-[0_28px_80px_-56px_rgba(22,77,160,0.24)] sm:rounded-[1.4rem] lg:rounded-[1.6rem]">
        <Reveal>
          <section className="grid border-b border-[#dce9ff] lg:grid-cols-[1.05fr_0.95fr]">
            <div className="relative min-h-[12rem] sm:min-h-[16rem] lg:min-h-[23rem]">
              <img
                src={bestSellerHeroImage}
                alt={`${bestSellerCollection?.title || "Best Sellers"} collection`}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(18,58,128,0.58)_0%,rgba(18,58,128,0.48)_50%,rgba(18,58,128,0.43)_100%)]" />
            </div>

            <div className="flex items-center justify-center bg-[linear-gradient(160deg,#f7fbff_0%,#edf5ff_42%,#f8fbff_100%)] px-5 py-8 text-left sm:px-7 sm:py-10 lg:px-11">
              <div className="relative w-full max-w-[26.4rem] overflow-hidden rounded-[1.28rem] border border-[#cadeff] bg-[linear-gradient(155deg,#f9fcff_0%,#edf5ff_45%,#f4f8ff_100%)] p-6 shadow-[0_30px_62px_-46px_rgba(22,77,160,0.56)] sm:p-7 lg:p-8">
                <div className="pointer-events-none absolute left-0 top-9 h-20 w-1 rounded-r-full bg-[#1f63d8]" />
                <div className="pointer-events-none absolute -right-8 -top-12 h-28 w-28 rounded-full bg-[#f2c100]/16 blur-2xl" />
                <p className="inline-flex items-center gap-1.5 rounded-full border border-[#ffe17a] bg-[#fff5ca] px-2.5 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-[#1f56b2] sm:text-[0.62rem]">
                  <Sparkles className="h-3 w-3" />
                  Salt best sellers
                </p>
                <h1 className="mt-4 font-display text-[clamp(2rem,6.4vw,3.45rem)] leading-[1.04] tracking-[-0.015em] text-[#183f84]">
                  <span className="block text-[0.92em] leading-[0.95] text-[#2b68db]">
                    Curated Home,
                  </span>
                  <span className="block bg-[linear-gradient(90deg,#1a4f9e_0%,#2d6cdf_100%)] bg-clip-text text-transparent">
                    Kitchen & Gifts
                  </span>
                  <span className="block">for Everyday Living</span>
                </h1>
                <div className="mt-7 flex w-full flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <Link
                    to={bestSellerCtaLink}
                    className="inline-flex h-11 items-center justify-center gap-1.5 rounded-[0.78rem] bg-[#1f63d8] px-6 text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_14px_30px_-18px_rgba(31,99,216,0.9)] transition hover:bg-[#1d56be] sm:px-7 sm:text-[0.72rem]"
                  >
                    Shop now
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <Link
                    to="/collections"
                    className="inline-flex h-11 items-center justify-center rounded-[0.78rem] border border-[#bcd6ff] bg-white/88 px-6 text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#1a4fa5] transition hover:-translate-y-[1px] hover:border-[#90b8ff] hover:text-[#133d83] sm:px-7 sm:text-[0.72rem]"
                  >
                    Browse collections
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal delayMs={80}>
          <section className="px-3 py-6 sm:px-5 sm:py-7 lg:px-8 lg:py-8">
            <SectionTitle title="Shop by Category" />
            <div className="mt-4 grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 sm:mt-5 sm:gap-3.5 lg:grid-cols-4">
              {categoryTiles.map((tile, index) => (
                <Reveal key={tile.title} delayMs={120 + index * 70}>
                  <Link
                    to={tile.to}
                    className="group relative block overflow-hidden border border-[#d2e4ff] bg-[#eef5ff]"
                  >
                    <div className="aspect-[1.26/0.85] overflow-hidden sm:aspect-[1.18/0.8]">
                      <div className="salt-category-scroll-track h-full w-full">
                        <img
                          src={tile.image}
                          alt={tile.title}
                          className="h-[114%] w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                        />
                      </div>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(14,48,109,0),rgba(14,48,109,0.92))] px-3 py-2.5 text-center">
                      <p className="font-display text-[0.98rem] text-white sm:text-[1.08rem]">
                        {tile.title}
                      </p>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </section>
        </Reveal>

        <Reveal delayMs={120}>
          <section className="border-t border-[#dce9ff] px-3 py-6 sm:px-5 sm:py-7 lg:px-8 lg:py-8">
            <SectionTitle title="Best Sellers" />
            <div className="mt-4 grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 sm:mt-5 sm:gap-3.5 lg:grid-cols-4">
              {bestSellerTiles.map((tile, index) => (
                <Reveal key={tile.title} delayMs={160 + index * 70}>
                  <Link
                    to={tile.to}
                    className="group relative block overflow-hidden border border-[#d2e4ff] bg-[#eef5ff]"
                  >
                    <div className="aspect-[1.05/1] overflow-hidden sm:aspect-[1/0.94]">
                      <img
                        src={tile.image}
                        alt={tile.title}
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                      />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(14,48,109,0),rgba(14,48,109,0.96))] px-2.5 py-2 text-center text-white">
                      <p className="font-display text-[0.88rem] leading-tight sm:text-[0.98rem]">
                        {tile.title}
                      </p>
                      <p className="mt-1 text-[0.78rem] font-semibold tracking-[0.04em] text-[#ffe27a]">
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
                      <img
                        src={tile.image}
                        alt={tile.title}
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
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

        <Reveal delayMs={220}>
          <section className="border-t border-[#dce9ff] px-3 py-6 sm:px-5 sm:py-7 lg:px-8 lg:py-8">
            <div className="grid gap-4 lg:grid-cols-[1fr_0.95fr] lg:items-stretch">
              <div className="rounded-[1.15rem] border border-[#d2e4ff] bg-[#f8fbff] p-4 sm:rounded-[1.35rem] sm:p-6">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-[#f2b600]">
                  Our Promise
                </p>
                <h2 className="mt-2 font-display text-[clamp(1.6rem,3.5vw,2.6rem)] leading-[1.06] text-[#183f84]">
                  The SALT Difference
                </h2>
                <p className="mt-3 max-w-[36ch] text-sm leading-6 text-[#2f5fa9] sm:text-[0.97rem]">
                  We keep shopping calm and intentional. Each pick is chosen for daily value, quality, and gift-ready simplicity.
                </p>

                <div className="mt-5 grid gap-4 sm:mt-6 sm:grid-cols-2">
                  {trustTiles.map((tile, index) => {
                    const Icon = tile.icon;

                    return (
                      <Reveal key={tile.title} delayMs={240 + index * 60}>
                        <div className="rounded-[0.95rem] border border-[#d2e4ff] bg-white p-3.5 sm:p-4">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#ffe27a] bg-[#fff8d7] text-[#1f63d8]">
                            <Icon className="h-4 w-4" />
                          </div>
                          <p className="mt-2 text-[0.95rem] font-semibold text-[#1c4b96]">
                            {tile.title}
                          </p>
                          <p className="mt-1 text-[0.82rem] leading-5 text-[#2f5fa9]">
                            {tile.copy}
                          </p>
                        </div>
                      </Reveal>
                    );
                  })}
                </div>
              </div>

              <div className="overflow-hidden rounded-[1.15rem] border border-[#d2e4ff] bg-[#eef5ff] sm:rounded-[1.35rem]">
                <img
                  src={collectionDecor}
                  alt="Styled home wall with decor frames and shelves"
                  className="h-full min-h-[17rem] w-full object-cover sm:min-h-[21rem]"
                />
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal delayMs={260}>
          <section className="border-t border-[#dce9ff] px-3 py-6 sm:px-5 sm:py-7 lg:px-8 lg:py-8">
            <SectionTitle title="What Our Customers Are Saying" />
            <div className="mt-5 grid grid-cols-1 gap-3.5 sm:mt-6 md:grid-cols-2 lg:grid-cols-3">
              {reviewTiles.map((tile, index) => (
                <Reveal key={tile.quote} delayMs={300 + index * 80}>
                  <article className="h-full border border-[#d2e4ff] bg-[#ffffff] p-5 text-[#1c4b96] shadow-[0_14px_36px_-30px_rgba(22,77,160,0.2)]">
                    <div className="flex items-center gap-1 text-[#f2c100]">
                      {stars.map((star) => (
                        <Star key={star} className="h-4 w-4 fill-current" />
                      ))}
                    </div>
                    <p className="mt-4 text-sm leading-6 text-[#2f5fa9]">
                      "{tile.quote}"
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

