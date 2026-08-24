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

  return (
    <section className="w-full px-0 sm:px-2 lg:px-4">
      <Reveal className="salt-reveal-instant min-w-0 overflow-hidden">
        <div className="salt-editorial-shell rounded-[1.5rem] p-2 sm:rounded-[1.75rem] sm:p-3 lg:p-4">
          <div className="grid gap-2 sm:gap-3 lg:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] lg:items-stretch">
            <Link
              to={activeSlide.ctaHref}
              aria-label={`Shop ${activeSlide.title}`}
              className="group relative aspect-square overflow-hidden rounded-[1.25rem] border border-border/70 bg-foreground shadow-[0_24px_50px_-34px_rgba(15,23,42,0.35)] sm:rounded-[1.5rem]"
            >
              <img
                src={normalizeShopifyAssetUrl(activeSlide.image) || activeSlide.image}
                alt={activeSlide.alt}
                loading="eager"
                {...({ fetchpriority: "high" } as Record<string, string>)}
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover object-center transition duration-700 group-hover:scale-[1.02]"
              />
            </Link>

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
