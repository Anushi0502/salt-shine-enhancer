import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, Star } from "lucide-react";
import Reveal from "@/components/storefront/Reveal";
import ProductCard from "@/components/storefront/ProductCard";
import SeoMetadata from "@/components/storefront/SeoMetadata";
import HomeHero, { type HomeHeroSlide } from "@/components/storefront/HomeHero";
import { HomeShelfState } from "@/components/storefront/HomeShelfState";
import GiftBanner from "@/components/salt/GiftBanner";
import { FreeGiftFinder } from "@/components/salt/FreeGiftFinder";
import { SaltFinds } from "@/components/salt/SaltFinds";
import { polishPlainText } from "@/lib/formatters";
import { SALT_BRAND_SHORT_DESCRIPTION } from "@/lib/salt-brand";
import { toGiftFinderProduct } from "@/lib/gift-finder-catalog";
import { useHomeCollectionProducts } from "@/lib/home-collection-products";
import { useHomeFeaturedProducts } from "@/lib/home-featured-products";
import { useJudgeMeTestimonials } from "@/lib/judgeme";
import { normalizeShopifyAssetUrl } from "@/lib/theme-assets";
import kidsCollectionBanner from "@/assets/collection-banners/kids-collection-banner.png";
import footwearCollectionBanner from "@/assets/collection-banners/footwear-collection-banner.png";
import bestsellersCollectionBanner from "@/assets/collection-banners/bestsellers-collection-banner.png";
import luxuryFragrancesCollectionBanner from "@/assets/collection-banners/luxury-fragrances-collection-banner.png";
import menCollectionBanner from "@/assets/collection-banners/men-collection-banner.png";
import womenCollectionBanner from "@/assets/collection-banners/women-collection-banner.png";
import heroMain from "@/assets/hero-main.jpg";
import type { ShopifyProduct } from "@/types/shopify";

type ReviewTile = {
  key: string;
  quote: string;
  author: string;
  rating: number;
  verifiedBuyer: boolean;
  sourceLabel: string;
};

const HOME_REVIEW_SCROLL_PX_PER_MS = 0.06;
const REVIEW_DISPLAY_LIMIT = 24;
const HOME_PRODUCT_DISPLAY_LIMIT = 12;

const HOME_COLLECTION_SHELVES = [
  { key: "kids", title: "Kids", handle: "kids" },
  { key: "footwear", title: "Footwear", handle: "footwear" },
  { key: "luxuryFragrances", title: "Luxury Fragrances", handle: "luxury-fragrances" },
  { key: "men", title: "Men", handle: "men-collection" },
  { key: "women", title: "Women", handle: "women" },
] as const;

const HOME_HERO_BANNERS = [
  { key: "kids", title: "Kids", handle: "kids", image: kidsCollectionBanner, alt: "Kids collection banner" },
  { key: "footwear", title: "Footwear", handle: "footwear", image: footwearCollectionBanner, alt: "Footwear collection banner" },
  { key: "bestSellers", title: "Best Sellers", handle: "best-sellers", image: bestsellersCollectionBanner, alt: "Best Sellers collection banner" },
  { key: "luxuryFragrances", title: "Luxury Fragrances", handle: "luxury-fragrances", image: luxuryFragrancesCollectionBanner, alt: "Luxury Fragrances collection banner" },
  { key: "men", title: "Men", handle: "men-collection", image: menCollectionBanner, alt: "Men collection banner" },
  { key: "women", title: "Women", handle: "women", image: womenCollectionBanner, alt: "Women collection banner" },
] as const;

const fallbackReviewTiles: ReviewTile[] = [
  {
    key: "fallback-review-1",
    quote: "Creating a warm home feels easier when everything is grouped in one calm place.",
    author: "SALT customer",
    rating: 5,
    verifiedBuyer: true,
    sourceLabel: "Verified shopper",
  },
  {
    key: "fallback-review-2",
    quote: "The layout feels clean, the categories make sense, and checkout is quick.",
    author: "SALT customer",
    rating: 5,
    verifiedBuyer: true,
    sourceLabel: "Verified shopper",
  },
  {
    key: "fallback-review-3",
    quote: "Beautiful picks, soft colors, and products that feel giftable right away.",
    author: "SALT customer",
    rating: 5,
    verifiedBuyer: true,
    sourceLabel: "Verified shopper",
  },
  {
    key: "fallback-review-4",
    quote: "Quality felt better than expected and delivery updates were clear throughout.",
    author: "SALT customer",
    rating: 5,
    verifiedBuyer: true,
    sourceLabel: "Verified shopper",
  },
];

