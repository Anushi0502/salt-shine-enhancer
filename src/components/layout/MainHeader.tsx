import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, Heart, Menu, Search, ShoppingBag, X } from "lucide-react";
import BrandLogo from "@/components/layout/BrandLogo";
import { filterProducts } from "@/lib/catalog";
import { useCart } from "@/lib/cart";
import { conciseTitle, formatMoney, minPrice, productImage } from "@/lib/formatters";
import { useCollections, useProducts } from "@/lib/shopify-data";
import { useWishlist } from "@/lib/wishlist";

type NavItem = {
  label: string;
  to: string;
  isActive?: (pathname: string) => boolean;
};

const primaryNav: NavItem[] = [
  {
    label: "Home",
    to: "/",
  },
  {
    label: "Shop",
    to: "/shop?collection=all-products",
    isActive: (pathname) => pathname === "/shop" || pathname.startsWith("/search"),
  },
  {
    label: "Collections",
    to: "/collections",
  },
  {
    label: "Blogs",
    to: "/blog",
  },
  {
    label: "Support",
    to: "/contact",
  },
];

const mobileNav: NavItem[] = [...primaryNav];

function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.isActive) {
    return item.isActive(pathname);
  }

  if (item.to === "/") {
    return pathname === "/";
  }

  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

const actionButtonClassName =
  "relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#bfd3f8] bg-[linear-gradient(180deg,#ffffff_0%,#eef5ff_100%)] text-[#1f4b97] shadow-[0_8px_16px_-14px_rgba(28,75,150,0.55)] transition duration-200 hover:-translate-y-[1px] hover:border-[#8eb1ef] hover:bg-[#e8f1ff] hover:text-[#143f8e] sm:h-10 sm:w-10";

const RECENT_SEARCHES_KEY = "salt-recent-searches";
const DEFAULT_TRENDING_SEARCHES = [
  "Gifts",
  "Candles",
  "Kitchen",
  "Pet accessories",
  "Home decor",
];

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

