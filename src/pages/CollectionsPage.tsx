import { Link } from "react-router-dom";
import { ArrowRight, Compass } from "lucide-react";
import CollectionCard from "@/components/storefront/CollectionCard";
import Reveal from "@/components/storefront/Reveal";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { useCollections } from "@/lib/shopify-data";
import type { ShopifyCollection } from "@/types/shopify";

function collectionEditorial(collection: ShopifyCollection) {
  const source = `${collection.title} ${collection.handle}`.toLowerCase();

  if (/cook|kitchen|table|bowl|ramekin|pan|pot/.test(source)) {
    return {
      kicker: "Kitchen edit",
      headline: "Set the table with pieces that feel quietly elevated.",
      description: "Cookware, serving pieces, and practical upgrades grouped into one clean browsing path.",
    };
  }

  if (/gift|planner|book|legacy/.test(source)) {
    return {
      kicker: "Gift-ready",
      headline: "Thoughtful finds shoppers can choose quickly and still feel good about.",
      description: "Useful, meaningful, and curated for occasions where the product needs to carry more emotional weight.",
    };
  }

  if (/wear|dress|robe|apparel|women|men/.test(source)) {
    return {
      kicker: "Style curation",
      headline: "Wardrobe picks organized for faster decisions and stronger first impressions.",
      description: "Softer discovery paths for shoppers browsing fashion, comfort, and giftable looks.",
    };
  }

  if (/garden|outdoor|camp|tool/.test(source)) {
    return {
      kicker: "Outdoor edit",
      headline: "Utility-first products presented with enough polish to still feel premium.",
      description: "Browse practical tools, outdoor essentials, and everyday setup pieces without the marketplace noise.",
    };
  }

  return {
    kicker: "Curated path",
    headline: "Shop the collections that make discovery feel calm instead of crowded.",
    description: "Each collection groups live Shopify inventory into clearer, more intentional browsing routes.",
  };
}

