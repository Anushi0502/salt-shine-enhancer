import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate, useSearchParams } from "react-router-dom";
import { Menu, Search, ShoppingBag, X } from "lucide-react";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { useCart } from "@/lib/cart";

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/shop", label: "Shop" },
  { to: "/collections", label: "Collections" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
];

const quickLinks = [
  { to: "/shop?collection=new-arrivals", label: "New Arrivals" },
  { to: "/shop?type=Cookware", label: "Cookware" },
  { to: "/shop?type=Apparel", label: "Apparel" },
];

function navClassName({ isActive }: { isActive: boolean }): string {
  return `rounded-full px-3 py-2 text-sm font-semibold transition ${
    isActive
      ? "bg-foreground text-primary-foreground"
      : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;
}

const MainHeader = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopSearch, setDesktopSearch] = useState("");
  const [mobileSearch, setMobileSearch] = useState("");
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const activeQuery = useMemo(() => searchParams.get("q") || "", [searchParams]);

  useEffect(() => {
    setDesktopSearch(activeQuery);
    setMobileSearch(activeQuery);
  }, [activeQuery]);

  const submitSearch = (query: string) => {
    const trimmed = query.trim();

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

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/90 backdrop-blur-xl">
      <div className="border-b border-border/70 bg-foreground text-primary-foreground">
        <div className="mx-auto flex w-[min(1280px,96vw)] items-center justify-between gap-3 py-2 text-[0.7rem] sm:text-xs">
          <span className="truncate">Free US shipping over $49</span>
          <span className="hidden text-primary-foreground/80 md:inline">Secure checkout</span>
          <span className="truncate text-right">
            New weekly drops • 30-day returns • Trusted by 2,300+ shoppers
          </span>
        </div>
      </div>

      <div className="mx-auto flex w-[min(1280px,96vw)] items-center justify-between gap-4 py-4">
        <Link to="/" className="group flex items-center gap-2">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-primary/40 bg-gradient-to-br from-primary to-salt-olive text-base font-black text-primary-foreground">
            SA
          </span>
          <div>
            <span className="font-display text-2xl tracking-[0.08em]">SALT</span>
            <p className="-mt-0.5 hidden text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground md:block">
              Online Store
            </p>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <NavLink key={link.to} to={link.to} className={navClassName} end={link.to === "/"}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <form onSubmit={onDesktopSearch} className="relative hidden lg:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={desktopSearch}
              onChange={(event) => setDesktopSearch(event.target.value)}
              type="search"
              placeholder="Search products"
              aria-label="Search products"
              className="h-10 w-64 rounded-full border border-border bg-card pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary/60"
            />
          </form>

          <ThemeToggle />

          <Link
            to="/cart"
            className="relative inline-flex h-10 items-center gap-2 rounded-full border border-primary/50 bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:brightness-110"
            aria-label={`Open cart with ${itemCount} items`}
          >
            <ShoppingBag className="h-4 w-4" />
            Cart
            {itemCount > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-[0.7rem] leading-none text-primary-foreground">
                {itemCount}
              </span>
            ) : null}
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card lg:hidden"
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div className="hidden border-t border-border/70 bg-card/70 lg:block">
        <div className="mx-auto flex w-[min(1280px,96vw)] items-center justify-between gap-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            {quickLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className="rounded-full border border-border bg-background px-3 py-1 text-[0.66rem] font-bold uppercase tracking-[0.1em] text-muted-foreground transition hover:border-primary/50 hover:text-primary"
              >
                {link.label}
              </NavLink>
            ))}
          </div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Fast dispatch • Easy returns • Encrypted checkout
          </p>
        </div>
      </div>

      {mobileOpen ? (
        <div className="border-t border-border bg-background px-4 py-4 lg:hidden">
          <form onSubmit={onMobileSearch} className="mx-auto mb-3 flex w-[min(1280px,96vw)] items-center gap-2">
            <label htmlFor="mobile-header-search" className="sr-only">
              Search products
            </label>
            <input
              id="mobile-header-search"
              type="search"
              value={mobileSearch}
              onChange={(event) => setMobileSearch(event.target.value)}
              placeholder="Search products"
              className="h-10 flex-1 rounded-full border border-border bg-card px-4 text-sm outline-none focus:border-primary/60"
            />
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-full border border-primary/50 bg-primary px-4 text-xs font-bold uppercase tracking-[0.08em] text-primary-foreground"
            >
              Search
            </button>
          </form>

          <nav className="mx-auto grid w-[min(1280px,96vw)] gap-2">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={navClassName}
                end={link.to === "/"}
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="mx-auto mt-3 flex w-[min(1280px,96vw)] flex-wrap gap-2">
            {quickLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={() => setMobileOpen(false)}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-[0.66rem] font-bold uppercase tracking-[0.1em] text-muted-foreground"
              >
                {link.label}
              </NavLink>
            ))}
          </div>

          <div className="mx-auto mt-4 flex w-[min(1280px,96vw)] items-center justify-between gap-3">
            <ThemeToggle />
            <Link
              to="/cart"
              onClick={() => setMobileOpen(false)}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full border border-primary/50 bg-primary px-4 text-sm font-bold text-primary-foreground"
              aria-label={`View cart with ${itemCount} items`}
            >
              <ShoppingBag className="h-4 w-4" />
              View Cart ({itemCount})
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
};

export default MainHeader;