const stars = Array.from({ length: 5 }, (_, index) => index);

function formatReviewAverage(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }

  return Number(value.toFixed(2)).toString();
}

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

function normalizeText(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
}

function productSearchText(product: ShopifyProduct): string {
  const tags = Array.isArray(product.tags) ? product.tags.join(" ") : String(product.tags || "");
  return normalizeText(`${product.title} ${product.product_type} ${tags}`);
}

type HomeCardSource = {
  id: number;
  title: string;
  handle: string;
  image: string;
  price: number;
  compareAtPrice: number | null;
  averageRating?: number | null;
  reviewCount?: number | null;
};

function toProductCardProduct(source: HomeCardSource): ShopifyProduct {
  const compareAtPrice = Number(source.compareAtPrice || 0);
  const image = source.image ? { id: source.id, src: source.image, alt: source.title } : null;

  return {
    id: source.id,
    title: source.title,
    handle: source.handle,
    body_html: null,
    vendor: "SALT",
    product_type: "",
    tags: [],
    created_at: "",
    published_at: null,
    updated_at: "",
    average_rating: Number(source.averageRating) > 0 ? Number(source.averageRating) : undefined,
    total_reviews: Number(source.reviewCount) > 0 ? Math.floor(Number(source.reviewCount)) : undefined,
    variants: [
      {
        id: source.id,
        title: "Default",
        price: source.price.toFixed(2),
        compare_at_price: compareAtPrice > source.price ? compareAtPrice.toFixed(2) : null,
        available: true,
      },
    ],
    images: image ? [image] : [],
    image,
  };
}

