import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  Gift,
  Grid2X2,
  Home,
  Search,
  Shirt,
  SlidersHorizontal,
  Sparkles,
  Stethoscope,
  UtensilsCrossed,
  X,
} from "lucide-react";
import InnerBreadcrumbs from "@/components/storefront/InnerBreadcrumbs";
import CollectionCard from "@/components/storefront/CollectionCard";
import Reveal from "@/components/storefront/Reveal";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { normalizeShopifyAssetUrl } from "@/lib/theme-assets";
import { useCollections } from "@/lib/shopify-data";
import type { ShopifyCollection } from "@/types/shopify";

type CollectionThemeId = "all" | "featured" | "fashion" | "home" | "kitchen" | "wellness" | "gifts";
type BaseCollectionTheme = Exclude<CollectionThemeId, "all" | "featured">;
type CollectionSort = "featured" | "popular" | "alphabetical" | "newest";
type CollectionSize = "all" | "small" | "medium" | "large" | "flagship";

type ThemeConfig = {
  id: CollectionThemeId;
  label: string;
  description: string;
  Icon: LucideIcon;
  keywords: string[];
};

type DecoratedCollection = ShopifyCollection & {
  imageSrc: string | null;
  isFeatured: boolean;
  searchText: string;
  theme: BaseCollectionTheme;
};

const themeConfigs: ThemeConfig[] = [
  {
    id: "all",
    label: "All collections",
    description:
      "Browse the full SALT collection index with the same structured, filter-led rhythm used on the shop page.",
    Icon: Grid2X2,
    keywords: [],
  },
  {
    id: "featured",
    label: "Featured",
    description:
      "Jump straight into the highest-traffic, storefront-driving collections and campaign routes.",
    Icon: Sparkles,
    keywords: ["best", "arrival", "summer", "all products"],
  },
  {
    id: "fashion",
    label: "Fashion",
    description:
      "Apparel-led collections for dresses, layers, tops, trousers, and wearable seasonal edits.",
    Icon: Shirt,
    keywords: ["women", "men", "dress", "jeans", "shirt", "trouser", "robe", "wear", "kaftan", "coat", "jacket", "thermal"],
  },
  {
    id: "home",
    label: "Home & decor",
    description:
      "Warm home collections spanning decor, candles, lamps, paintings, wall accents, and planters.",
    Icon: Home,
    keywords: ["home", "decor", "candle", "lamp", "painting", "clock", "aquarium", "planter", "bell"],
  },
  {
    id: "kitchen",
    label: "Kitchen & utility",
    description:
      "Cookware, practical kitchen helpers, everyday tools, and utility-focused household collections.",
    Icon: UtensilsCrossed,
    keywords: ["cook", "kitchen", "tool", "jar", "opener"],
  },
  {
    id: "wellness",
    label: "Wellness & care",
    description:
      "Personal care, support products, gloves, medical accessories, and practical daily-assist items.",
    Icon: Stethoscope,
    keywords: ["care", "medical", "mask", "glove", "walking", "magnifying", "bib"],
  },
  {
    id: "gifts",
    label: "Gifts & extras",
    description:
      "Giftable finds, pets, accessories, toys, unique edits, and collections that broaden discovery.",
    Icon: Gift,
    keywords: ["gifts", "pet", "bag", "hair", "unique", "toy", "digital"],
  },
];

const sortOptions: Array<{ value: CollectionSort; label: string }> = [
  { value: "featured", label: "Featured" },
  { value: "popular", label: "Most items" },
  { value: "alphabetical", label: "Alphabetical" },
  { value: "newest", label: "Recently updated" },
];

const sizeOptions: Array<{
  value: CollectionSize;
  label: string;
  min: number | null;
  max: number | null;
}> = [
  { value: "all", label: "Any size", min: null, max: null },
  { value: "small", label: "Under 10 items", min: null, max: 9 },
  { value: "medium", label: "10 to 49 items", min: 10, max: 49 },
  { value: "large", label: "50 to 149 items", min: 50, max: 149 },
  { value: "flagship", label: "150+ items", min: 150, max: null },
];

const PAGE_SIZE = 12;
const LEGACY_PLANNER_BANNER_IMAGE =
  "https://cdn.shopify.com/s/files/1/0580/7659/4275/files/7.png?v=1772179925";
