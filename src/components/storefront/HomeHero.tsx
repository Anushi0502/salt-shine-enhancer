import { Link } from "react-router-dom";
import { ArrowRight, Clock3, ShieldCheck, Sparkles, Truck } from "lucide-react";
import { formatMoney, minPrice, productImage } from "@/lib/formatters";
import type { ShopifyProduct } from "@/types/shopify";
import Reveal from "@/components/storefront/Reveal";
import BrandLogo from "@/components/layout/BrandLogo";

type HomeHeroProps = {
  featured: ShopifyProduct[];
};

const HomeHero = ({ featured }: HomeHeroProps) => {
  const [mainProduct, secondaryProduct, tertiaryProduct] = featured;
  const mainProductImage = mainProduct ? productImage(mainProduct) : null;

  return (
    <section className="mx-auto mt-8 grid w-[min(1280px,96vw)] gap-4 lg:grid-cols-[1.22fr_0.78fr]">
      <Reveal>
        <div className="salt-ink-panel relative isolate rounded-[2rem] p-8 text-[hsl(var(--salt-paper))] sm:p-12">
          <div className="pointer-events-none absolute inset-0 salt-grid-bg opacity-20" />
          <div className="pointer-events-none absolute -right-24 -top-20 h-72 w-72 rounded-full bg-primary/35 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/2 h-52 w-80 -translate-x-1/2 rounded-full bg-salt-olive/30 blur-[110px]" />
          <div className="pointer-events-none absolute -left-8 top-1/3 h-32 w-32 rounded-full border border-white/20 bg-white/5 blur-sm" />

          <BrandLogo
            size="sm"
            withWordmark
            className="mb-3 w-fit rounded-full border border-white/25 bg-white/10 px-2 py-1"
          />

          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.16em]">
              <Sparkles className="h-3.5 w-3.5" />
              Spring Curation 2026
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.16em]">
              <Clock3 className="h-3.5 w-3.5" />
              Limited weekend drops
            </span>
          </div>

          <h1 className="mt-4 max-w-[13ch] font-display text-[clamp(2.2rem,5.2vw,4.7rem)] leading-[0.9]">
            Make every purchase feel
            <span className="block text-accent">obvious and worth it.</span>
          </h1>
          <p className="mt-5 max-w-[56ch] text-sm leading-7 text-white/85 sm:text-base">
            Built for shoppers who compare before they buy: clearer product value, tighter catalog pathways,
            and fewer clicks between first interest and completed checkout.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/shop"
              className="salt-button-shine salt-primary-cta h-12 gap-2 px-6 text-sm font-bold uppercase tracking-[0.1em]"
            >
              Shop New Arrivals <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/collections"
              className="inline-flex h-12 items-center rounded-full border border-white/40 bg-white/10 px-6 text-sm font-bold uppercase tracking-[0.1em] text-white transition hover:bg-white hover:text-slate-900"
            >
              Explore Collections
            </Link>
          </div>

          <div className="mt-7 grid gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-white/85 sm:flex sm:flex-wrap sm:items-center sm:gap-4">
            <span className="inline-flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5" /> Free shipping over $49
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> 30-day return promise
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Weekly curated launches
            </span>
          </div>

          {mainProduct ? (
            <Link
              to={`/products/${mainProduct.handle}`}
              className="mt-8 grid max-w-2xl gap-3 rounded-2xl border border-white/30 bg-white/10 p-4 transition hover:border-white/45 hover:bg-white/14 sm:grid-cols-[84px_1fr_auto] sm:items-center"
            >
              {mainProductImage ? (
                <img
                  src={mainProductImage}
                  alt={mainProduct.title}
                  className="h-20 w-20 rounded-xl object-cover"
                />
              ) : (
                <div className="grid h-20 w-20 place-items-center rounded-xl bg-white/14 text-[0.55rem] font-bold uppercase tracking-[0.08em] text-white/80">
                  No image
                </div>
              )}
              <div>
                <p className="line-clamp-2 text-sm font-semibold">{mainProduct.title}</p>
                <p className="text-xs text-white/80">Best-selling pick this week</p>
              </div>
              <strong className="text-sm">{formatMoney(minPrice(mainProduct))}</strong>
            </Link>
          ) : null}

          <div className="mt-4 grid gap-2 text-xs text-white/85 sm:grid-cols-3">
            <p className="rounded-xl border border-white/20 bg-white/10 px-3 py-2">
              2,300+ recent orders fulfilled
            </p>
            <p className="rounded-xl border border-white/20 bg-white/10 px-3 py-2">
              Average dispatch in under 48 hours
            </p>
            <p className="rounded-xl border border-white/20 bg-white/10 px-3 py-2">
              Checkout encrypted end-to-end
            </p>
          </div>
        </div>
      </Reveal>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        {[secondaryProduct, tertiaryProduct].filter(Boolean).map((product, index) => (
          <Reveal key={product.id} delayMs={120 + index * 120}>
            <Link
              to={`/products/${product.handle}`}
              className="group salt-card-hover relative block overflow-hidden rounded-3xl border border-border/80 bg-[linear-gradient(165deg,hsl(var(--card)/0.97),hsl(var(--card)/0.9))] p-3 shadow-soft"
            >
              <span className="absolute left-5 top-5 z-10 rounded-full border border-white/45 bg-black/42 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.1em] text-white backdrop-blur-sm">
                Quick pick
              </span>
              <div className="relative aspect-[5/3.3] overflow-hidden rounded-2xl">
                {productImage(product) ? (
                  <img
                    src={productImage(product) || ""}
                    alt={product.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_25%_20%,hsl(var(--primary)/0.2),transparent_46%),radial-gradient(circle_at_72%_78%,hsl(var(--salt-olive)/0.22),transparent_40%),hsl(var(--muted))] px-6 text-center">
                    <p className="text-[0.62rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                      Image unavailable
                    </p>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/62 via-transparent to-transparent opacity-70 transition-opacity group-hover:opacity-100" />
              </div>
              <div className="space-y-2 p-3">
                <p className="line-clamp-2 text-sm font-semibold">{product.title}</p>
                <div className="flex items-center justify-between text-sm">
                  <strong className="text-primary">{formatMoney(minPrice(product))}</strong>
                  <span className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Details <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
};

export default HomeHero;
