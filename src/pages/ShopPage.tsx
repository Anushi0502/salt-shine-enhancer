import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
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
import CollectionGridState from "@/components/storefront/CollectionGridState";
import Reveal from "@/components/storefront/Reveal";
import SeoMetadata from "@/components/storefront/SeoMetadata";
import SectionHeading from "@/components/storefront/SectionHeading";
import TrustStrip from "@/components/storefront/TrustStrip";
import EverydayCarryEssentials from "@/components/storefront/EverydayCarryEssentials";

import { minPrice, savingsPercent } from "@/lib/formatters";
import { isDesignedCollectionBanner } from "@/lib/collection-banner";
import { trackMetaPixelSearch } from "@/lib/meta-pixel";
import { resolveShopBannerImageSelection } from "@/lib/shop-banner";
import {
  getCollectionByHandle,
  getSubcollectionByHandle,
  resolveCollectionFeedHandle,
  resolveCollectionShopifyHandle,
  SITE_COLLECTIONS,
} from "@/lib/site-navigation";
import { getCollectionGuideLinks, getCollectionGuideSummary } from "@/lib/collection-guide-links";
import { useLiveProductListing } from "@/lib/live-product-listings";
import { useCollections } from "@/lib/shopify-data";
import {
  buildBreadcrumbStructuredData,
  buildCollectionStructuredData,
} from "@/lib/sales-optimization";
import type { SearchIntelligence } from "@/lib/search-intelligence";
import {
  EVERYDAY_CARRY_COLLECTION_HANDLES,
  buildEverydayCarryFaqStructuredData,
} from "@/lib/aeo-content";
import type { ShopifyCollection, ShopifyProduct } from "@/types/shopify";

