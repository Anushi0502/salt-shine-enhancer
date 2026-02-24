import { Link } from "react-router-dom";
import { ArrowRight, BadgeCheck, Clock3, Sparkles, Star, TrendingUp } from "lucide-react";
import HomeHero from "@/components/storefront/HomeHero";
import CollectionCard from "@/components/storefront/CollectionCard";
import KpiStrip from "@/components/storefront/KpiStrip";
import ProductCard from "@/components/storefront/ProductCard";
import Reveal from "@/components/storefront/Reveal";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { formatMoney, minPrice, savingsPercent } from "@/lib/formatters";
import { useCollections, useProducts } from "@/lib/shopify-data";

const trustBullets = [
  "Fast US fulfillment and dependable shipping updates",
  "Secure checkout and encrypted payment processing",
  "30-day returns on eligible products",
  "Curated launches every week across key categories",
];

const testimonials = [
  {
    quote: "The product quality is way above what I expected for the price point.",
    name: "Priya R.",
    label: "Verified customer",
  },
  {
    quote: "Checkout was smooth and delivery updates were clear from day one.",
    name: "Daniel M.",
    label: "Returning customer",
  },
  {
    quote: "SALT has become my first stop for smart gifts and practical home picks.",
    name: "Nadia K.",
    label: "Gift shopper",
  },
];

