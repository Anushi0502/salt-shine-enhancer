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

  return (
    <section className="mx-auto mt-8 w-[min(1280px,96vw)] pb-6">
      <Reveal>
        <div className="rounded-[2rem] border border-border/80 bg-card p-6 shadow-soft sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Collections</p>
          <h1 className="mt-1 font-display text-[clamp(2rem,4vw,3.2rem)] leading-[0.95]">Shop by Collection</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
            Enter through curated category paths built for faster decision-making and cleaner product discovery.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 font-semibold text-muted-foreground">
              <Compass className="h-3.5 w-3.5" /> {collections.length.toLocaleString()} collections
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 font-semibold text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" /> {totalProducts.toLocaleString()} mapped products
            </span>
            <Link to="/shop" className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-2 hover:underline">
              View all products <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </Reveal>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {collections.map((collection, index) => (
          <Reveal key={collection.id} delayMs={index * 60}>
            <CollectionCard collection={collection} />
          </Reveal>
        ))}
      </div>

      <Reveal delayMs={120}>
        <div className="mt-10 rounded-3xl border border-border/80 bg-gradient-to-br from-card via-card to-salt-warm/40 p-6 shadow-soft sm:p-8">
          <h2 className="font-display text-[clamp(1.6rem,2.8vw,2.4rem)] leading-tight">
            Not sure where to start?
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
            Jump into the full catalog and use filters to narrow by collection, product type, and savings opportunities.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              to="/shop"
              className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-xs font-bold uppercase tracking-[0.08em] text-primary-foreground hover:brightness-110"
            >
              Open full catalog
            </Link>
            <Link
              to="/shop?sort=discount"
              className="inline-flex h-11 items-center rounded-full border border-border bg-background px-5 text-xs font-bold uppercase tracking-[0.08em] hover:border-primary/50"
            >
              View best savings
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
};

export default CollectionsPage;
