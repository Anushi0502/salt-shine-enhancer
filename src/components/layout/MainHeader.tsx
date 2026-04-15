import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, CircleUserRound, Heart, Menu, Search, ShoppingBag, X } from "lucide-react";
import BrandLogo from "@/components/layout/BrandLogo";
import { filterProducts } from "@/lib/catalog";
import { useCart } from "@/lib/cart";
import { buildCustomerAccessPath, useCustomerAuth } from "@/lib/customer-auth";
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
    label: "Shop",
    to: "/shop",
    isActive: (pathname) => pathname === "/shop" || pathname.startsWith("/search"),
  },
  {
    label: "Collections",
    to: "/collections",
  },
  {
    label: "Journal",
    to: "/blog",
  },
  {
    label: "About",
    to: "/about",
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
  "relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d7d1bd] bg-[#fbf8ef] text-[#293244] transition hover:border-[#c8b77a] hover:text-[#111827] sm:h-10 sm:w-10";

const MainHeader = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { itemCount, openCartDrawer } = useCart();
  const { itemCount: wishlistCount } = useWishlist();
  const { isAuthenticated, logout } = useCustomerAuth();
  const { data: productsData } = useProducts();
  const { data: collectionsData } = useCollections();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
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
      return allProducts.slice(0, 5);
    }

    return filterProducts(allProducts, { query: searchInput.trim() }).slice(0, 6);
  }, [allProducts, hasSearchQuery, searchInput]);
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

  const accountHref = useMemo(
    () =>
      isAuthenticated
        ? "/order-history"
        : buildCustomerAccessPath({
            mode: "login",
            next: "/order-history",
            reason: "account",
          }),
    [isAuthenticated],
  );

  const signupHref = useMemo(
    () =>
      buildCustomerAccessPath({
        mode: "signup",
        next: "/order-history",
        reason: "account",
      }),
    [],
  );

  useEffect(() => {
    setMobileOpen(false);
    setSearchDropdownOpen(false);
  }, [location.pathname, location.search]);

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

  const applySearchQuery = (value: string) => {
    const normalizedQuery = value.trim();
    if (!normalizedQuery) {
      navigate("/shop");
      return;
    }

    navigate(`/search?q=${encodeURIComponent(normalizedQuery)}`);
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchDropdownOpen(false);
    applySearchQuery(searchInput);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[#dbd2bb] bg-[#f4ecd7] shadow-[0_14px_36px_-30px_rgba(37,44,58,0.34)]">
      <div className="border-b border-[#e5deca]">
        <div className="mx-auto flex max-w-[1120px] items-center justify-center px-3 py-2 text-center text-[0.62rem] font-semibold tracking-[0.08em] text-[#5d6677] sm:px-4 sm:text-[0.72rem]">
          <span>Free Shipping on All US Orders</span>
          <span className="mx-3 text-[#b7bfcf]">|</span>
          <span>30-Day Easy Returns</span>
        </div>
      </div>

      <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-4">
        <Link to="/" className="shrink-0" aria-label="Go to SALT homepage">
          <BrandLogo withWordmark size="sm" />
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-4 lg:flex xl:gap-5">
          {primaryNav.map((item) => {
            const active = isNavItemActive(item, location.pathname);

            return (
              <Link
                key={item.label}
                to={item.to}
                className={`font-display text-[1rem] leading-none transition xl:text-[1.05rem] ${
                  active ? "text-[#111827]" : "text-[#202938] hover:text-[#111827]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1.5 min-[420px]:gap-2">
          {showHeaderSearch ? (
            <form onSubmit={submitSearch} className="relative hidden w-[min(280px,90%)] lg:block xl:w-[min(400px,90%)]">
              <label className="relative block w-full">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#626a7a]" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  onFocus={() => setSearchDropdownOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => setSearchDropdownOpen(false), 120);
                  }}
                  placeholder="Search"
                  className="h-10 w-full rounded-full border border-[#d9cb97] bg-[#fcfaf3] pl-10 pr-16 text-[0.92rem] text-[#111827] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] outline-none placeholder:text-[#6f7380] focus:border-[#cdb575] focus:shadow-[0_0_0_3px_rgba(205,181,117,0.2)]"
                  aria-label="Search products"
                />
                {searchInput.trim() ? (
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setSearchInput("");
                    }}
                    className="absolute right-11 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-[#2f5eaa] transition hover:bg-[#e7edf7]"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-[#dbdbd3] bg-[#f7f7f4] px-2 py-0.5 text-[0.62rem] font-semibold text-[#7c8290]">
                  / K
                </span>
              </label>

              {searchDropdownOpen ? (
                <div
                  className="absolute right-0 top-[calc(100%+0.45rem)] z-[80] hidden w-[min(680px,calc(100vw-2rem))] grid-cols-[minmax(0,1.15fr)_minmax(230px,0.9fr)] gap-2.5 rounded-[0.9rem] border border-[#d5d5cf] bg-[#f8f8f6] p-2 shadow-[0_26px_48px_-40px_rgba(15,23,42,0.48)] lg:grid"
                  onMouseDown={(event) => event.preventDefault()}
                >
                  <section className="rounded-[0.85rem] border border-[#d6d6cf] bg-[#f6f6f3] p-2">
                    <div className="flex items-center justify-between border-b border-[#d6d6cf] pb-2">
                      <p className="text-[0.64rem] font-bold uppercase tracking-[0.2em] text-[#c7a536]">Products</p>
                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          setSearchDropdownOpen(false);
                          applySearchQuery(searchInput);
                        }}
                        className="text-[0.64rem] font-bold uppercase tracking-[0.2em] text-[#4f5767] transition hover:text-[#111827]"
                      >
                        Search all
                      </button>
                    </div>

                    <div className="mt-2 grid max-h-[420px] gap-1.5 overflow-y-auto pr-1">
                      {dropdownProducts.map((product) => {
                        const image = productImage(product);
                        const price = formatMoney(minPrice(product));
                        return (
                          <Link
                            key={product.id}
                            to={`/products/${product.handle}`}
                            onClick={() => setSearchDropdownOpen(false)}
                            className="grid grid-cols-[2.8rem_minmax(0,1fr)_5rem] items-center gap-2 rounded-[0.8rem] border border-[#d5d5cf] bg-[#f3f3ef] px-2 py-1.5 transition hover:border-[#c3c3bc] hover:bg-[#efefea]"
                          >
                            {image ? (
                              <img
                                src={image}
                                alt={product.title}
                                className="h-[2.8rem] w-[2.8rem] rounded-[0.62rem] object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="grid h-[2.8rem] w-[2.8rem] place-items-center rounded-[0.62rem] bg-[#e8e8e3] text-[0.44rem] font-bold uppercase tracking-[0.08em] text-[#707786]">
                                SALT
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="line-clamp-2 text-[0.95rem] font-semibold leading-tight text-[#1d2433]">
                                {conciseTitle(product.title, 58)}
                              </p>
                              <p className="mt-0.5 text-[0.56rem] font-semibold uppercase tracking-[0.13em] text-[#687081]">
                                {product.product_type || "Curated pick"}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-[1rem] font-semibold text-[#1d2433]">{price}</p>
                              <p className="mt-0.5 text-[0.6rem] text-[#616879]">View product</p>
                            </div>
                          </Link>
                        );
                      })}

                      {hasSearchQuery && !dropdownProducts.length ? (
                        <div className="rounded-[1rem] border border-dashed border-[#d5d5cf] px-3 py-4 text-sm text-[#616879]">
                          No product matches this search. Try another keyword.
                        </div>
                      ) : null}
                    </div>
                  </section>

                  <section className="rounded-[0.85rem] border border-[#d6d6cf] bg-[#f6f6f3] p-2">
                    <div className="flex items-start justify-between">
                      <p className="text-[0.64rem] font-bold uppercase tracking-[0.2em] text-[#c7a536]">Collections</p>
                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          setSearchDropdownOpen(false);
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d6d6cf] text-[#7a818f] transition hover:bg-[#efefea] hover:text-[#1d2433]"
                        aria-label="Close search"
                      >
                        <X className="h-4.5 w-4.5" />
                      </button>
                    </div>

                    <div className="mt-4 rounded-[0.8rem] border border-[#d5d5cf] bg-[#f3f3ef] p-3">
                      <p className="text-[0.64rem] font-bold uppercase tracking-[0.2em] text-[#596172]">Popular routes</p>
                      <div className="mt-3 grid gap-1.5">
                        {popularRoutes.map((route) => (
                          <Link
                            key={route.label}
                            to={route.to}
                            onClick={() => setSearchDropdownOpen(false)}
                            className="inline-flex items-center justify-between rounded-[0.75rem] px-2 py-1.5 text-[0.94rem] font-medium text-[#1d2433] transition hover:bg-[#ecece7]"
                          >
                            <span>{route.label}</span>
                            <ChevronRight className="h-4 w-4 text-[#2f3748]" />
                          </Link>
                        ))}
                      </div>
                    </div>
                  </section>
                </div>
              ) : null}
            </form>
          ) : null}

          <Link to={accountHref} className={actionButtonClassName} aria-label="Open account">
            <CircleUserRound className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
          </Link>

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
        <div className="border-t border-[#e5deca] px-3 py-2 lg:hidden">
          <div className="mx-auto max-w-[1120px]">
            <form onSubmit={submitSearch}>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#626a7a]" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search"
                  className="h-10 w-full rounded-full border border-[#d9cb97] bg-[#fcfaf3] pl-10 pr-24 text-sm text-[#111827] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none placeholder:text-[#6f7380] focus:border-[#cdb575] focus:shadow-[0_0_0_3px_rgba(205,181,117,0.2)]"
                  aria-label="Search products"
                />
                <button
                  type="submit"
                  className="absolute right-1 top-1 inline-flex h-8 items-center justify-center rounded-full bg-[#2d3a52] px-3 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-white transition hover:bg-[#1e293b]"
                >
                  Search
                </button>
              </label>
            </form>
          </div>
        </div>
      ) : null}

      {mobileOpen ? (
        <div className="border-t border-[#e5deca] bg-[#f7f1df] px-3 py-4 lg:hidden">
          <div className="mx-auto grid max-w-[1120px] gap-2">
            {mobileNav.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                onClick={closeMobileMenu}
                className={`inline-flex h-11 items-center justify-center rounded-[0.9rem] border border-[#d7d1bd] bg-[#fbf8ef] px-4 font-display text-[1rem] transition ${
                  isNavItemActive(item, location.pathname)
                    ? "text-[#111827]"
                    : "text-[#2b3344] hover:border-[#c8b77a] hover:text-[#111827]"
                }`}
              >
                {item.label}
              </Link>
            ))}

            <div className="mt-1 grid grid-cols-2 gap-2">
              <Link
                to="/wishlist"
                onClick={closeMobileMenu}
                className="inline-flex h-10 items-center justify-center rounded-[0.85rem] border border-[#d7d1bd] bg-[#fbf8ef] text-[0.74rem] font-semibold uppercase tracking-[0.11em] text-[#2b3344]"
              >
                Wishlist
              </Link>
              <button
                type="button"
                onClick={() => {
                  closeMobileMenu();
                  openCartDrawer();
                }}
                className="inline-flex h-10 items-center justify-center rounded-[0.85rem] bg-[#2d3a52] px-4 text-[0.74rem] font-semibold uppercase tracking-[0.11em] text-white"
              >
                Cart ({itemCount})
              </button>
            </div>

            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => {
                  logout();
                  closeMobileMenu();
                }}
                className="mt-1 inline-flex h-10 items-center justify-center rounded-[0.85rem] border border-[#d7d1bd] bg-[#fbf8ef] text-[0.74rem] font-semibold uppercase tracking-[0.11em] text-[#2b3344]"
              >
                Log out
              </button>
            ) : (
              <div className="mt-1 grid grid-cols-2 gap-2">
                <Link
                  to={accountHref}
                  onClick={closeMobileMenu}
                  className="inline-flex h-10 items-center justify-center rounded-[0.85rem] border border-[#d7d1bd] bg-[#fbf8ef] text-[0.74rem] font-semibold uppercase tracking-[0.11em] text-[#2b3344]"
                >
                  Login
                </Link>
                <Link
                  to={signupHref}
                  onClick={closeMobileMenu}
                  className="inline-flex h-10 items-center justify-center rounded-[0.85rem] bg-[#c9a73a] px-4 text-[0.74rem] font-semibold uppercase tracking-[0.11em] text-[#1e2432]"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
};

export default MainHeader;
