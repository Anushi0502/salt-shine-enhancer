import { Link } from "react-router-dom";
import { ArrowRight, BadgeCheck, Clock3, ShieldCheck, Sparkles, Star } from "lucide-react";
import { formatMoney, minPrice, productImage } from "@/lib/formatters";
import type { ShopifyProduct } from "@/types/shopify";
import Reveal from "@/components/storefront/Reveal";
import BrandLogo from "@/components/layout/BrandLogo";

type HomeHeroProps = {
  featured: ShopifyProduct[];
};

const heroStats = [
  {
    label: "Curated weekly",
    detail: "Fresh collections and editorial product groupings.",
    icon: Sparkles,
  },
  {
    label: "Checkout clarity",
    detail: "Low-friction product paths from first browse to cart.",
    icon: ShieldCheck,
  },
  {
    label: "Ready to gift",
    detail: "Lifestyle, home, gifting, and everyday essentials in one flow.",
    icon: BadgeCheck,
  },
];

function sideCardCopy(product: ShopifyProduct, index: number): { eyebrow: string; note: string } {
  const source = `${product.title} ${product.product_type}`.toLowerCase();

  if (/book|planner|legacy/.test(source)) {
    return {
      eyebrow: index === 0 ? "Most loved gift" : "Meaningful pick",
      note: "Thoughtful, lasting pieces shoppers tend to save for themselves and gift to others.",
    };
  }

  if (/dress|robe|wear|apparel/.test(source)) {
    return {
      eyebrow: "Wardrobe find",
      note: "Soft, easy style with enough presence to feel considered instead of impulse-only.",
    };
  }

  if (/cook|kitchen|pan|pot/.test(source)) {
    return {
      eyebrow: "Kitchen favorite",
      note: "Practical upgrades designed to feel giftable, useful, and ready to use every day.",
    };
  }

  return {
    eyebrow: index === 0 ? "Editor’s choice" : "Featured now",
    note: "A high-intent pick surfaced for clean browsing, stronger trust, and faster decision-making.",
  };
}

