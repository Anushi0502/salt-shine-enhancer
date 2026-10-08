import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useEffect, useId, useState } from "react";

import Reveal from "@/components/storefront/Reveal";
import ProductCard from "@/components/storefront/ProductCard";
import { normalizeShopifyAssetUrl } from "@/lib/theme-assets";
import type { JudgeMeReviewSummary } from "@/lib/judgeme";
import type { HomeCollectionProduct } from "@/lib/home-collection-products";
import type { ShopifyProduct } from "@/types/shopify";

export type HomeHeroSlide = {
  key: string;
  title: string;
  image: string;
  alt: string;
  ctaHref: string;
  products: HomeCollectionProduct[];
};

type HomeHeroProps = {
  slides?: HomeHeroSlide[];
  reviewSummaries?: Record<number, JudgeMeReviewSummary | null>;
  loading?: boolean;
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function shouldAutoplayByDefault() {
  return (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function" ||
    !window.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

function toHeroProductCardProduct(source: HomeCollectionProduct): ShopifyProduct {
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
    variants: [
      {
        id: source.id,
        title: "Default",
        price: Number(source.price || 0).toFixed(2),
        compare_at_price: compareAtPrice > Number(source.price || 0) ? compareAtPrice.toFixed(2) : null,
        available: true,
      },
    ],
    images: image ? [image] : [],
    image,
  };
}

const HomeHero = ({ slides = [], reviewSummaries = {}, loading = true }: HomeHeroProps) => {
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(shouldAutoplayByDefault);
  const [isPointerPaused, setIsPointerPaused] = useState(false);
  const [isFocusPaused, setIsFocusPaused] = useState(false);
  const [failedImageKey, setFailedImageKey] = useState<string | null>(null);
  const carouselId = useId();
  const activeSlideId = `${carouselId}-active-slide`;

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const reducedMotionQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const handleReducedMotionChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setIsPlaying(false);
      }
    };

    reducedMotionQuery.addEventListener?.("change", handleReducedMotionChange);

    return () => {
      reducedMotionQuery.removeEventListener?.("change", handleReducedMotionChange);
    };
  }, []);

  useEffect(() => {
    if (slides.length <= 1) {
      setActiveSlideIndex(0);
      return;
    }

    setActiveSlideIndex((currentIndex) => currentIndex % slides.length);
  }, [slides.length]);

  const isRotationActive = isPlaying && !isPointerPaused && !isFocusPaused;

  useEffect(() => {
    if (slides.length <= 1 || !isRotationActive) {
      return;
    }

    const rotationInterval = window.setInterval(() => {
      setActiveSlideIndex((currentIndex) => (currentIndex + 1) % slides.length);
    }, 4400);

    return () => {
      window.clearInterval(rotationInterval);
    };
  }, [isRotationActive, slides.length]);

  const showPreviousSlide = () => {
    setActiveSlideIndex((currentIndex) => (currentIndex - 1 + slides.length) % slides.length);
  };

  const showNextSlide = () => {
    setActiveSlideIndex((currentIndex) => (currentIndex + 1) % slides.length);
  };

  const activeSlide = slides[activeSlideIndex] || slides[0];

  useEffect(() => {
    setFailedImageKey(null);
  }, [activeSlide?.image, activeSlide?.key]);

  if (!activeSlide) {
    return (
      <section
        className="w-full px-2 sm:px-4 lg:px-6"
        aria-busy={loading}
        aria-label={loading ? "Loading the current storefront edit" : "Current storefront edit unavailable"}
      >
        <div className="salt-editorial-shell overflow-hidden rounded-[2rem] p-3 sm:p-4 lg:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.16fr)_minmax(0,0.84fr)]">
            <div className="min-h-[20rem] animate-pulse rounded-[1.65rem] border border-border/60 bg-muted/55 sm:min-h-[28rem] lg:min-h-[38rem]" />
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }, (_, index) => (
                <div
                  key={`home-hero-skeleton-${index}`}
                  className="min-h-[14rem] animate-pulse rounded-[1.65rem] border border-border/60 bg-muted/45 sm:min-h-0"
                />
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  const slideProducts = (activeSlide.products ?? []).slice(0, 4);
  const activeSlideLabel = `Slide ${activeSlideIndex + 1} of ${slides.length}: ${activeSlide.title}`;

  return (
    <section
      className="w-full px-0 sm:px-2 lg:px-4"
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured collections"
      onMouseEnter={() => setIsPointerPaused(true)}
      onMouseLeave={() => setIsPointerPaused(false)}
      onFocusCapture={() => setIsFocusPaused(true)}
      onBlurCapture={(event) => {
        const nextFocusedElement = event.relatedTarget;

        if (!(nextFocusedElement instanceof Node) || !event.currentTarget.contains(nextFocusedElement)) {
          setIsFocusPaused(false);
        }
      }}
    >
      <Reveal className="salt-reveal-instant min-w-0 overflow-hidden">
        <div className="salt-editorial-shell rounded-[1.5rem] p-2 sm:rounded-[1.75rem] sm:p-3 lg:p-4">
          <div className="grid gap-2 sm:gap-3 lg:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] lg:items-stretch">
            <div
              id={activeSlideId}
              role="group"
              aria-roledescription="slide"
              aria-label={activeSlideLabel}
              aria-live={isRotationActive ? "off" : "polite"}
              aria-atomic="true"
              className="relative aspect-[16/9] overflow-hidden rounded-[1.25rem] border border-border/70 bg-foreground shadow-[0_24px_50px_-34px_rgba(15,23,42,0.35)] sm:rounded-[1.5rem]"
            >
              <Link
                to={activeSlide.ctaHref}
                aria-label={`Shop ${activeSlide.title}`}
                className="group absolute inset-0"
              >
                {failedImageKey === activeSlide.key ? (
                  <div
                    className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_30%_30%,rgba(59,130,246,0.48),transparent_42%),linear-gradient(135deg,#07111f,#203452)] px-8 text-center text-white"
                    aria-label={`${activeSlide.title} collection preview`}
                  >
                    <span className="font-display text-[clamp(2rem,5vw,5rem)] font-semibold leading-none tracking-[-0.06em]">
                      {activeSlide.title}
                    </span>
                  </div>
                ) : (
                  <img
                    src={normalizeShopifyAssetUrl(activeSlide.image) || activeSlide.image}
                    alt={activeSlide.alt}
                    loading="eager"
                    onError={() => setFailedImageKey(activeSlide.key)}
                    {...({ fetchpriority: "high" } as Record<string, string>)}
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover object-center transition duration-700 group-hover:scale-[1.02]"
                  />
                )}
              </Link>

              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(6,18,31,0.78)_0%,rgba(6,18,31,0.36)_38%,rgba(6,18,31,0.02)_72%)]" />
              <div className="pointer-events-none absolute inset-x-5 bottom-5 max-w-[48%] text-white sm:inset-x-8 sm:bottom-8">
                <p className="text-[0.58rem] font-bold uppercase tracking-[0.24em] text-white/75 sm:text-[0.68rem]">
                  SALT collection edit
                </p>
                <h2 className="mt-2 font-display text-[clamp(1.8rem,4vw,4.4rem)] font-semibold leading-[0.9] tracking-[-0.06em]">
                  {activeSlide.title}
                </h2>
                <span className="mt-3 inline-flex rounded-full bg-white px-4 py-2 text-[0.58rem] font-bold uppercase tracking-[0.12em] text-slate-950 sm:mt-4 sm:px-5 sm:py-2.5 sm:text-[0.66rem]">
                  Shop collection
                </span>
              </div>

              {slides.length > 1 ? (
                <div className="absolute right-2.5 top-2.5 z-10 flex max-w-[calc(100%-1.25rem)] items-center gap-1 rounded-full border border-white/35 bg-slate-950/75 p-1 text-white shadow-lg backdrop-blur-md sm:right-3 sm:top-3">
                  <button
                    type="button"
                    onClick={showPreviousSlide}
                    aria-label="Show previous featured collection"
                    aria-controls={activeSlideId}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:h-9 sm:w-9"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </button>

                  <div
                    className="flex items-center"
                    role="group"
                    aria-label="Choose a featured collection slide"
                  >
                    {slides.map((slide, index) => {
                      const isActive = index === activeSlideIndex;

                      return (
                        <button
                          key={slide.key}
                          type="button"
                          onClick={() => setActiveSlideIndex(index)}
                          aria-label={`Show slide ${index + 1} of ${slides.length}: ${slide.title}`}
                          aria-controls={activeSlideId}
                          aria-current={isActive ? "true" : undefined}
                          className="inline-flex h-7 w-5 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                          <span
                            aria-hidden="true"
                            className={`block h-1.5 rounded-full transition-all ${
                              isActive ? "w-3.5 bg-white" : "w-1.5 bg-white/50"
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={showNextSlide}
                    aria-label="Show next featured collection"
                    aria-controls={activeSlideId}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:h-9 sm:w-9"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsPlaying((currentValue) => !currentValue)}
                    aria-label={isPlaying ? "Pause automatic slide rotation" : "Start automatic slide rotation"}
                    aria-controls={activeSlideId}
                    className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-full border border-white/25 bg-white/10 px-2 text-[0.68rem] font-semibold uppercase tracking-[0.08em] transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:h-9 sm:px-2.5 sm:text-xs"
                  >
                    {isPlaying ? (
                      <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>{isPlaying ? "Pause" : "Play"}</span>
                  </button>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {slideProducts.map((product, index) => (
                <Reveal key={product.id} delayMs={80 + index * 80} className="salt-reveal-instant min-w-0">
                  <ProductCard
                    product={toHeroProductCardProduct(product)}
                    variant="hero"
                    reviewSummary={reviewSummaries[product.id] ?? null}
                    className="min-w-0"
                  />
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
};

export default HomeHero;
