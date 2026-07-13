import { FormEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  Heart,
  Menu,
  Search,
  ShoppingCart,
} from "lucide-react";
import { getBrowserStorage } from "@/lib/browser-storage";
import { useCart } from "@/lib/cart";
import {
  SITE_COLLECTIONS,
  buildCollectionRoute,
  buildSubcollectionRoute,
  isSiteHeaderCollectionLinkActive,
  type SiteHeaderCollectionLink,
} from "@/lib/site-navigation";
import { getRuntimeContext, getShopifyAccountRoutes } from "@/lib/theme-assets";
import { mapShopifyCustomerAccountSnapshot } from "@/lib/shopify-customer-account";
import { useWishlist } from "@/lib/wishlist";
import BrandLogo from "@/components/layout/BrandLogo";
import { CollectionHoverMenu } from "@/components/layout/CollectionHoverMenu";
import { Sheet, SheetClose, SheetContent } from "@/components/ui/sheet";
import { WEEKEND_SALE_BANNER_ALT, WEEKEND_SALE_BANNER_IMAGE, WEEKEND_SALE_ROUTE } from "@/lib/promo-banners";

const HeaderSearchResults = lazy(() => import("@/components/layout/HeaderSearchResults"));

const searchScopeOptions = [
  {
    label: "All",
    collection: "all-products",
  },
  { label: "Senior Living Solutions", collection: "books" },
  { label: "Home & Kitchen", collection: "cookware" },
  { label: "Home Decor & Lighting", collection: "home-decor" },
  { label: "Pet Essentials", collection: "pet-assocerries" },
  { label: "Health & Wellness", collection: "face-mask" },
  { label: "Travel & Outdoor", collection: "shopping-bags-jute-bags" },
  { label: "Gifts Collection", collection: "gifts" },
  { label: "Trending Finds", collection: "unique-products" },
  { label: "New Arrivals", collection: "new-arrivals" },
] as const;

type HeaderSearchScope = (typeof searchScopeOptions)[number]["collection"];

type HeaderNavItem = {
  label: string;
  to: string;
  kind?: "link" | "resources";
  isActive?: (pathname: string, search: string) => boolean;
};

function isCollectionRouteActive(pathname: string, search: string, collection: HeaderSearchScope): boolean {
  const params = new URLSearchParams(search);
  const currentCollection = params.get("collection");

  return (
    (pathname === "/shop" ||
      pathname === "/search" ||
      pathname.startsWith("/shop/") ||
      pathname.startsWith("/search/")) &&
    currentCollection === collection
  );
}

const headerShortcutLinks: SiteHeaderCollectionLink[] = [
  {
    label: "Best Sellers",
    routeHandle: "unique-products",
    activeCollectionHandles: ["best-sellers", "appplaza-best-sellers"],
    to: buildSubcollectionRoute("unique-products", "best-sellers"),
  },
  {
    label: "New Arrivals",
    routeHandle: "unique-products",
    activeCollectionHandles: ["new-arrivals"],
    to: buildSubcollectionRoute("unique-products", "new-arrivals"),
  },
  {
    label: "Under $25",
    routeHandle: "unique-products",
    activeCollectionHandles: ["under-25"],
    to: buildCollectionRoute("under-25"),
  },
  {
    label: "Trending Now",
    routeHandle: "unique-products",
    activeCollectionHandles: [
      "viral-tiktok-products",
      "best-sellers",
      "appplaza-best-sellers",
      "new-arrivals",
      "staff-picks",
      "under-25",
      "under-50",
    ],
    to: buildCollectionRoute("unique-products"),
  },
  {
    label: "Under $50",
    routeHandle: "unique-products",
    activeCollectionHandles: ["under-50"],
    to: buildCollectionRoute("under-50"),
  },
];

