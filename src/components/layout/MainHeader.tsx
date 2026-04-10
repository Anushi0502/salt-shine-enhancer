import { FormEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Menu,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";
import BrandLogo from "@/components/layout/BrandLogo";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { useCart } from "@/lib/cart";
import { buildCustomerAccessPath, useCustomerAuth } from "@/lib/customer-auth";
import { formatMoney, minPrice, productImage } from "@/lib/formatters";
import { useCollections, useProducts } from "@/lib/shopify-data";
import type { ShopifyCollection, ShopifyProduct } from "@/types/shopify";

const navLinks = [
  { to: "/shop", label: "Shop" },
  { to: "/collections", label: "Collections" },
  { to: "/blog", label: "Journal" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Support" },
];

type SearchSuggestions = {
  products: ShopifyProduct[];
  collections: ShopifyCollection[];
};

function normalizeText(value: string | string[] | null | undefined): string {
  if (Array.isArray(value)) {
    return value.join(" ");
  }

  return String(value || "").trim().toLowerCase();
}

function buildSearchSuggestions(
  query: string,
  products: ShopifyProduct[],
  collections: ShopifyCollection[],
): SearchSuggestions {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2) {
    return { products: [], collections: [] };
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const includesAllTokens = (haystack: string) =>
    tokens.every((token) => haystack.includes(token));

  const productMatches = products
    .filter((product) =>
      includesAllTokens(
        [
          product.title,
          product.product_type,
          normalizeText(product.tags),
          product.vendor,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      ),
    )
    .slice(0, 5);

  const collectionMatches = collections
    .filter((collection) =>
      includesAllTokens(
        [collection.title, collection.handle, collection.description]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      ),
    )
    .slice(0, 4);

  return {
    products: productMatches,
    collections: collectionMatches,
  };
}

function navClassName({ isActive }: { isActive: boolean }): string {
  return [
    "inline-flex items-center rounded-full px-3 py-2 text-[0.76rem] font-semibold tracking-[0.04em] transition xl:px-4 xl:py-2.5 xl:text-[0.82rem]",
    isActive
      ? "bg-[hsl(var(--salt-ink))] text-white shadow-[0_18px_36px_-28px_rgba(15,23,42,0.34)] hover:text-white"
      : "text-[hsl(var(--salt-ink))] opacity-80 hover:bg-card hover:text-[hsl(var(--salt-ink))] hover:opacity-100 dark:text-white dark:opacity-78 dark:hover:bg-white/8 dark:hover:text-white",
  ].join(" ");
}

function mobileNavClassName({ isActive }: { isActive: boolean }): string {
  return [
    "flex h-12 w-full items-center justify-start rounded-[1rem] border px-4 text-[0.92rem] font-semibold tracking-[0.01em] transition",
    isActive
      ? "border-[hsl(var(--salt-ink))] bg-[hsl(var(--salt-ink))] text-[hsl(var(--salt-paper))] shadow-[0_18px_34px_-28px_rgba(15,23,42,0.36)]"
      : "border-border/75 bg-background text-foreground hover:border-primary/35 hover:text-primary",
  ].join(" ");
}

type SearchPanelProps = {
  collections: ShopifyCollection[];
  mode?: "desktop" | "mobile";
  onCollectionSelect: () => void;
  onClose: () => void;
  onProductSelect: () => void;
  onSearchAll: () => void;
  query: string;
  suggestions: SearchSuggestions;
};

const SearchPanel = ({
  collections,
  mode = "desktop",
  onCollectionSelect,
  onClose,
  onProductSelect,
  onSearchAll,
  query,
  suggestions,
}: SearchPanelProps) => {
  const hasSuggestions = suggestions.products.length > 0 || suggestions.collections.length > 0;
  const panelClassName =
    mode === "mobile"
      ? "absolute left-0 right-0 top-[calc(100%+0.7rem)] z-50 max-h-[min(24rem,56svh)] overflow-y-auto overflow-x-hidden rounded-[1rem] border border-border/85 bg-[linear-gradient(180deg,hsl(var(--card)),hsl(var(--background)))] shadow-[0_30px_90px_-50px_rgba(15,23,42,0.24)]"
      : "absolute right-0 top-[calc(100%+0.7rem)] z-50 w-[min(44rem,calc(100vw-1.5rem))] overflow-hidden rounded-[1.05rem] border border-border/80 bg-[linear-gradient(180deg,hsl(var(--card)),hsl(var(--background)))] shadow-[0_30px_90px_-50px_rgba(15,23,42,0.24)]";

  return (
    <div className={panelClassName} onMouseDown={(event) => event.preventDefault()}>
      {hasSuggestions ? (
        <div className="grid gap-4 p-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="mb-3 flex items-center justify-between gap-3 pr-12">
              <div className="min-w-0">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-primary">
                  Products
                </p>
              </div>
              <button
                type="button"
                onClick={onSearchAll}
                className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition hover:text-foreground"
              >
                Search all
              </button>
            </div>

            <div className="space-y-2">
              {suggestions.products.map((product) => {
                const image = productImage(product);

                return (
                  <Link
                    key={product.id}
                    to={`/products/${product.handle}`}
                    onClick={onProductSelect}
                    className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[0.9rem] border border-border/70 bg-card/80 p-3 transition hover:border-primary/35 hover:bg-background"
                  >
                    <div className="h-16 w-14 overflow-hidden rounded-[0.85rem] bg-muted">
                      {image ? (
                        <img src={image} alt={product.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-[0.52rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          No image
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-semibold leading-5 text-foreground transition group-hover:text-primary">
                        {product.title}
                      </p>
                      <p className="mt-1 text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
                        {product.product_type || "Curated pick"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold text-foreground">{formatMoney(minPrice(product))}</p>
                      <p className="mt-1 whitespace-nowrap text-[0.68rem] text-muted-foreground">View product</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="rounded-[0.95rem] border border-border/70 bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--card)))] p-4">
            <p className="pr-10 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-primary">
              Collections
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.collections.map((collection) => (
                <Link
                  key={collection.id}
                  to={`/shop?collection=${collection.handle}`}
                  onClick={onCollectionSelect}
                  className="salt-outline-chip h-9 px-4 py-0 text-[0.68rem]"
                >
                  {collection.title}
                </Link>
              ))}
            </div>

            <div className="mt-5 rounded-[0.95rem] border border-border/70 bg-card/82 p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Popular routes
              </p>
              <div className="mt-3 space-y-2">
                {collections.slice(0, 4).map((collection) => (
                  <Link
                    key={collection.id}
                    to={`/shop?collection=${collection.handle}`}
                    onClick={onCollectionSelect}
                    className="flex items-center justify-between rounded-[0.8rem] px-3 py-2 text-sm font-medium text-foreground transition hover:bg-background hover:text-primary"
                  >
                    <span>{collection.title}</span>
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-5">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-primary">
            Search SALT
          </p>
          <button
            type="button"
            onClick={onSearchAll}
            className="salt-primary-cta mt-3 h-11 px-5 text-[0.72rem] font-semibold uppercase tracking-[0.1em]"
          >
            Search for “{query.trim()}”
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground transition hover:text-foreground"
        aria-label="Close search suggestions"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

const MainHeader = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { itemCount, openCartDrawer } = useCart();
  const { data: productsPayload } = useProducts();
  const { data: collectionsPayload } = useCollections();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobilePanelTop, setMobilePanelTop] = useState(0);
  const [desktopSearch, setDesktopSearch] = useState("");
  const [mobileSearch, setMobileSearch] = useState("");
  const [activePanel, setActivePanel] = useState<"desktop" | "mobile" | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const desktopSearchRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchRef = useRef<HTMLInputElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const { isAuthenticated, logout } = useCustomerAuth();

  const products = productsPayload?.products ?? [];
  const collections = useMemo(
    () =>
      [...(collectionsPayload?.collections ?? [])]
        .sort((left, right) => right.products_count - left.products_count)
        .slice(0, 7),
    [collectionsPayload],
  );
  const activeQuery = useMemo(() => searchParams.get("q") || "", [searchParams]);
  const deferredDesktopSearch = useDeferredValue(desktopSearch);
  const deferredMobileSearch = useDeferredValue(mobileSearch);
  const desktopSuggestions = useMemo(
    () => buildSearchSuggestions(deferredDesktopSearch, products, collections),
    [collections, deferredDesktopSearch, products],
  );
  const mobileSuggestions = useMemo(
    () => buildSearchSuggestions(deferredMobileSearch, products, collections),
    [collections, deferredMobileSearch, products],
  );
  const orderHistoryHref = isAuthenticated
    ? "/order-history"
    : buildCustomerAccessPath({ mode: "login", next: "/order-history", reason: "orders" });
  const loginHref = buildCustomerAccessPath({ mode: "login", next: "/order-history", reason: "account" });
  const signupHref = buildCustomerAccessPath({ mode: "signup", next: "/order-history", reason: "account" });

  useEffect(() => {
    setDesktopSearch(activeQuery);
    setMobileSearch(activeQuery);
  }, [activeQuery]);

  useEffect(() => {
    if (!mobileOpen || typeof window === "undefined") {
      return;
    }

    const timer = window.setTimeout(() => {
      mobileSearchRef.current?.focus();
    }, 80);

    return () => window.clearTimeout(timer);
  }, [mobileOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;

    if (!mobileOpen) {
      setMobilePanelTop(0);
      return () => undefined;
    }

    const updateMobilePanelTop = () => {
      setMobilePanelTop(headerRef.current?.getBoundingClientRect().bottom ?? 0);
    };

    updateMobilePanelTop();
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    window.addEventListener("resize", updateMobilePanelTop);
    window.addEventListener("scroll", updateMobilePanelTop, { passive: true });

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;
      window.removeEventListener("resize", updateMobilePanelTop);
      window.removeEventListener("scroll", updateMobilePanelTop);
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable =
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT";

      if (event.key === "Escape") {
        setActivePanel(null);
        setAccountMenuOpen(false);
        if (mobileOpen) {
          setMobileOpen(false);
        }
        return;
      }

      if (isEditable) {
        return;
      }

      const slashShortcut =
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey;
      const commandShortcut = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);

      if (!slashShortcut && !commandShortcut) {
        return;
      }

      event.preventDefault();

      if (window.matchMedia("(min-width: 1024px)").matches) {
        desktopSearchRef.current?.focus();
        desktopSearchRef.current?.select();
        setActivePanel("desktop");
      } else {
        setMobileOpen(true);
        window.setTimeout(() => {
          mobileSearchRef.current?.focus();
          mobileSearchRef.current?.select();
          setActivePanel("mobile");
        }, 90);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  const submitSearch = (query: string) => {
    const trimmed = query.trim();
    setActivePanel(null);

    if (trimmed) {
      navigate(`/shop?q=${encodeURIComponent(trimmed)}`);
      return;
    }

    navigate("/shop");
  };

  const onDesktopSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitSearch(desktopSearch || activeQuery);
  };

  const onMobileSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitSearch(mobileSearch || activeQuery);
    setMobileOpen(false);
  };

  const closeMobileMenu = () => {
    setActivePanel(null);
    setMobileOpen(false);
  };

  return (
    <header
      ref={headerRef}
      className="relative sticky top-0 z-50 border-b border-border/70 bg-[linear-gradient(90deg,rgba(255,247,224,0.992),rgba(250,244,235,0.994),rgba(243,247,251,0.992))] shadow-[0_16px_42px_-34px_rgba(15,23,42,0.24)] dark:bg-[linear-gradient(90deg,rgba(20,27,42,0.995),rgba(18,24,38,0.996),rgba(22,28,44,0.995))] dark:shadow-[0_18px_46px_-32px_rgba(0,0,0,0.72)]"
    >
      <div className="border-b border-border/60 bg-[hsl(var(--salt-ink))] text-[hsl(var(--salt-paper))]">
        <div className="mx-auto flex w-[min(1340px,94vw)] flex-col items-center gap-1.5 py-2 text-center text-[0.58rem] font-medium uppercase tracking-[0.14em] text-white/78 sm:flex-row sm:justify-between sm:gap-3 sm:text-left sm:text-[0.72rem] sm:tracking-[0.16em]">
          <span className="max-w-[24rem]">Curated home, gifts, lifestyle, and everyday essentials</span>
          <span className="hidden md:inline">Free shipping across the US</span>
          <span className="max-w-[20rem]">Fast checkout and 30-day returns</span>
        </div>
      </div>

      <div className="mx-auto grid w-[min(1340px,94vw)] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-2.5 sm:gap-3 sm:py-3 md:gap-4 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:py-4">
        <Link to="/" className="min-w-0 shrink-0" aria-label="Go to SALT homepage">
          <BrandLogo withWordmark size="sm" className="xl:hidden" />
          <BrandLogo withWordmark size="md" className="hidden xl:inline-flex" />
        </Link>

        <nav className="hidden min-w-0 items-center justify-center gap-1 lg:flex xl:gap-1.5">
          {navLinks.map((link) => (
            <NavLink key={link.to} to={link.to} className={navClassName}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden min-w-0 items-center gap-2 md:flex lg:justify-self-end">
          <form onSubmit={onDesktopSearch} className="relative w-[min(14.5rem,18vw)] xl:w-[min(17rem,21vw)] 2xl:w-[19rem]">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={desktopSearchRef}
              type="search"
              value={desktopSearch}
              onChange={(event) => setDesktopSearch(event.target.value)}
              onFocus={() => setActivePanel("desktop")}
              onBlur={() => window.setTimeout(() => setActivePanel(null), 120)}
              placeholder="Search..."
              aria-label="Search products"
              className="salt-form-control h-10 w-full rounded-full border-transparent bg-card/85 pl-10 pr-11 text-[0.88rem] shadow-none"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full border border-border/70 bg-background/88 px-1.5 py-1 text-[0.54rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground 2xl:block">
              / K
            </span>
            {activePanel === "desktop" && deferredDesktopSearch.trim().length >= 2 ? (
              <SearchPanel
                collections={collections}
                query={desktopSearch}
                suggestions={desktopSuggestions}
                mode="desktop"
                onCollectionSelect={() => setActivePanel(null)}
                onClose={() => setActivePanel(null)}
                onProductSelect={() => setActivePanel(null)}
                onSearchAll={() => submitSearch(desktopSearch)}
              />
            ) : null}
          </form>

          <ThemeToggle className="shrink-0" />

          <div ref={accountMenuRef} className="relative hidden xl:block">
            <button
              type="button"
              onClick={() => setAccountMenuOpen((open) => !open)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-primary/40 bg-[hsl(var(--salt-accent))] px-5 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-white shadow-[0_14px_34px_-24px_rgba(37,99,235,0.7)] transition hover:bg-[hsl(var(--salt-accent)/0.92)] xl:h-11 xl:px-6 xl:text-[0.75rem]"
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
            >
              <span className="inline-flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Account
              </span>
              <ChevronDown
                className={`h-4 w-4 transition ${accountMenuOpen ? "rotate-180" : ""}`}
              />
            </button>

            {accountMenuOpen ? (
              <div className="absolute right-0 top-[calc(100%+0.65rem)] z-50 w-56 rounded-[1.15rem] border border-border/80 bg-[linear-gradient(180deg,hsl(var(--card)),hsl(var(--background)))] p-2 shadow-[0_30px_80px_-42px_rgba(15,23,42,0.28)]">
                {isAuthenticated ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        openCartDrawer();
                      }}
                      className="flex h-11 w-full items-center justify-between rounded-[0.95rem] px-3 text-sm font-medium text-foreground transition hover:bg-background hover:text-primary"
                    >
                      <span className="inline-flex items-center gap-2">
                        <ShoppingBag className="h-4 w-4" />
                        Cart
                      </span>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <Link
                      to={orderHistoryHref}
                      onClick={() => setAccountMenuOpen(false)}
                      className="flex h-11 items-center justify-between rounded-[0.95rem] px-3 text-sm font-medium text-foreground transition hover:bg-background hover:text-primary"
                    >
                      <span className="inline-flex items-center gap-2">
                        <ClipboardList className="h-4 w-4" />
                        Orders
                      </span>
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        logout();
                        setAccountMenuOpen(false);
                      }}
                      className="flex h-11 w-full items-center justify-between rounded-[0.95rem] px-3 text-sm font-medium text-foreground transition hover:bg-background hover:text-primary"
                    >
                      <span>Logout</span>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        openCartDrawer();
                      }}
                      className="flex h-11 w-full items-center justify-between rounded-[0.95rem] px-3 text-sm font-medium text-foreground transition hover:bg-background hover:text-primary"
                    >
                      <span className="inline-flex items-center gap-2">
                        <ShoppingBag className="h-4 w-4" />
                        Cart
                      </span>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <Link
                      to={loginHref}
                      onClick={() => setAccountMenuOpen(false)}
                      className="flex h-11 items-center justify-between rounded-[0.95rem] px-3 text-sm font-medium text-foreground transition hover:bg-background hover:text-primary"
                    >
                      <span>Login</span>
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                    <Link
                      to={signupHref}
                      onClick={() => setAccountMenuOpen(false)}
                      className="flex h-11 items-center justify-between rounded-[0.95rem] px-3 text-sm font-medium text-foreground transition hover:bg-background hover:text-primary"
                    >
                      <span>Sign up</span>
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                    <Link
                      to={orderHistoryHref}
                      onClick={() => setAccountMenuOpen(false)}
                      className="flex h-11 items-center justify-between rounded-[0.95rem] px-3 text-sm font-medium text-foreground transition hover:bg-background hover:text-primary"
                    >
                      <span className="inline-flex items-center gap-2">
                        <ClipboardList className="h-4 w-4" />
                        Orders
                      </span>
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/70 bg-card text-[hsl(var(--salt-ink))] transition hover:border-primary/35 dark:text-white lg:hidden"
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div className="hidden border-t border-border/70 bg-[linear-gradient(90deg,rgba(255,247,224,0.96),rgba(250,244,235,0.975),rgba(243,247,251,0.97))] dark:bg-[linear-gradient(90deg,rgba(22,30,46,0.985),rgba(18,24,38,0.986),rgba(20,28,42,0.985))] lg:block">
        <div className="mx-auto flex w-[min(1340px,94vw)] flex-col gap-3 py-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {collections.map((collection) => (
              <Link
                key={collection.id}
                to={`/shop?collection=${collection.handle}`}
                className="salt-outline-chip h-9 px-3 py-0 text-[0.68rem] xl:px-4 xl:text-[0.7rem]"
              >
                {collection.title}
              </Link>
            ))}
          </div>
          <p className="hidden text-[0.72rem] font-medium uppercase tracking-[0.16em] text-muted-foreground 2xl:block">
            Home, gifts, apparel, kitchen, decor, seasonal
          </p>
        </div>
      </div>

      {mobileOpen ? (
        <div
          className="fixed inset-x-0 z-[80] border-t border-border/75 bg-[linear-gradient(180deg,rgba(255,251,242,0.998),rgba(250,245,236,0.998),rgba(244,248,252,0.998))] shadow-[0_26px_60px_-42px_rgba(15,23,42,0.24)] dark:bg-[linear-gradient(180deg,rgba(22,30,46,0.995),rgba(18,24,38,0.996),rgba(17,23,36,0.995))] dark:shadow-[0_30px_70px_-42px_rgba(0,0,0,0.74)] lg:hidden"
          style={{
            top: mobilePanelTop ? `${mobilePanelTop}px` : undefined,
            height: mobilePanelTop ? `calc(100svh - ${mobilePanelTop}px)` : undefined,
          }}
        >
          <div className="mx-auto h-full w-[min(1340px,94vw)] overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 sm:py-4">
            <div className="grid gap-3.5 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <div className="rounded-[1.35rem] border border-border/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.985),rgba(250,247,241,0.975))] p-3.5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.14)] sm:rounded-[1.6rem] sm:p-4">
              <form onSubmit={onMobileSearch} className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={mobileSearchRef}
                  type="search"
                  value={mobileSearch}
                  onChange={(event) => setMobileSearch(event.target.value)}
                  onFocus={() => setActivePanel("mobile")}
                  onBlur={() => window.setTimeout(() => setActivePanel(null), 120)}
                  placeholder="Search by product or collection"
                  className="salt-form-control h-12 w-full rounded-full border-transparent bg-background pl-11 pr-4 shadow-none"
                />
                {activePanel === "mobile" && deferredMobileSearch.trim().length >= 2 ? (
                  <SearchPanel
                    collections={collections}
                    query={mobileSearch}
                    suggestions={mobileSuggestions}
                    mode="mobile"
                    onCollectionSelect={closeMobileMenu}
                    onClose={() => setActivePanel(null)}
                    onProductSelect={closeMobileMenu}
                    onSearchAll={() => {
                      submitSearch(mobileSearch);
                      closeMobileMenu();
                    }}
                  />
                ) : null}
              </form>

              <div className="mt-3 grid gap-2">
                {navLinks.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    className={mobileNavClassName}
                    onClick={closeMobileMenu}
                  >
                    {link.label}
                  </NavLink>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 rounded-[1rem] border border-border/70 bg-background/85 px-4 py-3">
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Theme
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    Switch light and dark mode
                  </p>
                </div>
                <ThemeToggle className="shrink-0" />
              </div>
            </div>

            <div className="rounded-[1.25rem] border border-border/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(249,246,240,0.965))] p-3.5 shadow-[0_16px_34px_-28px_rgba(15,23,42,0.12)] sm:rounded-[1.45rem] sm:p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-primary">
                Shop by collection
              </p>
              <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
                {collections.map((collection) => (
                  <Link
                    key={collection.id}
                    to={`/shop?collection=${collection.handle}`}
                    onClick={closeMobileMenu}
                    className="salt-outline-chip h-9 shrink-0 px-4 py-0 text-[0.68rem]"
                  >
                    {collection.title}
                  </Link>
                ))}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {isAuthenticated ? (
                <>
                  <Link
                    to={orderHistoryHref}
                    onClick={closeMobileMenu}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border/75 bg-background px-4 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-foreground"
                  >
                    Orders
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      closeMobileMenu();
                    }}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border/75 bg-background px-4 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-foreground"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to={loginHref}
                    onClick={closeMobileMenu}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border/75 bg-background px-4 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-foreground"
                  >
                    Login
                  </Link>
                  <Link
                    to={signupHref}
                    onClick={closeMobileMenu}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border/75 bg-background px-4 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-foreground"
                  >
                    Sign up
                  </Link>
                </>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Link
                to={orderHistoryHref}
                onClick={closeMobileMenu}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border/75 bg-background px-4 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-foreground"
              >
                <ClipboardList className="h-4 w-4" />
                Orders
              </Link>
              <button
                type="button"
                onClick={() => {
                  closeMobileMenu();
                  openCartDrawer();
                }}
                className="salt-primary-cta inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-[0.72rem] font-semibold uppercase tracking-[0.12em]"
              >
                <ShoppingBag className="h-4 w-4" />
                Cart ({itemCount})
              </button>
            </div>
          </div>
        </div>
        </div>
      ) : null}
    </header>
  );
};

export default MainHeader;
