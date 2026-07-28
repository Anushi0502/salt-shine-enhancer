import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Star } from "lucide-react";
import Reveal from "@/components/storefront/Reveal";
import ResilientImage from "@/components/storefront/ResilientImage";
import SeoMetadata from "@/components/storefront/SeoMetadata";
import HomeHero from "@/components/storefront/HomeHero";
import GiftBanner from "@/components/salt/GiftBanner";
import { formatMoney, polishPlainText } from "@/lib/formatters";
import { useCollections } from "@/lib/collections-data";
import { useHomeCollectionProducts } from "@/lib/home-collection-products";
import { useHomeFeaturedProducts } from "@/lib/home-featured-products";
import { isBestSellerCollectionHandle } from "@/lib/homepage-merchandising";
import { normalizeShopifyAssetUrl } from "@/lib/theme-assets";
import heroEverydayEssentials from "@/assets/hero-everyday-essentials-square.png";
import heroPortableGadgets from "@/assets/hero-portable-gadgets-square.png";
import heroTravelOutdoor from "@/assets/hero-travel-outdoor-square.png";
import heroWomensBeauty from "@/assets/hero-womens-beauty-square.png";
import heroMain from "@/assets/hero-main.jpg";
import type { HomeHeroSlide } from "@/components/storefront/HomeHero";
import type { ShopifyCollection, ShopifyProduct } from "@/types/shopify";

