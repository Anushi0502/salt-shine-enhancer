import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ClipboardList, LogOut, Menu, Search, ShoppingBag, User, X } from "lucide-react";
import BrandLogo from "@/components/layout/BrandLogo";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { useCart } from "@/lib/cart";
import { buildShopLoginUrl, getShopifyAccountRoutes, openShopLogin } from "@/lib/theme-assets";

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
  return `salt-nav-pill rounded-full px-3.5 py-2 text-sm font-semibold transition-all duration-200 ${
    isActive
      ? "is-active salt-glow-ring border border-primary/50 bg-[linear-gradient(130deg,hsl(var(--salt-ink)/0.98),hsl(var(--salt-ink)/0.9))] text-[hsl(var(--salt-paper))] shadow-[0_16px_28px_-22px_rgba(0,0,0,0.8)]"
      : "border border-transparent text-foreground/80 hover:border-border/85 hover:bg-background/88 hover:text-foreground hover:shadow-[0_10px_24px_-18px_rgba(0,0,0,0.5)]"
  }`;
}

const MainHeader = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopSearch, setDesktopSearch] = useState("");
  const [mobileSearch, setMobileSearch] = useState("");
  const { itemCount } = useCart();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const accountRoutes = useMemo(
    () => getShopifyAccountRoutes(),
    [location.pathname, location.search, location.hash],
  );
  const orderHistoryLoginHref = useMemo(
    () => buildShopLoginUrl(accountRoutes.orders),
    [accountRoutes.orders],
  );

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

  const closeMobileMenu = () => setMobileOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/82 shadow-[0_18px_44px_-34px_rgba(0,0,0,0.62)] backdrop-blur-2xl supports-[backdrop-filter]:backdrop-saturate-150">
      <a
        href="#main-content"
        className="absolute left-3 top-2 z-[60] -translate-y-20 rounded-full bg-[hsl(var(--salt-ink))] px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[hsl(var(--salt-paper))] opacity-0 shadow-soft transition focus:translate-y-0 focus:opacity-100"
      >
        Skip to content
      </a>
      <div className="border-b border-border/50 bg-[linear-gradient(90deg,hsl(var(--salt-ink))_0%,hsl(var(--salt-ink)/0.95)_42%,hsl(var(--salt-olive)/0.7)_100%)] text-[hsl(var(--salt-paper))]">
        <div className="mx-auto flex w-[min(1280px,96vw)] items-center justify-between gap-3 py-2.5 text-[0.7rem] sm:text-xs">
          <span className="truncate">Free shipping all over the US</span>
          <Link
            to="/contact"
            className="hidden text-[hsl(var(--salt-paper))/0.82] underline-offset-2 hover:text-[hsl(var(--salt-paper))] hover:underline md:inline"
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

        <nav className="hidden items-center gap-1 rounded-full border border-border/70 bg-background/55 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] lg:flex">
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
              className="salt-form-control h-10 w-72 rounded-full border-border/80 bg-card/95 pl-9 pr-3"
            />
          </form>

          <ThemeToggle />

          {accountRoutes.isLoggedIn ? (
            <div className="hidden items-center gap-1.5 lg:flex">
              <a
                href={accountRoutes.orders}
                className="salt-outline-chip inline-flex h-10 items-center gap-1.5 px-3 py-0 text-[0.7rem] font-semibold tracking-[0.03em]"
                aria-label="Open order history"
              >
                <ClipboardList className="h-3.5 w-3.5" />
                Orders
              </a>
              <a
                href={accountRoutes.account}
                className="salt-outline-chip inline-flex h-10 items-center gap-1.5 px-3 py-0 text-[0.7rem] font-semibold tracking-[0.03em]"
                aria-label="Open account dashboard"
              >
                <User className="h-3.5 w-3.5" />
                Account
              </a>
              <a
                href={accountRoutes.logout}
                className="inline-flex h-10 items-center rounded-full px-2 text-[0.72rem] font-semibold text-muted-foreground transition hover:text-primary"
                aria-label="Log out from account"
              >
                <LogOut className="mr-1 h-3.5 w-3.5" />
                Logout
              </a>
            </div>
          ) : (
            <div className="hidden items-center gap-1.5 lg:flex">
              
              <a
                href={accountRoutes.shopLogin}
                onClick={(event) => {
                  event.preventDefault();
                  openShopLogin(accountRoutes.shopLogin);
                }}
                className="inline-flex h-10 items-center rounded-full bg-[linear-gradient(135deg,#5e40ff,#3f34d6)] px-3 text-[0.68rem] font-bold tracking-[0.03em] text-white shadow-[0_14px_28px_-22px_rgba(71,59,215,0.92)] transition hover:brightness-110"
                aria-label="Login with Shop"
              >
                Login with Shop
              </a>
            </div>
          )}

          <Link
            to="/cart"
            className="salt-button-shine relative inline-flex h-10 items-center gap-2 rounded-full border border-primary/50 bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:brightness-110"
            aria-label={`Open cart with ${itemCount} items`}
          >
            <ShoppingBag className="h-4 w-4" />
            Cart
            {itemCount > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[hsl(var(--salt-paper))] px-1 text-[0.7rem] leading-none text-[hsl(var(--salt-ink))]">
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

      <div className="hidden border-t border-border/70 bg-[linear-gradient(180deg,hsl(var(--card)/0.8),hsl(var(--card)/0.56))] lg:block">
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
          <p className="rounded-full border border-border/75 bg-background/65 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
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
              className="salt-form-control h-10 flex-1 rounded-full border-border bg-card/90 px-4"
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

          <div className="mx-auto mt-4 grid w-[min(1280px,96vw)] gap-2 rounded-2xl border border-border/70 bg-card/70 p-3">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Account
            </p>
            <div className="flex flex-wrap gap-2">
              {accountRoutes.isLoggedIn ? (
                <>
                  <a
                    href={accountRoutes.account}
                    onClick={closeMobileMenu}
                    className="salt-outline-chip inline-flex h-9 items-center gap-1.5 px-3 py-0 text-[0.68rem] font-bold uppercase tracking-[0.08em]"
                  >
                    <User className="h-3.5 w-3.5" />
                    Dashboard
                  </a>
                  <a
                    href={accountRoutes.orders}
                    onClick={closeMobileMenu}
                    className="salt-outline-chip inline-flex h-9 items-center gap-1.5 px-3 py-0 text-[0.68rem] font-bold uppercase tracking-[0.08em]"
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    Order history
                  </a>
                  <a
                    href={accountRoutes.addresses}
                    onClick={closeMobileMenu}
                    className="salt-outline-chip inline-flex h-9 items-center gap-1.5 px-3 py-0 text-[0.68rem] font-bold uppercase tracking-[0.08em]"
                  >
                    Addresses
                  </a>
                  <a
                    href={accountRoutes.logout}
                    onClick={closeMobileMenu}
                    className="salt-outline-chip inline-flex h-9 items-center gap-1.5 px-3 py-0 text-[0.68rem] font-bold uppercase tracking-[0.08em]"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Logout
                  </a>
                </>
              ) : (
                <>
                  <a
                    href={orderHistoryLoginHref}
                    onClick={(event) => {
                      event.preventDefault();
                      closeMobileMenu();
                      openShopLogin(orderHistoryLoginHref);
                    }}
                    className="salt-outline-chip inline-flex h-9 items-center gap-1.5 px-3 py-0 text-[0.68rem] font-bold uppercase tracking-[0.08em]"
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    Order history
                  </a>
                  <a
                    href={accountRoutes.shopLogin}
                    onClick={(event) => {
                      event.preventDefault();
                      closeMobileMenu();
                      openShopLogin(accountRoutes.shopLogin);
                    }}
                    className="salt-outline-chip inline-flex h-9 items-center gap-1.5 px-3 py-0 text-[0.68rem] font-bold uppercase tracking-[0.08em]"
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    Login with Shop
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
};

export default MainHeader;
