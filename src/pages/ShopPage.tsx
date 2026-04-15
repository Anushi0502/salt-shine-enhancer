import { useEffect, useMemo, useRef } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import ProductCard from "@/components/storefront/ProductCard";
import Reveal from "@/components/storefront/Reveal";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { filterProducts } from "@/lib/catalog";
import { minPrice, savingsPercent } from "@/lib/formatters";
import { trackMetaPixelSearch } from "@/lib/meta-pixel";
import { normalizeShopifyAssetUrl } from "@/lib/theme-assets";
import {
  useCollections,
  useCollectionProductIds,
  useProducts,
} from "@/lib/shopify-data";

const sortOptions = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "discount", label: "Biggest Savings" },
  { value: "newest", label: "Newest" },
] as const;

const PAGE_SIZE = 24;

function asPositiveInt(input: string | null, fallback: number): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function asNumberOrNull(input: string | null): number | null {
  if (!input || !input.trim()) {
    return null;
  }

  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function normalizeHandle(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function isBestSellerCollection(handle: string, title: string): boolean {
  const normalizedHandle = normalizeHandle(handle);
  const normalizedTitle = String(title || "").trim().toLowerCase();

  if (
    normalizedHandle === "appplaza-best-sellers" ||
    normalizedHandle === "best-sellers" ||
    normalizedHandle === "best-seller" ||
    normalizedHandle === "bestsellers" ||
    normalizedHandle === "bestseller"
  ) {
    return true;
  }

  return /best[\s-]*sellers?/.test(`${normalizedHandle} ${normalizedTitle}`);
}

function normalizeCollectionFilter(value: string | null | undefined): string {
  const normalized = normalizeHandle(value);

  if (!normalized || normalized === "all" || normalized === "all-products") {
    return "";
  }

  return normalized;
}

const ShopPage = () => {
  const navigate = useNavigate();
  const { handle: routeCollectionHandle } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const collectionHandle = normalizeCollectionFilter(searchParams.get("collection"));
  const typeFilter = searchParams.get("type") || "";
  const sort = searchParams.get("sort") || "featured";
  const page = asPositiveInt(searchParams.get("page"), 1);
  const perPage = PAGE_SIZE;

  const minFilter = asNumberOrNull(searchParams.get("min"));
  const maxFilter = asNumberOrNull(searchParams.get("max"));
  const lastTrackedSearchRef = useRef("");

  useEffect(() => {
    if (!routeCollectionHandle) {
      return;
    }

    const nextCollection = normalizeCollectionFilter(routeCollectionHandle);
    const currentCollection = normalizeCollectionFilter(searchParams.get("collection"));

    if (nextCollection === currentCollection) {
      return;
    }

    const next = new URLSearchParams(searchParams);

    if (!nextCollection) {
      next.delete("collection");
    } else {
      next.set("collection", nextCollection);
    }

    setSearchParams(next, { replace: true });
  }, [routeCollectionHandle, searchParams, setSearchParams]);

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
    data: collectionProductIdsPayload,
    isLoading: collectionProductIdsLoading,
    error: collectionProductIdsError,
    refetch: refetchCollectionProductIds,
  } = useCollectionProductIds(collectionHandle, Boolean(collectionHandle));

  const products = useMemo(() => productsPayload?.products ?? [], [productsPayload]);
  const collections = useMemo(() => collectionsPayload?.collections ?? [], [collectionsPayload]);
  const selectedCollectionProductIds = useMemo(
    () => collectionProductIdsPayload?.productIds ?? null,
    [collectionProductIdsPayload],
  );
  const selectedCollectionOrder = useMemo(() => {
    if (!collectionHandle || !Array.isArray(selectedCollectionProductIds) || !selectedCollectionProductIds.length) {
      return null;
    }

    return new Map(selectedCollectionProductIds.map((productId, index) => [productId, index]));
  }, [collectionHandle, selectedCollectionProductIds]);
  const textFilteredProducts = useMemo(
    () =>
      filterProducts(products, {
        query,
        productType: typeFilter,
        collections,
      }),
    [products, query, typeFilter, collections],
  );

  const collectionFilteredProducts = useMemo(() => {
    if (!collectionHandle) {
      return textFilteredProducts;
    }

    return filterProducts(textFilteredProducts, {
      collection: collectionHandle,
      collections,
      collectionProductIds: selectedCollectionProductIds,
    });
  }, [collectionHandle, textFilteredProducts, collections, selectedCollectionProductIds]);

  const priceFilteredProducts = useMemo(() => {
    return collectionFilteredProducts.filter((product) => {
      const price = minPrice(product);

      if (minFilter != null && price < minFilter) {
        return false;
      }

      if (maxFilter != null && price > maxFilter) {
        return false;
      }

      return true;
    });
  }, [collectionFilteredProducts, minFilter, maxFilter]);

  const sortedProducts = useMemo(() => {
    const base = [...priceFilteredProducts];

    if (sort === "featured" && selectedCollectionOrder) {
      return base.sort((a, b) => {
        const leftRank = selectedCollectionOrder.get(a.id);
        const rightRank = selectedCollectionOrder.get(b.id);
        const leftHasRank = leftRank != null;
        const rightHasRank = rightRank != null;

        if (leftHasRank && rightHasRank && leftRank !== rightRank) {
          return leftRank - rightRank;
        }

        if (leftHasRank !== rightHasRank) {
          return leftHasRank ? -1 : 1;
        }

        return 0;
      });
    }

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
  }, [priceFilteredProducts, sort, selectedCollectionOrder]);

  const selectedCollection = collections.find(
    (collection) => normalizeHandle(collection.handle) === normalizeHandle(collectionHandle),
  );
  const bestSellerCollection = collections.find((collection) =>
    isBestSellerCollection(collection.handle, collection.title),
  );
  const allProductsCollection = collections.find(
    (collection) => normalizeHandle(collection.handle) === "all-products",
  );
  const previewCollection = selectedCollection || bestSellerCollection || allProductsCollection || null;
  const selectedCollectionImage = normalizeShopifyAssetUrl(previewCollection?.image?.src);

  const totalResults = sortedProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / perPage));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const startIndex = (currentPage - 1) * perPage;
  const endIndex = Math.min(startIndex + perPage, totalResults);
  const visibleProducts = sortedProducts.slice(startIndex, endIndex);

  useEffect(() => {
    if (productsLoading || collectionsLoading || (Boolean(collectionHandle) && collectionProductIdsLoading)) {
      return;
    }

    if (productsError || collectionsError || (Boolean(collectionHandle) && collectionProductIdsError)) {
      return;
    }

    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      lastTrackedSearchRef.current = "";
      return;
    }

    const signature = `${normalizedQuery.toLowerCase()}::${totalResults}`;
    if (lastTrackedSearchRef.current === signature) {
      return;
    }

    lastTrackedSearchRef.current = signature;
    trackMetaPixelSearch(normalizedQuery, totalResults);
  }, [
    collectionHandle,
    collectionProductIdsError,
    collectionProductIdsLoading,
    collectionsError,
    collectionsLoading,
    productsError,
    productsLoading,
    query,
    totalResults,
  ]);

  if (productsLoading || collectionsLoading || (Boolean(collectionHandle) && collectionProductIdsLoading)) {
    return (
      <LoadingState
        title="Loading products"
        subtitle="Building your filtered catalog view with latest pricing and availability."
      />
    );
  }

  if (productsError || collectionsError || (Boolean(collectionHandle) && collectionProductIdsError)) {
    return (
      <ErrorState
        title="Catalog unavailable"
        subtitle="Retry to refresh live Shopify data."
        action={
          <button
            type="button"
            onClick={() => {
              refetchProducts();
              refetchCollections();
              if (collectionHandle) {
                refetchCollectionProductIds();
              }
            }}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
          >
            Retry
          </button>
        }
      />
    );
  }

  const updateParams = (updates: Record<string, string | null>, resetPage = false) => {
    const next = new URLSearchParams(searchParams);

    Object.entries(updates).forEach(([key, value]) => {
      const normalized = value?.trim() || "";

      if (normalized) {
        next.set(key, normalized);
      } else {
        next.delete(key);
      }
    });

    if (resetPage) {
      next.delete("page");
    }

    next.delete("perPage");
    setSearchParams(next);
  };

  const clearFilters = () => {
    if (routeCollectionHandle) {
      navigate("/shop", { replace: true });
      return;
    }

    setSearchParams(new URLSearchParams());
  };

  const onPageChange = (nextPage: number) => {
    const clamped = Math.max(1, Math.min(totalPages, nextPage));

    updateParams({ page: clamped <= 1 ? null : String(clamped) });
  };

  const sortLabel = sortOptions.find((option) => option.value === sort)?.label || "Featured";

  return (
    <section className="mx-auto mt-4 w-[min(1320px,94vw)] pb-8 sm:mt-6 sm:w-[min(1320px,96vw)]">
      <Reveal>
        <div className="rounded-[1.55rem] sm:rounded-[3.1rem]">
          <div className="grid gap-4 xl:items-stretch">
            

            <div className="salt-editorial-shell relative overflow-hidden rounded-[1.45rem] p-3 sm:rounded-[1.95rem] sm:p-5">
              <div className="pointer-events-none absolute left-0 top-8 h-16 w-1 rounded-r-full bg-primary/55" />
              {selectedCollectionImage ? (
                <img
                  src={selectedCollectionImage}
                  alt={previewCollection?.title || "Collection preview"}
                  className="absolute inset-0 h-full w-full object-cover opacity-[0.24]"
                />
              ) : null}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_16%,hsl(var(--primary)/0.12),transparent_32%),radial-gradient(circle_at_88%_14%,hsl(var(--salt-gold)/0.14),transparent_35%),linear-gradient(160deg,rgba(255,255,255,0.36),rgba(255,255,255,0.18))]" />
              <div className="relative flex h-full min-h-[9rem] flex-col justify-between p-3 sm:min-h-[11rem] sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="salt-editorial-pill">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    {selectedCollection ? "Collection spotlight" : "Editorial browse"}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2.5">
                  <p className="salt-editorial-meta">
                    {totalResults.toLocaleString()} matched | Showing {totalResults === 0 ? 0 : startIndex + 1}-{endIndex}
                  </p>
                  {query || collectionHandle || typeFilter || sort !== "featured" || minFilter != null || maxFilter != null ? (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="salt-editorial-action"
                    >
                      Clear all filters
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          
        </div>
      </Reveal>

      {totalResults === 0 ? (
        <Reveal delayMs={80} className="mt-6">
          <div className="salt-editorial-shell rounded-[2rem] p-8 text-center">
            <p className="salt-kicker">No matching products</p>
            <h2 className="mt-3 font-display text-[clamp(1.9rem,3vw,2.8rem)]">No products match this filter</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              Remove one or two filters and try again.
            </p>
            <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
              <button
                type="button"
                onClick={clearFilters}
                className="salt-primary-cta h-10 w-full px-5 text-xs font-bold uppercase tracking-[0.08em] sm:w-auto"
              >
                Reset filters
              </button>
              <Link
                to="/collections"
                className="salt-outline-chip h-10 w-full px-5 py-0 text-xs sm:w-auto"
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
              <div className="salt-story-card rounded-[1.35rem] p-4 text-sm text-muted-foreground">
                <p className="inline-flex items-center gap-2 font-semibold text-foreground">
                  <Sparkles className="h-4 w-4 text-primary" /> Showing the strongest live savings first.
                </p>
              </div>
            </Reveal>
          ) : null}

          <div className="salt-section-shell mt-5 rounded-[1.55rem] p-3 sm:mt-6 sm:rounded-[2rem] sm:p-4">
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6 xl:grid-cols-4">
              {visibleProducts.map((product, index) => (
                <Reveal key={product.id} delayMs={index * 35} className="h-full">
                  <ProductCard product={product} variant="dense" />
                </Reveal>
              ))}
            </div>
          </div>

          <Reveal delayMs={80} className="mt-7">
            <div className="salt-glass-rail flex flex-col items-start gap-3 rounded-[1.55rem] p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <button
                  type="button"
                  onClick={() => onPageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="salt-outline-chip h-10 flex-1 gap-1 px-4 py-0 text-xs disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </button>

                <p className="w-full text-center text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:w-auto sm:text-left">
                  Page {currentPage} of {totalPages}
                </p>

                <button
                  type="button"
                  onClick={() => onPageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="salt-outline-chip h-10 flex-1 gap-1 px-4 py-0 text-xs disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <p className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-background/88 px-3 py-2 text-center text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground sm:w-auto">
                <ArrowDownUp className="h-3.5 w-3.5" />
                Sorted by {sortLabel}
              </p>
            </div>
          </Reveal>
        </>
      )}
    </section>
  );
};

export default ShopPage;