const HomeHero = ({ featured }: HomeHeroProps) => {
  const [mainProduct, secondaryProduct, tertiaryProduct] = featured ?? [];

  const mainProductImage = mainProduct ? productImage(mainProduct) : null;
  const sideProducts = [secondaryProduct, tertiaryProduct].filter(Boolean) as ShopifyProduct[];

  return (
    <section className="mx-auto mt-8 grid w-[min(1320px,96vw)] gap-4 lg:grid-cols-[1.16fr_0.84fr]">
      <Reveal>
        <div className="salt-ink-panel relative isolate overflow-hidden rounded-[2.4rem] border border-white/10 px-6 py-8 text-[hsl(var(--salt-paper))] shadow-[0_34px_90px_-40px_rgba(0,0,0,0.7)] sm:px-8 sm:py-10 lg:px-10 lg:py-11">
          <div className="pointer-events-none absolute inset-0 salt-grid-bg opacity-[0.12]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_30%),radial-gradient(circle_at_88%_10%,hsl(var(--primary)/0.24),transparent_22%),radial-gradient(circle_at_45%_100%,hsl(var(--salt-blue)/0.2),transparent_30%)]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
          <div className="pointer-events-none absolute -left-12 top-20 h-44 w-44 rounded-full bg-primary/18 blur-[78px]" />
          <div className="pointer-events-none absolute right-[-4rem] top-[-3rem] h-72 w-72 rounded-full bg-salt-blue/18 blur-[100px]" />

          <div className="relative z-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <BrandLogo
                size="sm"
                withWordmark
                className="w-fit rounded-full border border-white/16 bg-white/8 px-3 py-2 backdrop-blur-md"
              />

              <div className="flex flex-wrap gap-2.5">
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/38 bg-primary/14 px-3.5 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-primary backdrop-blur-md">
                  <Sparkles className="h-3.5 w-3.5" />
                  Spring curation
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/8 px-3.5 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-white/82 backdrop-blur-md">
                  <Clock3 className="h-3.5 w-3.5" />
                  Limited weekend drops
                </span>
              </div>
            </div>

            <div className="mt-8 max-w-[46rem]">
              <p className="salt-kicker">Curated lifestyle retail, built to convert</p>
              <h1 className="mt-4 max-w-[11ch] font-display text-[clamp(2.95rem,5.8vw,5.8rem)] leading-[0.84] tracking-[-0.045em] text-white">
                Discover the pieces that make home, gifting, and everyday living feel
                <span className="mt-2 block bg-gradient-to-r from-primary via-[hsl(48_97%_68%)] to-white bg-clip-text text-transparent">
                  deliberate, easy, and worth buying.
                </span>
              </h1>
              <p className="mt-5 max-w-[38rem] text-[0.98rem] leading-7 text-white/74 sm:text-[1.03rem]">
                SALT brings editorial warmth to real shopping behavior: cleaner collection paths, better featured picks, and a storefront designed to move from first click to confident checkout without friction.
              </p>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/shop?collection=new-arrivals"
                className="salt-button-shine salt-primary-cta group inline-flex h-13 items-center gap-2.5 rounded-full px-7 text-sm font-bold uppercase tracking-[0.12em] shadow-[0_18px_44px_-18px_hsl(var(--primary)/0.65)] transition-all hover:scale-[1.02]"
              >
                Shop New Arrivals
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>

              <Link
                to="/collections"
                className="inline-flex h-13 items-center rounded-full border border-white/28 bg-white/8 px-7 text-sm font-bold uppercase tracking-[0.12em] text-white backdrop-blur-md transition-all hover:border-white/55 hover:bg-white hover:text-[hsl(var(--salt-ink))]"
              >
                Explore Collections
              </Link>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              {heroStats.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="salt-hero-stat rounded-[1.35rem] px-4 py-3.5">
                    <div className="flex items-center gap-2 text-primary">
                      <Icon className="h-4 w-4" />
                      <p className="text-[0.72rem] font-bold uppercase tracking-[0.12em] text-white/88">
                        {item.label}
                      </p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-white/68">{item.detail}</p>
                  </div>
                );
              })}
            </div>

            {mainProduct ? (
              <Link
                to={`/products/${mainProduct.handle}`}
                className="group/card relative mt-8 flex min-h-[19rem] flex-col gap-5 overflow-hidden rounded-[1.8rem] border border-white/10 bg-white/[0.05] p-5 shadow-[0_20px_44px_-24px_rgba(0,0,0,0.58)] backdrop-blur-md transition-all duration-500 hover:border-primary/38 hover:bg-white/[0.07] sm:flex-row sm:items-center sm:p-6"
              >
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),transparent_28%,transparent_70%,rgba(255,255,255,0.05))] opacity-0 transition-opacity duration-500 group-hover/card:opacity-100" />

                <div className="relative z-10 shrink-0 self-start sm:self-center">
                  {mainProductImage ? (
                    <img
                      src={mainProductImage}
                      alt={mainProduct.title}
                      className="h-32 w-28 rounded-[1.45rem] object-cover shadow-[0_16px_36px_-18px_rgba(0,0,0,0.72)] ring-1 ring-white/18 transition-all duration-300 group-hover/card:scale-[1.03] sm:h-40 sm:w-32 lg:h-44 lg:w-36"
                    />
                  ) : (
                    <div className="grid h-32 w-28 place-items-center rounded-[1.45rem] bg-white/12 text-[0.58rem] font-bold uppercase tracking-[0.08em] text-white/80 sm:h-40 sm:w-32 lg:h-44 lg:w-36">
                      No image
                    </div>
                  )}

                  <span className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-[hsl(var(--primary-foreground))] shadow-[0_14px_28px_-14px_hsl(var(--primary)/0.8)]">
                    <Star className="h-4 w-4 fill-current" />
                  </span>
                </div>

                <div className="relative z-10 min-w-0 flex-1">
                  <p className="salt-kicker">Most loved this week</p>
                  <p className="mt-3 line-clamp-2 font-display text-[clamp(1.45rem,2.8vw,2.55rem)] leading-[1] text-white">
                    {mainProduct.title}
                  </p>
                  <p className="mt-3 max-w-[34rem] text-[0.96rem] leading-7 text-white/68">
                    A lead product placement built to hold attention, surface price clarity fast, and give shoppers one obvious premium pick before they browse the wider catalog.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="inline-flex rounded-full border border-white/20 bg-white/8 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-white/90">
                      Bestseller spotlight
                    </span>
                    {mainProduct.product_type ? (
                      <span className="inline-flex rounded-full border border-white/14 bg-black/20 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-white/70">
                        {mainProduct.product_type}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="relative z-10 flex shrink-0 flex-row items-end justify-between gap-4 sm:flex-col sm:items-end sm:justify-between">
                  <div className="text-left sm:text-right">
                    <p className="text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-white/44">
                      Starting at
                    </p>
                    <strong className="mt-1 block font-display text-3xl font-bold text-primary sm:text-[2.55rem]">
                      {formatMoney(minPrice(mainProduct))}
                    </strong>
                  </div>

                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/35 bg-primary/14 px-4 py-2 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-primary transition-all group-hover/card:bg-primary group-hover/card:text-[hsl(var(--primary-foreground))]">
                    Shop now
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/card:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            ) : null}
          </div>
        </div>
      </Reveal>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        {sideProducts.map((product, index) => {
          const image = productImage(product);
          const copy = sideCardCopy(product, index);

          return (
            <Reveal key={product.id} delayMs={120 + index * 120}>
              <Link
                to={`/products/${product.handle}`}
                className="salt-story-card group flex h-full flex-col overflow-hidden rounded-[1.9rem]"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  {image ? (
                    <img
                      src={image}
                      alt={product.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.08]"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_22%_20%,hsl(var(--primary)/0.16),transparent_44%),radial-gradient(circle_at_76%_78%,hsl(var(--salt-blue)/0.18),transparent_38%),hsl(var(--muted))] px-6 text-center">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        Image unavailable
                      </p>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--card))] via-[hsl(var(--card)/0.14)] to-transparent opacity-95" />
                  <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/22 to-transparent" />
                </div>

                <div className="flex flex-1 flex-col p-5 sm:p-6">
                  <p className="salt-kicker">{copy.eyebrow}</p>
                  <h3 className="mt-3 line-clamp-2 font-display text-[1.55rem] leading-[1.03] text-foreground">
                    {product.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy.note}</p>
                  <div className="mt-auto flex items-end justify-between gap-3 pt-6">
                    <div>
                      <p className="text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Starting at
                      </p>
                      <strong className="mt-1 block text-2xl font-bold text-primary">
                        {formatMoney(minPrice(product))}
                      </strong>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background px-4 py-2 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-foreground transition group-hover:border-primary/45 group-hover:text-primary">
                      View pick
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                    </span>
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