type ImageTile = {
  title: string;
  image: string;
  to: string;
  alt?: string;
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

const HOME_REVIEW_SCROLL_PX_PER_MS = 0.035;

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

function SectionTitle({ title, to }: { title: string; to?: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <p className="text-[0.66rem] font-bold uppercase tracking-[0.22em] text-muted-foreground">
          Curated edit
        </p>
        <h2 className="mt-2 font-display text-[clamp(1.45rem,3vw,2.15rem)] leading-[0.96] tracking-[-0.035em] text-foreground">
          {to ? (
            <Link to={to} className="transition hover:text-primary">
              {title}
            </Link>
          ) : (
            title
          )}
        </h2>
      </div>

      {to ? (
        <Link to={to} className="salt-outline-chip h-10 px-4 py-0 text-[0.66rem] font-bold uppercase tracking-[0.14em]">
          View all
        </Link>
      ) : null}
    </div>
  );
}

function OverlayProductCard({
  title,
  image,
  to,
  price,
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
  fallbackImage: string;
  className?: string;
  imageAlt?: string;
  compact?: boolean;
  tight?: boolean;
}) {
  const imageSrc = normalizeShopifyAssetUrl(image) || image || fallbackImage;
  const fallbackSrc = normalizeShopifyAssetUrl(fallbackImage) || fallbackImage;
  const resolvedAlt = imageAlt || `${title} product image from SALT Online Store`;
  const shellClass = tight
    ? "rounded-[1.15rem] border border-border/70 bg-[linear-gradient(180deg,hsl(var(--background)/0.98),hsl(var(--card)/0.94))] shadow-[0_16px_34px_-28px_rgba(15,23,42,0.16)]"
    : compact
      ? "rounded-[1.35rem] border border-border/70 bg-[linear-gradient(180deg,hsl(var(--background)/0.98),hsl(var(--card)/0.94))] shadow-[0_18px_36px_-30px_rgba(15,23,42,0.16)]"
      : "rounded-[1.55rem] border border-border/70 bg-[linear-gradient(180deg,hsl(var(--background)/0.98),hsl(var(--card)/0.94))] shadow-[0_20px_44px_-32px_rgba(15,23,42,0.18)]";
  const mediaClass = tight
    ? "aspect-[1/1.02] overflow-hidden bg-muted/20"
    : compact
      ? "aspect-[1/1.04] overflow-hidden bg-muted/20"
      : "aspect-[1/0.96] overflow-hidden bg-muted/20";
  const titleClass = tight
    ? "line-clamp-2 font-display text-[0.88rem] font-semibold leading-[1.08] tracking-[-0.03em] text-foreground sm:text-[0.96rem]"
    : compact
      ? "line-clamp-2 font-display text-[0.96rem] font-semibold leading-[1.08] tracking-[-0.03em] text-foreground sm:text-[1.05rem]"
      : "line-clamp-2 font-display text-[1.04rem] font-semibold leading-[1.08] tracking-[-0.03em] text-foreground sm:text-[1.16rem]";
  const priceClass = tight
    ? "text-[0.9rem] font-black leading-none tracking-[0.01em] text-foreground sm:text-[0.96rem]"
    : compact
      ? "text-[1rem] font-black leading-none tracking-[0.01em] text-foreground sm:text-[1.08rem]"
      : "text-[1.16rem] font-black leading-none tracking-[0.01em] text-foreground sm:text-[1.26rem]";
  const bodyClass = tight ? "px-2.5 py-2.5" : compact ? "px-3 py-3" : "px-3.5 py-3.5";
  const imageClass = "h-full w-full object-cover transition duration-700 group-hover:scale-[1.05]";

  return (
    <Link
      to={to}
      className={`group flex h-full flex-col overflow-hidden ${shellClass} ${className}`.trim()}
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
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--background)/0.02),hsl(var(--foreground)/0.04)_52%,hsl(var(--foreground)/0.12))]" />
      </div>
      <div className={`flex flex-1 flex-col ${bodyClass}`}>
        <p className="text-[0.55rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          SALT pick
        </p>
        <p className={titleClass}>{title}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <span className={priceClass}>{price}</span>
          <span className="salt-editorial-meta inline-flex items-center gap-1 px-2.5 py-1 text-[0.55rem] font-bold uppercase tracking-[0.12em] transition group-hover:border-primary/30 group-hover:bg-background">
            View
            <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function normalizeText(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
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

function buildProductImageAltText(title: string, contextLabel: string): string {
  const normalizedTitle = polishPlainText(title) || "Product";
  const normalizedContext = polishPlainText(contextLabel).toLowerCase();
  return `${normalizedTitle} product photo featured in SALT ${normalizedContext}.`;
}

const HomePage = () => {
  // Do not download the full 6k-product catalog just to render curated homepage cards.
  // Full catalog loading remains on search, collection, and product routes.
  const { data: collectionsPayload } = useCollections();
  const { data: homeFeaturedProductsPayload } = useHomeFeaturedProducts();
  const { data: homeCollectionProductsPayload } = useHomeCollectionProducts();
  const normalizedHeroMain = normalizeShopifyAssetUrl(heroMain) || heroMain;
  const collections = useMemo(() => collectionsPayload?.collections ?? [], [collectionsPayload]);
  const bestSellerCollection = useMemo(
    () => findBestSellerCollection(collections),
    [collections],
  );
  const bestSellerTiles = useMemo<ProductTile[]>(() => {
    return (homeFeaturedProductsPayload?.bestSellerProducts || []).slice(0, 15).map((product) => ({
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
    normalizeShopifyAssetUrl(bestSellerCollection?.image?.src) || normalizedHeroMain;
  const homeHeroSlides = useMemo<HomeHeroSlide[]>(() => {
    const sections = homeCollectionProductsPayload?.sections;
    if (!sections) {
      return [];
    }

    return [
      {
        key: sections.everydayEssentials.handle,
        title: sections.everydayEssentials.title,
        image: heroEverydayEssentials,
        alt: "Everyday Essentials collection banner.",
        ctaHref: `/collections/${sections.everydayEssentials.handle}`,
        products: sections.everydayEssentials.products,
      },
      {
        key: sections.womensBeautyEssentials.handle,
        title: sections.womensBeautyEssentials.title,
        image: heroWomensBeauty,
        alt: "Women's Beauty Essentials collection banner.",
        ctaHref: `/collections/${sections.womensBeautyEssentials.handle}`,
        products: sections.womensBeautyEssentials.products,
      },
      {
        key: sections.portableGadgets.handle,
        title: sections.portableGadgets.title,
        image: heroPortableGadgets,
        alt: "Portable Gadgets collection banner.",
        ctaHref: `/collections/${sections.portableGadgets.handle}`,
        products: sections.portableGadgets.products,
      },
      {
        key: sections.travelOutdoor.handle,
        title: sections.travelOutdoor.title,
        image: heroTravelOutdoor,
        alt: "Travel & Outdoor collection banner.",
        ctaHref: `/collections/${sections.travelOutdoor.handle}`,
        products: sections.travelOutdoor.products,
      },
    ];
  }, [homeCollectionProductsPayload]);
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
  const homeDescription = "Shop curated essentials and gift-ready finds with clearer discovery and faster checkout.";

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
        image={normalizedHeroMain}
      />
      <div className="space-y-4 sm:space-y-5">
        <HomeHero
          featured={homeFeaturedProductsPayload?.bestSellerProducts?.slice(0, 4) || []}
          leadCollection={bestSellerCollection}
          slides={homeHeroSlides}
        />

        {bestSellerDisplayTiles.length > 0 ? <Reveal delayMs={80}>
          <section className="salt-section-shell rounded-[1.75rem] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
            <SectionTitle title="Best Sellers" />
            <div className="mt-5 grid grid-cols-2 gap-3 sm:mt-6 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5 lg:gap-5 xl:grid-cols-6 xl:gap-6">
              {bestSellerDisplayTiles.map((tile, index) => (
                <Reveal key={`${tile.to}-${tile.title}-${index}`} delayMs={120 + index * 50}>
                  <OverlayProductCard
                    title={tile.title}
                    image={tile.image}
                    to={tile.to}
                    price={tile.price}
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
              <section className="salt-section-shell rounded-[1.75rem] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
                <SectionTitle title={section.title} to={section.to} />
                <div className="mt-5 grid grid-cols-2 gap-3 sm:mt-6 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5 lg:gap-5 xl:grid-cols-6 xl:gap-6">
                  {section.tiles.map((tile, index) => (
                    <Reveal key={`${tile.to}-${tile.title}-${index}`} delayMs={120 + index * 50}>
                      <OverlayProductCard
                        title={tile.title}
                        image={tile.image}
                        to={tile.to}
                        price={tile.price}
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
          <section className="salt-section-shell rounded-[1.75rem] px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6">
            <GiftBanner />
          </section>
        </Reveal>

        <Reveal delayMs={280}>
          <section className="salt-section-shell rounded-[1.75rem] px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6">
            <SectionTitle title="What Our Customers Are Saying" />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-muted-foreground sm:mt-5">
              <p className="salt-editorial-meta inline-flex items-center px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.12em]">
                {reviewTiles.length} reviews
              </p>
            </div>

            <div className="salt-surface mt-4 rounded-[1.25rem] p-3 shadow-[0_18px_40px_-34px_rgba(22,77,160,0.18)] sm:mt-5 sm:p-4">
              <div ref={reviewCarouselRef} className="salt-review-carousel">
                <div className="salt-review-carousel-track gap-3.5 sm:gap-4 lg:gap-5">
                  {reviewTrackTiles.map((tile, index) => (
                    <article
                      key={`${tile.key}-${index}`}
                      className="flex h-[13.75rem] w-[16rem] shrink-0 flex-col rounded-[1.05rem] border border-border/70 bg-background/96 p-4 text-foreground shadow-[0_14px_36px_-30px_rgba(22,77,160,0.14)] sm:h-[14rem] sm:w-[17rem] lg:h-[14.25rem] lg:w-[18rem]"
                    >
                      <div className="flex items-center gap-1 text-amber-500">
                        {stars.map((starIndex) => (
                          <Star
                            key={starIndex}
                            className={`h-4 w-4 ${starIndex < tile.rating ? "fill-current" : "text-border"}`}
                          />
                        ))}
                      </div>
                      <p className="mt-3 line-clamp-4 flex-1 text-sm leading-6 text-muted-foreground">
                        "{tile.quote}"
                      </p>
                      <p className="mt-3 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
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
