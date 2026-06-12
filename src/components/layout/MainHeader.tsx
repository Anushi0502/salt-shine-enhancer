import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, Globe, Menu, Search, ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

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
    isActive: (pathname, search) => {
      const params = new URLSearchParams(search);
      const collection = params.get("collection");

      return (pathname === "/shop" || pathname === "/search") && (!collection || collection === "all-products");
    },
  },
  {
    label: "Collections",
    to: "/collections",
    isActive: (pathname) => pathname === "/collections" || pathname.startsWith("/collections/"),
  },
  {
    label: "New Arrivals",
    to: "/shop?collection=new-arrivals",
    isActive: (pathname, search) => isCollectionRouteActive(pathname, search, "new-arrivals"),
  },
  {
    label: "Cookware",
    to: "/shop?collection=cookware",
    isActive: (pathname, search) => isCollectionRouteActive(pathname, search, "cookware"),
  },
  {
    label: "Home Decor",
    to: "/shop?collection=home-decor",
    isActive: (pathname, search) => isCollectionRouteActive(pathname, search, "home-decor"),
  },
  {
    label: "Apparel",
    to: "/shop?collection=apparel",
    isActive: (pathname, search) => isCollectionRouteActive(pathname, search, "apparel"),
  },
  {
    label: "Gifts",
    to: "/shop?collection=gifts",
    isActive: (pathname, search) => isCollectionRouteActive(pathname, search, "gifts"),
  },
  {
    label: "Support",
    to: "/contact",
    isActive: (pathname) => pathname === "/contact" || pathname.startsWith("/pages/contact"),
  },
];

