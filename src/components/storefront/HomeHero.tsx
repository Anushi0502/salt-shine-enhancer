import { Link } from "react-router-dom";
import { ArrowRight, Clock3, Sparkles, Star, ShieldCheck } from "lucide-react";
import { formatMoney, minPrice, productImage } from "@/lib/formatters";
import type { ShopifyProduct } from "@/types/shopify";
import Reveal from "@/components/storefront/Reveal";
import BrandLogo from "@/components/layout/BrandLogo";

type HomeHeroProps = {
  featured: ShopifyProduct[];
};

const HomeHero = ({ featured }: HomeHeroProps) => {
  const [mainProduct, secondaryProduct, tertiaryProduct] = featured ?? [];

  const mainProductImage = mainProduct ? productImage(mainProduct) : null;
  const sideProducts = [secondaryProduct, tertiaryProduct].filter(
    Boolean,
  ) as ShopifyProduct[];

  return (
    <section className="mx-auto mt-8 grid w-[min(1320px,96vw)] gap-4 lg:grid-cols-[1.24fr_0.76fr]">
      {/* Main Hero */}
      <Reveal>
        <div className="salt-ink-panel relative isolate overflow-hidden rounded-[2.25rem] border border-white/10 px-6 py-8 text-[hsl(var(--salt-paper))] shadow-[0_30px_90px_-35px_rgba(0,0,0,0.55)] sm:px-8 sm:py-10 lg:px-10 lg:py-12">
          {/* Background layers */}
          <div className="pointer-events-none absolute inset-0 salt-grid-bg opacity-[0.16]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_30%),radial-gradient(circle_at_85%_12%,hsl(var(--primary)/0.22),transparent_24%),radial-gradient(circle_at_50%_100%,hsl(var(--salt-blue)/0.18),transparent_32%)]" />
          <div className="pointer-events-none absolute -left-16 top-24 h-44 w-44 rounded-full bg-primary/15 blur-[70px]" />
          <div className="pointer-events-none absolute right-[-5rem] top-[-4rem] h-80 w-80 rounded-full bg-primary/20 blur-[100px]" />
          <div className="pointer-events-none absolute bottom-[-4rem] left-1/2 h-64 w-[28rem] -translate-x-1/2 rounded-full bg-salt-blue/20 blur-[120px]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

          <div className="relative z-10">
            <BrandLogo
              size="sm"
              withWordmark
              className="mb-5 w-fit rounded-full border border-white/20 bg-white/10 px-3 py-1.5 backdrop-blur-md"
            />

            <div className="flex flex-wrap gap-2.5">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-3.5 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-primary backdrop-blur-md">
                <Sparkles className="h-3.5 w-3.5" />
                Spring Curation 2026
              </span>

              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/8 px-3.5 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-white/85 backdrop-blur-md">
                <Clock3 className="h-3.5 w-3.5" />
                Limited weekend drops
              </span>

              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3.5 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-emerald-200 backdrop-blur-md">
                <ShieldCheck className="h-3.5 w-3.5" />
                Curated for value
              </span>
            </div>

            <div className="mt-7 max-w-[44rem]">
              <p className="mb-3 text-sm font-medium tracking-[0.12em] text-white/55 uppercase">
                Designed to convert attention into action
              </p>

              <h1 className="max-w-[12ch] font-display text-[clamp(2.7rem,5.6vw,5.4rem)] leading-[0.86] tracking-[-0.04em] text-white">
                Make every purchase feel
                <span className="mt-2 block bg-gradient-to-r from-primary via-[hsl(49_98%_68%)] to-white bg-clip-text text-transparent">
                  obvious and worth it.
                </span>
              </h1>
            </div>

            <div className="mt-8 flex flex-wrap gap-3 min-h-[3.25rem]">
              <Link
                to="/shop"
                className="salt-button-shine salt-primary-cta group inline-flex h-13 items-center gap-2.5 rounded-full px-7 text-sm font-bold uppercase tracking-[0.12em] shadow-[0_18px_44px_-18px_hsl(var(--primary)/0.65)] transition-all hover:scale-[1.02]"
              >
                Shop New Arrivals
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>

              <Link
                to="/collections"
                className="inline-flex h-13 items-center rounded-full border border-white/30 bg-white/8 px-7 text-sm font-bold uppercase tracking-[0.12em] text-white backdrop-blur-md transition-all hover:border-white/60 hover:bg-white hover:text-[hsl(var(--salt-ink))] hover:shadow-[0_14px_36px_-18px_rgba(255,255,255,0.45)]"
              >
                Explore Collections
              </Link>
            </div>


            {/* Featured bestseller */}
            {mainProduct ? (
              <Link
                to={`/products/${mainProduct.handle}`}
                className="group/card relative mt-9 min-h-[23rem] flex flex-col gap-5 overflow-hidden rounded-[1.75rem] border border-primary/25 bg-gradient-to-r from-primary/12 via-white/[0.08] to-white/[0.04] p-5 shadow-[0_22px_60px_-28px_rgba(0,0,0,0.55)] backdrop-blur-md transition-all duration-500 hover:border-primary/45 hover:shadow-[0_0_48px_-10px_hsl(var(--primary)/0.35)] sm:flex-row sm:items-center sm:p-6"
              >
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.04)_35%,transparent_60%)] opacity-0 transition-opacity duration-500 group-hover/card:opacity-100" />

                {/* Image */}
                <div className="relative z-10 shrink-0 self-start sm:self-center">
                  {mainProductImage ? (
                    <img
                      src={mainProductImage}
                      alt={mainProduct.title}
                      className="h-8 w-28 rounded-[1.35rem] object-cover shadow-[0_10px_28px_-8px_rgba(0,0,0,0.55)] ring-2 ring-primary/20 transition-all duration-300 group-hover/card:scale-[1.03] group-hover/card:ring-primary/55 sm:h-32 sm:w-32 lg:h-36 lg:w-36"
                    />
                  ) : (
                    <div className="grid h-28 w-28 place-items-center rounded-[1.35rem] bg-white/12 text-[0.58rem] font-bold uppercase tracking-[0.08em] text-white/80 sm:h-32 sm:w-32 lg:h-36 lg:w-36">
                      No image
                    </div>
                  )}

                  <span className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/35">
                    <Star className="h-3.5 w-3.5 fill-[hsl(var(--primary-foreground))] text-[hsl(var(--primary-foreground))]" />
                  </span>
                </div>

                {/* Content */}
                <div className="relative z-10 min-w-0 flex-1">
                  <span className="inline-flex w-fit items-center text-lg gap-1.5 rounded-full bg-primary/18 px-3 py-1 font-bold uppercase tracking-[0.14em] text-primary">
                    Best seller
                  </span>

                  <p className="mt-3 line-clamp-2 font-display text-xl font-bold leading-tight text-white sm:text-2xl">
                    {mainProduct.title}
                  </p>

                  <p className="mt-2 max-w-[32rem] text-sm leading-6 text-white/62 sm:text-[1.02rem]">
                    A beautifully crafted essential for documenting wishes, preserving memories, and bringing clarity to what matters most.
                  </p>
                </div>

                {/* Price / CTA */}
                <div className="relative z-10 flex shrink-0 flex-row items-end justify-between gap-4 sm:flex-col sm:items-end sm:justify-center">
                  <div className="text-left sm:text-right">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-white/42">
                      Starting at
                    </p>
                    <strong className="mt-1 block font-display text-3xl font-bold text-primary sm:text-4xl">
                      {formatMoney(minPrice(mainProduct))}
                    </strong>
                  </div>

                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/14 px-4 py-2 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-primary transition-all group-hover/card:bg-primary group-hover/card:text-[hsl(var(--primary-foreground))]">
                    Shop now
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/card:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            ) : null}
          </div>
                  <div class="mt-4 min-h-[3.5rem]items-center grid gap-2 text-xs text-white/85 sm:grid-cols-3">
    <p class="rounded-xl border border-white/20 bg-white/10 px-3 py-2">2,300+ recent orders fulfilled</p>
    <p class="rounded-xl border border-white/20 bg-white/10 px-3 py-2">Average dispatch in under 48 hours</p>
    <p class="rounded-xl border border-white/20 bg-white/10 px-3 py-2">Checkout encrypted end-to-end</p>
