import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Clock3,
} from "lucide-react";
import HomeHero from "@/components/storefront/HomeHero";
import CollectionCard from "@/components/storefront/CollectionCard";
import ProductCard from "@/components/storefront/ProductCard";
import Reveal from "@/components/storefront/Reveal";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { readingTime, savingsPercent } from "@/lib/formatters";
import { useJudgeMeRatings } from "@/lib/judgeme";
// import { useDeviceOrderHistory } from "@/lib/order-history";
import {
  useBlogPosts,
  useCollectionProductIds,
  useCollections,
  useProducts,
} from "@/lib/shopify-data";
import type { ShopifyCollection } from "@/types/shopify";

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

function isCookwareCollection(collection: ShopifyCollection): boolean {
  return /cook|kitchen|pan|pot/i.test(`${collection.title} ${collection.handle}`);
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

  const products = useMemo(() => productsPayload?.products ?? [], [productsPayload]);
  const collections = useMemo(() => collectionsPayload?.collections ?? [], [collectionsPayload]);
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
  const heroCollection = featuredCollections[0] || null;
  const focusCollection =
    rankedCollections.find((collection) => isCookwareCollection(collection)) || heroCollection;
  const browseCollections = rankedCollections
    .filter((collection) => collection.id !== focusCollection?.id)
    .slice(0, 6);
  const {
    data: focusCollectionProductIdsPayload,
  } = useCollectionProductIds(
    focusCollection?.handle || "",
    Boolean(focusCollection?.handle),
  );

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const focusedCollectionProducts = useMemo(() => {
    const ids = focusCollectionProductIdsPayload?.productIds || [];
    if (!ids.length) {
      return [];
    }

    return ids
      .map((id) => productById.get(id))
      .filter((product): product is NonNullable<typeof product> => Boolean(product));
  }, [focusCollectionProductIdsPayload, productById]);

  const focusRatingCandidateIds = useMemo(
    () => focusedCollectionProducts.slice(0, 80).map((product) => product.id),
    [focusedCollectionProducts],
  );
  const { data: focusCollectionRatings } = useJudgeMeRatings(focusRatingCandidateIds);

  const focusProducts = useMemo(() => {
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

    if (!focusCollection || !focusedCollectionProducts.length) {
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
  }, [focusCollection, focusCollectionRatings, focusedCollectionProducts, products]);

  const focusShopLink = focusCollection
    ? `/shop?collection=${focusCollection.handle}`
    : "/shop";
  const focusShopLabel = focusCollection
    ? collectionCtaLabel(focusCollection.title)
    : "Shop full catalog";
  const focusBestValueLink = focusCollection
    ? `/shop?collection=${focusCollection.handle}&sort=discount`
    : "/shop?sort=discount";
  const latestBlogPosts = !blogError && !blogLoading ? (blogPayload?.posts || []).slice(0, 3) : [];

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
      <HomeHero
        featured={featured}
        leadCollection={heroCollection}
        supportingCollections={featuredCollections.slice(1, 5)}
      />



      <section id="collections" className="mx-auto mt-10 w-[min(1320px,96vw)]">
        <Reveal>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="salt-kicker">Shop by collection</p>
              <h2 className="mt-3 font-display text-[clamp(2rem,3.1vw,3rem)] leading-[0.98]">
                Browse the store by collection
              </h2>
            </div>
            <Link to="/collections" className="salt-outline-chip h-11 px-5 py-0 text-sm">
              Explore all collections
            </Link>
          </div>
        </Reveal>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {browseCollections.map((collection, index) => (
            <Reveal key={collection.id} delayMs={index * 70}>
              <CollectionCard
                collection={collection}
                productCount={collection.effectiveCount}
              />
            </Reveal>
          ))}
        </div>
      </section>

      <section id="products" className="mx-auto mt-11 w-[min(1320px,96vw)]">
        <Reveal>
          
          <div className="salt-editorial-shell rounded-[2rem] p-4 sm:p-6">
                    {focusCollection ? (
          <Reveal delayMs={90} className="mt-4">
            <CollectionCard
              collection={focusCollection}
              productCount={focusCollection.effectiveCount}
              variant="hero"
            />
          </Reveal>
        ) : null}

            <div className="flex flex-wrap items-start justify-between gap-4">
              
              <div className="max-w-3xl">
                <p className="salt-kicker">{focusCollection ? "Collection focus" : "Trending now"}</p>
                <h2 className="mt-3 font-display text-[clamp(2rem,3.2vw,3rem)] leading-[0.98]">
                  {focusCollection
                    ? `${focusCollection.title} picks shoppers are choosing first`
                    : "Fresh favorites with buying momentum"}
                </h2>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link to={focusShopLink} className="salt-primary-cta h-11 px-5 text-sm font-bold">
                  {focusShopLabel}
                </Link>
                <Link
                  to={focusBestValueLink}
                  className="salt-outline-chip h-11 px-5 py-0 text-sm"
                >
                  Shop best value
                </Link>
              </div>
            </div>
          </div>
        </Reveal>


        <div className="salt-section-shell mt-4 rounded-[2rem] p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {focusProducts.map((product, index) => (
              <Reveal key={product.id} delayMs={index * 70} className="h-full">
                <ProductCard product={product} variant="dense" />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      
      {latestBlogPosts.length > 0 ? (
        <section className="mx-auto mt-10 w-[min(1280px,96vw)]">
          <Reveal>
            <div className="salt-editorial-shell rounded-[2rem] p-4 sm:p-6">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                    From the Blog
                  </p>
                  <h3 className="font-display text-[clamp(1.7rem,2.6vw,2.4rem)] leading-tight">
                    Ideas and seasonal inspiration
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
    </>
  );
};

export default HomePage;
