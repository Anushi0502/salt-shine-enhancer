import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ProductCard from "@/components/storefront/ProductCard";
import Reveal from "@/components/storefront/Reveal";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { filterProducts, uniqueProductTypes } from "@/lib/catalog";
import { useCollections, useProducts } from "@/lib/shopify-data";

const ShopPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const collectionHandle = searchParams.get("collection") || "";
  const typeFilter = searchParams.get("type") || "";

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

  const products = useMemo(() => productsPayload?.products ?? [], [productsPayload]);
  const collections = useMemo(() => collectionsPayload?.collections ?? [], [collectionsPayload]);

  const filteredProducts = useMemo(
    () =>
      filterProducts(products, {
        query,
        collection: collectionHandle,
        productType: typeFilter,
        collections,
      }),
    [products, query, collectionHandle, typeFilter, collections],
  );

  const productTypes = useMemo(() => uniqueProductTypes(products), [products]);
  const selectedCollection = collections.find((collection) => collection.handle === collectionHandle);

  if (productsLoading || collectionsLoading) {
    return (
      <LoadingState
        title="Loading products"
        subtitle="Building your filtered catalog view with latest pricing and availability."
      />
    );
  }

  if (productsError || collectionsError) {
    return (
      <ErrorState
        title="Catalog unavailable"
        subtitle="Retry to refresh live/snapshot data."
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

  const onTypeChange = (type: string) => {
    const next = new URLSearchParams(searchParams);

    if (type) {
      next.set("type", type);
    } else {
      next.delete("type");
    }

    setSearchParams(next);
  };

  const clearFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  return (
    <section className="mx-auto mt-8 w-[min(1280px,96vw)] pb-6">
      <Reveal>
        <div className="rounded-[2rem] border border-border/80 bg-card p-6 shadow-soft sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Shop</p>
          <h1 className="mt-1 font-display text-[clamp(2rem,4vw,3.2rem)] leading-[0.95]">All Products</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
            Browse the full SALT catalog with category and collection filters. Products are mapped from
            <a
              href="https://saltonlinestore.com"
              target="_blank"
              rel="noreferrer"
              className="mx-1 font-semibold text-primary underline-offset-2 hover:underline"
            >
              saltonlinestore.com
            </a>
            using live, snapshot, and seed fallbacks.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onTypeChange("")}
              className={`rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] ${
                !typeFilter
                  ? "border-foreground bg-foreground text-primary-foreground"
                  : "border-border bg-background hover:border-primary/40"
              }`}
            >
              All types
            </button>
            {productTypes.slice(0, 12).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => onTypeChange(type)}
                className={`rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] ${
                  typeFilter === type
                    ? "border-foreground bg-foreground text-primary-foreground"
                    : "border-border bg-background hover:border-primary/40"
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>{filteredProducts.length.toLocaleString()} products shown</span>
            {query ? <span>Search: "{query}"</span> : null}
            {selectedCollection ? <span>Collection: {selectedCollection.title}</span> : null}
            {(query || collectionHandle || typeFilter) && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-full border border-border px-3 py-1 font-semibold hover:border-primary/40 hover:text-primary"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </Reveal>

      {filteredProducts.length === 0 ? (
        <Reveal delayMs={80} className="mt-6">
          <div className="rounded-3xl border border-border/80 bg-card p-10 text-center shadow-soft">
            <h2 className="font-display text-3xl">No products match this filter</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Try removing one filter or return to the full catalog.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-xs font-bold uppercase tracking-[0.08em] text-primary-foreground"
              >
                Reset filters
              </button>
              <Link
                to="/collections"
                className="inline-flex h-10 items-center rounded-full border border-border bg-background px-5 text-xs font-bold uppercase tracking-[0.08em]"
              >
                Browse collections
              </Link>
            </div>
          </div>
        </Reveal>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {filteredProducts.map((product, index) => (
            <Reveal key={product.id} delayMs={index * 45}>
              <ProductCard product={product} />
            </Reveal>
          ))}
        </div>
      )}
    </section>
  );
};

export default ShopPage;