const DEFAULT_COLLECTION_GRID_HANDLES = [
  "garden-tools",
  "cookware",
  "home-decor",
  "personal-care",
  "shopping-bags-jute-bags",
  "pet-assocerries",
  "unique-products",
  "trousers",
  "candles",
  "medical-accessories",
  "women-wear",
  "men-collection",
] as const;

function asPositiveInt(input: string | null, fallback: number): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function normalizeHandle(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeSearchText(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeThemeFilter(value: string | null): CollectionThemeId {
  const normalized = normalizeHandle(value);
  return themeConfigs.some((theme) => theme.id === normalized)
    ? (normalized as CollectionThemeId)
    : "all";
}

function normalizeSort(value: string | null): CollectionSort {
  const normalized = normalizeHandle(value);
  return sortOptions.some((option) => option.value === normalized)
    ? (normalized as CollectionSort)
    : "featured";
}

function normalizeSize(value: string | null): CollectionSize {
  const normalized = normalizeHandle(value);
  return sizeOptions.some((option) => option.value === normalized)
    ? (normalized as CollectionSize)
    : "all";
}

function isBestSellerCollection(handle: string, title: string): boolean {
  return /best[\s-]*sellers?/.test(`${normalizeHandle(handle)} ${normalizeHandle(title)}`);
}

function isNewArrivalCollection(handle: string, title: string): boolean {
  return /new[\s-]*arrivals?/.test(`${normalizeHandle(handle)} ${normalizeHandle(title)}`);
}

function isSummerCollection(handle: string, title: string): boolean {
  return /(summer|sunny|vacation|beach)/.test(`${normalizeHandle(handle)} ${normalizeHandle(title)}`);
}

function getCollectionTheme(collection: ShopifyCollection): BaseCollectionTheme {
  const searchText = normalizeSearchText(`${collection.title} ${collection.handle} ${collection.description}`);

  if (themeConfigs.find((theme) => theme.id === "gifts")?.keywords.some((keyword) => searchText.includes(keyword))) {
    return "gifts";
  }
  if (themeConfigs.find((theme) => theme.id === "fashion")?.keywords.some((keyword) => searchText.includes(keyword))) {
    return "fashion";
  }

  if (themeConfigs.find((theme) => theme.id === "home")?.keywords.some((keyword) => searchText.includes(keyword))) {
    return "home";
  }

  if (themeConfigs.find((theme) => theme.id === "kitchen")?.keywords.some((keyword) => searchText.includes(keyword))) {
    return "kitchen";
  }

  if (themeConfigs.find((theme) => theme.id === "wellness")?.keywords.some((keyword) => searchText.includes(keyword))) {
    return "wellness";
  }
}

function formatCollectionDescription(input?: string | null): string {
  const source = String(input || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!source) {
    return "Browse collections with a cleaner, filter-led layout that mirrors the product catalog experience and gets shoppers into the right aisle faster.";
  }

  if (source.length <= 170) {
    return source;
  }

  return `${source.slice(0, 167).trimEnd()}...`;
}

const CollectionsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [desktopFiltersVisible, setDesktopFiltersVisible] = useState(false);
  const [searchInput, setSearchInput] = useState(searchParams.get("q") || "");
  const themeFilter = normalizeThemeFilter(searchParams.get("theme"));
  const sort = normalizeSort(searchParams.get("sort"));
  const sizeFilter = normalizeSize(searchParams.get("size"));
  const page = asPositiveInt(searchParams.get("page"), 1);
  const query = searchParams.get("q") || "";

  const { data, isLoading, error, refetch } = useCollections();

  useEffect(() => {
    setSearchInput(query);
  }, [query]);

  const rawCollections = useMemo(() => data?.collections ?? [], [data?.collections]);

  const allProductsCollection = useMemo(
    () => rawCollections.find((collection) => normalizeHandle(collection.handle) === "all-products") || null,
    [rawCollections],
  );

  const collections = useMemo<DecoratedCollection[]>(
    () =>
      rawCollections
        .filter(
          (collection) =>
            collection.products_count > 0 && normalizeHandle(collection.handle) !== "all-products",
        )
        .map((collection) => ({
          ...collection,
          imageSrc: normalizeShopifyAssetUrl(collection.image?.src),
          isFeatured:
            isBestSellerCollection(collection.handle, collection.title) ||
            isNewArrivalCollection(collection.handle, collection.title) ||
            isSummerCollection(collection.handle, collection.title),
          searchText: normalizeSearchText(
            `${collection.title} ${collection.handle} ${collection.description}`,
          ),
          theme: getCollectionTheme(collection),
        })),
    [rawCollections],
  );

  const themeCounts = useMemo<Record<CollectionThemeId, number>>(
    () =>
      collections.reduce(
        (accumulator, collection) => {
          accumulator.all += 1;
          accumulator[collection.theme] += 1;
          if (collection.isFeatured) {
            accumulator.featured += 1;
          }
          return accumulator;
        },
        {
          all: 0,
          featured: 0,
          fashion: 0,
          home: 0,
          kitchen: 0,
          wellness: 0,
          gifts: 0,
        },
      ),
    [collections],
  );

  const highlightedCollections = useMemo(() => {
    const manual = [
      collections.find((collection) => isBestSellerCollection(collection.handle, collection.title)),
      collections.find((collection) => isNewArrivalCollection(collection.handle, collection.title)),
      collections.find((collection) => isSummerCollection(collection.handle, collection.title)),
      ...collections,
    ].filter((collection): collection is DecoratedCollection => Boolean(collection));

    const seen = new Set<number>();
    return manual.filter((collection) => {
      if (seen.has(collection.id)) {
        return false;
      }
      seen.add(collection.id);
      return true;
    });
  }, [collections]);

  const popularRoutes = useMemo(
    () => [
      {
        label: "All products",
        meta: `${(
          allProductsCollection?.products_count ||
          collections.reduce((sum, collection) => sum + collection.products_count, 0)
        ).toLocaleString()} items`,
        to: "/shop",
      },
      {
        label: highlightedCollections[0]?.title || "Best Sellers",
        meta: `${(highlightedCollections[0]?.products_count || 0).toLocaleString()} items`,
        to: highlightedCollections[0]
          ? `/shop?collection=${highlightedCollections[0].handle}`
          : "/shop?sort=featured",
      },
      {
        label: highlightedCollections[1]?.title || "New Arrivals",
        meta: `${(highlightedCollections[1]?.products_count || 0).toLocaleString()} items`,
        to: highlightedCollections[1]
          ? `/shop?collection=${highlightedCollections[1].handle}`
          : "/shop?sort=newest",
      },
      {
        label: highlightedCollections[2]?.title || "Summer Collection",
        meta: `${(highlightedCollections[2]?.products_count || 0).toLocaleString()} items`,
        to: highlightedCollections[2]
          ? `/shop?collection=${highlightedCollections[2].handle}`
          : "/collections",
      },
    ],
    [allProductsCollection, collections, highlightedCollections],
  );

  const filteredCollections = useMemo(() => {
    const queryTokens = normalizeSearchText(query).split(" ").filter(Boolean);
    const sizeOption = sizeOptions.find((option) => option.value === sizeFilter) || sizeOptions[0];

    const next = collections.filter((collection) => {
      if (themeFilter === "featured" && !collection.isFeatured) {
        return false;
      }

      if (themeFilter !== "all" && themeFilter !== "featured" && collection.theme !== themeFilter) {
        return false;
      }

      if (sizeOption.min != null && collection.products_count < sizeOption.min) {
        return false;
      }

      if (sizeOption.max != null && collection.products_count > sizeOption.max) {
        return false;
      }

      if (queryTokens.length && !queryTokens.every((token) => collection.searchText.includes(token))) {
        return false;
      }

      return true;
    });

    if (sort === "popular") {
      return next.sort((left, right) => right.products_count - left.products_count);
    }

    if (sort === "alphabetical") {
      return next.sort((left, right) => left.title.localeCompare(right.title));
    }

    if (sort === "newest") {
      return next.sort(
        (left, right) =>
          new Date(right.updated_at || right.published_at).getTime() -
          new Date(left.updated_at || left.published_at).getTime(),
      );
    }

    return next.sort((left, right) => {
      if (left.isFeatured !== right.isFeatured) {
        return left.isFeatured ? -1 : 1;
      }

      if (right.products_count !== left.products_count) {
        return right.products_count - left.products_count;
      }

      return left.title.localeCompare(right.title);
    });
  }, [collections, query, sizeFilter, sort, themeFilter]);

  const totalResults = filteredCollections.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalResults);
  const visibleCollections = filteredCollections.slice(startIndex, endIndex);
  const filteredProductTotal = filteredCollections.reduce(
    (sum, collection) => sum + collection.products_count,
    0,
  );
  const pageProgressPercent = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
  const selectedTheme = themeConfigs.find((theme) => theme.id === themeFilter) || themeConfigs[0];
  const previewCollection =
    visibleCollections[0] || filteredCollections[0] || highlightedCollections[0] || null;
  const sortLabel = sortOptions.find((option) => option.value === sort)?.label || "Featured";

  if (isLoading) {
    return (
      <LoadingState
        title="Loading collections"
        subtitle="Building a cleaner collection browse with the latest live catalog data."
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Unable to load collections"
        subtitle="Retry to refresh live Shopify collection data."
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

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateParams({ q: searchInput.trim() || null }, true);
  };

  const clearFilters = () => {
    setSearchInput("");
    setMobileFiltersOpen(false);
    setSearchParams(new URLSearchParams());
  };

  const onPageChange = (nextPage: number) => {
    const clamped = Math.max(1, Math.min(totalPages, nextPage));
    updateParams({ page: clamped <= 1 ? null : String(clamped) });
  };

  const filterChips = [
    themeFilter !== "all"
      ? {
          key: "theme",
          label: `Theme: ${selectedTheme.label}`,
          onRemove: () => updateParams({ theme: null }, true),
        }
      : null,
    sizeFilter !== "all"
      ? {
          key: "size",
          label: `Size: ${sizeOptions.find((option) => option.value === sizeFilter)?.label || "Any size"}`,
          onRemove: () => updateParams({ size: null }, true),
        }
      : null,
    sort !== "featured"
      ? {
          key: "sort",
          label: `Sort: ${sortLabel}`,
          onRemove: () => updateParams({ sort: null }, true),
        }
      : null,
    query.trim()
      ? {
          key: "q",
          label: `Search: ${query.trim()}`,
          onRemove: () => {
            setSearchInput("");
            updateParams({ q: null }, true);
          },
        }
      : null,
  ].filter(
    (
      chip,
    ): chip is {
      key: string;
      label: string;
      onRemove: () => void;
    } => Boolean(chip),
  );

  const hasActiveFilters = filterChips.length > 0;
  const desktopToolbarChips = filterChips.slice(0, 3);
  const hiddenDesktopChipCount = Math.max(0, filterChips.length - desktopToolbarChips.length);
  const leadCollection = highlightedCollections[0] || previewCollection;
  const spotlightImageSrc =
    leadCollection && isBestSellerCollection(leadCollection.handle, leadCollection.title)
      ? LEGACY_PLANNER_BANNER_IMAGE
      : leadCollection?.imageSrc || null;
  const supportCollections = highlightedCollections.filter(
    (collection) => !leadCollection || collection.id !== leadCollection.id,
  );
  const displayCollections = useMemo(() => {
    const shouldUseCuratedDefaultGrid =
      !query.trim() &&
      themeFilter === "all" &&
      sizeFilter === "all" &&
      sort === "featured" &&
      currentPage === 1;

    if (!shouldUseCuratedDefaultGrid) {
      return visibleCollections;
    }

    const byHandle = new Map(
      filteredCollections.map((collection) => [normalizeHandle(collection.handle), collection]),
    );
    const curated = DEFAULT_COLLECTION_GRID_HANDLES.map((handle) => byHandle.get(handle)).filter(
      (collection): collection is DecoratedCollection => Boolean(collection),
    );
    const seen = new Set(curated.map((collection) => collection.id));
    const fallback = filteredCollections.filter((collection) => !seen.has(collection.id));

    return [...curated, ...fallback].slice(0, PAGE_SIZE);
  }, [currentPage, filteredCollections, query, sizeFilter, sort, themeFilter, visibleCollections]);

  const sidebarFilterPanelContent = (
    <div className="mt-2 grid gap-2">
      <form onSubmit={submitSearch} className="grid gap-1.5">
        <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Search collections
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by title"
            className="salt-filter-field salt-filter-field-compact pl-9"
            aria-label="Search collections"
          />
        </div>
        <button
          type="submit"
          className="salt-editorial-action h-8 px-3 text-[0.62rem]"
        >
          Apply search
        </button>
      </form>

      <div className="grid gap-1">
        <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Theme
        </p>
        <select
          aria-label="Collection theme"
          value={themeFilter}
          onChange={(event) =>
            updateParams({ theme: event.target.value === "all" ? null : event.target.value }, true)
          }
          className="salt-filter-field salt-filter-field-compact"
        >
          {themeConfigs.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1">
        <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Collection size
        </p>
        <select
          aria-label="Collection size"
          value={sizeFilter}
          onChange={(event) =>
            updateParams({ size: event.target.value === "all" ? null : event.target.value }, true)
          }
          className="salt-filter-field salt-filter-field-compact"
        >
          {sizeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1">
        <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Sort by
        </p>
        <select
          aria-label="Sort collections"
          value={sort}
          onChange={(event) =>
            updateParams({ sort: event.target.value === "featured" ? null : event.target.value }, true)
          }
          className="salt-filter-field salt-filter-field-compact"
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1.5 border-t border-border/70 pt-2.5">
        <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Popular routes
        </p>
        <div className="grid gap-1.5">
          {popularRoutes.map((route) => (
            <Link key={route.label} to={route.to} className="salt-search-hit">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-[0.76rem] font-semibold text-foreground">
                  {route.label}
                </p>
                <p className="mt-0.5 text-[0.58rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  {route.meta}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );

  const mobileFilterPanelContent = (
    <div className="mt-2 grid gap-2">
      <form onSubmit={submitSearch} className="grid gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search collections"
            className="salt-filter-field salt-filter-field-compact pl-9"
            aria-label="Search collections"
          />
        </div>
      </form>

      <div className="salt-filter-grid sm:grid-cols-3">
        <select
          aria-label="Collection theme"
          value={themeFilter}
          onChange={(event) =>
            updateParams({ theme: event.target.value === "all" ? null : event.target.value }, true)
          }
          className="salt-filter-field salt-filter-field-compact"
        >
          {themeConfigs.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Collection size"
          value={sizeFilter}
          onChange={(event) =>
            updateParams({ size: event.target.value === "all" ? null : event.target.value }, true)
          }
          className="salt-filter-field salt-filter-field-compact"
        >
          {sizeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Sort collections"
          value={sort}
          onChange={(event) =>
            updateParams({ sort: event.target.value === "featured" ? null : event.target.value }, true)
          }
          className="salt-filter-field salt-filter-field-compact"
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  return (
    <section className="mt-4 w-full px-3 pb-8 sm:mt-6 sm:px-4 lg:px-5 xl:px-6">
      <Reveal>
        <InnerBreadcrumbs
          items={[
            { label: "Home", to: "/" },
            { label: "Collections" },
          ]}
        />
      </Reveal>

      <Reveal>
        <div className="salt-editorial-shell relative mt-3 overflow-hidden rounded-[1.35rem] p-4 sm:rounded-[1.7rem] sm:p-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_18%,rgba(46,109,255,0.1),transparent_28%),radial-gradient(circle_at_88%_16%,rgba(244,190,48,0.12),transparent_30%),linear-gradient(165deg,rgba(249,252,255,0.98),rgba(241,247,255,0.92))]" />

          <div className="relative">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start lg:gap-6">
              <div className="max-w-3xl">
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[#2b63ca]">
                  Collection directory
                </p>
                <h1 className="mt-3 font-display text-[clamp(2.15rem,4.8vw,3.5rem)] leading-[0.98] tracking-[-0.04em] text-[#173a74]">
                  {query.trim()
                    ? `Collection results for "${query.trim()}"`
                    : themeFilter === "all"
                      ? "Browse collections"
                      : `Explore ${selectedTheme.label}`}
                </h1>
                {query.trim() || themeFilter !== "all" ? (
                  <p className="mt-3 max-w-2xl text-[0.96rem] leading-7 text-[#56719d]">
                    {query.trim()
                      ? "Search collection names and browse with the same structured filtering and merchandising logic used across the shop catalog."
                      : formatCollectionDescription(previewCollection?.description) || selectedTheme.description}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#60789f]">
                  <span>US shipping included</span>
                  <span className="h-1 w-1 rounded-full bg-[#9db7e4]" />
                  <span>Secure checkout</span>
                  <span className="h-1 w-1 rounded-full bg-[#9db7e4]" />
                  <span>Structured browsing</span>
                </div>
              </div>

                          </div>

            <div className="mt-6 rounded-[1.15rem] border border-[#d6e4ff] bg-white/78 p-2 shadow-[0_14px_28px_-26px_rgba(28,75,150,0.24)]">
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
                {themeConfigs.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => updateParams({ theme: theme.id === "all" ? null : theme.id }, true)}
                    className={
                      theme.id === themeFilter
                        ? "inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-[#1f63d8] px-3.5 text-[0.78rem] font-semibold text-white shadow-[0_14px_28px_-22px_rgba(31,99,216,0.55)]"
                        : "inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-[0.78rem] font-medium text-[#355c98] transition hover:bg-[#edf4ff] hover:text-[#1d4d9d]"
                    }
                  >
                    {theme.label}
                    <span
                      className={
                        theme.id === themeFilter
                          ? "rounded-full bg-white/18 px-1.5 py-0.5 text-[0.62rem] leading-none text-white"
                          : "rounded-full bg-[#e7f0ff] px-1.5 py-0.5 text-[0.62rem] leading-none text-[#4d70a9]"
                      }
                    >
                      {themeCounts[theme.id].toLocaleString()}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      {!hasActiveFilters && leadCollection ? (
        <Reveal delayMs={70}>
          <div className="salt-section-shell mt-4 rounded-[1.35rem] p-2.5 sm:mt-5 sm:rounded-[1.6rem] sm:p-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.22fr)_minmax(260px,0.78fr)] lg:items-stretch">
              <CollectionCard
                collection={leadCollection}
                variant="hero"
                imageSrc={spotlightImageSrc}
                editorialContent={{
                  kicker: "Collection spotlight",
                  headline: leadCollection.title,
                  primaryAction: {
                    to: `/shop?collection=${leadCollection.handle}`,
                    label: "Open collection",
                  },
                  secondaryAction: {
                    to: "/shop",
                    label: "View all products",
                  },
                }}
              />

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {supportCollections.slice(0, 3).map((collection) => (
                  <Link
                    key={collection.id}
                    to={`/shop?collection=${collection.handle}`}
                    className="salt-search-hit min-h-[84px] rounded-[0.95rem] px-3 py-2.5"
                  >
                    {collection.imageSrc ? (
                      <img
                        src={collection.imageSrc}
                        alt={collection.title}
                        className="h-12 w-12 rounded-[0.8rem] object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="grid h-12 w-12 place-items-center rounded-[0.8rem] bg-muted text-[0.46rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                        SALT
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[0.86rem] font-semibold leading-5 text-foreground">
                        {collection.title}
                      </p>
                      <p className="mt-1 text-[0.56rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        {collection.products_count.toLocaleString()} items
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      ) : null}

      <div
        className={
          desktopFiltersVisible
            ? "mt-4 grid gap-4 lg:grid-cols-[252px_minmax(0,1fr)] lg:items-start"
            : "mt-4 grid gap-4 lg:grid-cols-1"
        }
      >
        {desktopFiltersVisible ? (
          <Reveal delayMs={70} className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
            <aside
              id="desktop-collection-filters"
              className="salt-filter-shell salt-filter-shell-compact rounded-[1.05rem] p-2 sm:p-2.5 lg:flex lg:min-h-[calc(100vh-8rem)] lg:flex-col"
            >
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
                  <button
                    key={chip.key}
                    type="button"
                    onClick={chip.onRemove}
                    className="salt-applied-chip"
                    aria-label={`Remove ${chip.label}`}
                  >
                    <span>{chip.label}</span>
                    <X className="h-3.5 w-3.5" />
                  </button>
                ))}
                {filterChips.length ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="salt-editorial-action h-8 px-3 text-[0.62rem]"
                  >
                    Clear all filters
                  </button>
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
                  {totalResults.toLocaleString()} collections
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/75 bg-background px-1.5 py-[0.2rem] text-[0.52rem] font-bold uppercase tracking-[0.07em] leading-none text-muted-foreground">
                    <ArrowDownUp className="h-2.5 w-2.5" /> {sortLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDesktopFiltersVisible((current) => !current)}
                    className="inline-flex h-8 items-center gap-1 rounded-full border border-[#15479a] bg-[linear-gradient(135deg,#2b67db_0%,#1f58c8_48%,#1749a7_100%)] px-2.5 text-[0.58rem] font-bold uppercase tracking-[0.08em] text-white shadow-[0_12px_22px_-18px_rgba(21,71,154,0.62)] transition hover:-translate-y-[1px] hover:brightness-105 hover:shadow-[0_16px_26px_-20px_rgba(21,71,154,0.7)]"
                    aria-controls="desktop-collection-filters"
                    aria-expanded={desktopFiltersVisible}
                  >
                    <SlidersHorizontal className="h-2.5 w-2.5" />
                    {desktopFiltersVisible ? "Hide filters" : "Show filters"}
                  </button>
                </div>
              </div>

              <div className="mt-1 flex flex-wrap gap-1">
                {desktopToolbarChips.map((chip) => (
                  <button
                    key={`toolbar-${chip.key}`}
                    type="button"
                    onClick={chip.onRemove}
                    className="salt-applied-chip"
                    aria-label={`Remove ${chip.label}`}
                  >
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
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="salt-editorial-action h-8 px-3 text-[0.62rem]"
                  >
                    Clear all filters
                  </button>
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
                aria-controls="mobile-collection-filters"
              >
                <span className="inline-flex items-center gap-2">
                  <SlidersHorizontal className="h-3.5 w-3.5" /> Filter and sort
                </span>
              </button>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {filterChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={chip.onRemove}
                    className="salt-applied-chip"
                    aria-label={`Remove ${chip.label}`}
                  >
                    <span>{chip.label}</span>
                    <X className="h-3.5 w-3.5" />
                  </button>
                ))}
                {filterChips.length ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="salt-editorial-action h-8 px-3 text-[0.62rem]"
                  >
                    Clear all filters
                  </button>
                ) : null}
              </div>

              {mobileFiltersOpen ? (
                <aside id="mobile-collection-filters" className="mt-3 border-t border-border/70 pt-3">
                  <div className="salt-quiet-scroll max-h-[70vh] overflow-y-auto pr-1">
                    {mobileFilterPanelContent}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      updateParams({ q: searchInput.trim() || null }, true);
                      setMobileFiltersOpen(false);
                    }}
                    className="salt-primary-cta mt-3 h-10 w-full justify-center text-[0.64rem] font-bold uppercase tracking-[0.08em]"
                  >
                    View {totalResults.toLocaleString()} collections
                  </button>
                </aside>
              ) : null}
            </div>
          </Reveal>

          {totalResults === 0 ? (
            <Reveal delayMs={90} className="mt-6">
              <div className="salt-editorial-shell rounded-[2rem] p-6 text-center sm:p-8">
                <p className="salt-kicker">No matching collections</p>
                <h2 className="mt-3 font-display text-[clamp(1.9rem,3vw,2.8rem)]">
                  No collections match this browse setup
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                  Try a broader theme, remove a size filter, or open the full catalog to browse products directly.
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
                    to="/shop"
                    className="salt-outline-chip h-10 w-full px-5 py-0 text-xs sm:w-auto"
                  >
                    Browse all products
                  </Link>
                </div>
              </div>
            </Reveal>
          ) : (
            <>
              <div className="mt-5 grid grid-cols-1 gap-3.5 min-[430px]:grid-cols-2 sm:mt-6 sm:gap-8 lg:grid-cols-4 lg:gap-9">
                {displayCollections.map((collection, index) => (
                  <Reveal key={collection.id} delayMs={index * 35} className="h-full">
                    <CollectionCard collection={collection} />
                  </Reveal>
                ))}
              </div>

              <Reveal delayMs={180} className="mt-7">
                <div className="salt-glass-rail rounded-[1rem] p-2.5 sm:p-3">
                  <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="w-full max-w-md">
                      <div className="flex flex-wrap items-center gap-1 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        <span>Page {currentPage} of {totalPages}</span>
                        <span className="text-border">|</span>
                        <span>
                          Showing {totalResults === 0 ? 0 : startIndex + 1}-{endIndex} of {totalResults}
                        </span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-border/70">
                        <span
                          className="block h-full rounded-full bg-primary transition-[width] duration-500"
                          style={{ width: `${pageProgressPercent}%` }}
                        />
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
                      <p className="text-[0.64rem] font-bold uppercase tracking-[0.12em] text-primary">
                        Prefer product-first browsing?
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Open the full catalog or search by product type after you choose a collection direction.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        to="/shop"
                        className="salt-primary-cta h-9 px-3.5 text-[0.62rem] font-bold uppercase tracking-[0.08em]"
                      >
                        Browse products
                      </Link>
                      <Link
                        to="/shop?sort=newest"
                        className="salt-outline-chip h-9 px-3.5 py-0 text-[0.62rem]"
                      >
                        Shop newest
                      </Link>
                      <Link
                        to="/contact"
                        className="salt-outline-chip h-9 px-3.5 py-0 text-[0.62rem]"
                      >
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

export default CollectionsPage;