const HomePage = () => {
  const {
    data: productsPayload,
    isLoading: productsLoading,
    error: productsError,
    refetch: refetchProducts,
  } = useProducts();

  const {
    data: collectionsPayload,
    isLoading: collectionsLoading,
    error: collectionsError,
    refetch: refetchCollections,
  } = useCollections();

  if (productsLoading || collectionsLoading) {
    return (
      <LoadingState
        title="Loading SALT catalog"
        subtitle="Preparing products, collections, and featured recommendations."
      />
    );
  }

  if (productsError || collectionsError) {
    return (
      <ErrorState
        title="We could not load the storefront"
        subtitle="Please retry. If the issue continues, the embedded fallback catalog will still appear on refresh."
        action={
          <button
            type="button"
            onClick={() => {
              refetchProducts();
              refetchCollections();
            }}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
          >
            Retry
          </button>
        }
      />
    );
  }

  const products = productsPayload?.products || [];
  const collections = collectionsPayload?.collections || [];

  const featured = products.slice(0, 3);
  const featuredCollections = collections.slice(0, 8);
  const trendingProducts = products.slice(0, 8);

  const hotDeals = [...products]
    .sort((a, b) => savingsPercent(b) - savingsPercent(a))
    .filter((product) => savingsPercent(product) > 0)
    .slice(0, 4);

  const latestDrop = [...products]
    .sort(
      (a, b) =>
        new Date(b.published_at || b.created_at).getTime() -
        new Date(a.published_at || a.created_at).getTime(),
    )
    .slice(0, 4);

  return (
    <>
      <HomeHero featured={featured} />
      <KpiStrip products={products} collections={collections} />

      <section className="mx-auto mt-10 w-[min(1280px,96vw)]">
        <Reveal>
          <div className="salt-glass rounded-[2rem] border border-border/80 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Quick access</p>
                <h2 className="font-display text-[clamp(1.5rem,2.8vw,2.3rem)] leading-[1.02]">
                  Shop by what you need right now
                </h2>
              </div>
              <Link
                to="/shop"
                className="inline-flex h-10 items-center rounded-full border border-border bg-background px-4 text-xs font-bold uppercase tracking-[0.08em] hover:border-primary/50"
              >
                View all products
              </Link>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {collections.slice(0, 8).map((collection) => (
                <Link
                  key={collection.id}
                  to={`/shop?collection=${collection.handle}`}
                  className="rounded-full border border-border bg-background px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground transition hover:border-primary/50 hover:text-primary"
                >
                  {collection.title}
                </Link>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      <section id="collections" className="mx-auto mt-12 w-[min(1280px,96vw)]">
        <Reveal>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Explore</p>
              <h2 className="font-display text-[clamp(1.9rem,3vw,2.8rem)] leading-[1.02]">
                Curated Collections, Sharper Navigation
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Move from broad browsing to focused buying with collection-led merchandising and stronger category intent.
              </p>
            </div>
            <Link
              to="/collections"
              className="inline-flex h-11 items-center rounded-full border border-border bg-card px-5 text-sm font-bold hover:border-primary/50 hover:text-primary"
            >
              View all collections
            </Link>
          </div>
        </Reveal>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featuredCollections.map((collection, index) => (
            <Reveal key={collection.id} delayMs={index * 80}>
              <CollectionCard collection={collection} />
            </Reveal>
          ))}
        </div>
      </section>

      <section id="products" className="mx-auto mt-14 w-[min(1280px,96vw)]">
        <Reveal>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Trending</p>
              <h2 className="font-display text-[clamp(1.9rem,3vw,2.8rem)] leading-[1.02]">
                Best Sellers This Week
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Fast-moving products from your current catalog with strong value clarity and direct add-to-cart flow.
              </p>
            </div>
            <Link
              to="/shop"
              className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground hover:brightness-110"
            >
              Shop full catalog
            </Link>
          </div>
        </Reveal>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {trendingProducts.map((product, index) => (
            <Reveal key={product.id} delayMs={index * 70}>
              <ProductCard product={product} />
            </Reveal>
          ))}
        </div>
      </section>

      {hotDeals.length > 0 ? (
        <section className="mx-auto mt-14 w-[min(1280px,96vw)]">
          <Reveal>
            <div className="rounded-[2rem] border border-border/80 bg-card p-5 shadow-soft sm:p-7">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Deal Focus</p>
                  <h3 className="font-display text-[clamp(1.7rem,2.6vw,2.4rem)] leading-tight">
                    Highest Savings Right Now
                  </h3>
                </div>
                <Link
                  to="/shop"
                  className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.1em] text-primary"
                >
                  See all deals <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {hotDeals.map((product) => (
                  <Link
                    key={product.id}
                    to={`/product/${product.handle}`}
                    className="group rounded-2xl border border-border/80 bg-background p-4 transition hover:-translate-y-0.5 hover:border-primary/40"
                  >
                    <div className="mb-2 inline-flex items-center gap-1 rounded-full border border-primary/35 bg-primary/10 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.1em] text-primary">
                      <TrendingUp className="h-3 w-3" /> Save {savingsPercent(product)}%
                    </div>
                    <p className="line-clamp-2 min-h-[2.8rem] text-sm font-semibold leading-5">{product.title}</p>
                    <p className="mt-2 text-sm text-muted-foreground">From {formatMoney(minPrice(product))}</p>
                  </Link>
                ))}
              </div>
            </div>
          </Reveal>
        </section>
      ) : null}

      {latestDrop.length > 0 ? (
        <section className="mx-auto mt-12 w-[min(1280px,96vw)]">
          <Reveal>
            <div className="rounded-[2rem] border border-border/80 bg-gradient-to-br from-card via-card to-salt-warm/40 p-5 shadow-soft sm:p-7">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Latest Drop</p>
                  <h3 className="font-display text-[clamp(1.7rem,2.6vw,2.4rem)] leading-tight">
                    New Picks Added to the Catalog
                  </h3>
                </div>
                <Link
                  to="/shop?collection=new-arrivals"
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-xs font-bold uppercase tracking-[0.09em]"
                >
                  Browse new arrivals <Clock3 className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {latestDrop.map((product) => (
                  <Link
                    key={product.id}
                    to={`/product/${product.handle}`}
                    className="rounded-2xl border border-border/75 bg-background/85 p-4 transition hover:border-primary/50"
                  >
                    <p className="line-clamp-2 min-h-[2.8rem] text-sm font-semibold">{product.title}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.08em] text-muted-foreground">
                      Freshly published
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </Reveal>
        </section>
      ) : null}

      <section className="mx-auto mt-14 w-[min(1280px,96vw)] rounded-[2rem] border border-border/80 bg-card p-5 shadow-soft sm:p-7">
        <Reveal>
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <h3 className="font-display text-[clamp(1.5rem,2.8vw,2.3rem)] leading-tight">
                Built for conversion without losing the SALT identity
              </h3>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
                This storefront blends editorial feel with practical ecommerce UX: stronger navigation hierarchy,
                clearer pricing cues, and frictionless path-to-purchase from discovery to checkout.
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {trustBullets.map((item) => (
                  <p key={item} className="rounded-xl border border-border/70 bg-background px-3 py-2 text-xs text-muted-foreground">
                    {item}
                  </p>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card to-salt-olive/10 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Customer proof</p>
              <h4 className="mt-2 font-display text-2xl leading-tight">Shoppers come back for reliability and value</h4>
              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                <p className="inline-flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-primary" /> 4.8 average rating across featured items
                </p>
                <p className="inline-flex items-center gap-2">
                  <Star className="h-4 w-4 text-primary" /> Transparent pricing and discount visibility
                </p>
                <p className="inline-flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Curated inventory updated continuously
                </p>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  to="/shop"
                  className="inline-flex h-10 items-center rounded-full bg-foreground px-4 text-xs font-bold uppercase tracking-[0.08em] text-primary-foreground hover:brightness-110"
                >
                  Start shopping
                </Link>
                <Link
                  to="/contact"
                  className="inline-flex h-10 items-center rounded-full border border-border bg-background px-4 text-xs font-bold uppercase tracking-[0.08em] hover:border-primary/50"
                >
                  Need help?
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="mx-auto mt-12 w-[min(1280px,96vw)] pb-4">
        <Reveal>
          <div className="grid gap-3 md:grid-cols-3">
            {testimonials.map((testimonial, index) => (
              <article key={testimonial.name} className="rounded-2xl border border-border/80 bg-card p-5 shadow-soft">
                <p className="text-sm leading-7">“{testimonial.quote}”</p>
                <p className="mt-4 text-xs font-bold uppercase tracking-[0.1em] text-primary">
                  {testimonial.name} • {testimonial.label}
                </p>
                <p className="mt-2 text-[0.65rem] uppercase tracking-[0.1em] text-muted-foreground">
                  Reviewed in the last 30 days ({index + 1})
                </p>
              </article>
            ))}
          </div>
        </Reveal>
      </section>
    </>
  );
};

export default HomePage;
