import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, Globe, MapPin, Menu, Search, ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart";

const categoryOptions = [
  "All",
  "Himalayan Salt",
  "Rock Salt",
  "Sea Salt",
  "Black Salt",
] as const;

type HeaderCategory = (typeof categoryOptions)[number];

type HeaderNavItem = {
  label: string;
  to: string;
  isActive?: (pathname: string, search: string) => boolean;
};

const secondaryNavItems: HeaderNavItem[] = [
  {
    label: "All",
    to: "/shop",
    isActive: (pathname) => pathname === "/" || pathname.startsWith("/shop"),
  },
  {
    label: "Today's Deals",
    to: "/shop?sort=discount",
    isActive: (pathname, search) => pathname === "/shop" && search.includes("sort=discount"),
  },
  {
    label: "Himalayan Salt",
    to: "/search?category=Himalayan%20Salt",
    isActive: (_, search) => new URLSearchParams(search).get("category") === "Himalayan Salt",
  },
  {
    label: "Rock Salt",
    to: "/search?category=Rock%20Salt",
    isActive: (_, search) => new URLSearchParams(search).get("category") === "Rock Salt",
  },
  {
    label: "Sea Salt",
    to: "/search?category=Sea%20Salt",
    isActive: (_, search) => new URLSearchParams(search).get("category") === "Sea Salt",
  },
  {
    label: "Black Salt",
    to: "/search?category=Black%20Salt",
    isActive: (_, search) => new URLSearchParams(search).get("category") === "Black Salt",
  },
  {
    label: "Bulk Orders",
    to: "/contact?topic=bulk-orders",
  },
  {
    label: "Customer Service",
    to: "/contact",
  },
];

