import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import ProductCard from "@/components/storefront/ProductCard";
import Reveal from "@/components/storefront/Reveal";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { filterProducts, uniqueProductTypes } from "@/lib/catalog";
import { minPrice, savingsPercent } from "@/lib/formatters";
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

const perPageOptions = [24, 48, 72] as const;

const priceRangeOptions = [
  { value: "all", label: "Any price", min: null, max: null },
  { value: "under-25", label: "Under $25", min: null, max: 25 },
  { value: "25-60", label: "$25 - $60", min: 25, max: 60 },
  { value: "60-120", label: "$60 - $120", min: 60, max: 120 },
  { value: "120-plus", label: "$120+", min: 120, max: null },
] as const;

function formattedDateTime(value: string): string {
  if (!value) {
    return "recently";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "recently";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

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

function asNumberFromInput(input: string): number | null {
  if (!input.trim()) {
    return null;
  }

  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function activePriceRangeValue(min: number | null, max: number | null): string {
  if (min == null && max == null) {
    return "all";
  }

  const exact = priceRangeOptions.find((option) => option.min === min && option.max === max);
  return exact?.value || "custom";
}

function formatTypeLabel(value: string): string {
  return value
    .split(/\s+/)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function normalizeHandle(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

const ShopPage = () => {
  const navigate = useNavigate();
  const { handle: routeCollectionHandle } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const collectionHandle = searchParams.get("collection") || "";
  const typeFilter = searchParams.get("type") || "";
  const sort = searchParams.get("sort") || "featured";
  const page = asPositiveInt(searchParams.get("page"), 1);
  const perPageValue = asPositiveInt(searchParams.get("perPage"), perPageOptions[0]);
  const perPage = perPageOptions.includes(perPageValue as (typeof perPageOptions)[number])
    ? (perPageValue as (typeof perPageOptions)[number])
    : perPageOptions[0];

  const minFilter = asNumberOrNull(searchParams.get("min"));
  const maxFilter = asNumberOrNull(searchParams.get("max"));
  const priceRangeValue = activePriceRangeValue(minFilter, maxFilter);

  const [searchInput, setSearchInput] = useState(query);
  const [customMinInput, setCustomMinInput] = useState(minFilter == null ? "" : String(minFilter));
  const [customMaxInput, setCustomMaxInput] = useState(maxFilter == null ? "" : String(maxFilter));
  const [priceError, setPriceError] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(
    minFilter != null || maxFilter != null || perPage !== perPageOptions[0],
  );

  useEffect(() => {
    if (!routeCollectionHandle || searchParams.get("collection")) {
      return;
    }

    const next = new URLSearchParams(searchParams);

    if (routeCollectionHandle.toLowerCase() === "all") {
      next.delete("collection");
    } else {
      next.set("collection", routeCollectionHandle);
    }

    setSearchParams(next, { replace: true });
  }, [routeCollectionHandle, searchParams, setSearchParams]);

  useEffect(() => {
    setSearchInput(query);
  }, [query]);

  useEffect(() => {
    setCustomMinInput(minFilter == null ? "" : String(minFilter));
    setCustomMaxInput(maxFilter == null ? "" : String(maxFilter));
    setPriceError("");
  }, [minFilter, maxFilter]);

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
  const latestSyncAt = useMemo(() => {
    const values = [
      productsPayload?.generatedAt,
      collectionsPayload?.generatedAt,
      collectionProductIdsPayload?.generatedAt,
    ].filter(Boolean) as string[];
    if (!values.length) {
      return "";
    }

    return values.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  }, [productsPayload, collectionsPayload, collectionProductIdsPayload]);

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

    if (sort === "featured" && !query && selectedCollectionOrder) {
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
  }, [priceFilteredProducts, sort, query, selectedCollectionOrder]);

  const productTypes = useMemo(() => uniqueProductTypes(products), [products]);
  const selectedCollection = collections.find(
    (collection) => normalizeHandle(collection.handle) === normalizeHandle(collectionHandle),
  );

  const totalResults = sortedProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / perPage));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const startIndex = (currentPage - 1) * perPage;
  const endIndex = Math.min(startIndex + perPage, totalResults);
  const visibleProducts = sortedProducts.slice(startIndex, endIndex);
  const activeFilterCount = [
    query,
    collectionHandle,
    typeFilter,
    sort !== "featured" ? sort : "",
    minFilter != null || maxFilter != null ? "price" : "",
    perPage !== perPageOptions[0] ? "page-size" : "",
  ].filter(Boolean).length;
  const activeFilterSummary = [
    query ? `Search: "${query}"` : "",
    selectedCollection ? `Collection: ${selectedCollection.title}` : "",
    typeFilter ? `Type: ${formatTypeLabel(typeFilter)}` : "",
    minFilter != null || maxFilter != null
      ? `Price: ${minFilter == null ? "$0" : `$${minFilter}`} - ${maxFilter == null ? "Any" : `$${maxFilter}`}`
      : "",
  ]
    .filter(Boolean)
    .join(" • ");

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

    setSearchParams(next);
  };

  const clearFilters = () => {
    if (routeCollectionHandle) {
      navigate("/shop", { replace: true });
      return;
    }

    setSearchParams(new URLSearchParams());
    setSearchInput("");
    setCustomMinInput("");
    setCustomMaxInput("");
    setPriceError("");
  };

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateParams({ q: searchInput.trim() }, true);
  };

  const onPageChange = (nextPage: number) => {
    const clamped = Math.max(1, Math.min(totalPages, nextPage));

    updateParams({ page: clamped <= 1 ? null : String(clamped) });
  };

  const onPerPageChange = (value: string) => {
    const nextValue = asPositiveInt(value, perPageOptions[0]);
    const normalized = perPageOptions.includes(nextValue as (typeof perPageOptions)[number])
      ? String(nextValue)
      : String(perPageOptions[0]);

    updateParams({ perPage: normalized }, true);
  };

  const onPriceRangeChange = (value: string) => {
    if (value === "all") {
      setCustomMinInput("");
      setCustomMaxInput("");
      updateParams({ min: null, max: null }, true);
      return;
    }

    const selectedRange = priceRangeOptions.find((option) => option.value === value);
    if (!selectedRange) {
      setCustomMinInput("");
      setCustomMaxInput("");
      updateParams({ min: null, max: null }, true);
      return;
    }

    setCustomMinInput(selectedRange.min == null ? "" : String(selectedRange.min));
    setCustomMaxInput(selectedRange.max == null ? "" : String(selectedRange.max));

    updateParams(
      {
        min: selectedRange.min == null ? null : String(selectedRange.min),
        max: selectedRange.max == null ? null : String(selectedRange.max),
      },
      true,
    );
  };

  const applyCustomPrice = () => {
    const normalizedMin = asNumberFromInput(customMinInput);
    const normalizedMax = asNumberFromInput(customMaxInput);

    if (customMinInput.trim() && normalizedMin == null) {
      setPriceError("Min price must be a valid number.");
      return;
    }

    if (customMaxInput.trim() && normalizedMax == null) {
      setPriceError("Max price must be a valid number.");
      return;
    }

    if (normalizedMin != null && normalizedMax != null && normalizedMin > normalizedMax) {
      setPriceError("Min price cannot be higher than max price.");
      return;
    }

    setPriceError("");
    updateParams(
      {
        min: normalizedMin == null ? null : String(normalizedMin),
        max: normalizedMax == null ? null : String(normalizedMax),
      },
      true,
    );
  };

  const filterIsActive =
    !!query ||
    !!collectionHandle ||
    !!typeFilter ||
    sort !== "featured" ||
    minFilter != null ||
    maxFilter != null ||
    perPage !== perPageOptions[0];
  const sortLabel = sortOptions.find((option) => option.value === sort)?.label || "Featured";
  const shopHeading = selectedCollection ? selectedCollection.title : "All Products";
  const shopSubtitle = selectedCollection
    ? `Live catalog view for ${selectedCollection.title}. Inventory, pricing, and sort state update directly from Shopify sync.`
    : "Browse a simplified catalog view with precise collection matching and faster page-based discovery.";
  const activeFilterChips = [
    query
      ? {
          key: "search",
          label: `Search: ${query}`,
          onRemove: () => {
            setSearchInput("");
            updateParams({ q: null }, true);
          },
        }
      : null,
    collectionHandle
      ? {
          key: "collection",
          label: `Collection: ${selectedCollection?.title || collectionHandle}`,
          onRemove: () => updateParams({ collection: null }, true),
        }
      : null,
    typeFilter
      ? {
          key: "type",
          label: `Type: ${formatTypeLabel(typeFilter)}`,
          onRemove: () => updateParams({ type: null }, true),
        }
      : null,
    sort !== "featured"
      ? {
          key: "sort",
          label: `Sort: ${sortLabel}`,
          onRemove: () => updateParams({ sort: "featured" }, true),
        }
      : null,
    minFilter != null || maxFilter != null
      ? {
          key: "price",
          label: `Price: ${minFilter == null ? "$0" : `$${minFilter}`} - ${maxFilter == null ? "Any" : `$${maxFilter}`}`,
          onRemove: () => {
            setCustomMinInput("");
            setCustomMaxInput("");
            setPriceError("");
            updateParams({ min: null, max: null }, true);
          },
        }
      : null,
    perPage !== perPageOptions[0]
      ? {
          key: "perPage",
          label: `${perPage} / page`,
          onRemove: () => updateParams({ perPage: null }, true),
        }
      : null,
  ].filter(
    (
      entry,
    ): entry is {
      key: string;
      label: string;
      onRemove: () => void;
    } => Boolean(entry),
  );

  return (
    <section className="mx-auto mt-8 w-[min(1280px,96vw)] pb-6">
      <Reveal>
        <div className="salt-panel-shell rounded-[2rem] p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Shop</p>
          <h1 className="mt-1 font-display text-[clamp(2rem,4vw,3.2rem)] leading-[0.95]">{shopHeading}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
            {shopSubtitle}
          </p>
          <p className="mt-2 text-xs uppercase tracking-[0.1em] text-muted-foreground">
            Catalog updated {formattedDateTime(latestSyncAt)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="salt-sync-pill">{totalResults.toLocaleString()} matched</span>
            <span className="salt-sync-pill">Sorted by {sortLabel}</span>
            <span className="salt-sync-pill">{perPage} per page</span>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
            <form onSubmit={onSearch} className="relative flex items-center gap-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                type="search"
                placeholder="Search by product, category, vendor"
                className="salt-form-control w-full pl-9 pr-4"
              />
              <button
                type="submit"
                className="salt-primary-cta h-11 px-4 text-[0.66rem] font-bold uppercase tracking-[0.09em]"
              >
                Search
              </button>
            </form>

            <select
              aria-label="Sort products"
              value={sort}
              onChange={(event) => updateParams({ sort: event.target.value }, true)}
              className="salt-form-control"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              aria-label="Products per page"
              value={perPage}
              onChange={(event) => onPerPageChange(event.target.value)}
              className="salt-form-control"
            >
              {perPageOptions.map((count) => (
                <option key={count} value={count}>
                  {count} / page
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <select
              aria-label="Collection filter"
              value={collectionHandle}
              onChange={(event) => updateParams({ collection: event.target.value }, true)}
              className="salt-form-control"
            >
              <option value="">All collections</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.handle}>
                  {collection.title}
                </option>
              ))}
            </select>

            <select
              aria-label="Product type filter"
              value={typeFilter}
              onChange={(event) => updateParams({ type: event.target.value }, true)}
              className="salt-form-control"
            >
              <option value="">All product types</option>
              {productTypes.map((type) => (
                <option key={type} value={type}>
                  {formatTypeLabel(type)}
                </option>
              ))}
            </select>

            <select
              aria-label="Price range filter"
              value={priceRangeValue === "custom" ? "all" : priceRangeValue}
              onChange={(event) => onPriceRangeChange(event.target.value)}
              className="salt-form-control"
            >
              {priceRangeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="salt-ambient-card mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/65 p-2.5">
            <button
              type="button"
              onClick={() => setShowAdvanced((value) => !value)}
              className="salt-outline-chip h-9 px-3 py-0 text-[0.67rem]"
            >
              <Filter className="mr-1.5 h-3.5 w-3.5" />
              {showAdvanced ? "Hide advanced filters" : "Show advanced filters"}
            </button>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background/85 px-3 py-1 font-semibold">
                <SlidersHorizontal className="h-3.5 w-3.5" /> {totalResults.toLocaleString()} matched
              </span>
              <span className="rounded-full border border-border bg-background/85 px-3 py-1">
                Showing {totalResults === 0 ? 0 : startIndex + 1}-{endIndex}
              </span>
              {activeFilterCount > 0 ? (
                <span className="rounded-full border border-border bg-background/85 px-3 py-1">
                  {activeFilterCount} active filters
                </span>
              ) : null}
              {filterIsActive ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-full border border-border px-3 py-1 font-semibold hover:border-primary/40 hover:text-primary"
                >
                  Clear all
                </button>
              ) : null}
            </div>
          </div>

          {showAdvanced ? (
            <div className="salt-section-shell mt-4 rounded-2xl p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={customMinInput}
                  onChange={(event) => setCustomMinInput(event.target.value)}
                  className="salt-form-control h-10"
                  placeholder="Min price"
                  aria-label="Minimum price"
                />
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={customMaxInput}
                  onChange={(event) => setCustomMaxInput(event.target.value)}
                  className="salt-form-control h-10"
                  placeholder="Max price"
                  aria-label="Maximum price"
                />
                <button
                  type="button"
                  onClick={applyCustomPrice}
                  className="salt-primary-cta h-10 px-4 text-[0.7rem] font-bold uppercase tracking-[0.09em]"
                >
                  Apply price
                </button>
              </div>
              {priceError ? <p className="mt-2 text-xs text-destructive">{priceError}</p> : null}
            </div>
          ) : null}

          {activeFilterSummary ? (
            <p className="mt-2 rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
              {activeFilterSummary}
            </p>
          ) : null}
          {activeFilterChips.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.onRemove}
                  className="salt-filter-chip"
                  aria-label={`Remove ${chip.label} filter`}
                >
                  <span>{chip.label}</span>
                  <X className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => updateParams({ sort: "newest", collection: null, page: null }, true)}
              className="salt-outline-chip text-[0.62rem]"
            >
              New arrivals first
            </button>
            <button
              type="button"
              onClick={() => updateParams({ sort: "discount", page: null }, true)}
              className="salt-outline-chip text-[0.62rem]"
            >
              Biggest savings
            </button>
            <button
              type="button"
              onClick={() => updateParams({ min: null, max: "25", page: null }, true)}
              className="salt-outline-chip text-[0.62rem]"
            >
              Budget picks under $25
            </button>
            <button
              type="button"
              onClick={() => updateParams({ collection: "cookware", page: null }, true)}
              className="salt-outline-chip text-[0.62rem]"
            >
              Shop cookware
            </button>
          </div>
        </div>
      </Reveal>

      {totalResults === 0 ? (
        <Reveal delayMs={80} className="mt-6">
          <div className="salt-surface rounded-3xl p-10 text-center">
            <h2 className="font-display text-3xl">No products match this filter</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Try removing one filter or return to the full catalog.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={clearFilters}
                className="salt-primary-cta h-10 px-5 text-xs font-bold uppercase tracking-[0.08em]"
              >
                Reset filters
              </button>
              <Link
                to="/collections"
                className="salt-outline-chip h-10 px-5 py-0 text-xs"
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
              <div className="salt-panel-shell rounded-2xl p-4 text-sm text-muted-foreground">
                <p className="inline-flex items-center gap-2 font-semibold text-foreground">
                  <Sparkles className="h-4 w-4 text-primary" /> Showing products ordered by best available savings.
                </p>
              </div>
            </Reveal>
          ) : null}

          <div className="salt-section-shell mt-6 rounded-[1.7rem] p-3 sm:p-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {visibleProducts.map((product, index) => (
                <Reveal key={product.id} delayMs={index * 35}>
                  <ProductCard product={product} variant="dense" />
                </Reveal>
              ))}
            </div>
          </div>

          <Reveal delayMs={80} className="mt-7">
            <div className="salt-panel-shell flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onPageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="salt-outline-chip h-10 gap-1 px-4 py-0 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </button>

                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </p>

                <button
                  type="button"
                  onClick={() => onPageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="salt-outline-chip h-10 gap-1 px-4 py-0 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
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
