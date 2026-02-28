import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  DollarSign,
  Sparkles,
  Star,
} from "lucide-react";
import HomeHero from "@/components/storefront/HomeHero";
import CollectionCard from "@/components/storefront/CollectionCard";
import KpiStrip from "@/components/storefront/KpiStrip";
import ProductCard from "@/components/storefront/ProductCard";
import Reveal from "@/components/storefront/Reveal";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { readingTime, savingsPercent } from "@/lib/formatters";
import {
  useBlogPosts,
  useCollections,
  useProducts,
} from "@/lib/shopify-data";
import type { ShopifyCollection } from "@/types/shopify";

const trustBullets = [
  {
    title: "Safe and Secure Delivery",
    detail:
      "We don't just ship boxes; we ensure your order arrives safely and swiftly with premium tracking every step of the way.",
  },
  {
    title: "Secure & Flexible Payments",
    detail:
      "Choose how you pay with our fully encrypted checkout, supporting all major cards and buy now, pay later options.",
  },
  {
    title: 'Our "Happiness" Guarantee',
    detail:
      "Not quite what you expected? No problem. Our 30-day, hassle-free return policy ensures you never have to settle.",
  },
  {
    title: "Expertly Curated Selection",
    detail:
      "Every item in our store is hand-vetted by our team for quality and durability, so you only ever get the best.",
  },
];