function isActiveNavItem(item: HeaderNavItem, pathname: string, search: string): boolean {
  if (item.isActive) {
    return item.isActive(pathname, search);
  }

  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function SaltBagMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#BFD7F2] bg-white/80 shadow-[0_10px_24px_-18px_rgba(12,32,72,0.3)] ${className}`}
    >
      <svg
        viewBox="0 0 56 56"
        className="h-8 w-8"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id="salt-bag-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#D0E4FC" />
          </linearGradient>
        </defs>
        <path
          d="M16.5 18.5c0-3.6 2.9-6.5 6.5-6.5h10c3.6 0 6.5 2.9 6.5 6.5v1.8c0 1.2-.6 2.4-1.6 3.1l-1.7 1.2c2.4 2.1 3.8 5.1 3.8 8.3v7.4c0 4.8-3.9 8.7-8.7 8.7h-7.8c-4.8 0-8.7-3.9-8.7-8.7v-7.4c0-3.2 1.4-6.2 3.8-8.3l-1.7-1.2c-1-.7-1.6-1.9-1.6-3.1v-1.8Z"
          fill="url(#salt-bag-gradient)"
          stroke="#0C2048"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M22 16.5h12"
          stroke="#0C2048"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M20.4 32.2l4.2-4.2 4.2 4.2 4.2-4.2 4.2 4.2"
          fill="none"
          stroke="#0C2048"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M23.2 23.5l2-2 2 2-2 2-2-2Zm8.4 0l2-2 2 2-2 2-2-2Z"
          fill="#ECF4FC"
          stroke="#0C2048"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

const MainHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { itemCount, openCartDrawer } = useCart();
  const headerRef = useRef<HTMLElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<HeaderCategory>("All");
  const [categoryOpen, setCategoryOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const query = params.get("q") || "";
    const category = params.get("category");

    setSearchQuery(query);
    setSelectedCategory(
      category && categoryOptions.includes(category as HeaderCategory)
        ? (category as HeaderCategory)
        : "All",
    );
  }, [location.pathname, location.search]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!headerRef.current) {
        return;
      }

      if (!headerRef.current.contains(event.target as Node)) {
        setCategoryOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCategoryOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const query = searchQuery.trim();
    const params = new URLSearchParams();

    if (query) {
      params.set("q", query);
    }

    if (selectedCategory !== "All") {
      params.set("category", selectedCategory);
    }

    navigate(params.toString() ? `/search?${params.toString()}` : "/search");
    setCategoryOpen(false);
  };

  const setCategory = (nextCategory: HeaderCategory) => {
    setSelectedCategory(nextCategory);
    setCategoryOpen(false);
  };

  const cartLabel = `Cart with ${itemCount} item${itemCount === 1 ? "" : "s"}`;

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 border-b border-[#BFD7F2] bg-[#ECF4FC]/96 text-[#102A43] shadow-[0_18px_36px_-28px_rgba(12,32,72,0.22)] backdrop-blur-md"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-start gap-3 px-3 py-3 sm:px-4 lg:px-8">
        <div className="order-1 flex min-w-0 flex-1 items-center justify-between gap-3 md:flex-none md:justify-start">
          <Link
            to="/"
            aria-label="Salt Online Store"
            className="flex min-w-0 items-center gap-2 rounded-full px-1.5 py-1 transition hover:bg-white/65"
          >
            <SaltBagMark />
            <span className="min-w-0 truncate text-[1.02rem] font-semibold tracking-[0.01em] text-[#102A43] sm:text-[1.08rem]">
              Salt Online Store
            </span>
          </Link>

          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              className="hidden h-10 items-center gap-1.5 rounded-full border border-[#BFD7F2] bg-white/85 px-3 text-[0.78rem] font-semibold text-[#102A43] shadow-sm transition hover:bg-[#F5FAFF] sm:inline-flex"
              aria-label="Language EN"
            >
              <Globe className="h-3.5 w-3.5" />
              <span>EN</span>
            </button>

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

          <button
            type="button"
            className="hidden h-11 items-center gap-2 rounded-full border border-[#BFD7F2] bg-white/80 px-4 text-left shadow-sm transition hover:bg-[#F5FAFF] md:inline-flex"
            aria-label="Deliver to India"
          >
            <MapPin className="h-4 w-4 text-[#0C2048]" />
            <span className="leading-tight">
              <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-[#5C748F]">
                Deliver to
              </span>
              <span className="block text-sm font-semibold text-[#102A43]">India</span>
            </span>
          </button>
        </div>

        <form
          onSubmit={submitSearch}
          className="order-3 basis-full md:order-2 md:min-w-0 md:flex-1"
        >
          <div className="relative isolate flex h-11 overflow-visible rounded-[4px] border border-[#131A22] bg-white shadow-[0_1px_0_rgba(255,255,255,0.7)_inset] transition focus-within:border-[#F0A115] focus-within:shadow-[0_0_0_3px_rgba(255,153,0,0.12)]">
            <div className="relative">
              <button
                type="button"
                onClick={() => setCategoryOpen((open) => !open)}
                aria-label={`Search category ${selectedCategory}`}
                aria-haspopup="listbox"
                aria-expanded={categoryOpen}
                className="flex h-full min-w-[4.9rem] items-center justify-between gap-1.5 rounded-l-[3px] border-r border-[#cdcdcd] bg-[#f3f3f3] px-3 text-left text-[0.8rem] font-normal text-[#555555] transition hover:bg-[#ececec] sm:min-w-[6rem] sm:max-w-[11.5rem]"
              >
                <span className="truncate">{selectedCategory}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 text-[#6b6b6b] transition ${categoryOpen ? "rotate-180" : ""}`}
                />
              </button>

              {categoryOpen ? (
                <div
                  id="header-category-menu"
                  role="listbox"
                  className="absolute left-0 top-[calc(100%+0.55rem)] z-40 w-[min(18rem,calc(100vw-1.25rem))] rounded-2xl border border-[#d5d5d5] bg-white p-2 shadow-[0_18px_36px_-28px_rgba(12,32,72,0.25)]"
                >
                  {categoryOptions.map((option) => {
                    const active = option === selectedCategory;

                    return (
                      <button
                        key={option}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => setCategory(option)}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                          active
                            ? "bg-[#fbeec2] font-semibold text-[#111111]"
                            : "text-[#111111] hover:bg-[#f7f7f7]"
                        }`}
                      >
                        <span>{option}</span>
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
              <span className="sr-only">Search Salt Online Store</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#767676]" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search Salt Online Store"
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

      <div className="border-t border-[#BFD7F2] bg-[#0C2048]">
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
                className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-2 transition ${
                  active
                    ? "border-[#D0E4FC] bg-[#D0E4FC] text-[#0C2048]"
                    : "border-white/10 bg-white/5 text-white/90 hover:border-[#D0E4FC] hover:bg-[#D0E4FC] hover:text-[#0C2048]"
                }`}
              >
                {item.label === "All" ? (
                  <Menu className="h-4 w-4" />
                ) : null}
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
