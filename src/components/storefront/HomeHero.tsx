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
  { label: "Curated weekly", icon: Sparkles },
  { label: "Gift-ready", icon: BadgeCheck },
  { label: "Fast dispatch", icon: Truck },
];

const HomeHero = ({ featured, leadCollection }: HomeHeroProps) => {
  const collectionImage = normalizeShopifyAssetUrl(leadCollection?.image?.src);
  const [mainProduct, secondaryProduct, tertiaryProduct] = featured ?? [];
  const spotlightProducts = [secondaryProduct, tertiaryProduct].filter(Boolean) as ShopifyProduct[];

  return (
    <section className="mx-auto mt-4 grid w-[min(1340px,95vw)] gap-3 sm:gap-4 xl:min-h-[60vw] xl:grid-cols-[1.12fr_0.88fr]">
      <Reveal>
        <div className="salt-ink-panel relative isolate min-h-[32rem] overflow-hidden rounded-[2rem] px-4 py-5 text-[hsl(var(--salt-paper))] shadow-[0_44px_120px_-72px_rgba(15,23,42,0.6)] sm:min-h-[41rem] sm:rounded-[2.35rem] sm:px-7 sm:py-7 lg:px-9 lg:py-8 xl:h-[60vw] xl:min-h-0">
          {collectionImage ? (
            <img
              src={collectionImage}
              alt={leadCollection?.title || "Featured collection"}
              className="absolute inset-0 h-full w-full object-cover opacity-30"
            />
          ) : null}
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(20,29,52,0.9),rgba(20,29,52,0.72)_42%,rgba(20,29,52,0.84)),radial-gradient(circle_at_14%_16%,rgba(244,196,48,0.18),transparent_28%),radial-gradient(circle_at_86%_18%,rgba(77,125,255,0.16),transparent_24%)]" />
          <div className="pointer-events-none absolute inset-3 rounded-[1.5rem] border border-white/10 sm:inset-[1.15rem] sm:rounded-[2rem]" />

          <div className="relative z-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <BrandLogo
                size="sm"
                withWordmark
                className="rounded-full border border-white/10 bg-white/8 px-3 py-2 backdrop-blur"
              />
            </div>

            <div className="mt-6 max-w-[40rem]">
              <h1 className="mt-4 max-w-[12ch] font-display text-[clamp(2.25rem,11vw,5rem)] leading-[1.04] tracking-[-0.05em] text-white sm:max-w-[18ch] sm:leading-[1.1]">
                Curated pieces for home, gifting, and beautifully useful days.
              </h1>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                to={leadCollection ? `/shop?collection=${leadCollection.handle}` : "/collections"}
                className="salt-primary-cta inline-flex h-12 w-full items-center gap-2 rounded-full px-6 text-[0.72rem] font-semibold uppercase tracking-[0.14em] sm:w-auto sm:text-[0.76rem]"
              >
                {leadCollection ? `Shop ${leadCollection.title}` : "Shop collections"}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/shop?sort=newest"
                className="inline-flex h-12 w-full items-center justify-center rounded-full border border-white/16 bg-white/8 px-6 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-white hover:text-[hsl(var(--salt-ink))] sm:w-auto sm:text-[0.76rem]"
              >
                Browse new arrivals
              </Link>
            </div>


            <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap">
              {heroStats.map((item) => {
                const Icon = item.icon;

                return (
                  <span
                    key={item.label}
                    className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white/78 backdrop-blur"
                  >
                    <Icon className="h-3.5 w-3.5 text-primary" />
                    {item.label}
                  </span>
                );
              })}
            </div>

            <div className="mt-5  grid gap-3 ">

              {mainProduct ? (<Link
  to={`/products/${mainProduct.handle}`}
  className="group flex flex-col items-stretch gap-4 rounded-[1.5rem] border border-white/10 bg-white/8 p-4 backdrop-blur transition hover:border-primary/35 hover:bg-white/[0.11] sm:flex-row sm:gap-5 sm:rounded-[1.8rem] sm:p-5 lg:p-6"
>
  <div className="h-52 w-full shrink-0 overflow-hidden rounded-[1.15rem] bg-white/10 sm:h-auto sm:w-32 sm:rounded-[1.25rem] lg:w-36">
    {productImage(mainProduct) ? (
        <img
          src={productImage(mainProduct) || ""}
          alt={mainProduct.title}
          className="block h-full w-full object-cover object-center transition duration-700 group-hover:scale-[1.05] sm:min-h-[15rem] lg:min-h-[16rem]"
        />
    ) : null}
  </div>

  <div className="flex min-w-0 flex-1 flex-col justify-between py-2">
    <div>
      <p className="inline-flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-primary">
        <Star className="h-3.5 w-3.5 fill-current" />
        Featured this week
      </p>

      <p className="mt-3 line-clamp-3 font-display text-[1.55rem] leading-[0.98] text-white sm:text-[2.05rem] lg:text-[2.55rem]">
        {mainProduct.title}
      </p>
    </div>

    <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
      <p className="font-display text-[1.95rem] leading-none text-white sm:text-[2.7rem] lg:text-[3.2rem]">
        {formatMoney(minPrice(mainProduct))}
      </p>

      <span className="text-[0.82rem] font-semibold uppercase tracking-[0.14em] text-white/82 transition group-hover:text-white">
        View
      </span>
    </div>
  </div>
</Link>
              ) : null}
            </div>
          </div>
        </div>
      </Reveal>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
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
                className="salt-story-card group relative block h-full min-h-[15rem] overflow-hidden rounded-[1.65rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.42))] shadow-[0_26px_80px_-52px_rgba(15,23,42,0.28)] transition duration-500 hover:-translate-y-1 hover:shadow-[0_36px_100px_-56px_rgba(15,23,42,0.38)] sm:min-h-[20rem] sm:rounded-[1.95rem] md:min-h-[22rem] xl:min-h-[24.5rem]"
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

                <div className="absolute right-4 top-4 rounded-full border border-white/18 bg-[linear-gradient(180deg,rgba(28,39,67,0.82),rgba(18,27,47,0.72))] px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-white shadow-[0_16px_36px_-24px_rgba(15,23,42,0.72)] backdrop-blur-md">
                  {badgeLabel}
                </div>

                <div className="absolute inset-x-0 bottom-0 p-3.5 sm:p-4">
                  <div className="rounded-[1.45rem] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,247,243,0.88))] p-4 shadow-[0_26px_60px_-38px_rgba(15,23,42,0.46)] backdrop-blur-md">
                    <p className="text-[0.58rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      Featured product
                    </p>
                    <h3 className="mt-2 line-clamp-2 max-w-[25ch] font-display text-[1.58rem] leading-[1.2] tracking-[-0.035em] text-foreground sm:text-[1.66rem]">
                      {product.title}
                    </h3>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-white px-4 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-foreground shadow-[0_12px_28px_-22px_rgba(15,23,42,0.45)] transition duration-300 group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:bg-primary group-hover:text-primary-foreground">
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