const MainHeader = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { itemCount, openCartDrawer } = useCart();
  const { itemCount: wishlistCount } = useWishlist();
  const { data: productsData } = useProducts();
  const { data: collectionsData } = useCollections();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const showHeaderSearch = true;
  const allProducts = useMemo(() => productsData?.products ?? [], [productsData?.products]);
  const allCollections = useMemo(
    () => collectionsData?.collections ?? [],
    [collectionsData?.collections],
  );
  const hasSearchQuery = Boolean(searchInput.trim());
  const dropdownProducts = useMemo(() => {
    if (!allProducts.length) {
      return [];
    }

    if (!hasSearchQuery) {
      return allProducts.slice(0, 4);
    }

    const strictMatches = filterProducts(allProducts, { query: searchInput.trim() }).slice(0, 4);
    if (strictMatches.length > 0) {
      return strictMatches;
    }

    const normalizedQuery = normalizeSearchPhrase(searchInput);
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
  }, [allProducts, hasSearchQuery, searchInput]);
  const trendingSearches = useMemo(() => {
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

    return merged.filter((value, index) => merged.findIndex((entry) => entry.toLowerCase() === value.toLowerCase()) === index).slice(0, 6);
  }, [allProducts]);
  const categorySuggestions = useMemo(() => {
    const query = normalizeSearchPhrase(searchInput);
    const suggestions: Array<{ label: string; to: string }> = [];
    const seen = new Set<string>();

    allCollections.forEach((collection) => {
      const label = String(collection.title || "").trim();
      const handle = String(collection.handle || "").trim();
      if (!label || !handle) {
        return;
      }

      if (query) {
        const searchable = normalizeSearchPhrase(`${collection.title} ${collection.handle}`);
        if (!searchable.includes(query)) {
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
        if (query && !normalizeSearchPhrase(label).includes(query)) {
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
  }, [allCollections, allProducts, searchInput]);
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
      { label: "All Products", to: "/shop" },
      {
        label: "Best Sellers",
        to: bestSellerCollection ? `/collections/${bestSellerCollection.handle}` : "/shop?sort=featured",
      },
      { label: "NEW ARRIVALS", to: "/shop?sort=newest" },
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

  useEffect(() => {
    setMobileOpen(false);
    setSearchDropdownOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const sanitized = parsed
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.trim())
          .filter(Boolean)
          .slice(0, 6);
        setRecentSearches(sanitized);
      }
    } catch {
      setRecentSearches([]);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setSearchInput(params.get("q") || "");
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!mobileOpen || typeof window === "undefined") {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [mobileOpen]);

  const closeMobileMenu = () => {
    setMobileOpen(false);
  };

  const rememberSearchQuery = (query: string) => {
    if (!query || typeof window === "undefined") {
      return;
    }

    const next = [query, ...recentSearches.filter((entry) => entry.toLowerCase() !== query.toLowerCase())].slice(0, 6);
    setRecentSearches(next);
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  };

  const applySearchQuery = (value: string) => {
    const normalizedQuery = value.trim();
    if (!normalizedQuery) {
      navigate("/shop");
      return;
    }

    rememberSearchQuery(normalizedQuery);
    navigate(`/search?q=${encodeURIComponent(normalizedQuery)}`);
  };

  const runQuickSearch = (value: string) => {
    setSearchInput(value);
    setSearchDropdownOpen(false);
    applySearchQuery(value);
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchDropdownOpen(false);
    applySearchQuery(searchInput);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[#c6d9ff] bg-[linear-gradient(180deg,rgba(249,252,255,0.96)_0%,rgba(239,246,255,0.96)_100%)] backdrop-blur-[10px] shadow-[0_18px_34px_-30px_rgba(20,58,128,0.55)]">
      <div className="border-b border-[#d7e5ff] bg-[linear-gradient(90deg,rgba(234,243,255,0.85),rgba(241,247,255,0.85))]">
        <div className="flex w-full items-center justify-center px-3 py-2 text-center text-[0.62rem] font-semibold tracking-[0.08em] text-[#36558f] sm:px-6 sm:text-[0.72rem] lg:px-8">
          <span>Free Shipping on All US Orders</span>
          <span className="mx-3 text-[#9eb8e8]">|</span>
          <span>30-Day Easy Returns</span>
        </div>
      </div>

      <div className="flex w-full items-start justify-between gap-3 px-3 py-3 sm:gap-4 sm:px-6 lg:px-8">
        <Link to="/" className="shrink-0 self-start" aria-label="Go to SALT homepage">
          <BrandLogo withWordmark size="md" />
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center justify-start gap-3 lg:flex xl:gap-4">
          {primaryNav.map((item) => {
            const active = isNavItemActive(item, location.pathname);

            return (
              <Link
                key={item.label}
                to={item.to}
                className={`rounded-full px-3 py-2 font-display text-[0.98rem] leading-none transition-colors xl:text-[1.05rem] ${
                  active
                    ? "bg-[#e7f0ff] text-[#15428d] shadow-[inset_0_0_0_1px_rgba(157,190,241,0.7)]"
                    : "text-[#2a3f66] hover:bg-[#edf4ff] hover:text-[#15428d]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 min-[420px]:gap-2">
          {showHeaderSearch ? (
            <form onSubmit={submitSearch} className="relative hidden w-[min(320px,42vw)] lg:block xl:w-[min(440px,46vw)]">
              <label className="relative block w-full">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5e78a6]" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  onFocus={() => setSearchDropdownOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => setSearchDropdownOpen(false), 120);
                  }}
                  placeholder="Search"
                  className="h-10 w-full rounded-full border border-[#b8cff8] bg-white pl-10 pr-16 text-[0.92rem] text-[#1b2e4f] shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] outline-none placeholder:text-[#6a80a8] focus:border-[#7ea6ea] focus:shadow-[0_0_0_3px_rgba(126,166,234,0.25)]"
                  aria-label="Search products"
                />
                {searchInput.trim() ? (
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setSearchInput("");
                    }}
                    className="absolute right-11 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-[#2f5eaa] transition hover:bg-[#e8f0ff]"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-[#c5d7f8] bg-[#eff5ff] px-2 py-0.5 text-[0.62rem] font-semibold text-[#5f78a8]">
                  / K
                </span>
              </label>

              {searchDropdownOpen ? (
                <div
                  className="absolute right-0 top-[calc(100%+0.45rem)] z-[80] hidden w-[min(840px,calc(100vw-2rem))] grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)] gap-1.5 rounded-[0.9rem] border border-[#c5d8fc] bg-[#f3f8ff] p-2 shadow-[0_26px_48px_-40px_rgba(20,58,128,0.52)] lg:grid"
                  onMouseDown={(event) => event.preventDefault()}
                >
                  <section className="rounded-[0.85rem] border border-[#cddffc] bg-[#f8fbff] p-2">
                    <div className="flex items-center justify-between border-b border-[#d8e6ff] pb-2">
                      <p className="text-[0.64rem] font-bold uppercase tracking-[0.2em] text-[#2e61c7]">Products</p>
                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          setSearchDropdownOpen(false);
                          applySearchQuery(searchInput);
                        }}
                        className="text-[0.64rem] font-bold uppercase tracking-[0.2em] text-[#4f6b9c] transition hover:text-[#1b3f8c]"
                      >
                        Search all
                      </button>
                    </div>

                    <div className="mt-2 grid max-h-[352px] grid-cols-1 gap-1.5 overflow-y-auto pr-1">
                      {dropdownProducts.map((product) => {
                        const image = productImage(product);
                        const price = formatMoney(minPrice(product));
                        return (
                          <Link
                            key={product.id}
                            to={`/products/${product.handle}`}
                            onClick={() => setSearchDropdownOpen(false)}
                            className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-start gap-2 rounded-[0.75rem] border border-[#d2e2ff] bg-[#f9fbff] px-2 py-1.5 transition hover:border-[#aac4ef] hover:bg-[#eef5ff]"
                          >
                            {image ? (
                              <img
                                src={image}
                                alt={product.title}
                                className="h-10 w-10 rounded-[0.65rem] object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="grid h-10 w-10 place-items-center rounded-[0.65rem] bg-[#eaf2ff] text-[0.42rem] font-bold uppercase tracking-[0.08em] text-[#5d75a2]">
                                SALT
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="line-clamp-2 text-[0.82rem] font-semibold leading-tight text-[#1c3761]">
                                {conciseTitle(product.title, 36)}
                              </p>
                              <p className="mt-0.5 text-[0.5rem] font-semibold uppercase tracking-[0.13em] text-[#5a729d]">
                                {product.product_type || "Curated pick"}
                              </p>
                            </div>
                            <div className="flex min-h-full flex-col items-end justify-between gap-1.5 text-right">
                              <p className="text-[0.84rem] font-semibold leading-none text-[#193764]">{price}</p>
                              <span className="inline-flex items-center gap-0.5 text-[0.54rem] font-semibold uppercase tracking-[0.12em] text-[#496793]">
                                View
                                <ChevronRight className="h-3 w-3" />
                              </span>
                            </div>
                          </Link>
                        );
                      })}

                      {hasSearchQuery && !dropdownProducts.length ? (
                        <div className="rounded-[1rem] border border-dashed border-[#c7daff] px-3 py-4 text-sm text-[#496793]">
                          <p>No product matches this search yet. Try a category shortcut:</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {(categorySuggestions.length ? categorySuggestions : popularRoutes).slice(0, 3).map((entry) => (
                              <button
                                key={entry.label}
                                type="button"
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  setSearchDropdownOpen(false);
                                }}
                                onClick={() => {
                                  if ("to" in entry) {
                                    navigate(entry.to);
                                  }
                                }}
                                className="rounded-full border border-[#bdd2f8] bg-[#eef5ff] px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-[#365a94] transition hover:border-[#8fb1ec] hover:text-[#1d3e7c]"
                              >
                                {entry.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </section>

                  <section className="rounded-[0.85rem] border border-[#cddffc] bg-[#f8fbff] p-2">
                    <div className="flex items-start justify-between">
                      <p className="text-[0.64rem] font-bold uppercase tracking-[0.2em] text-[#2e61c7]">Collections</p>
                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          setSearchDropdownOpen(false);
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#cadbf8] text-[#6a81ab] transition hover:bg-[#ecf3ff] hover:text-[#163f87]"
                        aria-label="Close search"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-3 rounded-[0.8rem] border border-[#cfdefa] bg-[#f5f9ff] p-2.5">
                      <p className="text-[0.64rem] font-bold uppercase tracking-[0.2em] text-[#4c6696]">Popular routes</p>
                      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                        {popularRoutes.map((route) => (
                          <Link
                            key={route.label}
                            to={route.to}
                            onClick={() => setSearchDropdownOpen(false)}
                            className="inline-flex items-center justify-between rounded-[0.7rem] border border-transparent bg-white px-2 py-1.5 text-[0.74rem] font-medium text-[#1c3761] transition hover:border-[#b4cbf1] hover:bg-[#edf4ff]"
                          >
                            <span>{route.label}</span>
                            <ChevronRight className="h-3 w-3 text-[#345f9b]" />
                          </Link>
                        ))}
                      </div>
                    </div>

                    <div className="mt-1.5 rounded-[0.8rem] border border-[#cfdefa] bg-[#f5f9ff] p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[0.64rem] font-bold uppercase tracking-[0.2em] text-[#4c6696]">Quick picks</p>
                        <p className="text-[0.52rem] font-semibold uppercase tracking-[0.12em] text-[#667ea8]">
                          {recentSearches.length ? "Recent first" : "Trending first"}
                        </p>
                      </div>

                      {quickCategoryLinks.length ? (
                        <div className="mt-2.5">
                          <p className="text-[0.52rem] font-bold uppercase tracking-[0.14em] text-[#667ea8]">Categories</p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {quickCategoryLinks.map((entry) => (
                              <Link
                                key={`${entry.label}-${entry.to}`}
                                to={entry.to}
                                onClick={() => setSearchDropdownOpen(false)}
                                className="rounded-full border border-[#bdd2f8] bg-[#eef5ff] px-2 py-1 text-[0.56rem] font-bold uppercase tracking-[0.08em] text-[#365a94] transition hover:border-[#8fb1ec] hover:text-[#1d3e7c]"
                              >
                                {entry.label}
                              </Link>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className={quickCategoryLinks.length ? "mt-2.5" : "mt-3"}>
                        <p className="text-[0.52rem] font-bold uppercase tracking-[0.14em] text-[#667ea8]">
                          {recentSearches.length ? "Recent searches" : "Trending searches"}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {quickSearchTerms.map((term) => (
                            <button
                              key={term}
                              type="button"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                runQuickSearch(term);
                              }}
                              className="rounded-full border border-[#bdd2f8] bg-[#eef5ff] px-2 py-1 text-[0.56rem] font-bold uppercase tracking-[0.08em] text-[#365a94] transition hover:border-[#8fb1ec] hover:text-[#1d3e7c]"
                            >
                              {term}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              ) : null}
            </form>
          ) : null}

          <Link to="/wishlist" className={actionButtonClassName} aria-label="Open wishlist">
            <Heart
              className={`h-4 w-4 sm:h-4.5 sm:w-4.5 ${
                wishlistCount > 0 ? "fill-[#f2b600] text-[#f2b600]" : ""
              }`}
            />
            {wishlistCount > 0 ? (
              <span className="absolute right-0.5 top-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#f2b600] text-[0.58rem] font-bold text-[#153a80]">
                {wishlistCount}
              </span>
            ) : null}
          </Link>

          <button
            type="button"
            onClick={openCartDrawer}
            className={actionButtonClassName}
            aria-label={`Open cart with ${itemCount} item${itemCount === 1 ? "" : "s"}`}
          >
            <ShoppingBag className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            {itemCount > 0 ? (
              <span className="absolute right-0.5 top-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#225ed6] text-[0.58rem] font-bold text-white">
                {itemCount}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            className={`${actionButtonClassName} lg:hidden`}
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? (
              <X className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            ) : (
              <Menu className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            )}
          </button>
        </div>
      </div>

      {showHeaderSearch ? (
        <div className="border-t border-[#d7e5ff] px-3 py-2 lg:hidden">
          <div className="w-full">
            <form onSubmit={submitSearch}>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5e78a6]" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search"
                  className="h-10 w-full rounded-full border border-[#b8cff8] bg-white pl-10 pr-24 text-sm text-[#1b2e4f] shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] outline-none placeholder:text-[#6a80a8] focus:border-[#7ea6ea] focus:shadow-[0_0_0_3px_rgba(126,166,234,0.25)]"
                  aria-label="Search products"
                />
                <button
                  type="submit"
                  className="absolute right-1 top-1 inline-flex h-8 items-center justify-center rounded-full bg-[#1d4faa] px-3 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-white transition hover:bg-[#153f8b]"
                >
                  Search
                </button>
              </label>
            </form>
          </div>
        </div>
      ) : null}

      {mobileOpen ? (
        <div className="border-t border-[#d7e5ff] bg-[#f1f7ff] px-3 py-4 lg:hidden">
          <div className="grid w-full gap-2">
            {mobileNav.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                onClick={closeMobileMenu}
                className={`inline-flex h-11 items-center justify-center rounded-[0.9rem] border border-[#c6d8f9] bg-[#f9fcff] px-4 font-display text-[1rem] transition ${
                  isNavItemActive(item, location.pathname)
                    ? "border-[#98b8ef] bg-[#e7f0ff] text-[#153f8d]"
                    : "text-[#2a3f66] hover:border-[#9ab9ee] hover:text-[#153f8d]"
                }`}
              >
                {item.label}
              </Link>
            ))}

            <div className="mt-1 grid grid-cols-2 gap-2">
              <Link
                to="/wishlist"
                onClick={closeMobileMenu}
                className="inline-flex h-10 items-center justify-center rounded-[0.85rem] border border-[#c6d8f9] bg-[#f9fcff] text-[0.74rem] font-semibold uppercase tracking-[0.11em] text-[#2a3f66]"
              >
                Wishlist
              </Link>
              <button
                type="button"
                onClick={() => {
                  closeMobileMenu();
                  openCartDrawer();
                }}
                className="inline-flex h-10 items-center justify-center rounded-[0.85rem] bg-[#1d4faa] px-4 text-[0.74rem] font-semibold uppercase tracking-[0.11em] text-white"
              >
                Cart ({itemCount})
              </button>
            </div>

          </div>
        </div>
      ) : null}
    </header>
  );
};

export default MainHeader;