const utilityNavItems: HeaderNavItem[] = [
  {
    label: "Resources",
    to: "/resources",
    kind: "resources",
    isActive: (pathname) =>
      pathname === "/resources" ||
      pathname.startsWith("/resources/") ||
      pathname === "/faq" ||
      pathname === "/track-order" ||
      pathname === "/wholesale-inquiries" ||
      pathname === "/terms-conditions" ||
      pathname.startsWith("/pages/track-order") ||
      pathname.startsWith("/pages/faq") ||
      pathname.startsWith("/pages/wholesale-inquiries") ||
      pathname.startsWith("/pages/terms-conditions"),
  },
  {
    label: "Support",
    to: "/contact",
    kind: "link",
    isActive: (pathname) => pathname === "/contact" || pathname.startsWith("/pages/contact"),
  },
];

function isActiveNavItem(item: HeaderNavItem, pathname: string, search: string): boolean {
  if (item.isActive) {
    return item.isActive(pathname, search);
  }

  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

const menuLinkActiveClass = "border-[#D0E4FC] bg-[#D0E4FC] text-[#0C2048]";
const menuLinkInactiveClass = "border-[#d8e6f5] bg-white text-[#102A43] hover:border-[#bcd4ef] hover:bg-[#f5faff]";
const collectionNavTabBaseClass = "salt-header-collection-item";
const collectionNavTabActiveClass = "border-[#f2b600] text-[#f2b600]";
const collectionNavTabInactiveClass = "border-transparent text-white/88 hover:border-[#f2b600]/60 hover:text-[#f2b600]";
const utilityNavTabClass = "salt-header-utility-item border-transparent text-white/82 hover:border-[#f2b600]/45 hover:text-[#f2b600]";
function collectionNavItemClass(active: boolean) {
  return `${collectionNavTabBaseClass} ${active ? collectionNavTabActiveClass : collectionNavTabInactiveClass}`;
}

function utilityNavItemClass(active: boolean) {
  return `${utilityNavTabClass} ${active ? "border-[#f2b600] text-[#f2b600]" : ""}`;
}

const RECENT_SEARCHES_KEY = "salt-recent-searches";
const SHOPIFY_CUSTOMER_ACCOUNT_URL = "https://shopify.com/58076594275/account";

type HeaderMenuDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function HeaderMenuDrawer({
  open,
  onOpenChange,
}: HeaderMenuDrawerProps) {
  const [expandedCollectionHandle, setExpandedCollectionHandle] = useState<string | null>(null);
  const accountRoutes = useMemo(() => getShopifyAccountRoutes(), []);
  const customerAccountSummary = useMemo(
    () =>
      mapShopifyCustomerAccountSnapshot(
        getRuntimeContext().customerAccountSnapshot as Parameters<typeof mapShopifyCustomerAccountSnapshot>[0],
      ),
    [],
  );
  const accountDisplayName = customerAccountSummary?.customer.displayName?.trim() || "";
  const accountHref = accountRoutes.isLoggedIn ? accountRoutes.account : accountRoutes.login;
  const accountLabel = accountRoutes.isLoggedIn ? `Hello, ${accountDisplayName || "there"}` : "Hello, sign in";

  useEffect(() => {
    if (!open) {
      setExpandedCollectionHandle(null);
    }
  }, [open]);

  return (
    <Sheet modal={false} open={open} onOpenChange={onOpenChange}>
      <SheetContent
        id="salt-header-menu"
        side="left"
        hideOverlay
        className="h-[100dvh] max-h-[100dvh] w-[min(16rem,calc(100vw-0.5rem))] max-w-[min(16rem,calc(100vw-0.5rem))] overscroll-contain overflow-y-auto border-r border-[#BFD7F2] bg-[#F7FBFF] p-0 text-[#102A43] shadow-[0_24px_48px_-36px_rgba(12,32,72,0.32)] lg:w-[min(17rem,calc(100vw-1rem))] lg:max-w-[min(17rem,calc(100vw-1rem))]"
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-[#BFD7F2] bg-[#2a354a] px-2.5 py-1.5 text-white sm:px-3 sm:py-2">
            <SheetClose asChild>
              <a
                href={accountHref}
                className="flex min-w-0 items-center gap-2 rounded-md pr-6 text-left transition hover:opacity-95"
                aria-label={accountRoutes.isLoggedIn && accountDisplayName ? `Open account for ${accountDisplayName}` : "Sign in to your account"}
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/18 bg-white text-[#1f2d47] shadow-[0_1px_2px_rgba(0,0,0,0.12)]">
                  <CircleUserRound className="h-4 w-4" />
                </span>
                <span className="min-w-0 truncate font-semibold text-[0.9rem] leading-none tracking-[-0.01em] text-white">
                  {accountLabel}
                </span>
              </a>
            </SheetClose>
          </div>

          <div className="px-2.5 pt-2 sm:px-3">
            <SheetClose asChild>
              <Link
                to={WEEKEND_SALE_ROUTE}
                className="group block overflow-hidden rounded-[1rem] border border-[#d7e3f6] bg-[#0c2048] shadow-[0_18px_36px_-30px_rgba(12,32,72,0.28)]"
              >
                <div className="relative aspect-[1.85/0.92] overflow-hidden">
                  <img
                    src={WEEKEND_SALE_BANNER_IMAGE}
                    alt={WEEKEND_SALE_BANNER_ALT}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,20,44,0.04),rgba(7,20,44,0.12)_50%,rgba(7,20,44,0.56))]" />
                  <div className="absolute inset-x-0 bottom-0 px-3 py-2 text-white">
                    <p className="text-[0.56rem] font-bold uppercase tracking-[0.18em] text-white/72">
                      Weekend Sale
                    </p>
                    <p className="mt-0.5 text-[0.88rem] font-semibold leading-5 text-white">
                      Friday Flash Sale
                    </p>
                  </div>
                </div>
              </Link>
            </SheetClose>
          </div>

          <div className="grid min-h-0 flex-1 gap-2 px-2.5 py-2.5 sm:px-3">
            <section className="flex min-h-0 flex-1 flex-col border-b border-[#e2edf8] pb-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[0.56rem] font-bold uppercase tracking-[0.18em] text-[#5C748F]">Collections</p>
                <SheetClose asChild>
                  <Link
                    to="/collections"
                    className="text-[0.56rem] font-bold uppercase tracking-[0.14em] text-[#1f55aa] transition hover:text-[#17418f]"
                  >
                    View all
                  </Link>
                </SheetClose>
              </div>

              <div className="mt-2 grid min-h-0 flex-1 content-start gap-1.5 overflow-y-auto pb-4 pr-1 lg:hidden">
                {SITE_COLLECTIONS.map((collection) => {
                  const isExpanded = expandedCollectionHandle === collection.handle;

                  return (
                    <div key={collection.handle} className="overflow-hidden rounded-[0.8rem] border border-[#e2edf8] bg-white">
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedCollectionHandle((current) =>
                            current === collection.handle ? null : collection.handle,
                          );
                        }}
                        className="group flex w-full items-center justify-between gap-2.5 px-2.5 py-2 text-left transition hover:bg-[#f5faff]"
                        aria-expanded={isExpanded}
                        aria-controls={`salt-menu-subcollections-${collection.handle}`}
                      >
                        <span className="min-w-0 flex-1 text-[0.82rem] font-semibold leading-5 text-[#102A43]">
                          {collection.title}
                        </span>
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#dbe8f6] bg-white text-[#7d90aa] transition group-hover:border-[#bfd7f2] group-hover:text-[#1f55aa]">
                          <ChevronRight className={`h-3.5 w-3.5 transition ${isExpanded ? "rotate-90" : ""}`} />
                        </span>
                      </button>

                      {isExpanded ? (
                        <div
                          id={`salt-menu-subcollections-${collection.handle}`}
                          className="border-t border-[#edf3fb] bg-[#fbfdff] px-1.5 py-1.5"
                        >
                          <div className="grid gap-0.5">
                            {collection.subcollections.map((subcollection) => (
                              <SheetClose asChild key={subcollection.handle}>
                                <Link
                                  to={buildSubcollectionRoute(collection.handle, subcollection.handle)}
                                  className="group flex items-center justify-between rounded-[0.55rem] px-2 py-1 text-[0.75rem] text-[#102A43] transition hover:bg-[#f5faff]"
                                >
                                  <span className="line-clamp-1">{subcollection.title}</span>
                                  <ChevronRight className="h-3 w-3 shrink-0 text-[#c0cada] transition group-hover:translate-x-0.5 group-hover:text-[#1f55aa]" />
                                </Link>
                              </SheetClose>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="mt-2 hidden min-h-0 flex-1 lg:flex">
                <CollectionHoverMenu
                  className="min-h-0 flex-1"
                  collections={SITE_COLLECTIONS}
                  onLinkClick={() => setMenuOpen(false)}
                />
              </div>
            </section>

          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const MainHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { itemCount: cartItemCount, openCartDrawer } = useCart();
  const { itemCount: wishlistItemCount } = useWishlist();
  const headerRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedScope, setSelectedScope] = useState<HeaderSearchScope>("all-products");
  const [scopeOpen, setScopeOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const resourcesNavItem = utilityNavItems.find((item) => item.label === "Resources") || utilityNavItems[0];
  const supportNavItem = utilityNavItems.find((item) => item.label === "Support") || utilityNavItems[0];

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const query = params.get("q") || "";
    const collection = params.get("collection");

    setSearchQuery(query);
    setSelectedScope(
      collection && searchScopeOptions.some((option) => option.collection === collection)
        ? (collection as HeaderSearchScope)
        : "all-products",
    );
  }, [location.pathname, location.search]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!headerRef.current) {
        return;
      }

      if (!headerRef.current.contains(event.target as Node)) {
        setScopeOpen(false);
        setSearchDropdownOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setScopeOpen(false);
        setSearchDropdownOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    try {
      const storage = getBrowserStorage();
      const raw = storage?.getItem(RECENT_SEARCHES_KEY);
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
    setSearchDropdownOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  const selectedScopeLabel =
    searchScopeOptions.find((option) => option.collection === selectedScope)?.label || "All";

  const openMenu = () => {
    setScopeOpen(false);
    setSearchDropdownOpen(false);
    setMenuOpen(true);
  };

  const rememberSearchQuery = (query: string) => {
    const storage = getBrowserStorage();
    if (!query || !storage) {
      return;
    }

    const next = [query, ...recentSearches.filter((entry) => entry.toLowerCase() !== query.toLowerCase())].slice(0, 6);
    setRecentSearches(next);
    storage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  };

  const applySearchQuery = (value: string) => {
    const normalizedQuery = value.trim();
    const params = new URLSearchParams();

    params.set("collection", selectedScope);

    if (normalizedQuery) {
      rememberSearchQuery(normalizedQuery);
      params.set("q", normalizedQuery);
    }

    navigate(`/shop?${params.toString()}`);
  };

  const runQuickSearch = (value: string) => {
    setSearchQuery(value);
    setSearchDropdownOpen(false);
    applySearchQuery(value);
  };

  const handleSearchBlur = () => {
    window.setTimeout(() => {
      if (searchRef.current?.contains(document.activeElement)) {
        return;
      }

      setSearchDropdownOpen(false);
    }, 0);
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchDropdownOpen(false);
    setScopeOpen(false);
    applySearchQuery(searchQuery);
  };

  const setScope = (nextScope: HeaderSearchScope) => {
    setSelectedScope(nextScope);
    setScopeOpen(false);
  };

  const cartLabel = `Cart with ${cartItemCount} item${cartItemCount === 1 ? "" : "s"}`;

  return (
    <>
      <header
        ref={headerRef}
        className="relative z-50 w-full overflow-visible border-b border-[#BFD7F2] bg-[#ECF4FC]/96 text-[#102A43] shadow-[0_18px_36px_-28px_rgba(12,32,72,0.22)] backdrop-blur-md"
      >
      <div className="flex w-full flex-wrap items-center gap-3 px-3 py-3 sm:px-4 lg:px-8">
        <div className="order-1 flex min-w-0 flex-1 items-center gap-2 md:flex-none">
          <Link
            to="/"
            aria-label="SALT Online Store"
            className="flex min-w-0 items-center rounded-full px-1.5 py-1 transition hover:bg-white/65"
          >
            <BrandLogo withWordmark size="md" />
          </Link>

          <div className="ml-auto flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={openMenu}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#BFD7F2] bg-white/90 text-[#0C2048] shadow-sm transition hover:bg-[#D0E4FC]"
              aria-label="Open menu"
              aria-expanded={menuOpen}
            >
              <Menu className="h-4.5 w-4.5" />
            </button>

            <Link
              to="/wishlist"
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#BFD7F2] bg-white/90 text-[#0C2048] shadow-sm transition hover:bg-[#D0E4FC]"
              aria-label={`Wishlist with ${wishlistItemCount} item${wishlistItemCount === 1 ? "" : "s"}`}
            >
              <Heart className={`h-4.5 w-4.5 ${wishlistItemCount > 0 ? "fill-[#0C2048]/12" : ""}`} />
              {wishlistItemCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#0C2048] px-1 text-[0.66rem] font-bold text-white">
                  {wishlistItemCount}
                </span>
              ) : null}
            </Link>

            <button
              type="button"
              onClick={openCartDrawer}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#BFD7F2] bg-white/90 text-[#0C2048] shadow-sm transition hover:bg-[#D0E4FC]"
              aria-label={cartLabel}
            >
              <ShoppingCart className="h-4.5 w-4.5" />
              {cartItemCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#0C2048] px-1 text-[0.66rem] font-bold text-white">
                  {cartItemCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        <form onSubmit={submitSearch} className="relative z-[60] order-3 basis-full md:order-2 md:min-w-0 md:flex-1">
          <div
            ref={searchRef}
            onBlurCapture={handleSearchBlur}
            className="relative flex h-11 overflow-visible rounded-[4px] border border-[#131A22] bg-white shadow-[0_1px_0_rgba(255,255,255,0.7)_inset] transition focus-within:border-[#F0A115] focus-within:shadow-[0_0_0_3px_rgba(255,153,0,0.12)]"
          >
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setSearchDropdownOpen(false);
                  setScopeOpen((open) => !open);
                }}
                aria-label={`Search category ${selectedScopeLabel}`}
                aria-haspopup="listbox"
                aria-expanded={scopeOpen}
                className="flex h-full min-w-[4.5rem] items-center justify-between gap-1.5 rounded-l-[3px] border-r border-[#cdcdcd] bg-[#f3f3f3] px-3 text-left text-[0.8rem] font-normal text-[#555555] transition hover:bg-[#ececec] sm:min-w-[6rem] sm:max-w-[11.5rem]"
              >
                <span className="truncate">{selectedScopeLabel}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 text-[#6b6b6b] transition ${scopeOpen ? "rotate-180" : ""}`}
                />
              </button>

              {scopeOpen ? (
                <div
                  id="header-scope-menu"
                  role="listbox"
                  className="absolute left-0 top-[calc(100%+0.55rem)] z-[70] w-[min(18rem,calc(100vw-1.25rem))] rounded-2xl border border-[#d5d5d5] bg-white p-2 shadow-[0_18px_36px_-28px_rgba(12,32,72,0.25)]"
                >
                  {searchScopeOptions.map((option) => {
                    const active = option.collection === selectedScope;

                    return (
                      <button
                        key={option.collection}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          setSearchDropdownOpen(false);
                          setScope(option.collection);
                        }}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                          active
                            ? "bg-[#fbeec2] font-semibold text-[#111111]"
                            : "text-[#111111] hover:bg-[#f7f7f7]"
                        }`}
                      >
                        <span>{option.label}</span>
                        {active ? (
                          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8a6110]">
                            Selected
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <label className="relative flex min-w-0 flex-1 items-stretch bg-white">
              <span className="sr-only">Search SALT</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#767676]" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onFocus={() => setSearchDropdownOpen(true)}
                placeholder="Search SALT"
                className="h-full w-full min-w-0 border-0 bg-transparent pl-10 pr-3 text-[0.92rem] text-[#111111] outline-none placeholder:text-[#767676]"
              />
            </label>

            <button
              type="submit"
              className="inline-flex h-full w-11 items-center justify-center rounded-r-[3px] border-l border-[#1749b0] bg-[#1f5bd3] text-white transition hover:bg-[#1849b0]"
            >
              <Search className="h-[1.08rem] w-[1.08rem]" />
              <span className="sr-only">Search</span>
            </button>

            {searchDropdownOpen ? (
              <Suspense
                fallback={
                  <div className="absolute left-0 right-0 top-[calc(100%+0.55rem)] z-[80] rounded-[1.15rem] border border-[#cfdff2] bg-[#f7fbff] p-4 text-sm text-[#5C748F] shadow-[0_18px_36px_-24px_rgba(12,32,72,0.3)]">
                    Preparing search…
                  </div>
                }
              >
                <HeaderSearchResults
                  query={searchQuery}
                  recentSearches={recentSearches}
                  onClose={() => setSearchDropdownOpen(false)}
                  onSearchAll={() => {
                    setSearchDropdownOpen(false);
                    applySearchQuery(searchQuery);
                  }}
                  onQuickSearch={runQuickSearch}
                />
              </Suspense>
            ) : null}
          </div>
        </form>

        <div className="order-2 ml-auto hidden items-center gap-2 md:order-3 md:flex">
          <a
            href={SHOPIFY_CUSTOMER_ACCOUNT_URL}
            aria-label="Hello, sign in / Account and orders"
            className="hidden min-w-0 flex-col rounded-full px-3 py-2 text-left transition hover:bg-white/60 lg:flex"
          >
            <span className="block text-[0.62rem] font-medium leading-none text-[#5C748F]">
              Hello, sign in
            </span>
            <span className="block whitespace-nowrap text-sm font-semibold leading-tight text-[#102A43]">
              Account & Orders
            </span>
          </a>

          <Link
            to="/wishlist"
            aria-label={`Wishlist with ${wishlistItemCount} item${wishlistItemCount === 1 ? "" : "s"}`}
            className="relative hidden h-11 w-11 items-center justify-center rounded-full border border-[#BFD7F2] bg-white/90 text-[#102A43] shadow-sm transition hover:bg-[#D0E4FC] lg:inline-flex"
          >
            <Heart className={`h-4.5 w-4.5 ${wishlistItemCount > 0 ? "fill-[#102A43]/12" : ""}`} />
            {wishlistItemCount > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#0C2048] px-1 text-[0.66rem] font-bold text-white">
                {wishlistItemCount}
              </span>
            ) : null}
          </Link>

          <button
            type="button"
            onClick={openCartDrawer}
            className="relative inline-flex h-11 items-center gap-2 rounded-full border border-[#BFD7F2] bg-white/90 px-4 text-sm font-semibold text-[#102A43] shadow-sm transition hover:bg-[#D0E4FC]"
            aria-label={cartLabel}
          >
            <ShoppingCart className="h-4.5 w-4.5" />
            <span className="hidden sm:inline">Cart</span>
            {cartItemCount > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#0C2048] px-1 text-[0.66rem] font-bold text-white">
                {cartItemCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>

        <div className="hidden border-t border-[#BFD7F2] bg-[#0C2048] md:block">
          <nav aria-label="Secondary navigation" className="salt-header-secondary-nav text-white">
            <button
              type="button"
              onClick={openMenu}
              className={collectionNavItemClass(menuOpen)}
              aria-expanded={menuOpen}
              aria-controls="salt-header-menu"
            >
              <Menu className="h-4 w-4 shrink-0" />
              <span>All</span>
            </button>

            {headerShortcutLinks.map((link) => {
              const isActive = isSiteHeaderCollectionLinkActive(location.pathname, location.search, link);

              return (
                <Link
                  key={link.label}
                  to={link.to}
                  className={collectionNavItemClass(isActive)}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span>{link.label}</span>
                </Link>
              );
            })}

            <Link
              to="/resources"
              className={utilityNavItemClass(isActiveNavItem(resourcesNavItem, location.pathname, location.search))}
              aria-current={isActiveNavItem(resourcesNavItem, location.pathname, location.search) ? "page" : undefined}
            >
              <span>Resources</span>
            </Link>

            <Link
              to="/contact"
              className={utilityNavItemClass(isActiveNavItem(supportNavItem, location.pathname, location.search))}
              aria-current={isActiveNavItem(supportNavItem, location.pathname, location.search) ? "page" : undefined}
            >
              <span>Support</span>
            </Link>
          </nav>
        </div>
      </header>
      <HeaderMenuDrawer
        open={menuOpen}
        onOpenChange={setMenuOpen}
      />
    </>
  );
};

export default MainHeader;
