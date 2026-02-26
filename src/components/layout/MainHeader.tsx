import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate, useSearchParams } from "react-router-dom";
import { Menu, Search, ShoppingBag, X } from "lucide-react";
import BrandLogo from "@/components/layout/BrandLogo";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { useCart } from "@/lib/cart";

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/shop", label: "Shop" },
  { to: "/collections", label: "Collections" },
  { to: "/blog", label: "Blog" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
];

const quickLinks = [
  { to: "/shop?collection=new-arrivals", label: "New Arrivals" },
  { to: "/shop?collection=cookware", label: "Cookware" },
  { to: "/shop?collection=gifts", label: "Gifts" },
  { to: "/shop?collection=robe", label: "Apparel" },
];

function navClassName({ isActive }: { isActive: boolean }): string {
  return `rounded-full px-3.5 py-2 text-sm font-semibold transition-all duration-200 ${
    isActive
      ? "salt-glow-ring bg-foreground text-primary-foreground"
      : "text-muted-foreground hover:bg-background hover:text-foreground hover:shadow-[0_10px_24px_-18px_rgba(0,0,0,0.5)]"
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
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/82 shadow-[0_18px_44px_-34px_rgba(0,0,0,0.62)] backdrop-blur-2xl supports-[backdrop-filter]:backdrop-saturate-150">
      <a
        href="#main-content"
        className="absolute left-3 top-2 z-[60] -translate-y-20 rounded-full bg-foreground px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-primary-foreground opacity-0 shadow-soft transition focus:translate-y-0 focus:opacity-100"
      >
        Skip to content
      </a>
      <div className="border-b border-border/50 bg-[linear-gradient(90deg,hsl(var(--foreground))_0%,hsl(var(--foreground)/0.94)_42%,hsl(var(--salt-olive)/0.68)_100%)] text-primary-foreground">
        <div className="mx-auto flex w-[min(1280px,96vw)] items-center justify-between gap-3 py-2.5 text-[0.7rem] sm:text-xs">
          <span className="truncate">Free US shipping over $49</span>
          <Link
            to="/contact"
            className="hidden text-primary-foreground/80 underline-offset-2 hover:text-primary-foreground hover:underline md:inline"
          >
            Need help? Contact support
          </Link>
          <span className="truncate text-right">
            New weekly drops • 30-day returns • Trusted by 2,300+ shoppers
          </span>
        </div>
      </div>

      <div className="mx-auto flex w-[min(1280px,96vw)] items-center justify-between gap-4 py-4">
        <Link to="/" className="group flex items-center gap-2" aria-label="Go to SALT homepage">
          <BrandLogo
            withWordmark
            size="md"
            className="rounded-full border border-border/70 bg-card/70 px-2.5 py-1.5 shadow-[0_14px_28px_-22px_rgba(0,0,0,0.5)] transition group-hover:border-primary/35 group-hover:shadow-[0_22px_38px_-28px_rgba(0,0,0,0.55)]"
          />
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
              className="h-10 w-72 rounded-full border border-border/80 bg-card/95 pl-9 pr-3 text-sm outline-none transition focus:border-primary/60 focus:shadow-[0_0_0_3px_hsl(var(--primary)/0.14)]"
            />
          </form>

          <ThemeToggle />

          <Link
            to="/cart"
            className="salt-button-shine relative inline-flex h-10 items-center gap-2 rounded-full border border-primary/50 bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:brightness-110"
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
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/80 bg-card/90 shadow-[0_12px_26px_-20px_rgba(0,0,0,0.45)] lg:hidden"
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div className="hidden border-t border-border/60 bg-[linear-gradient(180deg,hsl(var(--card)/0.72),hsl(var(--card)/0.5))] lg:block">
        <div className="mx-auto flex w-[min(1280px,96vw)] items-center justify-between gap-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            {quickLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className="salt-outline-chip"
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
        <div className="border-t border-border/60 bg-background/95 px-4 py-4 shadow-[0_26px_46px_-34px_rgba(0,0,0,0.65)] backdrop-blur lg:hidden">
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
              className="h-10 flex-1 rounded-full border border-border bg-card/90 px-4 text-sm outline-none transition focus:border-primary/60 focus:shadow-[0_0_0_3px_hsl(var(--primary)/0.14)]"
            />
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-full border border-primary/50 bg-primary px-4 text-xs font-bold uppercase tracking-[0.08em] text-primary-foreground shadow-[0_12px_22px_-16px_hsl(var(--primary)/0.9)]"
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
                className="salt-outline-chip"
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
              className="salt-button-shine inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full border border-primary/50 bg-primary px-4 text-sm font-bold text-primary-foreground"
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
