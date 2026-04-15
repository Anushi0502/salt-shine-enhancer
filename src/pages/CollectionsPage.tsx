import { Link } from "react-router-dom";
import { ArrowRight, Compass, Sparkles } from "lucide-react";
import CollectionCard from "@/components/storefront/CollectionCard";
import Reveal from "@/components/storefront/Reveal";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { useCollections } from "@/lib/shopify-data";

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
    .slice(0, 8);
  const topThreeCollections = spotlightCollections.slice(0, 3);

  return (
    <section className="mx-auto mt-5 w-[min(1320px,94vw)] pb-8 sm:mt-6 sm:w-[min(1320px,96vw)] sm:pb-10">
      <Reveal>
        <div className="salt-editorial-shell relative overflow-hidden rounded-[1.75rem] p-4 sm:rounded-[2.05rem] sm:p-6 lg:p-7">
          <div className="pointer-events-none absolute left-0 top-10 h-20 w-1 rounded-r-full bg-primary/65" />
          <div className="pointer-events-none absolute inset-0 opacity-70">
            <div className="absolute inset-y-0 right-0 w-[42%] bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.16),transparent_58%)]" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          </div>

          <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] lg:items-start">
            <div>
              <div className="salt-editorial-pill gap-2 tracking-[0.16em]">
                <Sparkles className="h-3.5 w-3.5" />
                Curated collections
              </div>

              <h1 className="mt-4 max-w-[12ch] font-display text-[clamp(2.2rem,4.8vw,4rem)] leading-[0.93] tracking-[-0.05em] text-foreground">
                Shop by Collection
              </h1>

              <p className="mt-3 max-w-2xl text-[0.98rem] leading-7 text-muted-foreground sm:text-base">
                Start with the mood, room, or gifting moment you have in mind. Browse the full SALT edit through collection-led discovery with clearer rhythm, stronger hierarchy, and an easier path into the catalog.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-2 text-xs">
                <span className="salt-editorial-meta">
                  <Compass className="h-3.5 w-3.5 text-primary" />
                  {collections.length.toLocaleString()} collections
                </span>
                <span className="salt-editorial-meta">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  {totalProducts.toLocaleString()} products across collections
                </span>
                <Link
                  to="/shop"
                  className="salt-primary-cta inline-flex h-10 w-full items-center justify-center gap-2 px-4 text-[0.7rem] font-bold uppercase tracking-[0.14em] sm:w-auto"
                >
                  Shop all products
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <Link
                  to="/blog"
                  className="salt-outline-chip inline-flex h-10 w-full items-center justify-center px-4 py-0 text-[0.7rem] font-bold uppercase tracking-[0.14em] sm:w-auto"
                >
                  Browse stories
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {topThreeCollections.length > 0 ? (
                topThreeCollections.map((collection, index) => (
                  <Link
                    key={collection.id}
                    to={`/shop?collection=${collection.handle}`}
                    className="salt-kpi-card salt-metric-card group relative overflow-hidden rounded-[1.25rem] px-4 py-4 transition duration-300 hover:-translate-y-0.5"
                  >
                    <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-primary/8 to-transparent opacity-0 transition duration-300 group-hover:opacity-100" />
                    <p className="relative text-[0.64rem] font-bold uppercase tracking-[0.16em] text-primary">
                      Top {index + 1}
                    </p>
                    <p className="relative mt-2 line-clamp-1 font-display text-[1.2rem] leading-none tracking-[-0.03em] text-foreground">
                      {collection.title}
                    </p>
                    <div className="relative mt-3 flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-muted-foreground">
                        {collection.products_count.toLocaleString()} products
                      </p>
                      <span className="inline-flex items-center gap-1 text-[0.64rem] font-bold uppercase tracking-[0.14em] text-muted-foreground transition group-hover:text-primary">
                        Explore <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="rounded-[1.45rem] border border-dashed border-border bg-background/70 px-4 py-5 text-sm text-muted-foreground">
                  Collections will appear here once your catalog is ready.
                </div>
              )}
            </div>
          </div>

          {spotlightCollections.length > 0 ? (
            <div className="relative mt-6 border-t border-border/70 pt-5">
              <p className="mb-3 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Quick collection browse
              </p>
              <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
                {spotlightCollections.map((collection, index) => (
                  <Link
                    key={collection.id}
                    to={`/shop?collection=${collection.handle}`}
                    className={index === 0
                      ? "salt-primary-cta inline-flex h-11 shrink-0 items-center px-4 text-[0.72rem] font-semibold uppercase tracking-[0.08em]"
                      : "salt-outline-chip inline-flex h-11 shrink-0 items-center px-4 py-0 text-[0.72rem] font-semibold uppercase tracking-[0.08em]"}
                  >
                    {collection.title}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </Reveal>

      <Reveal delayMs={80}>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary">Collection index</p>
            <h2 className="mt-2 font-display text-[clamp(1.6rem,2.8vw,2.5rem)] leading-[0.95] tracking-[-0.04em] text-foreground">
              Explore the full collection wall
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            A cleaner browse inspired by the storefront visual language, with stronger spacing, clearer grouping, and easier scanning across every collection tile.
          </p>
        </div>
      </Reveal>

      <div className="mt-5 grid gap-3 sm:mt-6 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {collections.map((collection, index) => (
          <Reveal key={collection.id} delayMs={index * 60}>
            <CollectionCard
              collection={collection}
            />
          </Reveal>
        ))}
      </div>

      <Reveal delayMs={140}>
        <div className="salt-surface-strong relative mt-10 overflow-hidden rounded-[2rem] p-5 sm:p-6 lg:p-7">
          <div className="pointer-events-none absolute inset-0 opacity-80">
            <div className="absolute inset-y-0 right-0 w-[32%] bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.22),transparent_55%)]" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          </div>

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary">
                Need a faster way in?
              </p>
              <h2 className="mt-2 max-w-[12ch] font-display text-[clamp(1.9rem,3vw,3rem)] leading-[0.94] tracking-[-0.05em] text-foreground">
                Open the full catalog and refine from there
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[0.95rem]">
                Jump into the complete product view, then filter by collection, type, or value to find the right edit faster.
              </p>
            </div>

            <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap">
              <Link
                to="/shop"
                className="salt-primary-cta inline-flex h-11 w-full items-center justify-center px-5 text-[0.72rem] font-bold uppercase tracking-[0.12em] sm:w-auto"
              >
                Open full catalog
              </Link>
              <Link
                to="/shop?sort=discount"
                className="salt-outline-chip inline-flex h-11 w-full items-center justify-center px-5 py-0 text-[0.72rem] font-bold uppercase tracking-[0.12em] sm:w-auto"
              >
                Shop best savings
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
};

export default CollectionsPage;
