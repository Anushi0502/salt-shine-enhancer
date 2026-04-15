import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Truck,
  X,
} from "lucide-react";
import InnerBreadcrumbs from "@/components/storefront/InnerBreadcrumbs";
import ProductCard from "@/components/storefront/ProductCard";
import Reveal from "@/components/storefront/Reveal";
import SectionHeading from "@/components/storefront/SectionHeading";
import TrustStrip from "@/components/storefront/TrustStrip";

import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { filterProducts, uniqueProductTypes } from "@/lib/catalog";
import { minPrice, savingsPercent } from "@/lib/formatters";
import { trackMetaPixelSearch } from "@/lib/meta-pixel";
import { normalizeShopifyAssetUrl } from "@/lib/theme-assets";
import { useCollections, useCollectionProductIds, useProducts } from "@/lib/shopify-data";

const sortOptions = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "discount", label: "Biggest Savings" },
  { value: "newest", label: "Newest" },
] as const;

const priceRangeOptions = [
  { value: "all", label: "Any price", min: null, max: null },
  { value: "under-25", label: "Under $25", min: null, max: 25 },
  { value: "25-50", label: "$25 to $50", min: 25, max: 50 },
  { value: "50-100", label: "$50 to $100", min: 50, max: 100 },
  { value: "100-plus", label: "$100+", min: 100, max: null },
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

function normalizeCollectionFilter(value: string | null | undefined): string {
  const normalized = normalizeHandle(value);

  if (!normalized || normalized === "all" || normalized === "all-products") {
    return "";
  }

  return normalized;
}

function normalizeSearchText(value: string): string {
  return normalizeHandle(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function isBestSellerCollection(handle: string, title: string): boolean {
  const normalizedHandle = normalizeHandle(handle);
  const normalizedTitle = String(title || "").trim().toLowerCase();

  if (["appplaza-best-sellers", "best-sellers", "best-seller", "bestsellers", "bestseller"].includes(normalizedHandle)) {
    return true;
  }

  return /best[\s-]*sellers?/.test(`${normalizedHandle} ${normalizedTitle}`);
}

function formatCollectionDescription(input?: string | null): string {
  const source = String(input || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!source) {
    return "Discover curated picks with cleaner filters, stronger hierarchy, and quicker routes into the catalog.";
  }

  if (source.length <= 170) {
    return source;
  }

  return `${source.slice(0, 167).trimEnd()}...`;
}

function formatTypeLabel(value: string): string {
  const cleaned = normalizeSearchText(value)
    .replace(/\bassocerries\b/g, "accessories")
    .replace(/\bassoceries\b/g, "accessories");

  const overrides: Record<string, string> = {
    "pet accessories": "Pet Accessories",
    "walking sticks": "Walking Sticks",
    "home decor": "Home Decor",
    "personal care": "Personal Care",
  };

  if (overrides[cleaned]) {
    return overrides[cleaned];
  }

  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
  const minFilter = asNumberOrNull(searchParams.get("min"));
  const maxFilter = asNumberOrNull(searchParams.get("max"));

  const [customMinInput, setCustomMinInput] = useState(minFilter == null ? "" : String(minFilter));
  const [customMaxInput, setCustomMaxInput] = useState(maxFilter == null ? "" : String(maxFilter));
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [desktopFiltersVisible, setDesktopFiltersVisible] = useState(false);
  const lastTrackedSearchRef = useRef("");

  useEffect(() => {
    setCustomMinInput(minFilter == null ? "" : String(minFilter));
    setCustomMaxInput(maxFilter == null ? "" : String(maxFilter));
  }, [minFilter, maxFilter]);

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

  const { data: productsPayload, isLoading: productsLoading, error: productsError, refetch: refetchProducts } = useProducts();
  const { data: collectionsPayload, isLoading: collectionsLoading, error: collectionsError, refetch: refetchCollections } = useCollections();
  const {
    data: collectionProductIdsPayload,
    isLoading: collectionProductIdsLoading,
    error: collectionProductIdsError,
    refetch: refetchCollectionProductIds,
  } = useCollectionProductIds(collectionHandle, Boolean(collectionHandle));

  const products = useMemo(() => productsPayload?.products ?? [], [productsPayload]);
  const collections = useMemo(() => collectionsPayload?.collections ?? [], [collectionsPayload]);
  const productTypes = useMemo(() => uniqueProductTypes(products), [products]);
  const selectedCollectionProductIds = useMemo(() => collectionProductIdsPayload?.productIds ?? null, [collectionProductIdsPayload]);
  const selectedCollectionOrder = useMemo(() => {
    if (!collectionHandle || !Array.isArray(selectedCollectionProductIds) || !selectedCollectionProductIds.length) {
      return null;
    }

    return new Map(selectedCollectionProductIds.map((productId, index) => [productId, index]));
  }, [collectionHandle, selectedCollectionProductIds]);

  const textFilteredProducts = useMemo(
    () => filterProducts(products, { query, productType: typeFilter, collections }),
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

  const priceFilteredProducts = useMemo(
    () =>
      collectionFilteredProducts.filter((product) => {
        const price = minPrice(product);
        if (minFilter != null && price < minFilter) {
          return false;
        }

        if (maxFilter != null && price > maxFilter) {
          return false;
        }

        return true;
      }),
    [collectionFilteredProducts, minFilter, maxFilter],
  );

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
        (a, b) => new Date(b.published_at || b.created_at).getTime() - new Date(a.published_at || a.created_at).getTime(),
      );
    }

    return base;
  }, [priceFilteredProducts, sort, selectedCollectionOrder]);

  const selectedCollection = collections.find(
    (collection) => normalizeHandle(collection.handle) === normalizeHandle(collectionHandle),
  );
  const bestSellerCollection = collections.find((collection) => isBestSellerCollection(collection.handle, collection.title));
  const allProductsCollection = collections.find((collection) => normalizeHandle(collection.handle) === "all-products");
  const previewCollection = selectedCollection || bestSellerCollection || allProductsCollection || null;
  const selectedCollectionImage = normalizeShopifyAssetUrl(previewCollection?.image?.src);

  const totalResults = sortedProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalResults);
  const visibleProducts = sortedProducts.slice(startIndex, endIndex);
  const pageProgressPercent = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;

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

  const onPricePresetChange = (value: string) => {
    const selected = priceRangeOptions.find((option) => option.value === value);
    if (!selected) {
      return;
    }

    const nextMin = selected.min == null ? "" : String(selected.min);
    const nextMax = selected.max == null ? "" : String(selected.max);
    setCustomMinInput(nextMin);
    setCustomMaxInput(nextMax);
    updateParams(
      {
        min: selected.min == null ? null : String(selected.min),
        max: selected.max == null ? null : String(selected.max),
      },
      true,
    );
  };

  const applyCustomPrice = () => {
    const parsedMin = asNumberOrNull(customMinInput);
    const parsedMax = asNumberOrNull(customMaxInput);

    if (parsedMin != null && parsedMax != null && parsedMin > parsedMax) {
      return;
    }

    updateParams(
      {
        min: parsedMin == null ? null : String(parsedMin),
        max: parsedMax == null ? null : String(parsedMax),
      },
      true,
    );
  };

  const clearFilters = () => {
    const preservedSearchQuery = query.trim();
    const nextParams = new URLSearchParams();
    if (preservedSearchQuery) {
      nextParams.set("q", preservedSearchQuery);
    }

    if (routeCollectionHandle) {
      const suffix = nextParams.toString();
      navigate(suffix ? `/shop?${suffix}` : "/shop", { replace: true });
      setMobileFiltersOpen(false);
      return;
    }

    setSearchParams(nextParams);
    setCustomMinInput("");
    setCustomMaxInput("");
    setMobileFiltersOpen(false);
  };

  const onPageChange = (nextPage: number) => {
    const clamped = Math.max(1, Math.min(totalPages, nextPage));
    updateParams({ page: clamped <= 1 ? null : String(clamped) });
  };

  const sortLabel = sortOptions.find((option) => option.value === sort)?.label || "Featured";

  const filterChips = [
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
      ? { key: "sort", label: `Sort: ${sortLabel}`, onRemove: () => updateParams({ sort: "featured" }, true) }
      : null,
    minFilter != null || maxFilter != null
      ? {
          key: "price",
          label: `Price: ${minFilter == null ? "$0" : `$${minFilter}`} - ${maxFilter == null ? "Any" : `$${maxFilter}`}`,
          onRemove: () => updateParams({ min: null, max: null }, true),
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
  const hasActiveFilters = filterChips.length > 0;
  const desktopToolbarChips = filterChips.slice(0, 3);
  const hiddenDesktopChipCount = Math.max(0, filterChips.length - desktopToolbarChips.length);

  const breadcrumbItems = [
    { label: "Home", to: "/" },
    { label: "Shop", to: "/shop" },
    { label: selectedCollection?.title || "Catalog" },
  ];
  const sidebarFilterPanelContent = (
    <div className="mt-2 grid gap-2">
      <div className="grid gap-1">
        <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Collection</p>
        <select
          aria-label="Collection filter"
          value={collectionHandle}
          onChange={(event) => updateParams({ collection: event.target.value || null }, true)}
          className="salt-filter-field salt-filter-field-compact"
        >
          <option value="">All collections</option>
          {collections.map((collection) => (
            <option key={collection.id} value={collection.handle}>
              {collection.title}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1">
        <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Product type</p>
        <select
          aria-label="Product type filter"
          value={typeFilter}
          onChange={(event) => updateParams({ type: event.target.value || null }, true)}
          className="salt-filter-field salt-filter-field-compact"
        >
          <option value="">All product types</option>
          {productTypes.map((type) => (
            <option key={type} value={type}>
              {formatTypeLabel(type)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1">
        <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Sort by</p>
        <select
          aria-label="Sort products"
          value={sort}
          onChange={(event) => updateParams({ sort: event.target.value }, true)}
          className="salt-filter-field salt-filter-field-compact"
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1">
        <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Price range</p>
        <select
          aria-label="Price range filter"
          value={priceRangeOptions.find((option) => option.min === minFilter && option.max === maxFilter)?.value || "custom"}
          onChange={(event) => onPricePresetChange(event.target.value)}
          className="salt-filter-field salt-filter-field-compact"
        >
          {priceRangeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          <option value="custom">Custom range</option>
        </select>
      </div>

      <div className="grid gap-1.5 border-t border-border/70 pt-2.5">
        <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Custom price</p>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={customMinInput}
          onChange={(event) => setCustomMinInput(event.target.value)}
          placeholder="Min price"
          className="salt-filter-field salt-filter-field-compact"
          aria-label="Minimum price"
        />
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={customMaxInput}
          onChange={(event) => setCustomMaxInput(event.target.value)}
          placeholder="Max price"
          className="salt-filter-field salt-filter-field-compact"
          aria-label="Maximum price"
        />
        <button
          type="button"
          onClick={() => {
            applyCustomPrice();
            setMobileFiltersOpen(false);
          }}
          className="salt-primary-cta h-8.5 w-full justify-center text-[0.58rem] font-bold uppercase tracking-[0.08em]"
        >
          Apply price
        </button>
      </div>
    </div>
  );

  const mobileFilterPanelContent = (
    <div className="mt-2 grid gap-2">
      <div className="salt-filter-grid sm:grid-cols-2 lg:grid-cols-4">
        <select
          aria-label="Collection filter"
          value={collectionHandle}
          onChange={(event) => updateParams({ collection: event.target.value || null }, true)}
          className="salt-filter-field salt-filter-field-compact"
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
          onChange={(event) => updateParams({ type: event.target.value || null }, true)}
          className="salt-filter-field salt-filter-field-compact"
        >
          <option value="">All product types</option>
          {productTypes.map((type) => (
            <option key={type} value={type}>
              {formatTypeLabel(type)}
            </option>
          ))}
        </select>
        <select
          aria-label="Sort products"
          value={sort}
          onChange={(event) => updateParams({ sort: event.target.value }, true)}
          className="salt-filter-field salt-filter-field-compact"
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Price range filter"
          value={priceRangeOptions.find((option) => option.min === minFilter && option.max === maxFilter)?.value || "custom"}
          onChange={(event) => onPricePresetChange(event.target.value)}
          className="salt-filter-field salt-filter-field-compact"
        >
          {priceRangeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          <option value="custom">Custom range</option>
        </select>
      </div>

      <div className="salt-filter-grid sm:grid-cols-[1fr_1fr_auto]">
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={customMinInput}
          onChange={(event) => setCustomMinInput(event.target.value)}
          placeholder="Min price"
          className="salt-filter-field salt-filter-field-compact"
          aria-label="Minimum price"
        />
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={customMaxInput}
          onChange={(event) => setCustomMaxInput(event.target.value)}
          placeholder="Max price"
          className="salt-filter-field salt-filter-field-compact"
          aria-label="Maximum price"
        />
        <button
          type="button"
          onClick={applyCustomPrice}
          className="salt-primary-cta h-9 w-full px-3 text-[0.62rem] font-bold uppercase tracking-[0.08em] sm:w-auto"
        >
          Apply price
        </button>
      </div>
    </div>
  );

  return (
    <section className="mx-auto mt-4 w-[min(1200px,94vw)] pb-8 sm:mt-6 sm:w-[min(1200px,96vw)]">
      <Reveal>
        <InnerBreadcrumbs items={breadcrumbItems} />
      </Reveal>

      <Reveal>
        <div className="salt-editorial-shell relative mt-3 overflow-hidden rounded-[1.35rem] p-4 sm:rounded-[1.7rem] sm:p-5">
          <div className="pointer-events-none absolute left-0 top-10 h-20 w-1 rounded-r-full bg-primary/55" />
          {selectedCollectionImage ? (
            <img
              src={selectedCollectionImage}
              alt={previewCollection?.title || "Collection preview"}
              className="absolute inset-0 h-full w-full object-cover opacity-[0.12]"
            />
          ) : null}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_16%,hsl(var(--primary)/0.1),transparent_30%),radial-gradient(circle_at_88%_14%,hsl(var(--salt-gold)/0.1),transparent_32%),linear-gradient(160deg,rgba(247,250,255,0.94),rgba(244,248,255,0.9))]" />

          <div className="relative">
            <span className="salt-editorial-pill">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              {selectedCollection ? "Collection spotlight" : "Editorial browse"}
            </span>
            <SectionHeading
              className="mt-3"
              title={selectedCollection?.title || "Explore the full SALT catalog"}
              description={formatCollectionDescription(selectedCollection?.description)}
              action={<p className="salt-editorial-meta">{totalResults.toLocaleString()} matched | Showing {totalResults === 0 ? 0 : startIndex + 1}-{endIndex}</p>}
            />
            <TrustStrip className="mt-4" items={[{ icon: Truck, label: "US shipping included" }, { icon: ShieldCheck, label: "Secure checkout" }, { icon: Sparkles, label: "Curated by category" }]} />
          </div>
        </div>
      </Reveal>
      <div className={desktopFiltersVisible ? "mt-4 grid gap-4 lg:grid-cols-[252px_minmax(0,1fr)] lg:items-start" : "mt-4 grid gap-4 lg:grid-cols-1"}>


        {desktopFiltersVisible ? (
          <Reveal delayMs={70} className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
            <aside id="desktop-shop-filters" className="salt-filter-shell salt-filter-shell-compact rounded-[1.05rem] p-2 sm:p-2.5 lg:flex lg:min-h-[calc(100vh-8rem)] lg:flex-col">
              <div className="flex items-center justify-between gap-2">
                <p className="inline-flex items-center gap-1.5 text-[0.56rem] font-bold uppercase tracking-[0.12em] text-primary">
                  <SlidersHorizontal className="h-3.5 w-3.5" /> Filter and sort
                </p>
                <button
                  type="button"
                  onClick={() => setDesktopFiltersVisible(false)}
                  className="salt-outline-chip h-6.5 px-2 py-0 text-[0.54rem]"
                  aria-label="Hide filters sidebar"
                >
                  Hide
                </button>
              </div>
              {sidebarFilterPanelContent}

              <div className="mt-3 flex flex-wrap gap-1.5 lg:mt-4">
                {filterChips.map((chip) => (
                  <button key={chip.key} type="button" onClick={chip.onRemove} className="salt-applied-chip" aria-label={`Remove ${chip.label} filter`}>
                    <span>{chip.label}</span>
                    <X className="h-3.5 w-3.5" />
                  </button>
                ))}
                {filterChips.length ? (
                  <button type="button" onClick={clearFilters} className="salt-editorial-action h-8 px-3 text-[0.62rem]">Clear all filters</button>
                ) : null}
              </div>
            </aside>
          </Reveal>
        ) : null}

        <div className={desktopFiltersVisible ? "lg:col-start-2" : "lg:col-start-1"}>
          <Reveal delayMs={78} className="mb-3 hidden lg:block">
            <div className="salt-filter-shell sticky top-24 z-20 rounded-[1.05rem] p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {totalResults.toLocaleString()} products
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/75 bg-background px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    <ArrowDownUp className="h-3.5 w-3.5" /> {sortLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDesktopFiltersVisible((current) => !current)}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-[#15479a] bg-[linear-gradient(135deg,#2b67db_0%,#1f58c8_48%,#1749a7_100%)] px-4 text-[0.72rem] font-bold uppercase tracking-[0.12em] text-white shadow-[0_16px_30px_-20px_rgba(21,71,154,0.72)] transition hover:-translate-y-[1px] hover:brightness-105 hover:shadow-[0_20px_34px_-22px_rgba(21,71,154,0.78)]"
                    aria-controls="desktop-shop-filters"
                    aria-expanded={desktopFiltersVisible}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    {desktopFiltersVisible ? "Hide filters" : "Show filters"}
                  </button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {desktopToolbarChips.map((chip) => (
                  <button key={`toolbar-${chip.key}`} type="button" onClick={chip.onRemove} className="salt-applied-chip" aria-label={`Remove ${chip.label} filter`}>
                    <span>{chip.label}</span>
                    <X className="h-3.5 w-3.5" />
                  </button>
                ))}
                {hiddenDesktopChipCount > 0 ? (
                  <span className="inline-flex items-center rounded-full border border-border/70 bg-background px-3 py-1 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    +{hiddenDesktopChipCount} more
                  </span>
                ) : null}
                {hasActiveFilters ? (
                  <button type="button" onClick={clearFilters} className="salt-editorial-action h-8 px-3 text-[0.62rem]">Clear all filters</button>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-dashed border-border/70 bg-background px-3 py-1 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    No active filters
                  </span>
                )}
              </div>
            </div>
          </Reveal>

          <Reveal delayMs={70} className="lg:hidden">
            <div className="salt-filter-shell rounded-[1.1rem] p-3">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen((current) => !current)}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-primary/30 bg-background/90 px-3 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-primary transition hover:border-primary/50 hover:text-primary/90"
                aria-expanded={mobileFiltersOpen}
                aria-controls="mobile-shop-filters"
              >
                <span className="inline-flex items-center gap-2">
                  <SlidersHorizontal className="h-3.5 w-3.5" /> Filter and sort
                </span>
              </button>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {filterChips.map((chip) => (
                  <button key={chip.key} type="button" onClick={chip.onRemove} className="salt-applied-chip" aria-label={`Remove ${chip.label} filter`}>
                    <span>{chip.label}</span>
                    <X className="h-3.5 w-3.5" />
                  </button>
                ))}
                {filterChips.length ? (
                  <button type="button" onClick={clearFilters} className="salt-editorial-action h-8 px-3 text-[0.62rem]">Clear all filters</button>
                ) : null}
              </div>

              {mobileFiltersOpen ? (
                <aside id="mobile-shop-filters" className="mt-3 border-t border-border/70 pt-3">
                  <div className="salt-quiet-scroll max-h-[70vh] overflow-y-auto pr-1">{mobileFilterPanelContent}</div>
                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen(false)}
                    className="salt-primary-cta mt-3 h-10 w-full justify-center text-[0.64rem] font-bold uppercase tracking-[0.08em]"
                  >
                    View {totalResults.toLocaleString()} results
                  </button>
                </aside>
              ) : null}
            </div>
          </Reveal>

          {totalResults === 0 ? (
            <Reveal delayMs={90} className="mt-6">
              <div className="salt-editorial-shell rounded-[2rem] p-6 text-center sm:p-8">
                <p className="salt-kicker">No matching products</p>
                <h2 className="mt-3 font-display text-[clamp(1.9rem,3vw,2.8rem)]">No products match this filter</h2>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Try a broader term, remove one or two filters, or start from a collection entry point.</p>
                <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
                  <button type="button" onClick={clearFilters} className="salt-primary-cta h-10 w-full px-5 text-xs font-bold uppercase tracking-[0.08em] sm:w-auto">Reset filters</button>
                  <Link to="/collections" className="salt-outline-chip h-10 w-full px-5 py-0 text-xs sm:w-auto">Browse collections</Link>
                </div>
              </div>
            </Reveal>
          ) : (
            <>
              <div className="salt-section-shell mt-5 rounded-[1.55rem] p-3 sm:mt-6 sm:rounded-[2rem] sm:p-4">
                <div className="grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 lg:gap-7 xl:grid-cols-4">
                  {visibleProducts.map((product, index) => (
                    <Reveal key={product.id} delayMs={index * 35} className="h-full">
                      <ProductCard product={product} variant="dense" />
                    </Reveal>
                  ))}
                </div>
              </div>

              <Reveal delayMs={180} className="mt-7">
                <div className="salt-glass-rail rounded-[1rem] p-2.5 sm:p-3">
                  <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="w-full max-w-md">
                      <div className="flex flex-wrap items-center gap-1 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        <span>Page {currentPage} of {totalPages}</span>
                        <span className="text-border">|</span>
                        <span>Showing {totalResults === 0 ? 0 : startIndex + 1}-{endIndex} of {totalResults}</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-border/70">
                        <span className="block h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pageProgressPercent}%` }} />
                      </div>
                    </div>

                    <div className="flex w-full flex-wrap items-center gap-1 lg:w-auto lg:justify-end">
                      <button
                        type="button"
                        onClick={() => onPageChange(currentPage - 1)}
                        disabled={currentPage <= 1}
                        className="salt-outline-chip h-8 flex-1 gap-1 px-3 py-0 text-[0.62rem] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" /> Prev
                      </button>
                      <button
                        type="button"
                        onClick={() => onPageChange(currentPage + 1)}
                        disabled={currentPage >= totalPages}
                        className="salt-outline-chip h-8 flex-1 gap-1 px-3 py-0 text-[0.62rem] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                      >
                        Next <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                      <p className="inline-flex w-full items-center justify-center gap-1 rounded-full border border-border bg-background/88 px-2 py-1 text-center text-[0.62rem] font-bold uppercase tracking-[0.08em] text-muted-foreground sm:w-auto">
                        <ArrowDownUp className="h-3 w-3" />Sorted by {sortLabel}
                      </p>
                    </div>
                  </div>
                </div>
              </Reveal>

              <Reveal delayMs={210} className="mt-5">
                <article className="salt-editorial-shell rounded-[1.25rem] p-3.5 sm:p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[0.64rem] font-bold uppercase tracking-[0.12em] text-primary">Need help narrowing results?</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Start with curated routes instead of scrolling the full catalog.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link to="/collections" className="salt-primary-cta h-9 px-3.5 text-[0.62rem] font-bold uppercase tracking-[0.08em]">
                        Browse collections
                      </Link>
                      <button
                        type="button"
                        onClick={() => updateParams({ sort: "newest" }, true)}
                        className="salt-outline-chip h-9 px-3.5 py-0 text-[0.62rem]"
                      >
                        Sort newest
                      </button>
                      <Link to="/contact" className="salt-outline-chip h-9 px-3.5 py-0 text-[0.62rem]">
                        Ask support
                      </Link>
                    </div>
                  </div>
                </article>
              </Reveal>
            </>
          )}
        </div>
      </div>
    </section>
  );
};

export default ShopPage;

