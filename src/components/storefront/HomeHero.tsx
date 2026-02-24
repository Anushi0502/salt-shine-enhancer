import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { formatMoney, minPrice, productImage } from "@/lib/formatters";
import type { ShopifyProduct } from "@/types/shopify";
import Reveal from "@/components/storefront/Reveal";

type HomeHeroProps = {
  featured: ShopifyProduct[];
};

const HomeHero = ({ featured }: HomeHeroProps) => {
  const [mainProduct, secondaryProduct, tertiaryProduct] = featured;

  return (
    <section className="mx-auto mt-8 grid w-[min(1280px,96vw)] gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <Reveal>
        <div className="relative isolate overflow-hidden rounded-[2rem] border border-border/80 bg-gradient-to-br from-foreground to-foreground/90 p-8 text-primary-foreground shadow-deep sm:p-12">
          <div className="absolute -right-24 -top-20 h-72 w-72 rounded-full bg-primary/35 blur-3xl" />
          <div className="absolute bottom-0 left-1/2 h-52 w-80 -translate-x-1/2 rounded-full bg-salt-olive/30 blur-[110px]" />

          <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/30 bg-primary-foreground/10 px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.16em]">
            <Sparkles className="h-3.5 w-3.5" />
            New Design Direction
          </span>

          <h1 className="mt-4 max-w-[12ch] font-display text-[clamp(2.2rem,5.2vw,4.7rem)] leading-[0.9]">
            Curated Everyday Luxury, Rebuilt for Conversion.
          </h1>
          <p className="mt-5 max-w-[56ch] text-sm leading-7 text-primary-foreground/85 sm:text-base">
            SALT combines cinematic layout language with practical ecommerce UX so shoppers can discover,
            evaluate, and purchase faster without changing the backend catalog structure.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/shop"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-sm font-bold uppercase tracking-[0.1em] text-primary-foreground transition hover:brightness-110"
            >
              Shop Full Catalog <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/collections"
              className="inline-flex h-12 items-center rounded-full border border-primary-foreground/40 px-6 text-sm font-bold uppercase tracking-[0.1em] text-primary-foreground transition hover:bg-primary-foreground hover:text-foreground"
            >
              Browse Collections
            </Link>
          </div>

          {mainProduct ? (
            <div className="mt-10 grid max-w-lg gap-3 rounded-2xl border border-primary-foreground/30 bg-primary-foreground/10 p-4 sm:grid-cols-[84px_1fr_auto] sm:items-center">
              <img
                src={productImage(mainProduct)}
                alt={mainProduct.title}
                className="h-20 w-20 rounded-xl object-cover"
              />
              <div>
                <p className="line-clamp-2 text-sm font-semibold">{mainProduct.title}</p>
                <p className="text-xs text-primary-foreground/80">Featured from live backend</p>
              </div>
              <strong className="text-sm">{formatMoney(minPrice(mainProduct))}</strong>
            </div>
          ) : null}
        </div>
      </Reveal>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        {[secondaryProduct, tertiaryProduct].filter(Boolean).map((product, index) => (
          <Reveal key={product.id} delayMs={120 + index * 120}>
            <Link
              to={`/product/${product.handle}`}
              className="group relative block overflow-hidden rounded-3xl border border-border/80 bg-card p-3 shadow-soft"
            >
              <div className="relative aspect-[5/3.3] overflow-hidden rounded-2xl">
                <img
                  src={productImage(product)}
                  alt={product.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
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