function isActiveNavItem(item: HeaderNavItem, pathname: string, search: string): boolean {
  if (item.isActive) {
    return item.isActive(pathname, search);
  }

  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

const MainHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { itemCount, openCartDrawer } = useCart();
  const headerRef = useRef<HTMLElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedScope, setSelectedScope] = useState<HeaderSearchScope>("all-products");
  const [scopeOpen, setScopeOpen] = useState(false);

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
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setScopeOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const selectedScopeLabel =
    searchScopeOptions.find((option) => option.collection === selectedScope)?.label || "All";

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const query = searchQuery.trim();
    const params = new URLSearchParams();

    params.set("collection", selectedScope);

    if (query) {
      params.set("q", query);
    }

    navigate(`/shop?${params.toString()}`);
    setScopeOpen(false);
  };

  const setScope = (nextScope: HeaderSearchScope) => {
    setSelectedScope(nextScope);
    setScopeOpen(false);
  };

  const cartLabel = `Cart with ${itemCount} item${itemCount === 1 ? "" : "s"}`;

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 border-b border-[#BFD7F2] bg-[#ECF4FC]/96 text-[#102A43] shadow-[0_18px_36px_-28px_rgba(12,32,72,0.22)] backdrop-blur-md"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-3 py-3 sm:px-4 lg:px-8">
        <div className="order-1 flex min-w-0 flex-1 items-center gap-2 md:flex-none">
          <Link
            to="/"
            aria-label="SALT Online Store"
            className="flex min-w-0 items-center rounded-full px-1.5 py-1 transition hover:bg-white/65"
          >
            <img
              src="/brand/salt-logo.png"
              alt="SALT Online Store"
              className="block h-11 w-auto select-none object-contain sm:h-12"
              loading="eager"
              decoding="async"
              draggable={false}
            />
          </Link>

          <div className="ml-auto flex items-center gap-2 md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <button
                  type="button"
                  onClick={() => setScopeOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#BFD7F2] bg-white/90 text-[#0C2048] shadow-sm transition hover:bg-[#D0E4FC]"
                  aria-label="Open menu"
                >
                  <Menu className="h-4.5 w-4.5" />
                </button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-full !max-w-[21rem] overflow-y-auto border-l border-[#BFD7F2] bg-[#F7FBFF] px-0"
              >
                <div className="flex min-h-full flex-col">
                  <SheetHeader className="border-b border-[#BFD7F2] px-4 pb-4 pt-10 text-left">
                    <SheetTitle className="font-display text-[clamp(1.6rem,4.8vw,2.1rem)] leading-tight text-[#102A43]">
                      Menu
                    </SheetTitle>
                    <SheetDescription className="text-sm leading-6 text-[#5C748F]">
                      Browse the catalog, collections, and account tools.
                    </SheetDescription>
                  </SheetHeader>

                  <div className="flex-1 px-4 py-4">
                    <div className="grid gap-1.5">
                      {secondaryNavItems.map((item) => {
                        const active = isActiveNavItem(item, location.pathname, location.search);

                        return (
                          <SheetClose asChild key={item.label}>
                            <Link
                              to={item.to}
                              className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                                active
                                  ? "border-[#D0E4FC] bg-[#D0E4FC] text-[#0C2048]"
                                  : "border-[#d8e6f5] bg-white text-[#102A43] hover:border-[#bcd4ef] hover:bg-[#f5faff]"
                              }`}
                              aria-current={active ? "page" : undefined}
                            >
                              {item.label}
                            </Link>
                          </SheetClose>
                        );
                      })}
                    </div>

                    <div className="mt-6 grid gap-1.5">
                      <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[#5C748F]">
                        Account
                      </p>

                      <SheetClose asChild>
                        <Link
                          to="/account"
                          className="rounded-2xl border border-[#d8e6f5] bg-white px-4 py-3 text-sm font-semibold text-[#102A43] transition hover:border-[#bcd4ef] hover:bg-[#f5faff]"
                        >
                          Account & Lists
                        </Link>
                      </SheetClose>

                      <SheetClose asChild>
                        <Link
                          to="/account/orders"
                          className="rounded-2xl border border-[#d8e6f5] bg-white px-4 py-3 text-sm font-semibold text-[#102A43] transition hover:border-[#bcd4ef] hover:bg-[#f5faff]"
                        >
                          Track order
                        </Link>
                      </SheetClose>

                      <SheetClose asChild>
                        <Link
                          to="/contact"
                          className="rounded-2xl border border-[#d8e6f5] bg-white px-4 py-3 text-sm font-semibold text-[#102A43] transition hover:border-[#bcd4ef] hover:bg-[#f5faff]"
                        >
                          Contact support
                        </Link>
                      </SheetClose>
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <button
              type="button"
              onClick={openCartDrawer}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#BFD7F2] bg-white/90 text-[#0C2048] shadow-sm transition hover:bg-[#D0E4FC]"
              aria-label={cartLabel}
            >
              <ShoppingCart className="h-4.5 w-4.5" />
              {itemCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#0C2048] px-1 text-[0.66rem] font-bold text-white">
                  {itemCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        <form onSubmit={submitSearch} className="order-3 basis-full md:order-2 md:min-w-0 md:flex-1">
          <div className="relative isolate flex h-11 overflow-visible rounded-[4px] border border-[#131A22] bg-white shadow-[0_1px_0_rgba(255,255,255,0.7)_inset] transition focus-within:border-[#F0A115] focus-within:shadow-[0_0_0_3px_rgba(255,153,0,0.12)]">
            <div className="relative">
              <button
                type="button"
                onClick={() => setScopeOpen((open) => !open)}
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
                        onClick={() => setScope(option.collection)}
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
          </div>
        </form>

        <div className="order-2 ml-auto hidden items-center gap-2 md:order-3 md:flex">
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-full border border-[#BFD7F2] bg-white/80 px-4 text-sm font-semibold text-[#102A43] shadow-sm transition hover:bg-[#F5FAFF]"
            aria-label="Language EN"
          >
            <Globe className="h-4 w-4" />
            <span>EN</span>
          </button>

          <Link
            to="/account"
            aria-label="Hello, sign in / Account & Lists"
            className="hidden min-w-0 flex-col rounded-full px-3 py-2 text-left transition hover:bg-white/60 lg:flex"
          >
            <span className="block text-[0.62rem] font-medium leading-none text-[#5C748F]">
              Hello, sign in
            </span>
            <span className="block text-sm font-semibold leading-tight text-[#102A43]">
              Account & Lists
            </span>
          </Link>

          <Link
            to="/account/orders"
            aria-label="Returns / & Orders"
            className="hidden min-w-0 flex-col rounded-full px-3 py-2 text-left transition hover:bg-white/60 lg:flex"
          >
            <span className="block text-[0.62rem] font-medium leading-none text-[#5C748F]">
              Returns
            </span>
            <span className="block text-sm font-semibold leading-tight text-[#102A43]">
              & Orders
            </span>
          </Link>

          <button
            type="button"
            onClick={openCartDrawer}
            className="relative inline-flex h-11 items-center gap-2 rounded-full border border-[#BFD7F2] bg-white/90 px-4 text-sm font-semibold text-[#102A43] shadow-sm transition hover:bg-[#D0E4FC]"
            aria-label={cartLabel}
          >
            <ShoppingCart className="h-4.5 w-4.5" />
            <span className="hidden sm:inline">Cart</span>
            {itemCount > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#0C2048] px-1 text-[0.66rem] font-bold text-white">
                {itemCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      <div className="hidden border-t border-[#BFD7F2] bg-[#0C2048] md:block">
        <nav
          aria-label="Secondary navigation"
          className="mx-auto flex w-full max-w-7xl items-center gap-2 overflow-x-auto px-3 py-2 text-sm font-medium text-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-4 lg:px-8"
        >
          {secondaryNavItems.map((item) => {
            const active = isActiveNavItem(item, location.pathname, location.search);

            return (
              <Link
                key={item.label}
                to={item.to}
                className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-3 py-2 transition ${
                  active
                    ? "border-[#D0E4FC] bg-[#D0E4FC] text-[#0C2048]"
                    : "border-white/10 bg-white/5 text-white/90 hover:border-[#D0E4FC] hover:bg-[#D0E4FC] hover:text-[#0C2048]"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
};

export default MainHeader;
