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
  const leadCollection = featuredCollections[0] || null;
  const supportingCollections = featuredCollections.slice(1, 5);
  const trailingCollections = featuredCollections.slice(5);
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



      <section id="collections" className="mx-auto mt-12 w-[min(1320px,96vw)]">
        <Reveal>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="salt-kicker">Shop by collection</p>
              <h2 className="mt-3 font-display text-[clamp(2rem,3.1vw,3rem)] leading-[0.98]">
                Merchandising paths built like an editorial storefront
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
                The strongest collection takes the lead, while the rest stay grouped into cleaner, faster routes for discovering home, gifts, style, and seasonal essentials.
              </p>
            </div>
            <Link to="/collections" className="salt-outline-chip h-11 px-5 py-0 text-sm">
              View all collections
            </Link>
          </div>
        </Reveal>

        <div className="salt-section-grid">
          {leadCollection ? (
            <Reveal>
              <CollectionCard
                collection={leadCollection}
                productCount={leadCollection.effectiveCount}
                variant="hero"
              />
            </Reveal>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            {supportingCollections.map((collection, index) => (
              <Reveal key={collection.id} delayMs={index * 70}>
                <CollectionCard
                  collection={collection}
                  productCount={collection.effectiveCount}
                />
              </Reveal>
            ))}
          </div>
        </div>

        {trailingCollections.length > 0 ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trailingCollections.map((collection, index) => (
              <Reveal key={collection.id} delayMs={160 + index * 70}>
                <CollectionCard
                  collection={collection}
                  productCount={collection.effectiveCount}
                />
              </Reveal>
            ))}
          </div>
        ) : null}
      </section>

      <section id="products" className="mx-auto mt-14 w-[min(1320px,96vw)]">
        <Reveal>
          <div className="salt-editorial-shell rounded-[2rem] p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <p className="salt-kicker">{trendingCollection ? "Collection focus" : "Trending now"}</p>
                <h2 className="mt-3 font-display text-[clamp(2rem,3.2vw,3rem)] leading-[0.98]">
                  {trendingCollection
                    ? `Best-rated picks from ${trendingCollection.title}`
                    : "High-intent products, prioritized for conversion"}
                </h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {trendingCollection
                    ? `These products come from the current banner collection and are ranked by stronger ratings, deeper review coverage, and sharper purchase intent.`
                    : "Ranked by strongest discount opportunity and recent catalog movement to keep merchandising conversion-focused."}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link to={trendingShopLink} className="salt-primary-cta h-11 px-5 text-sm font-bold">
                  {trendingShopLabel}
                </Link>
                <Link to="/shop?sort=discount" className="salt-outline-chip h-11 px-5 py-0 text-sm">
                  View top value picks
                </Link>
              </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-4">
              <div className="salt-ambient-card rounded-[1.2rem] p-4">
                <p className="text-[0.66rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Products in focus</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {(focusCollectionInsights?.productCount || trendingProducts.length).toLocaleString()}
                </p>
              </div>
              <div className="salt-ambient-card rounded-[1.2rem] p-4">
                <p className="text-[0.66rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Average rating</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {(focusCollectionInsights?.averageRating || reviewInsights?.averageRating || 0).toFixed(2)}
                </p>
              </div>
              <div className="salt-ambient-card rounded-[1.2rem] p-4">
                <p className="text-[0.66rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Reviews considered</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {(focusCollectionInsights?.totalReviews || reviewInsights?.totalReviews || 0).toLocaleString()}
                </p>
              </div>
              <div className="salt-ambient-card rounded-[1.2rem] p-4">
                <p className="text-[0.66rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Top reviewed</p>
                <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-foreground">
                  {focusCollectionInsights?.topReviewed?.product.title || reviewInsights?.topReviewed?.product.title || "Live catalog picks"}
                </p>
              </div>
            </div>
          </div>
        </Reveal>

        <div className="salt-section-shell mt-5 rounded-[2rem] p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {trendingProducts.map((product, index) => (
              <Reveal key={product.id} delayMs={index * 70} className="h-full">
                <ProductCard product={product} variant="dense" />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      
      {latestBlogPosts.length > 0 ? (
        <section className="mx-auto mt-12 w-[min(1280px,96vw)]">
          <Reveal>
            <div className="salt-editorial-shell rounded-[2rem] p-5 sm:p-7">
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

      <section className="mx-auto mt-14 w-[min(1320px,96vw)]">
        <Reveal>
          <div className="salt-editorial-shell rounded-[2rem] p-5 sm:p-7">
            <div className="salt-section-grid">
              <div>
                <p className="salt-kicker">Trust and conversion</p>
                <h3 className="mt-3 font-display text-[clamp(1.7rem,2.8vw,2.6rem)] leading-[0.98]">
                  A premium storefront should feel calm, credible, and ready to buy from
                </h3>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
                  Every trust cue here is grounded in actual store behavior: live review coverage, strong collection structure, clear dispatch messaging, and support paths that stay visible instead of buried.
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {trustBullets.map((item) => (
                    <div key={item.title} className="salt-story-card rounded-[1.35rem] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground">{item.title}</p>
                      <p className="mt-2 text-[0.78rem] leading-6 text-muted-foreground">
                        {item.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3">
                <div className="salt-story-card rounded-[1.6rem] p-5">
                  <p className="salt-kicker">Live customer proof</p>
                  <h4 className="mt-3 font-display text-[1.9rem] leading-[1.02]">
                    Review depth that supports faster decisions
                  </h4>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="salt-ambient-card rounded-[1.2rem] p-4">
                      <p className="text-[0.66rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Average rating</p>
                      <p className="mt-2 text-3xl font-semibold text-foreground">
                        {(reviewInsights?.averageRating || 0).toFixed(2)}
                      </p>
                    </div>
                    <div className="salt-ambient-card rounded-[1.2rem] p-4">
                      <p className="text-[0.66rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Published reviews</p>
                      <p className="mt-2 text-3xl font-semibold text-foreground">
                        {(reviewInsights?.totalReviews || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-[1.2rem] border border-border/70 bg-background/72 p-4">
                    <p className="text-[0.66rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Top reviewed product</p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-foreground">
                      {reviewInsights?.topReviewed?.product.title || "Live catalog picks surfaced automatically"}
                    </p>
                  </div>
                </div>

                <div className="salt-story-card rounded-[1.6rem] p-5">
                  <p className="salt-kicker">Confidence cues</p>
                  <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                    <p className="inline-flex items-start gap-2">
                      <BadgeCheck className="mt-0.5 h-4 w-4 text-primary" /> Live product data stays connected to Shopify for current pricing and availability.
                    </p>
                    <p className="inline-flex items-start gap-2">
                      <Star className="mt-0.5 h-4 w-4 text-primary" /> High-intent collection paths reduce noise and keep discovery closer to checkout.
                    </p>
                    <p className="inline-flex items-start gap-2">
                      <Sparkles className="mt-0.5 h-4 w-4 text-primary" /> Editorial surfaces raise perceived value without slowing down commerce actions.
                    </p>
                    <p className="inline-flex items-start gap-2">
                      <DollarSign className="mt-0.5 h-4 w-4 text-primary" /> Pricing, savings, and support paths remain visible in every major shopping step.
                    </p>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link to="/shop" className="salt-primary-cta h-10 px-4 text-xs font-bold uppercase tracking-[0.08em]">
                      Shop with confidence
                    </Link>
                    <Link to="/blog" className="salt-outline-chip h-10 px-4 py-0 text-xs">
                      Read buying guides
                    </Link>
                    <Link to="/contact" className="salt-outline-chip h-10 px-4 py-0 text-xs">
                      Talk to support
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
};

export default HomePage;
