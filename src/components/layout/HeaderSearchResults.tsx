import { useDeferredValue, useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { conciseTitle, formatMoney, minPrice, productImage } from "@/lib/formatters";
import { useCollections } from "@/lib/collections-data";
import { useProductSearchIndex } from "@/lib/shopify-data";
import type { ShopifyProduct } from "@/types/shopify";

const DEFAULT_TRENDING_SEARCHES = ["Gifts", "Candles", "Kitchen", "Pet accessories", "Home decor"];

type HeaderSearchResultsProps = {
  query: string;
  recentSearches: string[];
  onClose: () => void;
  onSearchAll: () => void;
  onQuickSearch: (query: string) => void;
};

function normalizeSearchPhrase(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreQuickSearchProduct(
  product: ShopifyProduct,
  normalizedQuery: string,
  queryTokens: string[],
): number {
  const title = normalizeSearchPhrase(product.title);
  const type = normalizeSearchPhrase(product.product_type || "");
  const tags = Array.isArray(product.tags)
    ? normalizeSearchPhrase(product.tags.join(" "))
    : normalizeSearchPhrase(String(product.tags || ""));
  const haystack = `${title} ${type} ${tags}`;

  if (!queryTokens.length || !haystack) {
    return 0;
  }

  const matchedTokens = queryTokens.filter((token) => haystack.includes(token)).length;
  if (matchedTokens !== queryTokens.length) {
    return 0;
  }

  let score = matchedTokens * 10;
  if (title === normalizedQuery) {
    score += 100;
  } else if (title.startsWith(normalizedQuery)) {
    score += 60;
  } else if (title.includes(normalizedQuery)) {
    score += 35;
  }

  if (type.includes(normalizedQuery)) {
    score += 15;
  }

  return score;
}

const HeaderSearchResults = ({
  query,
  recentSearches,
  onClose,
  onSearchAll,
  onQuickSearch,
}: HeaderSearchResultsProps) => {
  // Keep the controlled header input on the urgent lane. Matching the full
  // catalog is intentionally deferred so typing never waits for 14k records
  // to be scanned and sorted on the main thread.
  const deferredQuery = useDeferredValue(query).trim();
  const { data: productsData } = useProductSearchIndex();
  const { data: collectionsData } = useCollections();
  const allProducts = useMemo(() => productsData?.products ?? [], [productsData]);
  const allCollections = useMemo(() => collectionsData?.collections ?? [], [collectionsData]);
  const hasSearchQuery = Boolean(query.trim());
  const normalizedQuery = useMemo(() => normalizeSearchPhrase(deferredQuery), [deferredQuery]);
  const queryTokens = useMemo(() => normalizedQuery.split(/\s+/).filter(Boolean), [normalizedQuery]);
  const quickSearchRecords = useMemo(
    () =>
      allProducts.map((product) => ({
        product,
        title: normalizeSearchPhrase(product.title),
        type: normalizeSearchPhrase(product.product_type || ""),
        tags: Array.isArray(product.tags)
          ? normalizeSearchPhrase(product.tags.join(" "))
          : normalizeSearchPhrase(String(product.tags || "")),
      })),
    [allProducts],
  );
  const typeSuggestions = useMemo(() => {
    const counts = new Map<string, number>();

    allProducts.forEach((product) => {
      const label = String(product.product_type || "").trim();
      if (label) {
        counts.set(label, (counts.get(label) || 0) + 1);
      }
    });

    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 24)
      .map(([label]) => ({ label }));
  }, [allProducts]);

  const dropdownProducts = useMemo(() => {
    if (!allProducts.length) {
      return [];
    }

    if (!hasSearchQuery) {
      return allProducts.slice(0, 4);
    }

    return quickSearchRecords
      .map(({ product, title, type, tags }) => {
        const haystack = `${title} ${type} ${tags}`;
        const matchedTokens = queryTokens.filter((token) => haystack.includes(token)).length;
        if (matchedTokens !== queryTokens.length) {
          return null;
        }

        return {
          product,
          score: scoreQuickSearchProduct(product, normalizedQuery, queryTokens),
        };
      })
      .filter((entry): entry is { product: (typeof allProducts)[number]; score: number } => Boolean(entry?.score))
      .sort((left, right) => right.score - left.score)
      .slice(0, 6)
      .map(({ product }) => product);
  }, [allProducts, hasSearchQuery, normalizedQuery, queryTokens, quickSearchRecords]);

  const productSectionLabel = hasSearchQuery ? "Product matches" : "Product matches";
  const predictiveQuerySuggestions: Array<{ query: string; label: string }> = [];

  const trendingSearches = useMemo(() => {
    if (!allProducts.length) {
      return DEFAULT_TRENDING_SEARCHES;
    }

    const counts = new Map<string, number>();

    allProducts.forEach((product) => {
      const label = String(product.product_type || "").trim();
      if (!label) {
        return;
      }
      counts.set(label, (counts.get(label) || 0) + 1);
    });

    const topFromCatalog = [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([label]) => label)
      .slice(0, 5);
    const merged = [...topFromCatalog, ...DEFAULT_TRENDING_SEARCHES];

    return merged
      .filter((value, index) => merged.findIndex((entry) => entry.toLowerCase() === value.toLowerCase()) === index)
      .slice(0, 6);
  }, [allProducts]);

  const categorySuggestions = useMemo(() => {
    const suggestions: Array<{ label: string; to: string }> = [];
    const seen = new Set<string>();

    allCollections.forEach((collection) => {
      const label = String(collection.title || "").trim();
      const handle = String(collection.handle || "").trim();
      if (!label || !handle) {
        return;
      }

      if (normalizedQuery) {
        const searchable = normalizeSearchPhrase(`${collection.title} ${collection.handle}`);
        if (!searchable.includes(normalizedQuery)) {
          return;
        }
      }

      const key = `collection:${label.toLowerCase()}`;
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      suggestions.push({ label, to: `/collections/${handle}` });
    });

    typeSuggestions.forEach(({ label }) => {
      if (normalizedQuery && !normalizeSearchPhrase(label).includes(normalizedQuery)) {
        return;
      }

      const key = `type:${label.toLowerCase()}`;
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      suggestions.push({ label, to: `/shop?type=${encodeURIComponent(label)}` });
    });

    return suggestions.slice(0, 8);
  }, [allCollections, normalizedQuery, typeSuggestions]);

  const predictiveCategorySuggestions = categorySuggestions;

  const bestSellerCollection = useMemo(
    () =>
      allCollections.find((collection) =>
        /best[\s-]*sellers?/i.test(`${collection.handle} ${collection.title}`),
      ) || null,
    [allCollections],
  );

  const summerCollection = useMemo(
    () =>
      allCollections.find((collection) =>
        /(summer|sunny|vacation|beach)/i.test(`${collection.handle} ${collection.title}`),
      ) || null,
    [allCollections],
  );

  const popularRoutes = useMemo(
    () => [
      { label: "All Products", to: "/shop?collection=all-products" },
      {
        label: "Best Sellers",
        to: bestSellerCollection ? `/collections/${bestSellerCollection.handle}` : "/shop?sort=featured",
      },
      { label: "New Arrivals", to: "/shop?collection=new-arrivals" },
      {
        label: "Summer Collection",
        to: summerCollection ? `/collections/${summerCollection.handle}` : "/collections",
      },
    ],
    [bestSellerCollection, summerCollection],
  );

  const quickCategoryLinks = useMemo(() => categorySuggestions.slice(0, 3), [categorySuggestions]);
  const quickSearchTerms = useMemo(
    () => (recentSearches.length ? recentSearches : trendingSearches).slice(0, 3),
    [recentSearches, trendingSearches],
  );

  return (
    <div
      className="absolute left-0 right-0 top-[calc(100%+0.55rem)] z-[80]"
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="grid gap-2 rounded-[1.15rem] border border-border/70 bg-[linear-gradient(180deg,hsl(var(--background)/0.98),hsl(var(--card)/0.94))] p-2 shadow-[0_18px_36px_-24px_rgba(15,23,42,0.2)] lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)] backdrop-blur-xl">
        <section className="rounded-[0.95rem] border border-border/70 bg-background/95 p-2">
          <div className="flex items-center justify-between border-b border-border/70 pb-2">
            <div>
              <p className="text-[0.64rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                {productSectionLabel}
              </p>
              {hasSearchQuery ? (
                <p className="mt-1 text-[0.54rem] leading-5 text-muted-foreground">
                  Matching titles, product types, tags, boosts, and collection clues.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onSearchAll}
              className="text-[0.64rem] font-bold uppercase tracking-[0.16em] text-primary transition hover:text-foreground"
            >
              Search all
            </button>
          </div>

          <div className="mt-2 grid max-h-[22rem] grid-cols-1 gap-1.5 overflow-y-auto pr-1">
            {dropdownProducts.map((product) => {
              const image = productImage(product);
              const price = formatMoney(minPrice(product));

              return (
                <Link
                  key={product.id}
                  to={`/products/${product.handle}`}
                  onClick={onClose}
                  className="grid grid-cols-[2.8rem_minmax(0,1fr)_auto] items-start gap-2 rounded-[0.85rem] border border-border/70 bg-background/92 px-2.5 py-2 transition hover:border-primary/20 hover:bg-background"
                >
                  {image ? (
                    <img
                      src={image}
                      alt={product.title}
                      className="h-11 w-11 rounded-[0.8rem] object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="grid h-11 w-11 place-items-center rounded-[0.8rem] bg-muted/45 text-[0.44rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                      SALT
                    </div>
                  )}

                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">
                      {conciseTitle(product.title, 44)}
                    </p>
                  </div>

                  <div className="flex min-h-full flex-col items-end gap-1.5 text-right">
                    <p className="text-sm font-semibold leading-none text-foreground">{price}</p>
                  </div>
                </Link>
              );
            })}

            {hasSearchQuery && !dropdownProducts.length ? (
              <div className="rounded-[0.95rem] border border-dashed border-border/70 bg-background/92 px-3 py-4 text-sm text-muted-foreground">
                <p>No exact match yet. Try a category shortcut:</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(categorySuggestions.length ? categorySuggestions : popularRoutes).slice(0, 3).map((entry) => (
                    <Link
                      key={`${entry.label}-${entry.to}`}
                      to={entry.to}
                      onClick={onClose}
                      className="rounded-full border border-border/70 bg-muted/45 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-foreground transition hover:border-primary/20 hover:bg-background"
                    >
                      {entry.label}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-[0.95rem] border border-border/70 bg-background/95 p-2">
          {hasSearchQuery ? (
            <div className="rounded-[0.85rem] border border-border/70 bg-background/92 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="mt-2.5 text-[0.64rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Predictive paths
                </p>
                <p className="text-[0.52rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Query aware
                </p>
              </div>

              {predictiveQuerySuggestions.length ? (
                <div className="mt-2.5">
                  <p className="text-[0.52rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Search next
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {predictiveQuerySuggestions.map((suggestion) => (
                      <button
                        key={suggestion.query}
                        type="button"
                        onClick={() => onQuickSearch(suggestion.query)}
                        className="rounded-full border border-border/70 bg-muted/45 px-2 py-1 text-[0.56rem] font-bold uppercase tracking-[0.08em] text-foreground transition hover:border-primary/20 hover:bg-background"
                      >
                        {suggestion.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {predictiveCategorySuggestions.length ? (
                <div className="mt-2.5">
                  <p className="text-[0.52rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Jump to category
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {predictiveCategorySuggestions.map((entry) => (
                      <Link
                        key={`${entry.label}-${entry.to}`}
                        to={entry.to}
                        onClick={onClose}
                        className="rounded-full border border-border/70 bg-muted/45 px-2 py-1 text-[0.56rem] font-bold uppercase tracking-[0.08em] text-foreground transition hover:border-primary/20 hover:bg-background"
                      >
                        {entry.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-[0.85rem] border border-border/70 bg-background/92 p-2.5">
            <p className="text-[0.64rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">Popular routes</p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
              {popularRoutes.map((route) => (
                <Link
                  key={route.label}
                  to={route.to}
                  onClick={onClose}
                  className="inline-flex items-center justify-between rounded-[0.75rem] border border-transparent bg-background px-2.5 py-2 text-sm font-medium text-foreground transition hover:border-primary/20 hover:bg-muted/40"
                >
                  <span>{route.label}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-2 rounded-[0.85rem] border border-border/70 bg-background/92 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[0.64rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">Quick picks</p>
              <p className="text-[0.52rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {recentSearches.length ? "Recent first" : "Trending first"}
              </p>
            </div>

            {quickCategoryLinks.length ? (
              <div className="mt-2.5">
                <p className="text-[0.52rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Categories</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {quickCategoryLinks.map((entry) => (
                    <Link
                      key={`${entry.label}-${entry.to}`}
                      to={entry.to}
                      onClick={onClose}
                      className="rounded-full border border-border/70 bg-muted/45 px-2 py-1 text-[0.56rem] font-bold uppercase tracking-[0.08em] text-foreground transition hover:border-primary/20 hover:bg-background"
                    >
                      {entry.label}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            <div className={quickCategoryLinks.length ? "mt-2.5" : "mt-3"}>
              <p className="text-[0.52rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {recentSearches.length ? "Recent searches" : "Trending searches"}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {quickSearchTerms.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => onQuickSearch(term)}
                    className="rounded-full border border-border/70 bg-muted/45 px-2 py-1 text-[0.56rem] font-bold uppercase tracking-[0.08em] text-foreground transition hover:border-primary/20 hover:bg-background"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default HeaderSearchResults;
