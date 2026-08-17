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
  X,
} from "lucide-react";
import { getBrowserStorage } from "@/lib/browser-storage";
import { useCart } from "@/lib/cart";
import {
  SITE_COLLECTIONS,
  buildCollectionRoute,
  buildResourceRoute,
  buildSubcollectionRoute,
  isSiteHeaderCollectionLinkActive,
  type SiteHeaderCollectionLink,
} from "@/lib/site-navigation";
import { getRuntimeContext, getShopifyAccountRoutes } from "@/lib/theme-assets";
import { mapShopifyCustomerAccountSnapshot } from "@/lib/shopify-customer-account";
import { useWishlist } from "@/lib/wishlist";
import BrandLogo from "@/components/layout/BrandLogo";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { WEEKEND_SALE_BANNER_ALT, WEEKEND_SALE_BANNER_IMAGE, WEEKEND_SALE_ROUTE } from "@/lib/promo-banners";

const HeaderSearchResults = lazy(() => import("@/components/layout/HeaderSearchResults"));
const CollectionHoverMenu = lazy(() =>
  import("@/components/layout/CollectionHoverMenu").then(({ CollectionHoverMenu: menu }) => ({
    default: menu,
  })),
);

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
    to: buildSubcollectionRoute("unique-products", "under-25"),
  },
  {
    label: "Trending Now",
    routeHandle: "unique-products",
    activeCollectionHandles: [
      "trending-finds",
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
    to: buildResourceRoute(""),
    kind: "resources",
    isActive: (pathname, search) => {
      const resourceMode = new URLSearchParams(search).get("resource");

      return (
      (pathname === "/shop" && (resourceMode === "hub" || resourceMode === "guide")) ||
      pathname === "/resources" ||
      pathname.startsWith("/resources/") ||
      pathname === "/faq" ||
      pathname === "/track-order" ||
      pathname === "/wholesale-inquiries" ||
      pathname === "/terms-conditions" ||
      pathname.startsWith("/pages/track-order") ||
      pathname.startsWith("/pages/faq") ||
      pathname.startsWith("/pages/wholesale-inquiries") ||
      pathname.startsWith("/pages/terms-conditions")
      );
    },
  },
  {
    label: "Support",
    to: "/pages/contact-us",
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

const collectionNavTabBaseClass = "salt-header-collection-item";
const utilityNavTabClass = "salt-header-utility-item";
function collectionNavItemClass(active: boolean) {
  return `${collectionNavTabBaseClass} ${active ? "is-active" : ""}`;
}

function utilityNavItemClass(active: boolean) {
  return `${utilityNavTabClass} ${active ? "is-active" : ""}`;
}

function isDrawerSubcollectionActive(
  pathname: string,
  search: string,
  collectionHandle: string,
  subcollectionHandle: string,
): boolean {
  const route = buildSubcollectionRoute(collectionHandle, subcollectionHandle);
  const [routePath, routeSearch = ""] = route.split("?", 2);
  return pathname === routePath && search === (routeSearch ? `?${routeSearch}` : "");
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
  const location = useLocation();
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
  const resourcesNavItem = utilityNavItems.find((item) => item.label === "Resources") || utilityNavItems[0];
  const supportNavItem = utilityNavItems.find((item) => item.label === "Support") || utilityNavItems[0];
  const quickLinks = [
    {
      item: resourcesNavItem,
      label: "Resources",
      to: resourcesNavItem.to,
    },
    {
      item: supportNavItem,
      label: "Support",
      to: supportNavItem.to,
    },
  ] as const;

  useEffect(() => {
    if (!open) {
      setExpandedCollectionHandle(null);
    }
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {open ? (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => onOpenChange(false)}
          className="fixed inset-0 z-[55] bg-foreground/15 backdrop-blur-[1px]"
        />
      ) : null}
      <SheetContent
        id="salt-header-menu"
        side="left"
        hideOverlay
        className="isolate z-[60] flex h-[100dvh] max-h-[100dvh] w-[min(19rem,calc(100vw-0.75rem))] max-w-[min(19rem,calc(100vw-0.75rem))] flex-col overflow-hidden border-r border-border/70 bg-[linear-gradient(180deg,hsl(var(--background)/0.99),hsl(var(--card)/0.95))] p-0 pt-[env(safe-area-inset-top)] text-foreground shadow-[0_28px_52px_-36px_rgba(15,23,42,0.28)] [&>button:last-child]:right-3 [&>button:last-child]:top-[calc(env(safe-area-inset-top)+0.7rem)] [&>button:last-child]:z-30 [&>button:last-child]:inline-flex [&>button:last-child]:h-11 [&>button:last-child]:w-11 [&>button:last-child]:items-center [&>button:last-child]:justify-center [&>button:last-child]:rounded-full [&>button:last-child]:border [&>button:last-child]:border-white/20 [&>button:last-child]:bg-white/10 [&>button:last-child]:text-white [&>button:last-child]:opacity-100 [&>button:last-child]:backdrop-blur [&>button:last-child]:hover:bg-white/20 lg:w-[min(17.5rem,calc(100vw-1rem))] lg:max-w-[min(17.5rem,calc(100vw-1rem))]"
      >
        <SheetTitle className="sr-only">Browse SALT</SheetTitle>
        <SheetDescription className="sr-only">
          Browse collections, account tools, and support links.
        </SheetDescription>
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Account Section - Enhanced gradient with gold/blue accents */}
          <div className="relative shrink-0 overflow-hidden border-b border-border/70 bg-[linear-gradient(135deg,hsl(var(--salt-navy)/0.97),hsl(225deg_42%_18%/0.95))] px-2.5 pb-3 pt-3 sm:px-3 sm:pb-3.5">
            {/* Subtle accent glow */}
            <div className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full bg-[radial-gradient(circle,hsl(var(--salt-gold)/0.12),transparent_70%)]" />
            <div className="pointer-events-none absolute -bottom-6 -left-6 h-16 w-16 rounded-full bg-[radial-gradient(circle,hsl(var(--salt-blue)/0.1),transparent_70%)]" />
            <p className="relative mb-2 text-[0.58rem] font-bold uppercase tracking-[0.2em] text-white/60">
              Browse SALT
            </p>
            <SheetClose asChild>
              <a
                href={accountHref}
                className="relative flex min-h-11 min-w-0 items-center gap-2.5 rounded-xl pr-14 text-left transition hover:opacity-90"
                aria-label={accountRoutes.isLoggedIn && accountDisplayName ? `Open account for ${accountDisplayName}` : "Sign in to your account"}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/18 bg-[linear-gradient(135deg,hsl(var(--salt-paper)/0.95),hsl(var(--salt-paper)/0.85))] text-foreground shadow-[0_2px_6px_rgba(0,0,0,0.18),inset_0_1px_0_hsl(0_0%_100%/0.5)]">
                  <CircleUserRound className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0 truncate font-semibold text-[0.9rem] leading-none tracking-[-0.01em] text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.24)]">
                  {accountLabel}
                </span>
              </a>
            </SheetClose>
          </div>

          {/* Sale Banner - Subtle inner shadow for depth */}
          <div className="shrink-0 px-2.5 pt-2.5 sm:px-3">
            <SheetClose asChild>
              <Link
                to={WEEKEND_SALE_ROUTE}
                className="group block overflow-hidden rounded-[1rem] border border-border/70 bg-background/92 shadow-[0_18px_36px_-30px_rgba(15,23,42,0.22),inset_0_1px_0_hsl(0_0%_100%/0.4)]"
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

          {/* Collections Section */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-2.5 sm:px-3 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-primary/30 [&::-webkit-scrollbar-track]:bg-transparent">
            <section className="flex flex-col border-b border-border/70 pb-2">
              {/* Section header with decorative elements */}
              <div className="relative flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-0.5 rounded-full bg-[linear-gradient(180deg,hsl(var(--salt-gold)),hsl(var(--primary)))]" />
                  <p className="text-[0.56rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    Collections
                  </p>
                </div>
                <SheetClose asChild>
                  <Link
                    to="/collections"
                    className="relative text-[0.56rem] font-bold uppercase tracking-[0.14em] text-primary transition hover:text-foreground after:absolute after:-bottom-0.5 after:left-0 after:h-px after:w-full after:scale-x-0 after:bg-foreground after:transition after:duration-200 hover:after:scale-x-100"
                  >
                    View all
                  </Link>
                </SheetClose>
              </div>

              {/* Collection items - visible on mobile/tablet */}
              <div className="mt-2.5 grid content-start gap-1.5 pb-4 pr-1 lg:hidden">
                {SITE_COLLECTIONS.map((collection) => {
                  const isExpanded = expandedCollectionHandle === collection.handle;
                  const activeSubcollection = collection.subcollections.find((subcollection) =>
                    isDrawerSubcollectionActive(
                      location.pathname,
                      location.search,
                      collection.handle,
                      subcollection.handle,
                    ),
                  );

                  return (
                    <div
                      key={collection.handle}
                      className="overflow-hidden rounded-[1rem] border border-border/72 bg-[linear-gradient(160deg,hsl(var(--background)/0.99),hsl(var(--card)/0.93))] shadow-[0_10px_24px_-20px_rgba(15,23,42,0.14)] transition-shadow duration-200 hover:shadow-[0_14px_28px_-22px_rgba(15,23,42,0.18)]"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedCollectionHandle((current) =>
                            current === collection.handle ? null : collection.handle,
                          );
                        }}
                        className="group flex min-h-11 w-full items-center justify-between gap-2.5 px-3 py-2.5 text-left transition hover:bg-muted/30"
                        aria-expanded={isExpanded}
                        aria-controls={`salt-menu-subcollections-${collection.handle}`}
                      >
                        <span className="min-w-0 flex-1 text-[0.84rem] font-semibold leading-5 text-foreground">
                          {collection.title}
                        </span>
                        <span
                          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground shadow-[0_2px_6px_-4px_rgba(15,23,42,0.1)] transition-all duration-300 group-hover:border-primary/20 group-hover:text-primary ${
                            isExpanded || activeSubcollection
                              ? "border-primary/20 bg-primary/8 text-primary shadow-[0_2px_8px_-4px_hsl(var(--primary)/0.2)]"
                              : ""
                          }`}
                        >
                          <ChevronRight
                            className={`h-3.5 w-3.5 transition-all duration-300 ${isExpanded ? "rotate-90" : ""}`}
                          />
                        </span>
                      </button>

                      {/* Subcollections - smooth expand/collapse */}
                      <div
                        id={`salt-menu-subcollections-${collection.handle}`}
                        className={`overflow-hidden transition-all duration-300 ease-in-out ${
                          isExpanded ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
                        }`}
                      >
                        <div className="px-2.5 pb-2.5">
                          <div className="rounded-[1rem] border border-border/65 bg-[linear-gradient(180deg,hsl(var(--background)/0.97),hsl(var(--card)/0.92))] px-2.5 py-2.5 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.12)]">
                            <div className="flex items-start justify-between gap-2 border-b border-border/65 pb-2.5">
                              <div className="min-w-0">
                                <p className="text-[0.56rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                                  Subcategories
                                </p>
                              </div>

                              <SheetClose asChild>
                                <Link
                                  to={buildCollectionRoute(collection.handle)}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/70 bg-background px-2.5 py-1.5 text-[0.56rem] font-bold uppercase tracking-[0.12em] text-primary transition hover:border-primary/20 hover:bg-muted/40"
                                >
                                  <span>View all</span>
                                  <ChevronRight className="h-3 w-3" />
                                </Link>
                              </SheetClose>
                            </div>

                            <div className="mt-2 grid gap-1">
                              {collection.subcollections.map((subcollection) => {
                                const isActive = isDrawerSubcollectionActive(
                                  location.pathname,
                                  location.search,
                                  collection.handle,
                                  subcollection.handle,
                                );

                                return (
                                  <SheetClose asChild key={subcollection.handle}>
                                    <Link
                                      to={buildSubcollectionRoute(collection.handle, subcollection.handle)}
                                      className={`group flex min-h-[2.75rem] items-center justify-between gap-2 rounded-[0.9rem] border px-2.5 py-2 text-left text-[0.76rem] font-semibold leading-5 transition ${
                                        isActive
                                          ? "border-primary/20 bg-primary/8 text-foreground shadow-[0_12px_20px_-18px_rgba(15,23,42,0.18)]"
                                          : "border-transparent text-foreground/88 hover:border-primary/12 hover:bg-muted/40 hover:text-primary"
                                      }`}
                                    >
                                      <span className="line-clamp-1">{subcollection.title}</span>
                                      <ChevronRight
                                        className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary ${
                                          isActive ? "text-primary" : ""
                                        }`}
                                      />
                                    </Link>
                                  </SheetClose>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Collection hover menu - visible on desktop */}
              <div className="mt-2 hidden min-h-0 flex-1 lg:flex">
                <Suspense fallback={<div className="min-h-0 flex-1" aria-hidden="true" />}>
                  <CollectionHoverMenu
                    className="min-h-0 flex-1"
                    collections={SITE_COLLECTIONS}
                    onLinkClick={() => onOpenChange(false)}
                  />
                </Suspense>
              </div>
            </section>

            <div className="mt-2 rounded-[1rem] border border-border/70 bg-[linear-gradient(180deg,hsl(var(--background)/0.98),hsl(var(--card)/0.98))] p-2.5 pb-[calc(0.65rem+env(safe-area-inset-bottom))] shadow-[0_-16px_30px_-26px_rgba(15,23,42,0.3)]">
              <div className="flex items-center justify-between gap-2 px-0.5 pb-2">
                <p className="text-[0.56rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Quick links
                </p>
                <p className="text-[0.56rem] font-bold uppercase tracking-[0.18em] text-primary/80">
                  Explore
                </p>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {quickLinks.map(({ item, label, to }) => {
                  const active = isActiveNavItem(item, location.pathname, location.search);

                  return (
                    <SheetClose asChild key={label}>
                      <Link
                        to={to}
                        className={`flex min-h-11 items-center justify-between rounded-[0.95rem] border px-3 py-2.5 text-left transition ${
                          active
                            ? "border-primary/25 bg-primary/8 text-foreground shadow-[0_12px_20px_-18px_rgba(15,23,42,0.18)]"
                            : "border-border/70 bg-background/92 text-foreground/92 hover:border-primary/20 hover:bg-background"
                        }`}
                        aria-current={active ? "page" : undefined}
                      >
                        <span className="text-[0.78rem] font-semibold leading-5">{label}</span>
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition ${
                            active
                              ? "border-primary/20 bg-background text-primary"
                              : "border-border/70 bg-background text-muted-foreground"
                          }`}
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </span>
                      </Link>
                    </SheetClose>
                  );
                })}
              </div>
            </div>
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

  const toggleMenu = () => {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }

    openMenu();
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
        className="relative z-50 w-full overflow-visible border-b border-border/60 bg-[linear-gradient(180deg,hsl(var(--background)/0.98),hsl(var(--card)/0.94))] text-foreground shadow-[0_16px_36px_-28px_rgba(15,23,42,0.18)] backdrop-blur-xl"
      >
      <div className="flex w-full flex-wrap items-center gap-3 px-3 py-3.5 sm:px-4 lg:px-8">
        <div className="order-1 flex min-w-0 flex-1 items-center gap-2 md:flex-none">
          <Link
            to="/"
            aria-label="SALT Online Store"
            className="flex min-w-0 items-center rounded-full px-1.5 py-1 transition hover:bg-background/78"
          >
            <BrandLogo withWordmark size="md" />
          </Link>

          <div className="ml-auto flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={toggleMenu}
              className={`touch-manipulation inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-[0_10px_20px_-16px_rgba(15,23,42,0.16)] transition ${
                menuOpen
                  ? "border-primary/30 bg-primary text-primary-foreground"
                  : "border-border/70 bg-background/92 text-foreground hover:bg-background"
              }`}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="salt-header-menu"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            <Link
              to="/wishlist"
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-background/92 text-foreground shadow-[0_10px_20px_-16px_rgba(15,23,42,0.16)] transition hover:bg-background"
              aria-label={`Wishlist with ${wishlistItemCount} item${wishlistItemCount === 1 ? "" : "s"}`}
            >
              <Heart className={`h-4.5 w-4.5 ${wishlistItemCount > 0 ? "fill-primary/12" : ""}`} />
              {wishlistItemCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[0.66rem] font-bold text-primary-foreground">
                  {wishlistItemCount}
                </span>
              ) : null}
            </Link>

            <button
              type="button"
              onClick={openCartDrawer}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-background/92 text-foreground shadow-[0_10px_20px_-16px_rgba(15,23,42,0.16)] transition hover:bg-background"
              aria-label={cartLabel}
            >
              <ShoppingCart className="h-4.5 w-4.5" />
              {cartItemCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[0.66rem] font-bold text-primary-foreground">
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
            className="relative flex h-11 overflow-visible rounded-full border border-border/70 bg-background/92 shadow-[0_12px_22px_-18px_rgba(15,23,42,0.16)] transition focus-within:border-primary/25 focus-within:shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]"
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
                className="flex h-full min-w-[4.5rem] items-center justify-between gap-1.5 rounded-l-full border-r border-border/70 bg-muted/35 px-3 text-left text-[0.8rem] font-semibold text-muted-foreground transition hover:bg-muted/55 sm:min-w-[6rem] sm:max-w-[11.5rem]"
              >
                <span className="truncate">{selectedScopeLabel}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition ${scopeOpen ? "rotate-180" : ""}`}
                />
              </button>

              {scopeOpen ? (
                <div
                  id="header-scope-menu"
                  role="listbox"
                  className="absolute left-0 top-[calc(100%+0.55rem)] z-[70] w-[min(18rem,calc(100vw-1.25rem))] rounded-[1.2rem] border border-border/70 bg-background/96 p-2 shadow-[0_18px_36px_-28px_rgba(15,23,42,0.18)] backdrop-blur-xl"
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
                            ? "bg-primary/10 font-semibold text-foreground"
                            : "text-foreground hover:bg-muted/40"
                        }`}
                      >
                        <span>{option.label}</span>
                        {active ? (
                          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                            Selected
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <label className="relative flex min-w-0 flex-1 items-stretch bg-background">
              <span className="sr-only">Search SALT</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onFocus={() => setSearchDropdownOpen(true)}
                placeholder="Search SALT"
                className="h-full w-full min-w-0 border-0 bg-transparent pl-10 pr-3 text-[0.92rem] text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>

            <button
              type="submit"
              className="salt-primary-cta inline-flex h-full w-11 items-center justify-center rounded-r-full border-l border-transparent transition hover:brightness-105"
            >
              <Search className="h-[1.08rem] w-[1.08rem]" />
              <span className="sr-only">Search</span>
            </button>

            {searchDropdownOpen ? (
              <Suspense
                fallback={
                  <div className="absolute left-0 right-0 top-[calc(100%+0.55rem)] z-[80] rounded-[1.15rem] border border-border/70 bg-background/96 p-4 text-sm text-muted-foreground shadow-[0_18px_36px_-24px_rgba(15,23,42,0.18)] backdrop-blur-xl">
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
            className="hidden min-w-0 flex-col rounded-[1rem] border border-border/70 bg-background/90 px-3.5 py-2 text-left shadow-[0_10px_20px_-18px_rgba(15,23,42,0.14)] transition hover:-translate-y-[1px] hover:border-primary/18 hover:bg-background/96 lg:flex"
          >
            <span className="block text-[0.62rem] font-medium leading-none text-muted-foreground">
              Hello, sign in
            </span>
            <span className="block whitespace-nowrap text-sm font-semibold leading-tight text-foreground">
              Account & Orders
            </span>
          </a>

          <Link
            to="/wishlist"
            aria-label={`Wishlist with ${wishlistItemCount} item${wishlistItemCount === 1 ? "" : "s"}`}
            className="relative hidden h-11 w-11 items-center justify-center rounded-full border border-border/70 bg-background/92 text-foreground shadow-[0_10px_20px_-16px_rgba(15,23,42,0.16)] transition hover:bg-background lg:inline-flex"
          >
            <Heart className={`h-4.5 w-4.5 ${wishlistItemCount > 0 ? "fill-primary/12" : ""}`} />
            {wishlistItemCount > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[0.66rem] font-bold text-primary-foreground">
                {wishlistItemCount}
              </span>
            ) : null}
          </Link>

          <button
            type="button"
            onClick={openCartDrawer}
            className="relative inline-flex h-11 items-center gap-2 rounded-full border border-border/70 bg-background/92 px-4 text-sm font-semibold text-foreground shadow-[0_10px_20px_-16px_rgba(15,23,42,0.16)] transition hover:bg-background"
            aria-label={cartLabel}
          >
            <ShoppingCart className="h-4.5 w-4.5" />
            <span className="hidden sm:inline">Cart</span>
            {cartItemCount > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[0.66rem] font-bold text-primary-foreground">
                {cartItemCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>

        <div className="hidden border-t border-border/70 bg-[linear-gradient(180deg,hsl(var(--background)/0.82),hsl(var(--card)/0.9))] shadow-[inset_0_1px_0_hsl(0_0%_100%/0.3),0_1px_3px_-2px_rgba(15,23,42,0.06)] md:block">
          <nav aria-label="Secondary navigation" className="salt-header-secondary-nav text-foreground">
            <button
              type="button"
              onClick={openMenu}
              className={collectionNavItemClass(menuOpen)}
              aria-expanded={menuOpen}
              aria-controls="salt-header-menu"
              aria-label={menuOpen ? "Close all collections menu" : "Open all collections menu"}
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
              to={resourcesNavItem.to}
              className={utilityNavItemClass(isActiveNavItem(resourcesNavItem, location.pathname, location.search))}
              aria-current={isActiveNavItem(resourcesNavItem, location.pathname, location.search) ? "page" : undefined}
            >
              <span>Resources</span>
            </Link>

            <Link
              to="/pages/contact-us"
              className={utilityNavItemClass(isActiveNavItem(supportNavItem, location.pathname, location.search))}
              aria-current={isActiveNavItem(supportNavItem, location.pathname, location.search) ? "page" : undefined}
            >
              <span>Support</span>
            </Link>
          </nav>
        </div>
      </header>
      <HeaderMenuDrawer open={menuOpen} onOpenChange={setMenuOpen} />
    </>
  );
};

export default MainHeader;