const sortOptions = [
  { value: "title-asc", label: "A to Z" },
  { value: "title-desc", label: "Z to A" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "featured", label: "Featured" },
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

const PAGE_SIZE = 36;
const DEFAULT_COLLECTION_HANDLE = "all-products";

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

function findVirtualPriceSubcollection(handle: string | null | undefined) {
  const normalizedHandle = normalizeHandle(handle);
  if (!normalizedHandle) {
    return null;
  }

  for (const collection of SITE_COLLECTIONS) {
    const subcollection = collection.subcollections.find(
      (candidate) =>
        normalizeHandle(candidate.handle) === normalizedHandle ||
        normalizeHandle(candidate.shopifyHandle) === normalizedHandle,
    );

    if (subcollection?.priceFilter) {
      return { collection, subcollection };
    }
  }

  return null;
}

function normalizeCollectionFilter(value: string | null | undefined): string {
  const normalized = normalizeHandle(value);

  if (!normalized || normalized === "all") {
    return "";
  }

  return normalized;
}

function normalizeSearchText(value: string): string {
  return normalizeHandle(value).replace(/[^a-z0-9]+/g, " ").trim();
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

type ShopHeroAction = {
  label: string;
  to?: string;
  href?: string;
  primary?: boolean;
  onClick?: () => void;
};

type SearchIntelligenceBuilder = (
  products: ShopifyProduct[],
  collections: ShopifyCollection[],
  query: string,
) => SearchIntelligence;

function renderHeroAction(action: ShopHeroAction) {
  const actionClass = action.primary
    ? "inline-flex h-11 items-center justify-center rounded-full border border-transparent bg-primary px-5 text-[0.7rem] font-bold uppercase tracking-[0.08em] text-white transition hover:-translate-y-[1px] hover:shadow-[0_18px_30px_-24px_rgba(37,99,235,0.5)]"
    : "inline-flex h-11 items-center justify-center rounded-full border border-border px-5 text-[0.7rem] font-bold uppercase tracking-[0.08em] text-foreground transition hover:-translate-y-[1px] hover:text-primary";

  if (action.onClick) {
    return (
      <button key={action.label} type="button" onClick={action.onClick} className={actionClass}>
        {action.label}
      </button>
    );
  }

  if (action.href) {
    const external = /^https?:\/\//i.test(action.href);

    return (
      <a
        key={action.label}
        href={action.href}
        className={actionClass}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
      >
        {action.label}
      </a>
    );
  }

  return (
    <Link key={action.label} to={action.to || "/"} className={actionClass}>
      {action.label}
    </Link>
  );
}

const ShopPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { handle: routeCollectionHandle, subhandle: routeSubcollectionHandle } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const deferredQuery = useDeferredValue(query);
  const [searchIntelligenceBuilder, setSearchIntelligenceBuilder] = useState<SearchIntelligenceBuilder | null>(null);
  const currentCollectionParam = normalizeCollectionFilter(searchParams.get("collection"));
  const routeCollectionAlias = normalizeCollectionFilter(routeCollectionHandle);
  const routeSubcollectionAlias = normalizeCollectionFilter(routeSubcollectionHandle);
  const hasSearchQuery = Boolean(query.trim());

  useEffect(() => {
    let active = true;

    if (!hasSearchQuery) {
      setSearchIntelligenceBuilder(null);
      return () => {
        active = false;
      };
    }

    // Keep the large catalog-intelligence engine off collection/PDP first paint.
    // Search results already have the lightweight catalog filter immediately;
    // this enhancement loads only after a submitted query needs it.
    void import("@/lib/search-intelligence").then(({ buildSearchIntelligence }) => {
      if (active) {
        setSearchIntelligenceBuilder(() => buildSearchIntelligence);
      }
    });

    return () => {
      active = false;
    };
  }, [hasSearchQuery]);
  const isDefaultSearchCollection =
    hasSearchQuery && currentCollectionParam === DEFAULT_COLLECTION_HANDLE && !routeCollectionAlias && !routeSubcollectionAlias;
  const activeCollectionParam = isDefaultSearchCollection ? "" : currentCollectionParam;
  const routeFeedHandle = routeCollectionAlias
    ? resolveCollectionFeedHandle(routeCollectionAlias, routeSubcollectionAlias || activeCollectionParam || null)
    : "";
  const explicitCollectionHandle = activeCollectionParam || routeFeedHandle || routeCollectionAlias;
  const shouldDefaultToAllProducts = !explicitCollectionHandle && !hasSearchQuery;
  const routeCuratedCollection = getCollectionByHandle(routeCollectionAlias || activeCollectionParam || routeFeedHandle);
  const routeCuratedSubcollection = routeCollectionAlias
    ? getSubcollectionByHandle(routeCollectionAlias, routeSubcollectionAlias || activeCollectionParam)
    : null;
  const routeVirtualPriceMatch =
    routeCuratedCollection && routeCuratedSubcollection?.priceFilter
      ? { collection: routeCuratedCollection, subcollection: routeCuratedSubcollection }
      : null;
  const virtualPriceMatch =
    routeVirtualPriceMatch ||
    findVirtualPriceSubcollection(routeSubcollectionAlias || activeCollectionParam || routeCollectionAlias);
  // Under $50 is a real Shopify collection with live manual ordering. Keep
  // Under $25 as a price-constrained view, but let Under $50 use Shopify's
  // current collection membership, count, and ordering directly.
  const isLiveShopifyPriceCollection =
    normalizeHandle(virtualPriceMatch?.subcollection.shopifyHandle) === "under-50";
  const priceFilterMatch = isLiveShopifyPriceCollection ? null : virtualPriceMatch;
  const isVirtualPriceSubcollection = Boolean(priceFilterMatch);
  const curatedCollection = virtualPriceMatch?.collection || routeCuratedCollection;
  const curatedSubcollection = virtualPriceMatch?.subcollection || routeCuratedSubcollection;
  const resolvedCollectionSelectionHandle = priceFilterMatch
    ? routeFeedHandle || priceFilterMatch.subcollection.shopifyHandle || priceFilterMatch.subcollection.handle
    : explicitCollectionHandle || (shouldDefaultToAllProducts ? DEFAULT_COLLECTION_HANDLE : "");
  // Price-only views must use the complete live-synced catalog. Shopify's
  // legacy under-25 collection can report a count while returning no
  // storefront products, so treating it as collection membership hides every
  // valid catalog item. Real collections still use Shopify membership/order.
  const collectionHandle = priceFilterMatch
    ? DEFAULT_COLLECTION_HANDLE
    : resolveCollectionShopifyHandle(resolvedCollectionSelectionHandle);
  const isAllProductsCollection = collectionHandle === DEFAULT_COLLECTION_HANDLE;
  const typeFilter = searchParams.get("type") || "";
  const sort = searchParams.get("sort") || "featured";
  const page = asPositiveInt(searchParams.get("page"), 1);
  const minFilter = asNumberOrNull(searchParams.get("min"));
  const maxFilter = asNumberOrNull(searchParams.get("max"));
  const virtualPriceMin = priceFilterMatch?.subcollection.priceFilter?.min ?? null;
  const virtualPriceMax = priceFilterMatch?.subcollection.priceFilter?.max ?? null;
  const effectiveMinFilter =
    minFilter == null ? virtualPriceMin : virtualPriceMin == null ? minFilter : Math.max(minFilter, virtualPriceMin);
  const effectiveMaxFilter =
    maxFilter == null ? virtualPriceMax : virtualPriceMax == null ? maxFilter : Math.min(maxFilter, virtualPriceMax);

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
    if (!routeCollectionAlias || isVirtualPriceSubcollection) {
      return;
    }

    const nextCollection = routeFeedHandle || resolveCollectionShopifyHandle(routeCollectionAlias);
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

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [isVirtualPriceSubcollection, routeCollectionAlias, routeFeedHandle, searchParams, setSearchParams]);

  useEffect(() => {
    if (!isDefaultSearchCollection) {
      return;
    }

    const next = new URLSearchParams(searchParams);
    next.delete("collection");

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [isDefaultSearchCollection, searchParams, setSearchParams]);

  // Shopify renders only the requested page, filter, and sort into a lightweight
  // section response. This keeps prices current without downloading the catalog.
  const {
    data: productsPayload,
    isLoading: productsLoading,
    isFetching: productsFetching,
    error: productsError,
    refetch: refetchProducts,
  } = useLiveProductListing({
    collectionHandle,
    query: deferredQuery,
    page,
    sort,
    productType: typeFilter,
    minPrice: effectiveMinFilter,
    maxPrice: effectiveMaxFilter,
  });
  const { data: collectionsPayload } = useCollections();

  const products = useMemo(() => productsPayload?.products ?? [], [productsPayload]);
  const collections = useMemo(() => collectionsPayload?.collections ?? [], [collectionsPayload]);
  const searchIntelligence = useMemo(
    () =>
      hasSearchQuery && searchIntelligenceBuilder
        ? searchIntelligenceBuilder(products, collections, deferredQuery)
        : null,
    [collections, deferredQuery, hasSearchQuery, products, searchIntelligenceBuilder],
  );
  const productTypes = useMemo(
    () => productsPayload?.productTypes ?? [],
    [productsPayload?.productTypes],
  );

  const sortedProducts = useMemo(() => {
    const base = [...products];
    // Shopify handles every globally sortable option. Discount is not a native
    // Shopify sort key, so keep that one useful by ranking the bounded live page.
    if (sort === "discount") {
      return base.sort((a, b) => savingsPercent(b) - savingsPercent(a));
    }
    return base;
  }, [products, sort]);

  const selectedCollectionHandleCandidates = new Set(
    [
      collectionHandle,
      routeCollectionAlias,
      routeCuratedCollection?.handle,
      routeCuratedCollection?.shopifyHandle,
      activeCollectionParam,
    ]
      .map(normalizeHandle)
      .filter(Boolean),
  );
  const selectedCollection = isVirtualPriceSubcollection
    ? undefined
    : collections.find((collection) => selectedCollectionHandleCandidates.has(normalizeHandle(collection.handle))) ||
      (routeCuratedCollection
        ? collections.find(
            (collection) => normalizeSearchText(collection.title) === normalizeSearchText(routeCuratedCollection.title),
          )
        : undefined);
  const collectionHeroKicker =
    selectedCollection?.customData?.heroKicker ||
    curatedSubcollection?.title ||
    curatedCollection?.title ||
    "Explore the full SALT catalog";
  const collectionDiscoveryHandle = normalizeHandle(routeCollectionAlias || selectedCollection?.handle || collectionHandle);
  const collectionDiscoverySummary =
    !hasSearchQuery && !isVirtualPriceSubcollection && !routeSubcollectionAlias
      ? getCollectionGuideSummary(collectionDiscoveryHandle)
      : "";
  const collectionHeroSummary =
    selectedCollection?.customData?.heroSummary ||
    collectionDiscoverySummary ||
    formatCollectionDescription(
      curatedSubcollection?.description ||
        curatedCollection?.description ||
        selectedCollection?.description ||
        "",
    );
  const collectionTrustStrip = selectedCollection?.customData?.trustStrip?.length
    ? selectedCollection.customData.trustStrip
    : ["US shipping included", "Secure checkout", "Curated by category"];
  const bannerImageSelection = useMemo(
    () =>
      resolveShopBannerImageSelection({
        collections,
        selectedCollection,
        categoryValue: typeFilter,
        routeCollectionHandle: routeCollectionAlias,
        routeSubcollectionHandle: routeSubcollectionAlias || activeCollectionParam || null,
      }),
    [collections, selectedCollection, typeFilter, routeCollectionAlias, routeSubcollectionAlias, activeCollectionParam],
  );
  const selectedCollectionImage = bannerImageSelection.image;
  const selectedCollectionImageAlt =
    bannerImageSelection.collection?.title ||
    curatedSubcollection?.title ||
    curatedCollection?.title ||
    selectedCollection?.title ||
    "Collection preview";
  const showDesignedCollectionBanner = Boolean(
    selectedCollectionImage &&
      bannerImageSelection.source === "selected-collection" &&
      isDesignedCollectionBanner(selectedCollection),
  );

  const totalResults = productsPayload?.total ?? sortedProducts.length;
  const totalPages = productsPayload?.totalPages ?? Math.max(1, Math.ceil(totalResults / PAGE_SIZE));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const visibleProducts = sortedProducts;
  const endIndex = Math.min(startIndex + visibleProducts.length, totalResults);
  const predictiveProducts = searchIntelligence?.predictedProducts ?? [];
  const predictiveQuerySuggestions = searchIntelligence?.querySuggestions ?? [];
  const predictiveCategorySuggestions = searchIntelligence?.categorySuggestions ?? [];
  const predictiveRefinements = searchIntelligence?.refinements ?? [];
  const understoodIntent = searchIntelligence?.intent ?? null;
  const pageProgressPercent = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const aeoCollectionHandle = collectionDiscoveryHandle;
  const showEverydayCarryEssentials = !hasSearchQuery && EVERYDAY_CARRY_COLLECTION_HANDLES.has(aeoCollectionHandle);
  const collectionDiscoveryGuides =
    !hasSearchQuery && !isVirtualPriceSubcollection && !routeSubcollectionAlias
      ? getCollectionGuideLinks(aeoCollectionHandle)
      : [];
  const seoStructuredData = useMemo(() => {
    if (!origin) {
      return [];
    }

    return [
      buildBreadcrumbStructuredData([
        { name: "Home", url: `${origin}/` },
        { name: "Shop", url: `${origin}/shop` },
        {
          name: curatedSubcollection?.title || curatedCollection?.title || selectedCollection?.title || "Catalog",
          url: `${origin}${location.pathname}`,
        },
      ]),
      ...(selectedCollection ? buildCollectionStructuredData(selectedCollection, origin) : []),
      ...(showEverydayCarryEssentials
        ? [buildEverydayCarryFaqStructuredData(origin, location.pathname)]
        : []),
    ].filter(Boolean);
  }, [curatedCollection?.title, curatedSubcollection?.title, location.pathname, origin, selectedCollection, showEverydayCarryEssentials]);
  const seoTitle = query.trim()
    ? `Search "${query.trim()}" | SALT Online Store`
    : `${curatedSubcollection?.title || curatedCollection?.title || selectedCollection?.title || "Shop"} | SALT Online Store`;
  const seoDescription = query.trim()
    ? `Search ${query.trim()} across ${totalResults.toLocaleString()} products with smarter ranking, filters, and merchandising signals.`
    : collectionHeroSummary;
  useEffect(() => {
    if (productsLoading) {
      return;
    }

    if (productsError) {
      return;
    }

    const normalizedQuery = deferredQuery.trim();
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
    productsError,
    productsLoading,
    deferredQuery,
    totalResults,
  ]);
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

    if (routeCollectionAlias) {
      const suffix = nextParams.toString();
      const targetRoute = suffix ? `/shop?${suffix}` : "/shop";
      const currentRoute = `${location.pathname}${location.search}${location.hash}`;
      if (targetRoute !== currentRoute) {
        navigate(targetRoute, { replace: true });
      }
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
          label: `Collection: ${curatedSubcollection?.title || curatedCollection?.title || selectedCollection?.title || collectionHandle}`,
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
  const heroActions: ShopHeroAction[] = [
    { label: "Browse collections", to: "/collections", primary: true },
    { label: "Resource Hub", to: "/shop?resource=hub" },
    hasActiveFilters ? { label: "Clear filters", onClick: clearFilters } : { label: "Ask support", to: "/pages/contact-us" },
  ];
  const desktopToolbarChips = filterChips.slice(0, 3);
  const hiddenDesktopChipCount = Math.max(0, filterChips.length - desktopToolbarChips.length);

  const breadcrumbItems = [
    { label: "Home", to: "/" },
    { label: "Shop", to: "/shop" },
    { label: curatedSubcollection?.title || curatedCollection?.title || selectedCollection?.title || "Catalog" },
  ];
  const sidebarFilterPanelContent = (
    <form
      aria-label="Product filters"
      className="mt-2 grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        applyCustomPrice();
      }}
    >
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
        <label htmlFor="min_price" className="sr-only">Minimum price</label>
        <input
          id="min_price"
          name="min_price"
          type="number"
          min={0}
          inputMode="numeric"
          value={customMinInput}
          onChange={(event) => setCustomMinInput(event.target.value)}
          placeholder="Min price"
          className="salt-filter-field salt-filter-field-compact"
          aria-label="Minimum price"
        />
        <label htmlFor="max_price" className="sr-only">Maximum price</label>
        <input
          id="max_price"
          name="max_price"
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
          type="submit"
          className="salt-primary-cta h-8.5 w-full justify-center text-[0.58rem] font-bold uppercase tracking-[0.08em]"
        >
          Apply price
        </button>
      </div>
    </form>
  );

  const mobileFilterPanelContent = (
    <form
      aria-label="Product filters"
      className="mt-2 grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        applyCustomPrice();
        setMobileFiltersOpen(false);
      }}
    >
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
        <label htmlFor="min_price" className="sr-only">Minimum price</label>
        <input
          id="min_price"
          name="min_price"
          type="number"
          min={0}
          inputMode="numeric"
          value={customMinInput}
          onChange={(event) => setCustomMinInput(event.target.value)}
          placeholder="Min price"
          className="salt-filter-field salt-filter-field-compact"
          aria-label="Minimum price"
        />
        <label htmlFor="max_price" className="sr-only">Maximum price</label>
        <input
          id="max_price"
          name="max_price"
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
          type="submit"
          className="salt-primary-cta h-9 w-full px-3 text-[0.62rem] font-bold uppercase tracking-[0.08em] sm:w-auto"
        >
          Apply price
        </button>
      </div>
    </form>
  );

  return (
    <section className="mt-4 w-full px-3 pb-8 sm:mt-6 sm:px-4 lg:px-5 xl:px-6">
      <SeoMetadata
        title={seoTitle}
        description={seoDescription}
        canonicalPath={location.pathname}
        image={selectedCollectionImage || undefined}
        noIndex={hasSearchQuery || (location.pathname === "/shop" && Boolean(location.search))}
        structuredData={seoStructuredData}
      />
      <Reveal>
        <InnerBreadcrumbs items={breadcrumbItems} />
      </Reveal>

      {showEverydayCarryEssentials ? <EverydayCarryEssentials /> : null}

      {hasSearchQuery ? (
        <Reveal delayMs={35}>
          <div className="salt-editorial-shell mt-3 rounded-[1.35rem] p-4 sm:rounded-[1.6rem] sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-[0.64rem] font-bold uppercase tracking-[0.12em] text-primary">
                  Predictive search
                </p>
                <h2 className="mt-2 font-display text-[clamp(1.4rem,2.6vw,2rem)] leading-none">
                  {searchIntelligence?.resultMode === "catalog-intent"
                    ? `${totalResults.toLocaleString()} tailored match${totalResults === 1 ? "" : "es"} for "${query.trim()}"`
                    : searchIntelligence?.exactProducts.length
                    ? `${totalResults.toLocaleString()} exact result${totalResults === 1 ? "" : "s"} for "${query.trim()}"`
                    : `Closest predicted matches for "${query.trim()}"`}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {understoodIntent
                    ? `${understoodIntent.label}. Ranked from current Shopify results, product attributes, and live constraints.`
                    : "Search titles, product types, tags, boost phrases, and collection cues all at once."}
                </p>
              </div>

              {predictiveQuerySuggestions.length ? (
                <div className="flex flex-wrap gap-2 lg:max-w-[24rem] lg:justify-end">
                  {predictiveQuerySuggestions.slice(0, 3).map((suggestion) => (
                    <button
                      key={suggestion.query}
                      type="button"
                      onClick={() => updateParams({ q: suggestion.query }, true)}
                      className="salt-applied-chip"
                    >
                      <span>{suggestion.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {understoodIntent || predictiveRefinements.length ? (
              <div className="mt-4 rounded-[1rem] border border-primary/15 bg-primary/[0.035] p-3">
                {understoodIntent ? (
                  <div className="flex flex-wrap items-center gap-2 text-[0.62rem] font-bold uppercase tracking-[0.1em] text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Catalog intelligence</span>
                    {understoodIntent.familyLabel ? (
                      <span className="rounded-full border border-primary/15 bg-background/80 px-2 py-1 text-muted-foreground">
                        {understoodIntent.familyLabel}
                      </span>
                    ) : null}
                    {understoodIntent.priceLabel ? (
                      <span className="rounded-full border border-primary/15 bg-background/80 px-2 py-1 text-muted-foreground">
                        {understoodIntent.priceLabel}
                      </span>
                    ) : null}
                    {understoodIntent.availabilityLabel ? (
                      <span className="rounded-full border border-primary/15 bg-background/80 px-2 py-1 text-muted-foreground">
                        {understoodIntent.availabilityLabel}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {predictiveRefinements.length ? (
                  <div className={understoodIntent ? "mt-2.5" : ""}>
                    <p className="text-[0.58rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      Refine this shortlist
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {predictiveRefinements.slice(0, 6).map((refinement) => (
                        <button
                          key={`refinement-${refinement.query}`}
                          type="button"
                          onClick={() => updateParams({ q: refinement.query }, true)}
                          title={refinement.reason}
                          className="salt-applied-chip"
                        >
                          <span>{refinement.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {predictiveCategorySuggestions.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {predictiveCategorySuggestions.slice(0, 4).map((suggestion) => (
                  <Link key={`${suggestion.label}-${suggestion.to}`} to={suggestion.to} className="salt-applied-chip">
                    <span>{suggestion.label}</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </Reveal>
      ) : null}

      {!hasSearchQuery ? (
        <Reveal>
          {showDesignedCollectionBanner ? (
            <div className="salt-editorial-shell salt-shop-channel-shell mt-3 overflow-hidden rounded-[1.35rem] p-0 shadow-[0_18px_45px_-30px_rgba(12,32,72,0.32)] sm:rounded-[1.7rem]">
              <img
                src={selectedCollectionImage}
                alt={selectedCollectionImageAlt}
                className="block h-auto w-full"
                decoding="async"
                fetchPriority="high"
                loading="eager"
              />
            </div>
          ) : (
            <div
              className="salt-editorial-shell salt-shop-channel-shell relative mt-3 overflow-hidden rounded-[1.35rem] p-4 sm:rounded-[1.7rem] sm:p-5 lg:p-6"
            >
              <div className="pointer-events-none absolute left-0 top-10 h-20 w-1 rounded-r-full bg-primary/55" />
              <div
                className={`grid gap-4 lg:gap-5${selectedCollectionImage ? " lg:grid-cols-[minmax(0,1.1fr)_minmax(17rem,0.9fr)] lg:items-center" : ""}`}
              >
                <div className="relative z-10">
                  <SectionHeading
                    className="mt-3"
                    kicker={collectionHeroKicker}
                    title={curatedSubcollection?.title || curatedCollection?.title || selectedCollection?.title || "Explore the full SALT catalog"}
                    description={collectionHeroSummary}
                    as="h1"
                  />
                  <TrustStrip
                    className="mt-4"
                    items={collectionTrustStrip.slice(0, 3).map((label, index) => ({
                      icon: [Truck, ShieldCheck, Sparkles][index] || Sparkles,
                      label,
                    }))}
                  />
                  <div className="mt-5 flex flex-wrap gap-2">
                    {[
                      { label: "Results", value: `${totalResults.toLocaleString()} products` },
                      {
                        label: "Route",
                        value: curatedSubcollection?.title || curatedCollection?.title || selectedCollection?.title || "All products",
                      },
                      { label: "Sort", value: sortLabel },
                    ].map((item) => (
                      <div
                        key={`${item.label}-${item.value}`}
                        className="salt-editorial-meta inline-flex items-baseline gap-2 px-3 py-1 text-xs"
                      >
                        <span className="font-semibold text-muted-foreground">{item.label}</span>
                        <span className="max-w-[12rem] truncate font-semibold text-foreground">{item.value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    {heroActions.map(renderHeroAction)}
                  </div>
                </div>

                {selectedCollectionImage ? (
                  <div className="relative order-first aspect-[6/5] overflow-hidden rounded-[1.15rem] border border-border/70 bg-background/92 shadow-[0_16px_34px_-28px_rgba(12,32,72,0.18)] lg:order-none">
                    <img
                      src={selectedCollectionImage}
                      alt={selectedCollectionImageAlt}
                      className="h-full w-full object-cover object-center transition duration-500"
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--background)/0.02),hsl(var(--foreground)/0.04)_54%,hsl(var(--foreground)/0.16))]" />
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </Reveal>
      ) : null}
      {collectionDiscoveryGuides.length ? (
        <Reveal delayMs={45}>
          <section className="salt-editorial-shell mt-4 rounded-[1.35rem] p-4 sm:rounded-[1.6rem] sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[0.64rem] font-bold uppercase tracking-[0.12em] text-primary">Helpful before you shop</p>
                <h2 className="mt-2 font-display text-[clamp(1.45rem,2.8vw,2.15rem)] leading-none text-foreground">
                  Use a focused guide to narrow this collection
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {collectionDiscoverySummary ||
                    "Compare the live category signals first, then open the products that fit your task, style, or use case."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {collectionDiscoveryGuides.map((guide) => (
                  <Link
                    key={guide.handle}
                    to={`/pages/${guide.handle}`}
                    className="inline-flex min-h-10 items-center rounded-full border border-border px-4 py-2 text-[0.66rem] font-bold uppercase tracking-[0.09em] text-foreground transition hover:-translate-y-[1px] hover:border-primary/30 hover:text-primary"
                  >
                    {guide.title}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </Reveal>
      ) : null}
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
          <Reveal delayMs={78} className="mb-2 hidden lg:block">
            <div className="salt-filter-shell sticky top-24 z-20 rounded-[0.9rem] px-2 py-1.5">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {totalResults.toLocaleString()} products
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/75 bg-background px-1.5 py-[0.2rem] text-[0.52rem] font-bold uppercase tracking-[0.07em] leading-none text-muted-foreground">
                    <ArrowDownUp className="h-2.5 w-2.5" /> {sortLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDesktopFiltersVisible((current) => !current)}
                    className="salt-primary-cta h-8 gap-1 px-2.5 text-[0.58rem] font-bold uppercase tracking-[0.08em] shadow-[0_12px_22px_-18px_rgba(21,71,154,0.18)] transition hover:-translate-y-[1px] hover:shadow-[0_16px_26px_-20px_rgba(21,71,154,0.26)]"
                    aria-controls="desktop-shop-filters"
                    aria-expanded={desktopFiltersVisible}
                  >
                    <SlidersHorizontal className="h-2.5 w-2.5" />
                    {desktopFiltersVisible ? "Hide filters" : "Show filters"}
                  </button>
                </div>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
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
                  <span className="inline-flex items-center rounded-full border border-dashed border-border/70 bg-background px-1.5 py-[0.08rem] text-[0.42rem] font-bold uppercase tracking-[0.06em] leading-none text-muted-foreground">
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

          {productsError ? (
            <CollectionGridState
              state="error"
              retrying={productsFetching}
              onRetry={() => refetchProducts()}
            />
          ) : productsLoading || productsFetching ? (
            <CollectionGridState state="loading" />
          ) : totalResults === 0 ? (
            <>
              <CollectionGridState
                state="empty"
                hasSearchQuery={hasSearchQuery}
                query={query}
                onReset={clearFilters}
              >
                {hasSearchQuery
                  ? predictiveQuerySuggestions.slice(0, 3).map((suggestion) => (
                      <button
                        key={`empty-query-${suggestion.query}`}
                        type="button"
                        onClick={() => updateParams({ q: suggestion.query }, true)}
                        className="salt-applied-chip"
                      >
                        <span>{suggestion.label}</span>
                      </button>
                    ))
                  : null}
                {hasSearchQuery
                  ? predictiveCategorySuggestions.slice(0, 3).map((suggestion) => (
                      <Link
                        key={`empty-category-${suggestion.label}-${suggestion.to}`}
                        to={suggestion.to}
                        className="salt-applied-chip"
                      >
                        <span>{suggestion.label}</span>
                      </Link>
                    ))
                  : null}
              </CollectionGridState>

              {hasSearchQuery && predictiveProducts.length ? (
                <Reveal delayMs={120} className="mt-5">
                  <div className="salt-section-shell rounded-[1.35rem] p-3 sm:p-4 lg:p-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-[0.64rem] font-bold uppercase tracking-[0.12em] text-primary">
                          Predicted products
                        </p>
                        <h3 className="mt-1 font-display text-[1.5rem] leading-none">
                          Closest matches for "{query.trim()}"
                        </h3>
                      </div>
                      <p className="text-[0.62rem] uppercase tracking-[0.1em] text-muted-foreground">
                        {predictiveProducts.length} picks
                      </p>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
                      {predictiveProducts.slice(0, 4).map((product) => (
                        <ProductCard
                          key={product.id}
                          product={product}
                          variant="shop"
                        />
                      ))}
                    </div>
                  </div>
                </Reveal>
              ) : null}
            </>
          ) : (
            <>
                <div className="salt-section-shell mt-5 rounded-[1.45rem] p-3 sm:mt-6 sm:rounded-[1.7rem] sm:p-4 lg:p-5">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-5 xl:grid-cols-6 xl:gap-6">
                    {visibleProducts.map((product) => (
                      <Reveal key={product.id} delayMs={0} className="salt-reveal-instant h-full w-full">
                        <ProductCard
                          product={product}
                          variant="shop"
                        />
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
                      <Link to="/pages/contact-us" className="salt-outline-chip h-9 px-3.5 py-0 text-[0.62rem]">
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
