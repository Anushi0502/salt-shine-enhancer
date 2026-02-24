import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowDownUp, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import ProductCard from "@/components/storefront/ProductCard";
import Reveal from "@/components/storefront/Reveal";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { filterProducts, uniqueProductTypes } from "@/lib/catalog";
import { minPrice, savingsPercent } from "@/lib/formatters";
import { useCollections, useProducts } from "@/lib/shopify-data";

const sortOptions = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "discount", label: "Biggest Savings" },
  { value: "newest", label: "Newest" },
] as const;

const ShopPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const collectionHandle = searchParams.get("collection") || "";
  const typeFilter = searchParams.get("type") || "";
  const sort = searchParams.get("sort") || "featured";
  const [searchInput, setSearchInput] = useState(query);

  useEffect(() => {
    setSearchInput(query);
  }, [query]);

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

  const sortedProducts = useMemo(() => {
    const base = [...filteredProducts];

    if (sort === "price-asc") {
      return base.sort((a, b) => minPrice(a) - minPrice(b));
    }

    if (sort === "price-desc") {
      return base.sort((a, b) => minPrice(b) - minPrice(a));
    }

    if (sort === "discount") {
      return base.sort((a, b) => savingsPercent(b) - savingsPercent(a));
    }

    if (sort === "newest") {
      return base.sort(
        (a, b) =>
          new Date(b.published_at || b.created_at).getTime() -
          new Date(a.published_at || a.created_at).getTime(),
      );
    }

    return base;
  }, [filteredProducts, sort]);

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

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);

    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }

    setSearchParams(next);
  };

  const clearFilters = () => {
    setSearchParams(new URLSearchParams());
    setSearchInput("");
  };

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateParam("q", searchInput.trim());
  };

  return (
    <section className="mx-auto mt-8 w-[min(1280px,96vw)] pb-6">
      <Reveal>
        <div className="rounded-[2rem] border border-border/80 bg-card p-6 shadow-soft sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Shop</p>
          <h1 className="mt-1 font-display text-[clamp(2rem,4vw,3.2rem)] leading-[0.95]">All Products</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
            Explore the full SALT catalog with layered filtering and quick sort controls for faster product discovery.
          </p>

          <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_auto]">
            <form onSubmit={onSearch} className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                type="search"
                placeholder="Search by product, category, vendor"
                className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-4 text-sm outline-none focus:border-primary/60"
              />
            </form>

            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                <ArrowDownUp className="h-3.5 w-3.5" /> Sort
              </div>
              <label htmlFor="sort-products" className="sr-only">
                Sort products
              </label>
              <select
                id="sort-products"
                value={sort}
                onChange={(event) => updateParam("sort", event.target.value)}
                className="h-11 min-w-[180px] rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/60"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 font-semibold">
              <SlidersHorizontal className="h-3.5 w-3.5" /> {sortedProducts.length.toLocaleString()} shown
            </span>
            {query ? <span className="rounded-full border border-border bg-background px-3 py-1">Search: "{query}"</span> : null}
            {selectedCollection ? (
              <span className="rounded-full border border-border bg-background px-3 py-1">Collection: {selectedCollection.title}</span>
            ) : null}
            {typeFilter ? <span className="rounded-full border border-border bg-background px-3 py-1">Type: {typeFilter}</span> : null}
            {(query || collectionHandle || typeFilter || sort !== "featured") && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-full border border-border px-3 py-1 font-semibold hover:border-primary/40 hover:text-primary"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="mt-4">
            <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Collections</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => updateParam("collection", "")}
                className={`rounded-full border px-3 py-1.5 text-[0.66rem] font-bold uppercase tracking-[0.1em] ${
                  !collectionHandle
                    ? "border-foreground bg-foreground text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-primary"
                }`}
              >
                All collections
              </button>
              {collections.slice(0, 12).map((collection) => (
                <button
                  key={collection.id}
                  type="button"
                  onClick={() => updateParam("collection", collection.handle)}
                  className={`rounded-full border px-3 py-1.5 text-[0.66rem] font-bold uppercase tracking-[0.1em] ${
                    collectionHandle === collection.handle
                      ? "border-foreground bg-foreground text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-primary"
                  }`}
                >
                  {collection.title}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Product type</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => updateParam("type", "")}
                className={`rounded-full border px-3 py-1.5 text-[0.66rem] font-bold uppercase tracking-[0.1em] ${
                  !typeFilter
                    ? "border-foreground bg-foreground text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-primary"
                }`}
              >
                All types
              </button>
              {productTypes.slice(0, 12).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => updateParam("type", type)}
                  className={`rounded-full border px-3 py-1.5 text-[0.66rem] font-bold uppercase tracking-[0.1em] ${
                    typeFilter === type
                      ? "border-foreground bg-foreground text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-primary"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Reveal>

      {sortedProducts.length === 0 ? (
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
        <>
          {sort === "discount" ? (
            <Reveal delayMs={80} className="mt-6">
              <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4 text-sm text-muted-foreground">
                <p className="inline-flex items-center gap-2 font-semibold text-foreground">
                  <Sparkles className="h-4 w-4 text-primary" /> Showing products ordered by best available savings.
                </p>
              </div>
            </Reveal>
          ) : null}

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {sortedProducts.map((product, index) => (
              <Reveal key={product.id} delayMs={index * 45}>
                <ProductCard product={product} />
              </Reveal>
            ))}
          </div>
        </>
      )}
    </section>
  );
};

export default ShopPage;
