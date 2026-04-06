import { FormEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronRight,
  ClipboardList,
  Menu,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";
import BrandLogo from "@/components/layout/BrandLogo";
import { useCart } from "@/lib/cart";
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
      ? "bg-[hsl(var(--salt-ink))] text-[hsl(var(--salt-paper))] shadow-[0_18px_36px_-28px_rgba(15,23,42,0.34)]"
      : "text-foreground/78 hover:bg-card hover:text-foreground",
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
      ? "absolute left-0 right-0 top-[calc(100%+0.7rem)] z-50 overflow-hidden rounded-[1.05rem] border border-border/80 bg-[linear-gradient(180deg,hsl(var(--card)),hsl(var(--background)))] shadow-[0_30px_90px_-50px_rgba(15,23,42,0.24)]"
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
  const [desktopSearch, setDesktopSearch] = useState("");
  const [mobileSearch, setMobileSearch] = useState("");
  const [activePanel, setActivePanel] = useState<"desktop" | "mobile" | null>(null);
  const desktopSearchRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchRef = useRef<HTMLInputElement | null>(null);

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

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable =
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT";

      if (event.key === "Escape") {
        setActivePanel(null);
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
    <header className="sticky top-0 z-50 border-b border-border/70 bg-[linear-gradient(90deg,rgba(255,247,224,0.98),rgba(250,244,235,0.985),rgba(243,247,251,0.98))] shadow-[0_16px_42px_-34px_rgba(15,23,42,0.24)]">
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

          <Link
            to="/order-history"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-foreground transition hover:border-primary/35 hover:text-primary 2xl:h-10 2xl:w-auto 2xl:gap-2 2xl:px-3"
            aria-label="Order history"
            title="Order history"
          >
            <ClipboardList className="h-4 w-4" />
            <span className="hidden 2xl:inline">Orders</span>
          </Link>

          <button
            type="button"
            onClick={openCartDrawer}
            className="salt-primary-cta inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[0.7rem] font-semibold uppercase tracking-[0.12em] xl:h-11 xl:px-5 xl:text-[0.75rem]"
            aria-label={`Open cart with ${itemCount} item${itemCount === 1 ? "" : "s"}`}
          >
            <ShoppingBag className="h-4 w-4" />
            Cart
            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-white/16 px-2 py-0.5 text-[0.68rem]">
              {itemCount}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/70 bg-card text-foreground transition hover:border-primary/35 lg:hidden"
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div className="hidden border-t border-border/70 bg-[linear-gradient(90deg,rgba(255,247,224,0.96),rgba(250,244,235,0.975),rgba(243,247,251,0.97))] lg:block">
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
        <div className="border-t border-border/70 bg-background/96 px-3 py-3 shadow-[0_26px_60px_-42px_rgba(15,23,42,0.24)] sm:px-4 sm:py-4 lg:hidden">
          <div className="mx-auto grid w-[min(1340px,94vw)] gap-4">
            <div className="rounded-[1.4rem] border border-border/70 bg-card/82 p-3.5 sm:rounded-[1.6rem] sm:p-4">
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

              <div className="mt-4 grid gap-2">
                {navLinks.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    className={({ isActive }) =>
                      `${navClassName({ isActive })} justify-center text-sm`
                    }
                    onClick={closeMobileMenu}
                  >
                    {link.label}
                  </NavLink>
                ))}
              </div>
            </div>

            <div className="rounded-[1.35rem] border border-border/70 bg-card/78 p-3.5 sm:rounded-[1.45rem] sm:p-4">
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
              <Link
                to="/order-history"
                onClick={closeMobileMenu}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border/70 bg-card px-4 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-foreground"
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
      ) : null}
    </header>
  );
};

export default MainHeader;