const CollectionsPage = () => {
  const { data, isLoading, error, refetch } = useCollections();

  if (isLoading) {
    return (
      <LoadingState
        title="Loading collections"
        subtitle="Preparing category tiles and product counts."
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Unable to load collections"
        subtitle="Please try again."
        action={
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
          >
            Retry
          </button>
        }
      />
    );
  }

  const collections = data?.collections || [];
  const totalProducts = collections.reduce((sum, collection) => sum + collection.products_count, 0);
  const spotlightCollections = [...collections]
    .sort((a, b) => b.products_count - a.products_count)
    .slice(0, 12);
  const [primaryCollection, ...secondaryCollections] = spotlightCollections;
  const topCollections = secondaryCollections.slice(0, 2);
  const collectionChipRail = spotlightCollections.slice(0, 8);
  const collectionGrid = collections;
  const primaryEditorial = primaryCollection ? collectionEditorial(primaryCollection) : null;

  return (
    <section className="mx-auto mt-8 w-[min(1280px,96vw)] pb-8">
      <Reveal>
        <div className="salt-panel-shell overflow-hidden rounded-[2.2rem] border border-border/70 p-6 sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Collections</p>
              <h1 className="mt-2 max-w-[12ch] font-display text-[clamp(2.2rem,4.9vw,4.4rem)] leading-[0.9] tracking-[-0.045em] text-foreground">
                Browse SALT through collection-led shopping, not product overload.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-[0.98rem]">
                The catalog is organized into calmer, more editorial entry points so shoppers can move straight into the part of the store that matches their intent, whether they are buying for home, gifting, kitchen, or seasonal living.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="salt-kpi-card rounded-[1.15rem] border border-border/70 px-4 py-3.5">
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-primary">Live collections</p>
                  <p className="mt-2 font-display text-3xl text-foreground">{collections.length.toLocaleString()}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Shopify-backed browsing paths</p>
                </div>
                <div className="salt-kpi-card rounded-[1.15rem] border border-border/70 px-4 py-3.5">
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-primary">Mapped products</p>
                  <p className="mt-2 font-display text-3xl text-foreground">{totalProducts.toLocaleString()}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Visible across collection routes</p>
                </div>
                <div className="salt-kpi-card rounded-[1.15rem] border border-border/70 px-4 py-3.5">
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-primary">Best use</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">Faster category entry</p>
                  <p className="mt-1 text-xs text-muted-foreground">Less scrolling, stronger intent</p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {collectionChipRail.map((collection) => (
                  <Link
                    key={collection.id}
                    to={`/shop?collection=${collection.handle}`}
                    className="salt-outline-chip text-[0.68rem]"
                  >
                    {collection.title}
                  </Link>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-[1.5rem] border border-border/70 bg-[linear-gradient(160deg,hsl(var(--card)/0.98),hsl(var(--card)/0.92))] p-5 shadow-soft">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-primary">Why this matters</p>
                    <h2 className="mt-2 font-display text-[clamp(1.45rem,2.6vw,2.1rem)] leading-[0.95] text-foreground">
                      Collection-first browsing reduces drop-off before cart.
                    </h2>
                  </div>
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                    <Compass className="h-5 w-5" />
                  </span>
                </div>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  Instead of asking shoppers to sift through everything, SALT groups the catalog into stronger browsing doors so decisions feel faster and more deliberate.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
                <div className="rounded-[1.25rem] border border-border/70 bg-background/90 p-4 shadow-soft">
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-primary">Best for</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">Giftable discovery</p>
                  <p className="mt-1 text-xs leading-6 text-muted-foreground">Collections surface what is easiest to buy confidently.</p>
                </div>
                <div className="rounded-[1.25rem] border border-border/70 bg-background/90 p-4 shadow-soft">
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-primary">Built around</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">Live Shopify inventory</p>
                  <p className="mt-1 text-xs leading-6 text-muted-foreground">Counts and browsing paths stay connected to the store backend.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      {primaryCollection ? (
        <section className="mt-6 grid gap-4 lg:grid-cols-[1.12fr_0.88fr]">
          <Reveal>
            <CollectionCard
              collection={primaryCollection}
              variant="hero"
              editorialContent={primaryEditorial
                ? {
                    kicker: primaryEditorial.kicker,
                    headline: primaryCollection.title,
                    description: primaryEditorial.description,
                    primaryAction: {
                      to: `/shop?collection=${primaryCollection.handle}`,
                      label: "Shop collection",
                    },
                    secondaryAction: {
                      to: "/shop?sort=featured",
                      label: "View featured",
                    },
                  }
                : undefined}
            />
          </Reveal>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {topCollections.map((collection, index) => {
              const editorial = collectionEditorial(collection);
              return (
                <Reveal key={collection.id} delayMs={120 + index * 80}>
                  <div className="salt-panel-shell h-full rounded-[1.75rem] p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-primary">
                          {editorial.kicker}
                        </p>
                        <h3 className="mt-2 font-display text-[clamp(1.4rem,2.2vw,2rem)] leading-[0.96] text-foreground">
                          {collection.title}
                        </h3>
                      </div>
                      <span className="inline-flex items-center rounded-full border border-border/70 bg-background px-3 py-1 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                        {collection.products_count.toLocaleString()} items
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">{editorial.headline}</p>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground/90">{editorial.description}</p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Link
                        to={`/shop?collection=${collection.handle}`}
                        className="salt-primary-cta h-10 px-4 text-[0.68rem] font-bold uppercase tracking-[0.08em]"
                      >
                        Open {collection.title}
                      </Link>
                      <Link
                        to={`/shop?collection=${collection.handle}&sort=featured`}
                        className="salt-outline-chip h-10 px-4 py-0 text-[0.68rem]"
                      >
                        Featured order
                      </Link>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </section>
      ) : null}

      <Reveal delayMs={120}>
        <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">All collections</p>
            <h2 className="mt-1 font-display text-[clamp(1.85rem,3vw,2.8rem)] leading-[0.96] text-foreground">
              Every category path in one place
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
              Browse the full collection map when shoppers want to enter by category rather than product search.
            </p>
          </div>
          <Link
            to="/shop"
            className="salt-outline-chip h-11 px-5 py-0 text-xs font-bold uppercase tracking-[0.08em]"
          >
            View full catalog <ArrowRight className="ml-2 h-3.5 w-3.5" />
          </Link>
        </div>
      </Reveal>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {collectionGrid.map((collection, index) => (
          <Reveal key={collection.id} delayMs={index * 45}>
            <CollectionCard collection={collection} />
          </Reveal>
        ))}
      </div>

      <Reveal delayMs={140}>
        <div className="salt-panel-shell mt-10 rounded-[2rem] p-6 sm:p-8">
          <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Need a faster route?</p>
              <h2 className="mt-2 font-display text-[clamp(1.7rem,2.8vw,2.5rem)] leading-[0.96] text-foreground">
                Use the full shop view when the shopper already knows the category.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
                The collection index is built for calm discovery. The main shop route is still the fastest option when the customer wants search, filtering, and featured sorting in one place.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Link
                to="/shop"
                className="salt-primary-cta h-11 px-5 text-xs font-bold uppercase tracking-[0.08em]"
              >
                Open full shop
              </Link>
              <Link
                to="/shop?sort=featured"
                className="salt-outline-chip h-11 px-5 py-0 text-xs"
              >
                Browse featured order
              </Link>
              <Link
                to="/shop?sort=newest"
                className="salt-outline-chip h-11 px-5 py-0 text-xs"
              >
                See newest arrivals
              </Link>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.2rem] border border-border/70 bg-background/90 p-4">
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-primary">Featured order</p>
              <p className="mt-2 text-sm font-semibold text-foreground">Manual Shopify sort</p>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">Collection pages and shop featured sorting respect the collection order set in Shopify.</p>
            </div>
            <div className="rounded-[1.2rem] border border-border/70 bg-background/90 p-4">
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-primary">Filter depth</p>
              <p className="mt-2 text-sm font-semibold text-foreground">Collection + price + type</p>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">Customers can keep narrowing without losing the editorial collection entry point.</p>
            </div>
            <div className="rounded-[1.2rem] border border-border/70 bg-background/90 p-4">
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-primary">Mobile ready</p>
              <p className="mt-2 text-sm font-semibold text-foreground">Collection-led browsing stays readable</p>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">The layout is tuned so category discovery remains clean on smaller screens.</p>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
};

export default CollectionsPage;
