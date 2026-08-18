import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

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

  useEffect(() => {
    if (slides.length <= 1) {
      setActiveSlideIndex(0);
      return;
    }

    setActiveSlideIndex((currentIndex) => currentIndex % slides.length);

    const rotationInterval = window.setInterval(() => {
      setActiveSlideIndex((currentIndex) => (currentIndex + 1) % slides.length);
    }, 4400);

    return () => {
      window.clearInterval(rotationInterval);
    };
  }, [slides.length]);

  const activeSlide = slides[activeSlideIndex] || slides[0];

  if (!activeSlide) {
    return (
      <section
        className="mx-auto w-full max-w-[1360px] px-4 sm:px-6"
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

  return (
    <section className="mx-auto w-full max-w-[1360px] px-4 sm:px-6">
      <Reveal className="salt-reveal-instant min-w-0 overflow-hidden">
        <div className="salt-editorial-shell rounded-[2rem] p-3 sm:p-4 lg:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.16fr)_minmax(0,0.84fr)] lg:items-stretch">
              <Link
                to={activeSlide.ctaHref}
                aria-label={activeSlide.title}
                className="group relative flex h-full min-h-[20rem] overflow-hidden rounded-[1.65rem] border border-border/70 bg-[linear-gradient(180deg,hsl(var(--background)/0.98),hsl(var(--card)/0.96))] shadow-[0_26px_56px_-40px_rgba(15,23,42,0.2)] sm:min-h-[28rem] lg:min-h-[38rem]"
              >
                <div className="relative h-full w-full overflow-hidden">
                  <img
                    src={normalizeShopifyAssetUrl(activeSlide.image) || activeSlide.image}
                    alt={activeSlide.alt}
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                    className="h-full w-full object-cover object-center transition duration-700 group-hover:scale-[1.01]"
                  />
                </div>

                {slides.length > 1 ? (
                  <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex items-center justify-center gap-2">
                    {slides.map((slide, index) => (
                      <span
                        key={`${slide.key}-dot-${index}`}
                        className={`h-1.5 rounded-full transition-all ${
                          index === activeSlideIndex ? "w-6 bg-white/95" : "w-2 bg-white/55"
                        }`}
                      />
                    ))}
                  </div>
                ) : null}
              </Link>

              <div className="grid gap-3 sm:grid-cols-2">
                {slideProducts.map((product, index) => {
                  return (
                    <Reveal key={product.id} delayMs={120 + index * 120} className="salt-reveal-instant h-full">
                      <ProductCard
                        product={toHeroProductCardProduct(product)}
                        variant="shop"
                        reviewSummary={reviewSummaries[product.id] ?? null}
                        className="min-w-0"
                      />
                    </Reveal>
                  );
                })}
              </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
};

export default HomeHero;
