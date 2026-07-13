import { useDeferredValue, useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { filterProducts } from "@/lib/catalog";
import { conciseTitle, formatMoney, minPrice, productImage } from "@/lib/formatters";
import { useCollections } from "@/lib/collections-data";
import { useProductSearchIndex } from "@/lib/shopify-data";

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

function approximateSearchScore(haystack: string, queryTokens: string[]): number {
  if (!haystack || !queryTokens.length) {
    return 0;
  }

  const words = haystack.split(" ").filter(Boolean);
  let score = 0;

  queryTokens.forEach((token) => {
    if (!token) {
      return;
    }

    if (haystack.includes(token)) {
      score += 5;
      return;
    }

    const prefix = token.length > 3 ? token.slice(0, token.length - 1) : token;
    if (words.some((word) => word.startsWith(prefix))) {
      score += 3;
      return;
    }

    const compact = token.replace(/[aeiou]/g, "");
    if (compact && words.some((word) => word.includes(compact))) {
      score += 1;
    }
  });

  return score;
}

const HeaderSearchResults = ({
  query,
  recentSearches,
  onClose,
  onSearchAll,
  onQuickSearch,
}: HeaderSearchResultsProps) => {
  const deferredQuery = useDeferredValue(query).trim();
  const { data: productsData } = useProductSearchIndex();
  const { data: collectionsData } = useCollections();
  const allProducts = useMemo(() => productsData?.products ?? [], [productsData]);
  const allCollections = useMemo(() => collectionsData?.collections ?? [], [collectionsData]);
  const hasSearchQuery = Boolean(query.trim());

  const dropdownProducts = useMemo(() => {
    if (!allProducts.length) {
      return [];
    }

    if (!hasSearchQuery) {
      return allProducts.slice(0, 4);
    }

    const strictMatches = filterProducts(allProducts, { query: deferredQuery }).slice(0, 4);
    if (strictMatches.length > 0) {
      return strictMatches;
    }

    const normalizedQuery = normalizeSearchPhrase(deferredQuery);
    const queryTokens = normalizedQuery.split(" ").filter(Boolean);
    if (!queryTokens.length) {
      return [];
    }

    return allProducts
      .map((product) => {
        const tags = Array.isArray(product.tags) ? product.tags.join(" ") : String(product.tags || "");
        const searchable = normalizeSearchPhrase(`${product.title} ${product.product_type || ""} ${tags}`);
        const score = approximateSearchScore(searchable, queryTokens);
        return score > 0 ? { product, score } : null;
      })
      .filter((entry): entry is { product: (typeof allProducts)[number]; score: number } => Boolean(entry))
      .sort((left, right) => right.score - left.score || minPrice(left.product) - minPrice(right.product))
      .slice(0, 4)
      .map((entry) => entry.product);
  }, [allProducts, deferredQuery, hasSearchQuery]);

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
    const normalizedQuery = normalizeSearchPhrase(deferredQuery);
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

    const typeCounts = new Map<string, number>();
    allProducts.forEach((product) => {
      const label = String(product.product_type || "").trim();
      if (!label) {
        return;
      }
      typeCounts.set(label, (typeCounts.get(label) || 0) + 1);
    });

    [...typeCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .forEach(([label]) => {
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
  }, [allCollections, allProducts, deferredQuery]);

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
      <div className="grid gap-2 rounded-[1.15rem] border border-[#cfdff2] bg-[#f7fbff] p-2 shadow-[0_18px_36px_-24px_rgba(12,32,72,0.3)] lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
        <section className="rounded-[0.95rem] border border-[#d8e6f5] bg-white p-2">
          <div className="flex items-center justify-between border-b border-[#e2edf8] pb-2">
            <p className="text-[0.64rem] font-bold uppercase tracking-[0.18em] text-[#5C748F]">
              Product matches
            </p>
            <button
              type="button"
              onClick={onSearchAll}
              className="text-[0.64rem] font-bold uppercase tracking-[0.16em] text-[#8a6110] transition hover:text-[#6f4d08]"
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
                  className="grid grid-cols-[2.8rem_minmax(0,1fr)_auto] items-start gap-2 rounded-[0.85rem] border border-[#e2edf8] bg-[#fbfdff] px-2.5 py-2 transition hover:border-[#bfd7f2] hover:bg-[#f5faff]"
                >
                  {image ? (
                    <img
                      src={image}
                      alt={product.title}
                      className="h-11 w-11 rounded-[0.8rem] object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="grid h-11 w-11 place-items-center rounded-[0.8rem] bg-[#ECF4FC] text-[0.44rem] font-bold uppercase tracking-[0.08em] text-[#5C748F]">
                      SALT
                    </div>
                  )}

                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-semibold leading-tight text-[#102A43]">
                      {conciseTitle(product.title, 44)}
                    </p>
                    <p className="mt-0.5 text-[0.58rem] font-bold uppercase tracking-[0.14em] text-[#5C748F]">
                      {product.product_type || "Curated pick"}
                    </p>
                  </div>

                  <div className="flex min-h-full flex-col items-end gap-1.5 text-right">
                    <p className="text-sm font-semibold leading-none text-[#0C2048]">{price}</p>
                    <span className="inline-flex items-center gap-0.5 text-[0.56rem] font-bold uppercase tracking-[0.12em] text-[#5C748F]">
                      View
                      <ChevronRight className="h-3 w-3" />
                    </span>
                  </div>
                </Link>
              );
            })}

            {hasSearchQuery && !dropdownProducts.length ? (
              <div className="rounded-[0.95rem] border border-dashed border-[#cfdff2] bg-[#fbfdff] px-3 py-4 text-sm text-[#5C748F]">
                <p>No direct match yet. Try a category shortcut:</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(categorySuggestions.length ? categorySuggestions : popularRoutes).slice(0, 3).map((entry) => (
                    <Link
                      key={`${entry.label}-${entry.to}`}
                      to={entry.to}
                      onClick={onClose}
                      className="rounded-full border border-[#BFD7F2] bg-[#ECF4FC] px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-[#102A43] transition hover:border-[#9fc3e9] hover:bg-[#dcecff]"
                    >
                      {entry.label}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-[0.95rem] border border-[#d8e6f5] bg-white p-2">
          <div className="rounded-[0.85rem] border border-[#e2edf8] bg-[#fbfdff] p-2.5">
            <p className="text-[0.64rem] font-bold uppercase tracking-[0.18em] text-[#5C748F]">Popular routes</p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
              {popularRoutes.map((route) => (
                <Link
                  key={route.label}
                  to={route.to}
                  onClick={onClose}
                  className="inline-flex items-center justify-between rounded-[0.75rem] border border-transparent bg-white px-2.5 py-2 text-sm font-medium text-[#102A43] transition hover:border-[#bfd7f2] hover:bg-[#f5faff]"
                >
                  <span>{route.label}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-[#5C748F]" />
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-2 rounded-[0.85rem] border border-[#e2edf8] bg-[#fbfdff] p-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[0.64rem] font-bold uppercase tracking-[0.18em] text-[#5C748F]">Quick picks</p>
              <p className="text-[0.52rem] font-semibold uppercase tracking-[0.12em] text-[#8a99aa]">
                {recentSearches.length ? "Recent first" : "Trending first"}
              </p>
            </div>

            {quickCategoryLinks.length ? (
              <div className="mt-2.5">
                <p className="text-[0.52rem] font-bold uppercase tracking-[0.14em] text-[#8a99aa]">Categories</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {quickCategoryLinks.map((entry) => (
                    <Link
                      key={`${entry.label}-${entry.to}`}
                      to={entry.to}
                      onClick={onClose}
                      className="rounded-full border border-[#BFD7F2] bg-[#ECF4FC] px-2 py-1 text-[0.56rem] font-bold uppercase tracking-[0.08em] text-[#102A43] transition hover:border-[#9fc3e9] hover:bg-[#dcecff]"
                    >
                      {entry.label}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            <div className={quickCategoryLinks.length ? "mt-2.5" : "mt-3"}>
              <p className="text-[0.52rem] font-bold uppercase tracking-[0.14em] text-[#8a99aa]">
                {recentSearches.length ? "Recent searches" : "Trending searches"}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {quickSearchTerms.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => onQuickSearch(term)}
                    className="rounded-full border border-[#BFD7F2] bg-[#ECF4FC] px-2 py-1 text-[0.56rem] font-bold uppercase tracking-[0.08em] text-[#102A43] transition hover:border-[#9fc3e9] hover:bg-[#dcecff]"
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
