import { Link } from "react-router-dom";
import { ArrowRight, BadgeCheck, Sparkles, Star, Truck } from "lucide-react";
import Reveal from "@/components/storefront/Reveal";
import BrandLogo from "@/components/layout/BrandLogo";
import { formatMoney, minPrice, productImage, savingsPercent } from "@/lib/formatters";
import { normalizeShopifyAssetUrl } from "@/lib/theme-assets";
import type { ShopifyCollection, ShopifyProduct } from "@/types/shopify";

type HomeHeroProps = {
  featured: ShopifyProduct[];
  leadCollection?: ShopifyCollection | null;
  supportingCollections?: ShopifyCollection[];
};

const heroStats = [
  { label: "Easy to browse", icon: Sparkles },
  { label: "Gift-friendly finds", icon: BadgeCheck },
  { label: "Fast U.S. dispatch", icon: Truck },
];

const HomeHero = ({ featured, leadCollection }: HomeHeroProps) => {
  const collectionImage = normalizeShopifyAssetUrl(leadCollection?.image?.src);
  const [mainProduct, secondaryProduct, tertiaryProduct] = featured ?? [];
  const spotlightProducts = [mainProduct, secondaryProduct,].filter(Boolean) as ShopifyProduct[];
  const primaryCtaHref = leadCollection ? `/shop?collection=${leadCollection.handle}` : "/shop?sort=discount";
  const primaryCtaLabel = leadCollection && /best[\s-]*seller/i.test(leadCollection.title)
    ? "Shop best sellers"
    : "Shop curated picks";

  return (
    <section className="mx-auto grid w-full max-w-[1200px] gap-4 px-4 sm:gap-6 xl:min-h-[700px] xl:grid-cols-[1.15fr_0.85fr]">
      <Reveal className="min-w-0 overflow-hidden">
        <div className="relative isolate flex min-h-[30rem] flex-col overflow-hidden rounded-[2rem] bg-[#f8f5f0] p-6 sm:min-h-[45rem] sm:p-12 xl:h-full">
          {collectionImage ? (
            <img
              src={collectionImage}
              alt={leadCollection?.title || "Featured collection"}
              className="absolute inset-0 h-full w-full object-cover mix-blend-multiply opacity-20"
            />
          ) : null}
          
          <div className="relative z-10 flex h-full flex-col justify-center max-w-[44rem]">
            
              <BrandLogo
                size="sm"
                withWordmark
                className="rounded-full border border-white/10 bg-white/8 px-3 py-2 backdrop-blur"
              />

            <h1 className="font-display text-[clamp(2.5rem,7vw,5rem)] leading-[1.05] tracking-[-0.03em] text-[#1a1a1a]">
              Curated home, kitchen, gifts, and essentials — made easy to shop.
            </h1>
            
            <p className="mt-6 text-[clamp(1rem,2vw,1.25rem)] leading-relaxed text-[#4a453e]/90">
              SALT brings practical lifestyle finds and giftable favorites into one calm, premium storefront that is easy to understand in seconds.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:mt-10 sm:flex-row sm:items-center">
              <Link
                to={primaryCtaHref}
                className="inline-flex h-14 items-center justify-center rounded-full bg-[#1a1a1a] px-10 text-[0.76rem] font-bold uppercase tracking-[0.18em] text-white transition-all hover:bg-primary active:scale-[0.98]"
              >
                {primaryCtaLabel}
              </Link>
              <Link
                to="/collections"
                className="inline-flex h-14 items-center justify-center rounded-full border border-[#1a1a1a] px-10 text-[0.76rem] font-bold uppercase tracking-[0.18em] text-[#1a1a1a] transition-all hover:bg-[#1a1a1a] hover:text-white active:scale-[0.98]"
              >
                Explore categories
              </Link>
            </div>
          </div>
        </div>
      </Reveal>

      <div className="grid gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-1">
        {spotlightProducts.map((product, index) => {
          const image = productImage(product);
          const savings = savingsPercent(product);
          const variantCount = product.variants.length;
          const badgeLabel =
            savings > 0
              ? `${savings}% off`
              : `${variantCount} ${variantCount === 1 ? "option" : "options"}`;

          return (
            <Reveal key={product.id} delayMs={120 + index * 120} className="h-full">
              <Link
                to={`/products/${product.handle}`}
                className="salt-story-card group relative block h-full min-h-[13.5rem] overflow-hidden rounded-[1.45rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.42))] shadow-[0_26px_80px_-52px_rgba(15,23,42,0.28)] transition duration-500 hover:-translate-y-1 hover:shadow-[0_36px_100px_-56px_rgba(15,23,42,0.38)] sm:min-h-[20rem] sm:rounded-[1.95rem] md:min-h-[22rem] xl:min-h-[24.5rem]"
              >
                {image ? (
                  <img
                    src={image}
                    alt={product.title}
                    className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.06]"
                  />
                ) : (
                  <div className="salt-collection-fallback grid h-full w-full place-items-center bg-[linear-gradient(135deg,rgba(247,244,236,0.98),rgba(239,234,224,0.98))] px-6 text-center">
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--salt-ink))/0.84]">
                      Product image unavailable
                    </p>
                  </div>
                )}

                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,20,38,0.02),rgba(12,20,38,0.05)_20%,rgba(12,20,38,0.18)_58%,rgba(12,20,38,0.52)_100%)]" />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white/8 to-transparent" />

                <div className="absolute right-3 top-3 rounded-full border border-white/18 bg-[linear-gradient(180deg,rgba(28,39,67,0.82),rgba(18,27,47,0.72))] px-2.5 py-1 text-[0.56rem] font-semibold uppercase tracking-[0.16em] text-white shadow-[0_16px_36px_-24px_rgba(15,23,42,0.72)] backdrop-blur-md sm:right-4 sm:top-4 sm:px-3 sm:text-[0.62rem]">
                  {badgeLabel}
                </div>

                <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
                  <div className="rounded-[1.2rem] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,247,243,0.88))] p-3.5 shadow-[0_26px_60px_-38px_rgba(15,23,42,0.46)] backdrop-blur-md dark:bg-[linear-gradient(180deg,rgba(26,33,49,0.96),rgba(16,22,35,0.92))] sm:rounded-[1.45rem] sm:p-4">
                      <p className="text-[0.58rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                        Curated pick
                    </p>
                    <h3 className="mt-2 line-clamp-2 max-w-[25ch] font-display text-[1.32rem] leading-[1.12] tracking-[-0.035em] text-foreground sm:text-[1.66rem]">
                      {product.title}
                    </h3>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <span className="salt-showcase-pill px-4 py-2 text-[0.7rem] group-hover:border-primary/40 group-hover:bg-primary group-hover:text-primary-foreground">
                        Shop
                        <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-muted-foreground/80">
                        {formatMoney(minPrice(product))}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
};

export default HomeHero;

