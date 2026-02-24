import { Link } from "react-router-dom";
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

  return (
    <section className="mx-auto mt-8 w-[min(1280px,96vw)] pb-6">
      <Reveal>
        <div className="rounded-[2rem] border border-border/80 bg-card p-6 shadow-soft sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Collections</p>
          <h1 className="mt-1 font-display text-[clamp(2rem,4vw,3.2rem)] leading-[0.95]">Shop by Collection</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
            Discover focused category journeys inspired by both v1 and v2 design directions.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>{collections.length.toLocaleString()} collections available</span>
            <Link to="/shop" className="font-semibold text-primary underline-offset-2 hover:underline">
              View all products
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
    </section>
  );
};

export default CollectionsPage;
