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
  useCollectionProductsMap,
  useCollections,
  useProducts,
} from "@/lib/shopify-data";
import type { ShopifyCollection } from "@/types/shopify";

const trustBullets = [
  "Fast order processing and clear shipping updates",
  "Secure checkout with encrypted payment handling",
  "30-day returns on eligible products",
  "Weekly catalog refresh with high-intent categories",
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
    isLoading: collectionsLoading,
    error: collectionsError,
    refetch: refetchCollections,
  } = useCollections();

  const {
    data: blogPayload,
    isLoading: blogLoading,
    error: blogError,
    refetch: refetchBlog,
  } = useBlogPosts();

  const { data: collectionMapPayload } = useCollectionProductsMap();

  if (productsLoading || collectionsLoading || blogLoading) {
    return (
      <LoadingState
        title="Loading SALT catalog"
        subtitle="Preparing products, collections, and featured recommendations."
      />
    );
  }

  if (productsError || collectionsError || blogError) {
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

  const products = productsPayload?.products || [];
  const collections = collectionsPayload?.collections || [];
  const collectionMap = collectionMapPayload?.collections || {};
  const liveProductIdSet = new Set(products.map((product) => product.id));

  const countForCollection = (handle: string, fallback: number) => {
    const productIds = collectionMap[handle]?.productIds;
    if (!productIds || !productIds.length) {
      return fallback;
    }

    const uniqueIds = new Set(productIds);
    let total = 0;

    uniqueIds.forEach((id) => {
      if (liveProductIdSet.has(id)) {
        total += 1;
      }
    });

    return total;
  };

  const rankedCollections: RankedCollection[] = collections
    .map((collection) => ({
      ...collection,
      effectiveCount: countForCollection(collection.handle, collection.products_count),
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
  const latestBlogPosts = (blogPayload?.posts || []).slice(0, 3);

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

      <section className="mx-auto mt-6 w-[min(1280px,96vw)]">
        <Reveal>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card p-4 shadow-soft">
            <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
              Catalog synced {formattedDateTime(lastSyncedAt)}
            </p>
            <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
              Source: saltonlinestore.com • {products.length.toLocaleString()} products •{" "}
              {collections.length.toLocaleString()} collections
            </p>
          </div>
        </Reveal>
      </section>

      <section className="mx-auto mt-10 w-[min(1280px,96vw)]">
        <Reveal>
          <div className="salt-glass rounded-[2rem] border border-border/80 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                  Quick access
                </p>
                <h2 className="font-display text-[clamp(1.5rem,2.8vw,2.3rem)] leading-[1.02]">
                  Browse faster with fewer clicks
                </h2>
              </div>
              <Link
                to="/shop"
                className="inline-flex h-10 items-center rounded-full border border-border bg-background px-4 text-xs font-bold uppercase tracking-[0.08em] hover:border-primary/50"
              >
                View all products
              </Link>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {quickCollections.map((collection) => (
                <Link
                  key={collection.id}
                  to={`/shop?collection=${collection.handle}`}
                  className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold transition hover:border-primary/50"
                >
                  <span className="line-clamp-1">{collection.title}</span>
                  <span className="ml-2 text-xs uppercase tracking-[0.08em] text-muted-foreground">
                    {collection.effectiveCount}
                  </span>
                </Link>
              ))}
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Link
                to="/shop?max=25"
                className="rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold transition hover:border-primary/50 hover:text-primary"
              >
                Under $25
              </Link>
              <Link
                to="/shop?min=25&max=60"
                className="rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold transition hover:border-primary/50 hover:text-primary"
              >
                $25 to $60
              </Link>
              <Link
                to="/shop?min=60&max=120"
                className="rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold transition hover:border-primary/50 hover:text-primary"
              >
                $60 to $120
              </Link>
              <Link
                to="/shop?min=120"
                className="rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold transition hover:border-primary/50 hover:text-primary"
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
              className="inline-flex h-11 items-center rounded-full border border-border bg-card px-5 text-sm font-bold hover:border-primary/50 hover:text-primary"
            >
              View all collections
            </Link>
          </div>
        </Reveal>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featuredCollections.map((collection, index) => (
            <Reveal key={collection.id} delayMs={index * 80}>
              <CollectionCard collection={collection} productCount={collection.effectiveCount} />
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

      {latestBlogPosts.length > 0 ? (
        <section className="mx-auto mt-12 w-[min(1280px,96vw)]">
          <Reveal>
            <div className="rounded-[2rem] border border-border/80 bg-card p-5 shadow-soft sm:p-7">
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
                    className="rounded-2xl border border-border/75 bg-background p-4 transition hover:-translate-y-0.5 hover:border-primary/50"
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

      <section className="mx-auto mt-14 w-[min(1280px,96vw)] rounded-[2rem] border border-border/80 bg-card p-5 shadow-soft sm:p-7">
        <Reveal>
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <h3 className="font-display text-[clamp(1.5rem,2.8vw,2.3rem)] leading-tight">
                Built for conversion without losing the SALT identity
              </h3>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
                The storefront now focuses on fewer, stronger sections: faster catalog entry,
                cleaner filter paths, and lower friction to Shopify checkout.
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {trustBullets.map((item) => (
                  <p
                    key={item}
                    className="rounded-xl border border-border/70 bg-background px-3 py-2 text-xs text-muted-foreground"
                  >
                    {item}
                  </p>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card to-salt-olive/10 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                Customer proof
              </p>
              <h4 className="mt-2 font-display text-2xl leading-tight">
                Shoppers convert faster with trust signals
              </h4>
              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                <p className="inline-flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-primary" /> Reliable product and pricing
                  presentation
                </p>
                <p className="inline-flex items-center gap-2">
                  <Star className="h-4 w-4 text-primary" /> Clear savings visibility and product
                  tagging
                </p>
                <p className="inline-flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Updated catalog sections with
                  reduced noise
                </p>
                <p className="inline-flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-primary" /> Stronger path from discovery to
                  checkout
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
                  to="/blog"
                  className="inline-flex h-10 items-center rounded-full border border-border bg-background px-4 text-xs font-bold uppercase tracking-[0.08em] hover:border-primary/50"
                >
                  Read blog
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
    </>
  );
};

export default HomePage;