const HomePage = () => {
  // Request only the small live Shopify collections used by this page. Product,
  // search, and collection routes independently fetch their current bounded view.
  const homeFeaturedProductsQuery = useHomeFeaturedProducts();
  const { data: homeFeaturedProductsPayload } = homeFeaturedProductsQuery;
  const homeCollectionProductsQuery = useHomeCollectionProducts();
  const { data: homeCollectionProductsPayload } = homeCollectionProductsQuery;
  const normalizedHeroMain = normalizeShopifyAssetUrl(heroMain) || heroMain;
  const bestSellerTiles = useMemo(
    () =>
      (homeFeaturedProductsPayload?.bestSellerProducts || [])
        .slice(0, HOME_PRODUCT_DISPLAY_LIMIT)
        .map(toProductCardProduct),
    [homeFeaturedProductsPayload?.bestSellerProducts],
  );
  const bestSellerDisplayTiles = bestSellerTiles;
  const giftFinderProducts = useMemo(
    () => {
      const sourceProducts =
        homeFeaturedProductsPayload?.giftFinderProducts?.length
          ? homeFeaturedProductsPayload.giftFinderProducts
          : homeFeaturedProductsPayload?.bestSellerProducts || [];
      const seen = new Set<string>();

      return sourceProducts
        .map((product, index) => toGiftFinderProduct(product, index))
        .filter((product) => {
          if (seen.has(product.slug)) return false;
          seen.add(product.slug);
          return true;
        });
    },
    [homeFeaturedProductsPayload?.bestSellerProducts, homeFeaturedProductsPayload?.giftFinderProducts],
  );
  const homeHeroSlides = useMemo<HomeHeroSlide[]>(
    () =>
      HOME_HERO_BANNERS.map((banner) => {
        const section = homeCollectionProductsPayload?.sections[banner.key];

        return {
          key: banner.key,
          title: section?.title || banner.title,
          image: banner.image,
          alt: banner.alt,
          ctaHref: `/collections/${section?.handle || banner.handle}`,
          description: `Explore the latest ${section?.title || banner.title.toLowerCase()} edit from SALT.`,
          products: section?.products || [],
        };
      }),
    [homeCollectionProductsPayload],
  );
  const homeCollectionSections = useMemo(
    () =>
      HOME_COLLECTION_SHELVES.map((fallbackSection) => {
        const section = homeCollectionProductsPayload?.sections[fallbackSection.key];

        return {
          title: section?.title || fallbackSection.title,
          to: `/collections/${section?.handle || fallbackSection.handle}`,
          products: (section?.products || []).slice(0, HOME_PRODUCT_DISPLAY_LIMIT).map(toProductCardProduct),
        };
      }),
    [homeCollectionProductsPayload],
  );
  const reviewCarouselRef = useRef<HTMLDivElement | null>(null);
  const reviewScrollPositionRef = useRef(0);
  const [testimonialsEnabled, setTestimonialsEnabled] = useState(false);
  useEffect(() => {
    const carousel = reviewCarouselRef.current;
    if (!carousel || typeof IntersectionObserver === "undefined") {
      setTestimonialsEnabled(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }

        setTestimonialsEnabled(true);
        observer.disconnect();
      },
      { rootMargin: "900px 0px" },
    );

    observer.observe(carousel);
    return () => observer.disconnect();
  }, []);
  // The homepage displays at most REVIEW_DISPLAY_LIMIT testimonials. Do not
  // crawl Judge.me's entire review archive just to populate that carousel.
  const { data: judgeMeTestimonials = [], isFetching: judgeMeTestimonialsFetching } =
    useJudgeMeTestimonials(REVIEW_DISPLAY_LIMIT, testimonialsEnabled);
  const reviewTiles = useMemo<ReviewTile[]>(() => {
    if (judgeMeTestimonials.length > 0) {
      return judgeMeTestimonials
        .slice(0, REVIEW_DISPLAY_LIMIT)
        .map((review) => ({
          key: review.id,
          quote: polishPlainText(review.body || review.title),
          author: polishPlainText(review.author || "Verified shopper") || "Verified shopper",
          rating: Math.max(0, Math.min(5, review.rating || 0)),
          verifiedBuyer: review.verifiedBuyer,
          sourceLabel: polishPlainText(review.sourceLabel || "Judge.me review") || "Judge.me review",
        }))
        .filter((tile) => Boolean(tile.quote));
    }

    if (judgeMeTestimonialsFetching) {
      return [];
    }

    return fallbackReviewTiles;
  }, [judgeMeTestimonials, judgeMeTestimonialsFetching]);
  const reviewSectionLoading = judgeMeTestimonialsFetching && judgeMeTestimonials.length === 0;
  const reviewLoopCopies = useMemo(() => {
    return reviewTiles.length > 0 ? 2 : 0;
  }, [reviewTiles.length]);
  const reviewAverage = useMemo(() => {
    const ratingSource = judgeMeTestimonials.length > 0 ? judgeMeTestimonials : reviewTiles;
    if (!ratingSource.length) {
      return 0;
    }

    return ratingSource.reduce((sum, review) => sum + review.rating, 0) / ratingSource.length;
  }, [judgeMeTestimonials, reviewTiles]);
  const reviewHeaderStarCount = Math.max(0, Math.min(5, Math.floor(reviewAverage)));
  const reviewRatingLabel = formatReviewAverage(reviewAverage);
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
  const homeDescription = SALT_BRAND_SHORT_DESCRIPTION;

  useEffect(() => {
    const carousel = reviewCarouselRef.current;
    if (!carousel || reviewTiles.length <= 1 || typeof window === "undefined") {
      return;
    }

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const compactViewportQuery = window.matchMedia("(max-width: 767px)");
    if (motionQuery.matches || compactViewportQuery.matches) {
      return;
    }

    let animationFrameId = 0;
    let lastFrameAt = 0;
    let isPaused = false;
    reviewScrollPositionRef.current = carousel.scrollLeft;

    const handleMouseEnter = () => {
      isPaused = true;
    };

    const handleMouseLeave = () => {
      isPaused = false;
    };

    const handleScroll = () => {
      reviewScrollPositionRef.current = carousel.scrollLeft;
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
          reviewScrollPositionRef.current += elapsed * HOME_REVIEW_SCROLL_PX_PER_MS;
          if (reviewScrollPositionRef.current >= loopWidth) {
            reviewScrollPositionRef.current -= loopWidth;
          }

          carousel.scrollLeft = reviewScrollPositionRef.current;
        }
      }

      animationFrameId = window.requestAnimationFrame(tick);
    };

    carousel.addEventListener("mouseenter", handleMouseEnter);
    carousel.addEventListener("mouseleave", handleMouseLeave);
    carousel.addEventListener("scroll", handleScroll, { passive: true });
    animationFrameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      carousel.removeEventListener("mouseenter", handleMouseEnter);
      carousel.removeEventListener("mouseleave", handleMouseLeave);
      carousel.removeEventListener("scroll", handleScroll);
    };
  }, [reviewLoopCopies, reviewTiles.length]);
  const scrollReviewCarousel = (direction: -1 | 1) => {
    const carousel = reviewCarouselRef.current;
    if (!carousel) {
      return;
    }

    const firstCard = carousel.querySelector<HTMLElement>("[data-review-card]");
    const cardWidth = firstCard?.getBoundingClientRect().width || 272;
    const cardGap = 20;

    carousel.scrollBy({
      left: direction * (cardWidth + cardGap),
      behavior: "smooth",
    });
    reviewScrollPositionRef.current = carousel.scrollLeft;
  };

  return (
    <section className="mt-1 w-full px-3 pb-3 sm:mt-3 sm:px-4 sm:pb-5 lg:px-5 lg:pb-6 xl:px-6">
      <SeoMetadata
        title="SALT Online Store | Curated essentials and giftable finds"
        description={homeDescription}
        canonicalPath="/"
        image={normalizedHeroMain}
      />
      <div className="space-y-4 sm:space-y-5">
        <HomeHero slides={homeHeroSlides} loading={homeCollectionProductsQuery.isPending} />

        <Reveal delayMs={80}>
          <section className="salt-section-shell rounded-[1.75rem] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
            <SectionTitle title="Best Sellers" />
            {homeFeaturedProductsQuery.isPending ? (
              <HomeShelfState shelfTitle="Best Sellers" state="loading" />
            ) : homeFeaturedProductsQuery.isError ? (
              <HomeShelfState
                shelfTitle="Best Sellers"
                state="error"
                onRetry={() => void homeFeaturedProductsQuery.refetch()}
                isRetrying={homeFeaturedProductsQuery.isFetching}
              />
            ) : bestSellerDisplayTiles.length > 0 ? (
              <div className="mt-5 grid grid-cols-2 gap-3 sm:mt-6 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5 lg:gap-5 xl:grid-cols-6 xl:gap-6">
                {bestSellerDisplayTiles.map((product, index) => (
                  <Reveal key={`${product.handle}-${index}`} delayMs={0} className="salt-reveal-instant">
                    <ProductCard
                      product={product}
                      variant="shop"
                      className="w-full max-w-[11rem] justify-self-center"
                    />
                  </Reveal>
                ))}
              </div>
            ) : (
              <HomeShelfState shelfTitle="Best Sellers" state="empty" />
            )}
          </section>
        </Reveal>

        {homeCollectionSections.map((section, sectionIndex) => (
          <Reveal key={section.to} delayMs={100 + sectionIndex * 20}>
            <section className="salt-section-shell rounded-[1.75rem] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
              <SectionTitle title={section.title} to={section.to} />
              {homeCollectionProductsQuery.isPending ? (
                <HomeShelfState shelfTitle={section.title} state="loading" />
              ) : homeCollectionProductsQuery.isError ? (
                <HomeShelfState
                  shelfTitle={section.title}
                  state="error"
                  onRetry={() => void homeCollectionProductsQuery.refetch()}
                  isRetrying={homeCollectionProductsQuery.isFetching}
                />
              ) : section.products.length > 0 ? (
                <div className="mt-5 grid grid-cols-2 gap-3 sm:mt-6 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5 lg:gap-5 xl:grid-cols-6 xl:gap-6">
                  {section.products.map((product, index) => (
                    <Reveal key={`${product.handle}-${index}`} delayMs={0} className="salt-reveal-instant">
                      <ProductCard
                        product={product}
                        variant="shop"
                        className="w-full max-w-[11rem] justify-self-center"
                      />
                    </Reveal>
                  ))}
                </div>
              ) : (
                <HomeShelfState shelfTitle={section.title} state="empty" />
              )}
            </section>
          </Reveal>
        ))}

        <Reveal delayMs={110}>
          <section className="salt-section-shell rounded-[1.75rem] px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6">
            <GiftBanner />
          </section>
        </Reveal>

        {giftFinderProducts.length > 0 ? (
          <Reveal delayMs={150}>
            <section className="salt-section-shell rounded-[1.75rem] px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6">
              <FreeGiftFinder
                products={giftFinderProducts}
                title="Find a live SALT gift in four quick picks"
                description="Choose a recipient, occasion, budget, and interest to see live catalog picks that stay inside your selected price range."
              />
            </section>
          </Reveal>
        ) : null}

        <Reveal delayMs={210}>
          <SaltFinds />
        </Reveal>

        <Reveal delayMs={280}>
          <section className="salt-section-shell rounded-[1.75rem] px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6">
            <div className="mx-auto max-w-5xl text-center">
              <h2 className="font-display text-[clamp(1.7rem,4vw,3rem)] leading-[0.94] tracking-[-0.05em] text-foreground sm:text-[clamp(1.85rem,3.3vw,3.25rem)]">
                What Our Customers Are Saying
              </h2>
              {reviewSectionLoading ? (
                <div className="mx-auto mt-4 h-7 w-[min(24rem,85vw)] animate-pulse rounded-full bg-border/40" />
              ) : (
                <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[0.92rem] sm:mt-4 sm:gap-x-4">
                  <div className="flex items-center gap-1 text-foreground">
                    {stars.map((starIndex) => (
                      <Star
                        key={starIndex}
                        className={`h-4 w-4 ${starIndex < reviewHeaderStarCount ? "fill-current" : "text-border"}`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <span>{reviewRatingLabel}</span>
                    <Star className="h-4 w-4 fill-current" />
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/92 px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-foreground shadow-[0_10px_24px_-20px_rgba(15,23,42,0.2)]">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#4cc1ba] text-white shadow-sm">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    Verified
                  </span>
                </div>
              )}
            </div>

            <div className="relative mt-6 sm:mt-7">
              <div className="salt-surface overflow-hidden rounded-[1.4rem] p-3 shadow-[0_18px_40px_-34px_rgba(22,77,160,0.18)] sm:p-4 lg:px-10 lg:py-5">
                {reviewSectionLoading ? (
                  <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
                    {Array.from({ length: 4 }, (_, index) => (
                      <article
                        key={`review-skeleton-${index}`}
                        className="flex h-[18rem] flex-col rounded-[1.25rem] border border-border/60 bg-[linear-gradient(180deg,hsl(var(--background)/0.98),hsl(var(--card)/0.94))] p-4 text-foreground shadow-[0_18px_42px_-34px_rgba(22,77,160,0.16)] sm:h-[21rem] lg:h-[24rem]"
                      >
                        <div className="flex flex-1 flex-col animate-pulse">
                          <div className="flex-1" />
                          <div className="mx-auto h-20 w-[70%] rounded-2xl bg-border/35" />
                          <div className="flex-1" />
                        </div>
                        <div className="mt-auto space-y-3 text-center">
                          <div className="mx-auto h-5 w-28 rounded-full bg-border/35" />
                          <div className="mx-auto h-4 w-20 rounded-full bg-border/30" />
                          <div className="mx-auto h-3.5 w-24 rounded-full bg-border/25" />
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => scrollReviewCarousel(-1)}
                      aria-label="Previous reviews"
                      className="absolute left-0 top-1/2 hidden h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background/96 text-foreground shadow-[0_14px_30px_-24px_rgba(15,23,42,0.28)] transition hover:-translate-y-1/2 hover:border-primary/30 hover:text-primary lg:inline-flex"
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollReviewCarousel(1)}
                      aria-label="Next reviews"
                      className="absolute right-0 top-1/2 hidden h-12 w-12 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background/96 text-foreground shadow-[0_14px_30px_-24px_rgba(15,23,42,0.28)] transition hover:-translate-y-1/2 hover:border-primary/30 hover:text-primary lg:inline-flex"
                    >
                      <ChevronRight className="h-6 w-6" />
                    </button>

                    <div
                      ref={reviewCarouselRef}
                      className="salt-review-carousel snap-x snap-proximity"
                      aria-label="Judge.me customer reviews carousel"
                    >
                      <div className="salt-review-carousel-track gap-3.5 sm:gap-4 lg:gap-5">
                        {reviewTrackTiles.map((tile, index) => (
                          <article
                            key={`${tile.key}-${index}`}
                            data-review-card
                            className="flex h-[18rem] w-[13.75rem] shrink-0 snap-start flex-col rounded-[1.25rem] border border-border/60 bg-[linear-gradient(180deg,hsl(var(--background)/0.98),hsl(var(--card)/0.94))] p-3.5 text-foreground shadow-[0_18px_42px_-34px_rgba(22,77,160,0.16)] sm:h-[21rem] sm:w-[15rem] sm:p-4 lg:h-[24rem] lg:w-[17rem] lg:p-4"
                          >
                            <div className="flex flex-1 flex-col">
                              <div className="flex-1" />
                              <p className="mx-auto max-w-[11rem] text-center text-[0.92rem] leading-6 tracking-[-0.01em] text-foreground/92 sm:max-w-[12rem] sm:text-[1.06rem] sm:leading-7">
                                {tile.quote}
                              </p>
                              <div className="flex-1" />
                            </div>
                            <div className="mt-auto space-y-3 text-center">
                              <div className="flex items-center justify-center gap-1 text-primary">
                                {stars.map((starIndex) => (
                                  <Star
                                    key={starIndex}
                                    className={`h-4 w-4 ${starIndex < tile.rating ? "fill-current" : "text-border"}`}
                                  />
                                ))}
                              </div>
                              <p className="text-[1rem] font-semibold leading-tight tracking-[-0.02em] text-foreground">
                                {tile.author}
                              </p>
                              <p className="line-clamp-1 text-[0.78rem] text-muted-foreground">
                                {tile.sourceLabel}
                              </p>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        </Reveal>
      </div>
    </section>
  );
};

export default HomePage;
