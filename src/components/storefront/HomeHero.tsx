import { ArrowRight, BadgeCheck, Sparkles, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

import heroMain from "@/assets/hero-main.jpg";
import Reveal from "@/components/storefront/Reveal";
import BrandLogo from "@/components/layout/BrandLogo";
import ProductCard from "@/components/storefront/ProductCard";
import { buildCollectionRoute } from "@/lib/site-navigation";
import { normalizeShopifyAssetUrl } from "@/lib/theme-assets";
import type { JudgeMeReviewSummary } from "@/lib/judgeme";
import type { HomeCollectionProduct } from "@/lib/home-collection-products";
import type { HomeFeaturedProduct } from "@/lib/home-featured-products";
import type { ShopifyCollection, ShopifyProduct } from "@/types/shopify";

export type HomeHeroSlide = {
  key: string;
  title: string;
  image: string;
  alt: string;
  ctaHref: string;
  products: HomeCollectionProduct[];
};

type HomeHeroProps = {
  featured: HomeFeaturedProduct[];
  leadCollection?: ShopifyCollection | null;
  slides?: HomeHeroSlide[];
  reviewSummaries?: Record<number, JudgeMeReviewSummary | null>;
};

const heroStats = [
  { label: "Easy to browse", detail: "Calm discovery", icon: Sparkles },
  { label: "Gift-friendly finds", detail: "Ready to wrap", icon: BadgeCheck },
  { label: "Fast U.S. dispatch", detail: "Tracked shipping", icon: Truck },
];

function toHeroProductCardProduct(source: HomeCollectionProduct | HomeFeaturedProduct): ShopifyProduct {
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

const HomeHero = ({ featured, leadCollection, slides = [], reviewSummaries = {} }: HomeHeroProps) => {
  const fallbackHeroImage = normalizeShopifyAssetUrl(heroMain) || heroMain;
  const heroImage = normalizeShopifyAssetUrl(leadCollection?.image?.src) || fallbackHeroImage;
  const spotlightProducts = (featured ?? []).slice(0, 4);
  const primaryCtaHref = leadCollection ? buildCollectionRoute(leadCollection.handle) : "/shop?sort=discount";
  const primaryCtaLabel =
    leadCollection && /best[\s-]*seller/i.test(leadCollection.title)
      ? "Shop best sellers"
      : "Shop curated picks";
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

  if (activeSlide) {
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
                    src={normalizeShopifyAssetUrl(activeSlide.image) || fallbackHeroImage}
                    alt={activeSlide.alt}
                    loading="eager"
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
  }

  return (
    <section className="mx-auto w-full max-w-[1360px] px-4 sm:px-6">
      <Reveal className="salt-reveal-instant min-w-0 overflow-hidden">
        <div className="salt-editorial-shell rounded-[2rem] p-3 sm:p-4 lg:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.16fr)_minmax(0,0.84fr)]">
            <div className="relative isolate overflow-hidden rounded-[1.65rem] border border-border/70 bg-[linear-gradient(180deg,hsl(var(--background)/0.98),hsl(var(--card)/0.96))] shadow-[0_26px_56px_-40px_rgba(15,23,42,0.2)]">
              <img
                src={heroImage}
                alt={leadCollection?.title || "Featured collection"}
                loading="eager"
                className="absolute inset-0 h-full w-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,hsl(var(--background)/0.98)_0%,hsl(var(--background)/0.92)_30%,hsl(var(--background)/0.62)_56%,hsl(var(--background)/0.16)_76%,hsl(var(--background)/0.04)_100%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_16%,hsl(var(--background)/0.42),transparent_26%),radial-gradient(circle_at_80%_18%,hsl(var(--primary)/0.14),transparent_24%),linear-gradient(165deg,hsl(var(--background)/0.08),hsl(var(--background)/0.02))]" />

              <div className="relative z-10 flex min-h-[24rem] flex-col justify-between p-5 sm:min-h-[40rem] sm:p-8 lg:p-10">
                <div className="max-w-[34rem]">
                  <BrandLogo
                    size="sm"
                    withWordmark
                    className="inline-flex rounded-full border border-border/70 bg-background/80 px-3 py-2 backdrop-blur"
                  />
                  <p className="mt-6 text-[0.68rem] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                    Seasonal edit
                  </p>
                  <h1 className="mt-3 max-w-[12ch] font-display text-[clamp(2.8rem,5.8vw,5.9rem)] leading-[0.9] tracking-[-0.055em] text-foreground">
                    Curated home, gifts, and essentials.
                  </h1>
                  <p className="mt-4 max-w-[31rem] text-[0.98rem] leading-7 text-muted-foreground sm:text-[1.05rem]">
                    A calmer storefront with cleaner discovery, softer surfaces, and more editorial pacing inspired by premium fashion retail.
                  </p>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link
                      to={primaryCtaHref}
                      className="salt-primary-cta inline-flex h-12 items-center justify-center rounded-full px-5 text-[0.72rem] font-bold uppercase tracking-[0.16em]"
                    >
                      {primaryCtaLabel}
                      <ArrowRight className="ml-2 h-3.5 w-3.5" />
                    </Link>
                    <Link
                      to="/collections"
                      className="salt-outline-chip inline-flex h-12 items-center justify-center rounded-full px-5 text-[0.72rem] font-bold uppercase tracking-[0.16em]"
                    >
                      Explore categories
                    </Link>
                  </div>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-3">
                  {heroStats.map((stat) => {
                    const Icon = stat.icon;

                    return (
                      <div
                        key={stat.label}
                        className="flex items-center gap-3 rounded-[1.15rem] border border-border/70 bg-background/82 px-3 py-3 shadow-[0_14px_26px_-22px_rgba(15,23,42,0.16)] backdrop-blur-md"
                      >
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/70 bg-muted/45 text-primary">
                          <Icon className="h-4.5 w-4.5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[0.56rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                            {stat.label}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-foreground">
                            {stat.detail}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {spotlightProducts.map((product, index) => {
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