</div>

        </div>

      </Reveal>

{/* Secondary cards */}
<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
  {sideProducts.map((product, index) => {
    const image = productImage(product);

    return (
      <Reveal key={product.id} delayMs={120 + index * 120}>
        <Link
          to={`/products/${product.handle}`}
          className="group relative flex h-full min-h-[19rem] flex-col overflow-hidden rounded-[2rem] border border-primary/20 bg-[hsl(var(--card))] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.32)] transition-all duration-500 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_30px_80px_-24px_hsl(var(--primary)/0.24)]"
        >
          {/* premium glow layers */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.14),transparent_24%),radial-gradient(circle_at_bottom_left,hsl(var(--salt-blue)/0.12),transparent_26%)] opacity-90" />
          <div className="pointer-events-none absolute -right-10 top-0 h-36 w-36 rounded-full bg-primary/12 blur-[70px]" />
          <div className="pointer-events-none absolute -left-8 bottom-0 h-28 w-28 rounded-full bg-[hsl(48_95%_62%/.10)] blur-[60px]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-28 bg-gradient-to-b from-primary/10 via-primary/[0.04] to-transparent" />

          {/* Image */}
          <div className="relative aspect-[16/10] overflow-hidden">
            {image ? (
              <img
                src={image}
                alt={product.title}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.1]"
              />
            ) : (
              <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_22%_20%,hsl(var(--primary)/0.16),transparent_44%),radial-gradient(circle_at_76%_78%,hsl(var(--salt-blue)/0.18),transparent_38%),hsl(var(--muted))] px-6 text-center">
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Image unavailable
                </p>
              </div>
            )}

            {/* spotlight overlays */}
            <div className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--card))] via-[hsl(var(--card)/0.14)] to-transparent opacity-95" />
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.10),transparent_28%,transparent_68%,rgba(255,255,255,0.04))] opacity-70" />
            <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/20 to-transparent opacity-60" />
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

            {/* best overall badge */}
            <div className="absolute left-4 top-4 z-20 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/50 bg-[hsl(var(--salt-ink)/0.78)] px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-[0.13em] text-primary backdrop-blur-md">
                <Star className="h-3.5 w-3.5 fill-current" />
                Best overall pick
              </span>
            </div>

            {/* top-right star seal */}
            <div className="absolute right-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/35 bg-black/30 text-primary shadow-[0_10px_25px_-10px_hsl(var(--primary)/0.45)] backdrop-blur-md transition-all duration-300 group-hover:scale-105 group-hover:rotate-3">
              <Star className="h-4.5 w-4.5 fill-current" />
            </div>
          </div>

          {/* Content */}
          <div className="relative z-10 flex flex-1 flex-col p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="mt-2 line-clamp-2 font-display text-[1.28rem] font-semibold leading-snug text-foreground sm:text-[1.36rem]">
                  {product.title}
                </p>
              </div>

              <span className="shrink-0 rounded-full border border-primary/20 bg-primary/8 px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-primary">
                Editor’s pick
              </span>
            </div>

            {/* bottom action area */}
            <div className="mt-auto pt-5">
              <div className="flex items-center justify-between gap-3 rounded-[1.3rem] border border-primary/15 bg-[linear-gradient(180deg,hsl(var(--background)/0.92),hsl(var(--primary)/0.05))] px-4 py-3.5 transition-all duration-300 group-hover:border-primary/30 group-hover:bg-[linear-gradient(180deg,hsl(var(--background)/0.98),hsl(var(--primary)/0.08))]">
                <div>
                  <p className="text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Starting at
                  </p>
                  <strong className="mt-1 block text-2xl font-bold text-primary">
                    {formatMoney(minPrice(product))}
                  </strong>
                </div>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-3.5 py-2 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-primary transition-all duration-300 group-hover:border-primary/35 group-hover:bg-primary group-hover:text-[hsl(var(--primary-foreground))]">
                  Shop pick
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
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