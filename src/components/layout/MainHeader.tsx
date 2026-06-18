import { FormEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Heart, Menu, Search, ShoppingCart } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { filterProducts } from "@/lib/catalog";
import { getBrowserStorage } from "@/lib/browser-storage";
import { useCart } from "@/lib/cart";
import { conciseTitle, formatMoney, minPrice, productImage } from "@/lib/formatters";
import {
  SITE_COLLECTIONS,
  SITE_FOOTER_COMPANY_LINKS,
  SITE_FOOTER_RESOURCE_LINKS,
  SITE_FOOTER_POLICY_LINKS,
  SITE_RESOURCE_GUIDES,
  type SiteCollection,
  buildCollectionRoute,
  buildResourceRoute,
  getCollectionRoutePaths,
} from "@/lib/site-navigation";
import { useCollections, useProducts } from "@/lib/shopify-data";
import { useWishlist } from "@/lib/wishlist";
import BrandLogo from "@/components/layout/BrandLogo";
import {
  Sheet,
  SheetClose,
  SheetContent,
} from "@/components/ui/sheet";

const searchScopeOptions = [
  {
    label: "All",
    collection: "all-products",
  },
  {
    label: "New Arrivals",
    collection: "new-arrivals",
  },
  {
    label: "Cookware",
    collection: "cookware",
  },
  {
    label: "Home Decor",
    collection: "home-decor",
  },
  {
    label: "Apparel",
    collection: "apparel",
  },
  {
    label: "Gifts",
    collection: "gifts",
  },
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

const secondaryNavItems: HeaderNavItem[] = [
  {
    label: "All products",
    to: "/shop?collection=all-products",
    kind: "link",
    isActive: (pathname, search) => {
      const params = new URLSearchParams(search);
      const collection = params.get("collection");

      return (pathname === "/shop" || pathname === "/search") && (!collection || collection === "all-products");
    },
  },
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
type CollectionMenuPanelProps = {
  collection: SiteCollection;
};

function CollectionMenuPanel({ collection }: CollectionMenuPanelProps) {
  const [activeSubcollectionHandle, setActiveSubcollectionHandle] = useState(
    collection.subcollections[0]?.handle || "",
  );

  const activeSubcollection =
    collection.subcollections.find((subcollection) => subcollection.handle === activeSubcollectionHandle) ||
    collection.subcollections[0] ||
    null;

  return (
    <div className="w-[min(24rem,calc(100vw-0.75rem))] overflow-hidden border border-[#bfd4fb] bg-white shadow-[0_24px_40px_-32px_rgba(12,32,72,0.28)]">
      <div className="border-b border-[#edf3fb] bg-[#f7fbff] px-4 py-4 sm:px-5">
        <Link
          to={buildCollectionRoute(collection.handle)}
          className="inline-flex max-w-full text-[1rem] font-semibold leading-none tracking-[-0.03em] text-[#102A43] transition hover:text-[#ff6700]"
          onMouseEnter={() => setActiveSubcollectionHandle(collection.subcollections[0]?.handle || "")}
        >
          {collection.title}
        </Link>

        <p className="mt-1.5 max-w-[22rem] text-[0.78rem] leading-5 text-[#5C748F]">{collection.summary}</p>
      </div>

      <div className="px-2.5 py-2.5 sm:px-3">
        <div className="grid gap-1">
          {collection.subcollections.map((subcollection) => {
            const active = subcollection.handle === activeSubcollection?.handle;

            return (
              <Link
                key={subcollection.handle}
                to={`${buildCollectionRoute(collection.handle)}/${subcollection.handle}`}
                onMouseEnter={() => setActiveSubcollectionHandle(subcollection.handle)}
                onFocus={() => setActiveSubcollectionHandle(subcollection.handle)}
                className={`group flex items-center justify-between rounded-[0.75rem] px-3 py-2.5 text-sm transition ${
                  active ? "bg-[#f5faff] text-[#ff6700]" : "text-[#102A43] hover:bg-[#f5faff]"
                }`}
              >
                <span className={active ? "text-[#ff6700]" : "text-[#7a7a7a] group-hover:text-[#ff6700]"}>
                  {subcollection.title}
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#c0cada] transition group-hover:translate-x-0.5 group-hover:text-[#ff6700]" />
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[#edf3fb] px-4 py-3">
        <span className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-[#8a99aa]">Shop feed</span>
        <Link
          to={buildCollectionRoute(collection.handle)}
          className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-[#1f55aa] transition hover:text-[#17418f]"
        >
          Open collection
        </Link>
      </div>
    </div>
  );
}

function collectionNavItemClass(active: boolean) {
  return `${collectionNavTabBaseClass} ${active ? collectionNavTabActiveClass : collectionNavTabInactiveClass}`;
}

function utilityNavItemClass(active: boolean) {
  return `${utilityNavTabClass} ${active ? "border-[#f2b600] text-[#f2b600]" : ""}`;
}

const RECENT_SEARCHES_KEY = "salt-recent-searches";
const DEFAULT_TRENDING_SEARCHES = ["Gifts", "Candles", "Kitchen", "Pet accessories", "Home decor"];
const SHOPIFY_CUSTOMER_ACCOUNT_URL = "https://shopify.com/58076594275/account";

type HeaderMenuDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeCollectionHandle: string;
  onSelectCollection: (handle: string) => void;
};

function HeaderMenuDrawer({
  open,
  onOpenChange,
  activeCollectionHandle,
  onSelectCollection,
}: HeaderMenuDrawerProps) {
  const activeCollection =
    SITE_COLLECTIONS.find((collection) => collection.handle === activeCollectionHandle) || SITE_COLLECTIONS[0] || null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        id="salt-header-menu"
        side="left"
        style={{
          width: "min(46rem, calc(100vw - 0.75rem))",
          maxWidth: "min(46rem, calc(100vw - 0.75rem))",
        }}
        className="overflow-y-auto border-r border-[#BFD7F2] bg-[#F7FBFF] p-0 text-[#102A43] shadow-[0_24px_48px_-36px_rgba(12,32,72,0.32)]"
      >
        <div className="flex min-h-full flex-col">
          <div className="border-b border-[#BFD7F2] bg-[#0C2048] px-4 py-4 text-white">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 bg-white/10">
                <Menu className="h-5 w-5" />
              </div>

              <div className="min-w-0">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-white/60">
                  Browse SALT
                </p>
                <h2 className="font-display text-[1.6rem] leading-none">All</h2>
              </div>
            </div>

            <p className="mt-2.5 max-w-[18rem] text-sm leading-6 text-white/74">
              Collections, subcategories, resources, and support in one open panel.
            </p>
          </div>

          <div className="grid flex-1 gap-4 px-4 py-4 sm:grid-cols-[minmax(0,18.75rem)_minmax(24rem,1fr)]">
            <div className="min-w-0">
              <section className="border-b border-[#e2edf8] pb-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#5C748F]">Collections</p>
                <SheetClose asChild>
                  <Link
                    to="/collections"
                    className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-[#1f55aa] transition hover:text-[#17418f]"
                  >
                    View all
                  </Link>
                </SheetClose>
              </div>

              <div className="mt-3 grid gap-1">
                {SITE_COLLECTIONS.map((collection) => {
                  const active = activeCollection?.handle === collection.handle;

                  return (
                    <div key={collection.handle} className="border-b border-[#edf3fb] pb-2.5 last:border-b-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2">
                        <SheetClose asChild>
                          <Link
                            to={buildCollectionRoute(collection.handle)}
                            onMouseEnter={() => onSelectCollection(collection.handle)}
                            onFocus={() => onSelectCollection(collection.handle)}
                            className="min-w-0 flex-1 rounded-[0.75rem] px-1 py-1 text-left transition hover:bg-[#f5faff]"
                          >
                            <span className="block text-sm font-semibold leading-6 text-[#102A43]">
                              {collection.title}
                            </span>
                            <span className="mt-0.5 line-clamp-2 block text-[0.75rem] leading-5 text-[#5C748F]">
                              {collection.summary}
                            </span>
                          </Link>
                        </SheetClose>

                        <button
                          type="button"
                          onClick={() => onSelectCollection(active ? "" : collection.handle)}
                          className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#dbe8f6] bg-white text-[#7d90aa] transition hover:border-[#bfd7f2] hover:text-[#1f55aa]"
                          aria-label={`${active ? "Collapse" : "Expand"} ${collection.title}`}
                        >
                          <ChevronRight className={`h-4 w-4 transition ${active ? "rotate-90" : ""}`} />
                        </button>
                      </div>

                      {active ? (
                        <div className="mt-2 grid gap-1.5 border-l border-[#edf3fb] pl-3">
                          {collection.subcollections.map((subcollection) => (
                            <SheetClose asChild key={subcollection.handle}>
                              <Link
                                to={`${buildCollectionRoute(collection.handle)}/${subcollection.handle}`}
                                onMouseEnter={() => onSelectCollection(collection.handle)}
                                onFocus={() => onSelectCollection(collection.handle)}
                                className="group flex items-center justify-between rounded-[0.7rem] px-3 py-2 text-sm text-[#102A43] transition hover:bg-[#f5faff]"
                              >
                                <span className="line-clamp-1">{subcollection.title}</span>
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#c0cada] transition group-hover:translate-x-0.5 group-hover:text-[#1f55aa]" />
                              </Link>
                            </SheetClose>
                          ))}

                          <SheetClose asChild>
                            <Link
                              to={buildCollectionRoute(collection.handle)}
                              className="pt-1 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-[#1f55aa] transition hover:text-[#17418f]"
                            >
                              Open collection feed
                            </Link>
                          </SheetClose>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              </section>

              <section className="border-b border-[#e2edf8] py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#5C748F]">Resource Hub</p>
                  <SheetClose asChild>
                    <Link
                      to="/resources"
                      className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-[#1f55aa] transition hover:text-[#17418f]"
                    >
                      Open hub
                    </Link>
                  </SheetClose>
                </div>

                <div className="mt-3 grid gap-1.5">
                  {SITE_RESOURCE_GUIDES.map((guide) => (
                    <SheetClose asChild key={guide.handle}>
                      <Link
                        to={buildResourceRoute(guide.handle)}
                        className="group flex items-center justify-between rounded-[0.7rem] px-3 py-2 text-sm text-[#102A43] transition hover:bg-[#f5faff]"
                      >
                        <span className="line-clamp-1">{guide.title}</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#c0cada] transition group-hover:translate-x-0.5 group-hover:text-[#1f55aa]" />
                      </Link>
                    </SheetClose>
                  ))}
                </div>
              </section>

              <section className="border-b border-[#e2edf8] py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#5C748F]">
                    Account & support
                  </p>
                </div>

                <div className="mt-3 grid gap-1.5">
                  <SheetClose asChild>
                    <a
                      href={SHOPIFY_CUSTOMER_ACCOUNT_URL}
                      className="group flex items-center justify-between rounded-[0.7rem] px-3 py-2 text-sm text-[#102A43] transition hover:bg-[#f5faff]"
                    >
                      <span>Account & Orders</span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#c0cada] transition group-hover:translate-x-0.5 group-hover:text-[#1f55aa]" />
                    </a>
                  </SheetClose>

                  {SITE_FOOTER_COMPANY_LINKS.map((link) =>
                    link.href ? (
                      <SheetClose asChild key={link.label}>
                        <a
                          href={link.href}
                          className="group flex items-center justify-between rounded-[0.7rem] px-3 py-2 text-sm text-[#102A43] transition hover:bg-[#f5faff]"
                        >
                          <span>{link.label}</span>
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#c0cada] transition group-hover:translate-x-0.5 group-hover:text-[#1f55aa]" />
                        </a>
                      </SheetClose>
                    ) : (
                      <SheetClose asChild key={link.label}>
                        <Link
                          to={link.to || "/"}
                          className="group flex items-center justify-between rounded-[0.7rem] px-3 py-2 text-sm text-[#102A43] transition hover:bg-[#f5faff]"
                        >
                          <span>{link.label}</span>
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#c0cada] transition group-hover:translate-x-0.5 group-hover:text-[#1f55aa]" />
                        </Link>
                      </SheetClose>
                    ),
                  )}
                </div>
              </section>

              <section className="py-4">
                <div className="grid gap-4">
                  <div className="grid gap-1.5">
                    <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#5C748F]">Resources</p>
                    {SITE_FOOTER_RESOURCE_LINKS.map((link) =>
                      link.href ? (
                        <SheetClose asChild key={link.label}>
                          <a
                            href={link.href}
                            className="rounded-[0.7rem] px-3 py-2 text-sm text-[#102A43] transition hover:bg-[#f5faff]"
                          >
                            {link.label}
                          </a>
                        </SheetClose>
                      ) : (
                        <SheetClose asChild key={link.label}>
                          <Link
                            to={link.to || "/"}
                            className="rounded-[0.7rem] px-3 py-2 text-sm text-[#102A43] transition hover:bg-[#f5faff]"
                          >
                            {link.label}
                          </Link>
                        </SheetClose>
                      ),
                    )}
                  </div>

                  <div className="grid gap-1.5">
                    <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#5C748F]">Policies</p>
                    {SITE_FOOTER_POLICY_LINKS.map((link) =>
                      link.href ? (
                        <SheetClose asChild key={link.label}>
                          <a
                            href={link.href}
                            className="rounded-[0.7rem] px-3 py-2 text-sm text-[#102A43] transition hover:bg-[#f5faff]"
                          >
                            {link.label}
                          </a>
                        </SheetClose>
                      ) : (
                        <SheetClose asChild key={link.label}>
                          <Link
                            to={link.to || "/"}
                            className="rounded-[0.7rem] px-3 py-2 text-sm text-[#102A43] transition hover:bg-[#f5faff]"
                          >
                            {link.label}
                          </Link>
                        </SheetClose>
                      ),
                    )}
                  </div>
                </div>
              </section>
            </div>

            <div className="min-w-0 sm:sticky sm:top-4">
              <CollectionMenuPanel collection={activeCollection} />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

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
  const navigate = useNavigate();
  const location = useLocation();
  const { itemCount: cartItemCount, openCartDrawer } = useCart();
  const { itemCount: wishlistItemCount } = useWishlist();
  const headerRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedScope, setSelectedScope] = useState<HeaderSearchScope>("all-products");
  const [scopeOpen, setScopeOpen] = useState(false);
  const [openCollectionHandle, setOpenCollectionHandle] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuCollectionHandle, setMenuCollectionHandle] = useState(SITE_COLLECTIONS[0]?.handle || "");
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const deferredSearchQuery = useDeferredValue(searchQuery).trim();
  const shouldLoadSearchData = searchDropdownOpen;
  const { data: productsData } = useProducts(shouldLoadSearchData);
  const { data: collectionsData } = useCollections(shouldLoadSearchData);
  const allProducts = productsData?.products ?? [];
  const allCollections = collectionsData?.collections ?? [];
  const hasSearchQuery = Boolean(searchQuery.trim());
  const routeCollectionHandle = useMemo(() => {
    const matchedCollection = SITE_COLLECTIONS.find((collection) => {
      return getCollectionRoutePaths(collection.handle).some(
        (route) => location.pathname === route || location.pathname.startsWith(`${route}/`),
      );
    });

    return matchedCollection?.handle || "";
  }, [location.pathname]);
  const resourcesNavItem = secondaryNavItems.find((item) => item.label === "Resources") || secondaryNavItems[0];
  const supportNavItem = secondaryNavItems.find((item) => item.label === "Support") || secondaryNavItems[0];

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
    setOpenCollectionHandle(null);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    setMenuCollectionHandle(routeCollectionHandle || SITE_COLLECTIONS[0]?.handle || "");
  }, [menuOpen, routeCollectionHandle]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  const selectedScopeLabel =
    searchScopeOptions.find((option) => option.collection === selectedScope)?.label || "All";

  const openMenu = () => {
    setScopeOpen(false);
    setSearchDropdownOpen(false);
    setOpenCollectionHandle(null);
    setMenuCollectionHandle(routeCollectionHandle || SITE_COLLECTIONS[0]?.handle || "");
    setMenuOpen(true);
  };

  const dropdownProducts = useMemo(() => {
    if (!searchDropdownOpen || !allProducts.length) {
      return [];
    }

    if (!hasSearchQuery) {
      return allProducts.slice(0, 4);
    }

    const strictMatches = filterProducts(allProducts, { query: deferredSearchQuery }).slice(0, 4);
    if (strictMatches.length > 0) {
      return strictMatches;
    }

    const normalizedQuery = normalizeSearchPhrase(deferredSearchQuery);
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
  }, [allProducts, deferredSearchQuery, hasSearchQuery, searchDropdownOpen]);

  const trendingSearches = useMemo(() => {
    if (!searchDropdownOpen || !allProducts.length) {
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
  }, [allProducts, searchDropdownOpen]);

  const categorySuggestions = useMemo(() => {
    if (!searchDropdownOpen) {
      return [];
    }

    const query = normalizeSearchPhrase(deferredSearchQuery);
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
  }, [allCollections, allProducts, deferredSearchQuery, searchDropdownOpen]);

  const bestSellerCollection = useMemo(
    () =>
      searchDropdownOpen
        ? allCollections.find((collection) =>
            /best[\s-]*sellers?/i.test(`${collection.handle} ${collection.title}`),
          ) || null
        : null,
    [allCollections, searchDropdownOpen],
  );

  const summerCollection = useMemo(
    () =>
      searchDropdownOpen
        ? allCollections.find((collection) =>
            /(summer|sunny|vacation|beach)/i.test(`${collection.handle} ${collection.title}`),
          ) || null
        : null,
    [allCollections, searchDropdownOpen],
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
        className="sticky top-0 z-50 w-full border-b border-[#BFD7F2] bg-[#ECF4FC]/96 text-[#102A43] shadow-[0_18px_36px_-28px_rgba(12,32,72,0.22)] backdrop-blur-md"
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

        <form onSubmit={submitSearch} className="order-3 basis-full md:order-2 md:min-w-0 md:flex-1">
          <div
            ref={searchRef}
            onBlurCapture={handleSearchBlur}
            className="relative isolate flex h-11 overflow-visible rounded-[4px] border border-[#131A22] bg-white shadow-[0_1px_0_rgba(255,255,255,0.7)_inset] transition focus-within:border-[#F0A115] focus-within:shadow-[0_0_0_3px_rgba(255,153,0,0.12)]"
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
                  className="absolute left-0 top-[calc(100%+0.55rem)] z-40 w-[min(18rem,calc(100vw-1.25rem))] rounded-2xl border border-[#d5d5d5] bg-white p-2 shadow-[0_18px_36px_-28px_rgba(12,32,72,0.25)]"
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
              className="inline-flex h-full w-11 items-center justify-center rounded-r-[3px] border-l border-[#cdcdcd] bg-[#febd69] text-[#111111] transition hover:bg-[#f3a847]"
            >
              <Search className="h-[1.08rem] w-[1.08rem]" />
              <span className="sr-only">Search</span>
            </button>

            {searchDropdownOpen ? (
              <div
                className="absolute left-0 right-0 top-[calc(100%+0.55rem)] z-50"
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
                        onClick={() => {
                          setSearchDropdownOpen(false);
                          applySearchQuery(searchQuery);
                        }}
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
                            onClick={() => setSearchDropdownOpen(false)}
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
                                onClick={() => setSearchDropdownOpen(false)}
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
                      <p className="text-[0.64rem] font-bold uppercase tracking-[0.18em] text-[#5C748F]">
                        Popular routes
                      </p>
                      <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
                        {popularRoutes.map((route) => (
                          <Link
                            key={route.label}
                            to={route.to}
                            onClick={() => setSearchDropdownOpen(false)}
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
                        <p className="text-[0.64rem] font-bold uppercase tracking-[0.18em] text-[#5C748F]">
                          Quick picks
                        </p>
                        <p className="text-[0.52rem] font-semibold uppercase tracking-[0.12em] text-[#8a99aa]">
                          {recentSearches.length ? "Recent first" : "Trending first"}
                        </p>
                      </div>

                      {quickCategoryLinks.length ? (
                        <div className="mt-2.5">
                          <p className="text-[0.52rem] font-bold uppercase tracking-[0.14em] text-[#8a99aa]">
                            Categories
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {quickCategoryLinks.map((entry) => (
                              <Link
                                key={`${entry.label}-${entry.to}`}
                                to={entry.to}
                                onClick={() => setSearchDropdownOpen(false)}
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
                              onClick={() => runQuickSearch(term)}
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
        <nav
          aria-label="Secondary navigation"
          className="salt-header-secondary-nav text-white"
        >
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

          {SITE_COLLECTIONS.map((collection) => {
            const isActive = openCollectionHandle === collection.handle || routeCollectionHandle === collection.handle;

            return (
              <Popover
                key={collection.handle}
                open={openCollectionHandle === collection.handle}
                onOpenChange={(open) => setOpenCollectionHandle(open ? collection.handle : null)}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenCollectionHandle((current) => (current === collection.handle ? null : collection.handle))
                    }
                    className={collectionNavItemClass(isActive)}
                    aria-expanded={openCollectionHandle === collection.handle}
                  >
                    <span>{collection.title}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={0}
                  className="w-auto border-0 bg-transparent p-0 shadow-none"
                >
                  <CollectionMenuPanel collection={collection} />
                </PopoverContent>
              </Popover>
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
        activeCollectionHandle={menuCollectionHandle}
        onSelectCollection={setMenuCollectionHandle}
      />
    </>
  );
};

export default MainHeader;