function formattedDate(value: string): string {
  if (!value) {
    return "Recent";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recent";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formattedDateTime(value: string): string {
  if (!value) {
    return "recently";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "recently";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type RankedCollection = ShopifyCollection & {
  effectiveCount: number;
};

const HomePage = () => {
  const {
    data: productsPayload,
    isLoading: productsLoading,
    error: productsError,
    refetch: refetchProducts,
  } = useProducts();

  const {
    data: collectionsPayload,
    error: collectionsError,
    refetch: refetchCollections,
  } = useCollections();

  const {
    data: blogPayload,
    isLoading: blogLoading,
    error: blogError,
    refetch: refetchBlog,
  } = useBlogPosts();

  const products = productsPayload?.products || [];
  const collections = collectionsPayload?.collections || [];
  const isInitialProductsSync = productsLoading && !productsPayload;

  if (isInitialProductsSync) {
    return (
      <LoadingState
        title="Loading SALT catalog"
        subtitle="Preparing products, collections, and featured recommendations."
      />
    );
  }

  if (productsError && !productsPayload) {
    return (
      <ErrorState
        title="We could not load the storefront"
        subtitle="Please retry to pull the latest live catalog data."
        action={
          <button
            type="button"
            onClick={() => {
              refetchProducts();
              refetchCollections();
              refetchBlog();
            }}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
          >
            Retry
          </button>
        }
      />
    );
  }

  const hasCollectionSyncIssue = Boolean(collectionsError);

  const rankedCollections: RankedCollection[] = collections
    .map((collection) => ({
      ...collection,
      effectiveCount: collection.products_count,
    }))
    .sort((a, b) => {
      if (b.effectiveCount !== a.effectiveCount) {
        return b.effectiveCount - a.effectiveCount;
      }

      return (
        new Date(b.updated_at || b.published_at || "1970-01-01").getTime() -
        new Date(a.updated_at || a.published_at || "1970-01-01").getTime()
      );
    });

  const featured = products.slice(0, 3);
  const quickCollections = rankedCollections.slice(0, 6);
  const featuredCollections = rankedCollections.slice(0, 6);
  const trendingProducts = [...products]
    .sort((a, b) => {
      const discountDelta = savingsPercent(b) - savingsPercent(a);
      if (discountDelta !== 0) {
        return discountDelta;
      }

      return (
        new Date(b.updated_at || b.published_at || b.created_at || "1970-01-01").getTime() -
        new Date(a.updated_at || a.published_at || a.created_at || "1970-01-01").getTime()
      );
    })
    .slice(0, 8);
  const latestBlogPosts = !blogError && !blogLoading ? (blogPayload?.posts || []).slice(0, 3) : [];

  const syncCandidates = [
    productsPayload?.generatedAt,
    collectionsPayload?.generatedAt,
    blogPayload?.generatedAt,
  ].filter(Boolean) as string[];
  const lastSyncedAt = syncCandidates.sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime(),
  )[0];

  return (
    <>
      <HomeHero featured={featured} />
      <KpiStrip products={products} collections={collections} />
      {hasCollectionSyncIssue ? (
        <section className="mx-auto mt-4 w-[min(1280px,96vw)]">
          <Reveal>
            <div className="salt-ambient-card rounded-xl border border-primary/30 px-4 py-3 text-xs text-foreground">
              Collections are refreshing from Shopify. Product shopping and checkout remain live.
            </div>
          </Reveal>
        </section>
      ) : null}

      <section className="mx-auto mt-6 w-[min(1280px,96vw)]">
        <Reveal>
          <div className="salt-panel-shell salt-sync-strip rounded-2xl p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-foreground">
                <span className="salt-sync-dot" aria-hidden="true"></span>
                Catalog synced {formattedDateTime(lastSyncedAt)}
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="salt-sync-pill">Live inventory</span>
                <span className="salt-sync-pill">{products.length.toLocaleString()} products</span>
                <span className="salt-sync-pill">{collections.length.toLocaleString()} collections</span>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <p className="salt-ambient-card rounded-xl px-3 py-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> Discovery acceleration
                </span>
                <span className="mt-1 block">Sharper category routes and cleaner filter steps.</span>
              </p>
              <p className="salt-ambient-card rounded-xl px-3 py-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-foreground">
                  <BadgeCheck className="h-3.5 w-3.5 text-primary" /> Checkout confidence
                </span>
                <span className="mt-1 block">Direct handoff into secure Shopify checkout flow.</span>
              </p>
              <p className="salt-ambient-card rounded-xl px-3 py-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-foreground">
                  <Clock3 className="h-3.5 w-3.5 text-primary" /> Always current
                </span>
                <span className="mt-1 block">Auto-refresh keeps catalog and pricing up to date.</span>
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="mx-auto mt-10 w-[min(1280px,96vw)]">
        <Reveal>
          <div className="salt-panel-shell rounded-[2rem] p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                  Quick access
                </p>
                <h2 className="font-display text-[clamp(1.5rem,2.8vw,2.3rem)] leading-[1.02] text-foreground">
                  Jump straight to what shoppers actually buy
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  High-intent routes that reduce drop-off between browsing and cart.
                </p>
              </div>
              <Link
                to="/shop"
                className="salt-outline-chip h-10 px-4 py-0 text-xs"
              >
                View all products
              </Link>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {quickCollections.map((collection) => (
                <Link
                  key={collection.id}
                  to={`/shop?collection=${collection.handle}`}
                  className="salt-kpi-card salt-metric-card flex items-center justify-between rounded-xl bg-[linear-gradient(150deg,hsl(var(--card)/0.96),hsl(var(--card)/0.82))] px-4 py-3 text-sm font-semibold text-foreground transition hover:-translate-y-[2px] hover:border-primary/50 hover:text-primary"
                >
                  <span className="line-clamp-1 text-foreground">{collection.title}</span>
                  <span className="ml-2 text-xs uppercase tracking-[0.08em] text-muted-foreground">
                    {collection.effectiveCount}
                  </span>
                </Link>
              ))}
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Link
                to="/shop?max=25"
                className="salt-kpi-card salt-metric-card rounded-xl px-4 py-3 text-sm font-semibold text-foreground transition hover:-translate-y-[2px] hover:border-primary/50 hover:text-primary"
              >
                Under $25
              </Link>
              <Link
                to="/shop?min=25&max=60"
                className="salt-kpi-card salt-metric-card rounded-xl px-4 py-3 text-sm font-semibold text-foreground transition hover:-translate-y-[2px] hover:border-primary/50 hover:text-primary"
              >
                $25 to $60
              </Link>
              <Link
                to="/shop?min=60&max=120"
                className="salt-kpi-card salt-metric-card rounded-xl px-4 py-3 text-sm font-semibold text-foreground transition hover:-translate-y-[2px] hover:border-primary/50 hover:text-primary"
              >
                $60 to $120
              </Link>
              <Link
                to="/shop?min=120"
                className="salt-kpi-card salt-metric-card rounded-xl px-4 py-3 text-sm font-semibold text-foreground transition hover:-translate-y-[2px] hover:border-primary/50 hover:text-primary"
              >
                $120 and above
              </Link>
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
                Top collections with active inventory
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Collection counts are matched against currently synced products so shoppers see
                relevant inventory paths.
              </p>
            </div>
            <Link
              to="/collections"
              className="salt-outline-chip h-11 px-5 py-0 text-sm"
            >
              View all collections
            </Link>
          </div>
        </Reveal>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featuredCollections.map((collection, index) => (
            <Reveal key={collection.id} delayMs={index * 80}>
              <CollectionCard
                collection={collection}
                productCount={collection.effectiveCount}
                variant={index < 2 ? "hero" : "default"}
              />
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
                High-intent products, prioritized
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Ranked by strongest discount opportunity and fresh updates to keep merchandising
                conversion-focused.
              </p>
            </div>
            <Link
              to="/shop"
              className="salt-primary-cta h-11 px-5 text-sm font-bold"
            >
              Shop full catalog
            </Link>
          </div>
        </Reveal>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {trendingProducts.map((product, index) => (
            <Reveal key={product.id} delayMs={index * 70}>
              <ProductCard product={product} variant="dense" />
            </Reveal>
          ))}
        </div>
      </section>

      {latestBlogPosts.length > 0 ? (
        <section className="mx-auto mt-12 w-[min(1280px,96vw)]">
          <Reveal>
            <div className="salt-section-shell rounded-[2rem] p-5 sm:p-7">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                    From the Blog
                  </p>
                  <h3 className="font-display text-[clamp(1.7rem,2.6vw,2.4rem)] leading-tight">
                    Fresh content from Shopify posts
                  </h3>
                </div>
                <Link
                  to="/blog"
                  className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.1em] text-primary"
                >
                  Browse all posts <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {latestBlogPosts.map((post) => (
                  <Link
                    key={post.id}
                    to={`/blog/${post.handle}`}
                    className="salt-kpi-card salt-metric-card rounded-2xl p-4 transition hover:-translate-y-0.5 hover:border-primary/50"
                  >
                    <p className="line-clamp-2 text-lg font-semibold leading-7">{post.title}</p>
                    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{post.excerpt}</p>
                    <div className="mt-3 flex items-center justify-between text-[0.68rem] uppercase tracking-[0.1em] text-muted-foreground">
                      <span>{formattedDate(post.publishedAt)}</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5" />
                        {readingTime(post.contentHtml)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </Reveal>
        </section>
      ) : null}

      <section className="salt-surface-strong mx-auto mt-14 w-[min(1280px,96vw)] rounded-[2rem] p-5 sm:p-7">
        <Reveal>
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <h3 className="font-display text-[clamp(1.5rem,2.8vw,2.3rem)] leading-tight">
                Everything you need to shop with total confidence
              </h3>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
                We believe shopping should be effortless. That's why we've removed the guesswork,
                focusing on curated quality and a support team that actually cares about your
                experience.
              </p>

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {trustBullets.map((item) => (
                  <div
                    key={item.title}
                    className="salt-ambient-card salt-metric-card rounded-xl px-3 py-3"
                  >
                    <p className="text-xs font-semibold text-foreground">{item.title}</p>
                    <p className="mt-1 text-[0.72rem] leading-relaxed text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>

            </div>

            <div className="salt-card-hover salt-section-shell rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/18 via-card to-salt-olive/12 p-5 shadow-[0_24px_46px_-32px_rgba(0,0,0,0.5)]">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                Customer proof
              </p>
              <h4 className="mt-2 font-display text-2xl leading-tight">
                Why customers trust us with their shopping needs?
              </h4>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="salt-metric-card rounded-xl border border-border/70 bg-background px-2.5 py-2 text-center">
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    Ready to ship
                  </p>
                  <p className="mt-1 text-sm font-bold text-foreground">
                    In Stock Now
                  </p>
                </div>
                <div className="salt-metric-card rounded-xl border border-border/70 bg-background px-2.5 py-2 text-center">
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    New weekly drops
                  </p>
                  <p className="mt-1 text-sm font-bold text-foreground">
                    Just Added
                  </p>
                </div>
                <div className="salt-metric-card rounded-xl border border-border/70 bg-background px-2.5 py-2 text-center">
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    Fast delivery
                  </p>
                  <p className="mt-1 text-sm font-bold text-foreground">
                    Quick Dispatch
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                <p className="inline-flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-primary" /> Premium materials sourced from
                  ethical, certified partners.
                </p>
                <p className="inline-flex items-center gap-2">
                  <Star className="h-4 w-4 text-primary" /> Rigorous quality testing on every item
                  before shipping.
                </p>
                <p className="inline-flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Transparent, fair pricing without the
                  middleman markup.
                </p>
                <p className="inline-flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-primary" /> Dedicated 24/7 expert support for
                  total peace of mind.
                </p>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  to="/shop"
                  className="salt-button-shine inline-flex h-10 items-center rounded-full bg-[hsl(var(--salt-ink))] px-4 text-xs font-bold uppercase tracking-[0.08em] text-[hsl(var(--salt-paper))] transition hover:brightness-110"
                >
                  Shop with confidence
                </Link>

                <Link
                  to="/shop?sort=discount"
                  className="salt-outline-chip h-10 px-4 py-0 text-xs"
                >
                  View top value picks
                </Link>
                <Link
                  to="/blog"
                  className="salt-outline-chip h-10 px-4 py-0 text-xs"
                >
                  Read buying guides
                </Link>
                <Link
                  to="/contact"
                  className="salt-outline-chip h-10 px-4 py-0 text-xs"
                >
                  Talk to support
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
};

export default HomePage;
