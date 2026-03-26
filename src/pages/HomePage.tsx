import { useMemo } from "react";
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
import ProductCard from "@/components/storefront/ProductCard";
import Reveal from "@/components/storefront/Reveal";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { readingTime, savingsPercent } from "@/lib/formatters";
import { useJudgeMeRatings, type JudgeMeReviewSummary } from "@/lib/judgeme";
// import { useDeviceOrderHistory } from "@/lib/order-history";
import {
  useBlogPosts,
  useCollectionProductIds,
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


function collectionCtaLabel(title: string): string {
  const normalized = String(title || "").trim();
  if (!normalized) {
    return "Shop collection";
  }

  if (normalized.length <= 26) {
    return `Shop ${normalized}`;
  }

  return "Shop this collection";
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
  const featuredCollections = rankedCollections.slice(0, 6);
  const gardenCollection = rankedCollections.find((collection) =>
    /garden|tool/i.test(`${collection.title} ${collection.handle}`),
  );
  const trendingCollection = gardenCollection || null;
  const {
    data: trendingCollectionProductIdsPayload,
  } = useCollectionProductIds(
    trendingCollection?.handle || "",
    Boolean(trendingCollection?.handle),
  );

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const focusedCollectionProducts = useMemo(() => {
    const ids = trendingCollectionProductIdsPayload?.productIds || [];
    if (!ids.length) {
      return [];
    }

    return ids
      .map((id) => productById.get(id))
      .filter((product): product is NonNullable<typeof product> => Boolean(product));
  }, [productById, trendingCollectionProductIdsPayload]);

  const focusRatingCandidateIds = useMemo(
    () => focusedCollectionProducts.slice(0, 80).map((product) => product.id),
    [focusedCollectionProducts],
  );
  const { data: focusCollectionRatings } = useJudgeMeRatings(focusRatingCandidateIds);

  const trendingProducts = useMemo(() => {
    const fallback = [...products]
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

    if (!trendingCollection || !focusedCollectionProducts.length) {
      return fallback;
    }

    const rankedByRating = [...focusedCollectionProducts]
      .sort((a, b) => {
        const left = focusCollectionRatings?.[a.id];
        const right = focusCollectionRatings?.[b.id];

        const leftHasReviews = (left?.reviewCount || 0) > 0;
        const rightHasReviews = (right?.reviewCount || 0) > 0;
        if (leftHasReviews !== rightHasReviews) {
          return rightHasReviews ? 1 : -1;
        }

        const ratingDelta = (right?.rating || 0) - (left?.rating || 0);
        if (Math.abs(ratingDelta) > 0.01) {
          return ratingDelta;
        }

        const reviewCountDelta = (right?.reviewCount || 0) - (left?.reviewCount || 0);
        if (reviewCountDelta !== 0) {
          return reviewCountDelta;
        }

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

    return rankedByRating.length ? rankedByRating : fallback;
  }, [focusCollectionRatings, focusedCollectionProducts, products, trendingCollection]);

  const trendingShopLink = trendingCollection
    ? `/shop?collection=${trendingCollection.handle}`
    : "/shop";
  const trendingShopLabel = trendingCollection
    ? collectionCtaLabel(trendingCollection.title)
    : "Shop full catalog";
  const focusCollectionInsights = useMemo(() => {
    if (!trendingCollection || !focusedCollectionProducts.length) {
      return null;
    }

    const summaries = focusedCollectionProducts
      .map((product) => focusCollectionRatings?.[product.id])
      .filter((summary): summary is NonNullable<typeof summary> => Boolean(summary));

    const ratedProductCount = summaries.filter((summary) => summary.reviewCount > 0).length;
    const totalReviews = summaries.reduce((sum, summary) => sum + summary.reviewCount, 0);
    const averageRating =
      totalReviews > 0
        ? summaries.reduce((sum, summary) => sum + summary.rating * summary.reviewCount, 0) / totalReviews
        : summaries.length
          ? summaries.reduce((sum, summary) => sum + summary.rating, 0) / summaries.length
          : 0;

    const topReviewedCandidates = focusedCollectionProducts
      .map((product) => {
        const summary = focusCollectionRatings?.[product.id];
        if (!summary || summary.reviewCount <= 0) {
          return null;
        }
        return {
          product,
          summary,
        };
      })
      .filter((entry): entry is { product: (typeof focusedCollectionProducts)[number]; summary: JudgeMeReviewSummary } => Boolean(entry));

    const topReviewed = topReviewedCandidates
      .sort((a, b) => {
        const reviewDelta = b.summary.reviewCount - a.summary.reviewCount;
        if (reviewDelta !== 0) {
          return reviewDelta;
        }
        return b.summary.rating - a.summary.rating;
      })[0];

    return {
      productCount: focusedCollectionProducts.length,
      ratedProductCount,
      totalReviews,
      averageRating: Number.isFinite(averageRating) ? averageRating : 0,
      topReviewed,
    };
  }, [focusCollectionRatings, focusedCollectionProducts, trendingCollection]);
  const latestBlogPosts = !blogError && !blogLoading ? (blogPayload?.posts || []).slice(0, 3) : [];
  const trendingReviewIds = trendingProducts.slice(0, 8).map((product) => product.id);
  const { data: trendingRatings } = useJudgeMeRatings(trendingReviewIds);
  const reviewInsights = useMemo(() => {
    const summaries = trendingReviewIds
      .map((id) => trendingRatings?.[id])
      .filter((summary): summary is NonNullable<typeof summary> => Boolean(summary));

    if (!summaries.length) {
      return null;
    }

    const totalReviews = summaries.reduce((sum, summary) => sum + summary.reviewCount, 0);
    const weightedRating =
      totalReviews > 0
        ? summaries.reduce((sum, summary) => sum + summary.rating * summary.reviewCount, 0) / totalReviews
        : summaries.reduce((sum, summary) => sum + summary.rating, 0) / summaries.length;

    const topReviewedCandidates = trendingProducts
      .map((product) => ({
        product,
        summary: trendingRatings?.[product.id],
      }))
      .filter((entry) => Boolean(entry.summary))
      .map((entry) => ({ ...entry, summary: entry.summary! }));

    const topReviewed = topReviewedCandidates
      .sort((a, b) => {
        const ratingDelta = b.summary.rating - a.summary.rating;
        if (Math.abs(ratingDelta) > 0.01) {
          return ratingDelta;
        }

        return b.summary.reviewCount - a.summary.reviewCount;
      })[0];

    return {
      ratedProducts: summaries.filter((summary) => summary.reviewCount > 0).length,
      totalReviews,
      averageRating: Number.isFinite(weightedRating) ? weightedRating : 0,
      topReviewed,
    };
  }, [trendingReviewIds, trendingRatings, trendingProducts]);

  const syncCandidates = [
    productsPayload?.generatedAt,
    collectionsPayload?.generatedAt,
    blogPayload?.generatedAt,
  ].filter(Boolean) as string[];
  const lastSyncedAt = syncCandidates.sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime(),
  )[0];

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

  return (
    <>
      <HomeHero featured={featured} />



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
              />
            </Reveal>
          ))}
        </div>
      </section>

      <section id="products" className="mx-auto mt-14 w-[min(1280px,96vw)]">
        <Reveal>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                {trendingCollection ? "Collection focus" : "Trending"}
              </p>
              <h2 className="font-display text-[clamp(1.9rem,3vw,2.8rem)] leading-[1.02]">
                {trendingCollection
                  ? `Best-rated picks from ${trendingCollection.title}`
                  : "High-intent products, prioritized"}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {trendingCollection
                  ? `Products are now ranked from the ${trendingCollection.title} banner collection, prioritizing stronger ratings and review depth.`
                  : "Ranked by strongest discount opportunity and fresh updates to keep merchandising conversion-focused."}
              </p>
            </div>
            <Link
              to={trendingShopLink}
              className="salt-primary-cta h-11 px-5 text-sm font-bold"
            >
              {trendingShopLabel}
            </Link>
          </div>
        </Reveal>

        {focusCollectionInsights ? (
          <Reveal delayMs={50}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-card/75 px-3 py-2.5">
              <div className="flex flex-wrap gap-2">
                <span className="salt-outline-chip text-[0.64rem]">
                  {focusCollectionInsights.productCount.toLocaleString()} products in focus
                </span>
                <span className="salt-outline-chip text-[0.64rem]">
                  {focusCollectionInsights.ratedProductCount.toLocaleString()} rated items
                </span>
                <span className="salt-outline-chip text-[0.64rem]">
                  {focusCollectionInsights.averageRating.toFixed(2)} avg stars
                </span>
                <span className="salt-outline-chip text-[0.64rem]">
                  {focusCollectionInsights.totalReviews.toLocaleString()} reviews considered
                </span>
              </div>
              {focusCollectionInsights.topReviewed ? (
                <Link
                  to={`/products/${focusCollectionInsights.topReviewed.product.handle}`}
                  className="text-xs font-semibold text-muted-foreground hover:text-primary"
                >
                  Top reviewed: {focusCollectionInsights.topReviewed.product.title}
                </Link>
              ) : null}
            </div>
          </Reveal>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {trendingProducts.map((product, index) => (
            <Reveal key={product.id} delayMs={index * 70} className="h-full">
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

            <div className="salt-card-hover salt-section-shell rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/18 via-card to-salt-blue/12 p-5 shadow-[0_24px_46px_-32px_rgba(0,0,0,0.5)]">
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
