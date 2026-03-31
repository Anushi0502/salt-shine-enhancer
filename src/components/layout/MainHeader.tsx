import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useNavigate, useSearchParams } from "react-router-dom";
import { ClipboardList, Menu, Search, ShoppingBag, Sparkles, X } from "lucide-react";
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
  return `salt-nav-pill rounded-full px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
    isActive
      ? "is-active salt-glow-ring border border-primary/45 bg-[linear-gradient(135deg,hsl(var(--salt-ink)/0.98),hsl(var(--salt-ink)/0.88))] text-[hsl(var(--salt-paper))]"
      : "border border-transparent text-foreground/78 hover:border-border/85 hover:bg-background/90 hover:text-foreground"
  }`;
}

const MainHeader = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopSearch, setDesktopSearch] = useState("");
  const [mobileSearch, setMobileSearch] = useState("");
  const desktopSearchRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchRef = useRef<HTMLInputElement | null>(null);
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const activeQuery = useMemo(() => searchParams.get("q") || "", [searchParams]);

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

    const isEditableTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      if (!element) {
        return false;
      }

      return (
        element.isContentEditable ||
        element.tagName === "INPUT" ||
        element.tagName === "TEXTAREA" ||
        element.tagName === "SELECT"
      );
    };

    const focusSearch = () => {
      const desktopMode = window.matchMedia("(min-width: 1024px)").matches;
      if (desktopMode) {
        desktopSearchRef.current?.focus();
        desktopSearchRef.current?.select();
        return;
      }

      setMobileOpen(true);
      window.setTimeout(() => {
        mobileSearchRef.current?.focus();
        mobileSearchRef.current?.select();
      }, 90);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && mobileOpen) {
        setMobileOpen(false);
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      const slashShortcut =
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey;
      const commandShortcut =
        event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);

      if (!slashShortcut && !commandShortcut) {
        return;
      }

      event.preventDefault();
      focusSearch();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

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
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/78 shadow-[0_18px_44px_-34px_rgba(0,0,0,0.62)] backdrop-blur-2xl supports-[backdrop-filter]:backdrop-saturate-150">
      <div className="border-b border-border/40 bg-[linear-gradient(90deg,hsl(var(--salt-ink))_0%,hsl(var(--salt-ink)/0.95)_36%,hsl(var(--salt-blue)/0.46)_70%,hsl(var(--salt-gold)/0.22)_100%)] text-[hsl(var(--salt-paper))]">
        <div className="mx-auto flex w-[min(1320px,96vw)] items-center justify-between gap-3 py-2.5 text-[0.7rem] sm:text-xs">
          <span className="truncate font-medium text-white/92">Free shipping all over the US</span>
          <Link
            to="/contact"
            className="hidden text-white/78 underline-offset-2 transition hover:text-white hover:underline md:inline"
          >
            Need help? Contact support
          </Link>
          <span className="truncate text-right text-white/88">
            New weekly drops • 30-day returns • Trusted by 2,300+ shoppers
          </span>
        </div>
      </div>

      <div className="mx-auto flex w-[min(1320px,96vw)] items-center justify-between gap-4 py-4 lg:py-5">
        <Link to="/" className="group shrink-0" aria-label="Go to SALT homepage">
          <BrandLogo
            withWordmark
            size="md"
            className="rounded-full border border-border/65 bg-card/82 px-3 py-1.5 shadow-[0_18px_38px_-26px_rgba(0,0,0,0.5)] transition group-hover:border-primary/35 group-hover:shadow-[0_24px_44px_-28px_rgba(0,0,0,0.56)]"
          />
        </Link>

        <div className="hidden flex-1 items-center justify-center gap-3 lg:flex">
          <nav className="salt-glass-rail flex items-center gap-1 rounded-full p-1.5">
            {navLinks.map((link) => (
              <NavLink key={link.to} to={link.to} className={navClassName} end={link.to === "/"}>
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <form onSubmit={onDesktopSearch} className="salt-glass-rail relative hidden rounded-full px-1.5 py-1 lg:block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={desktopSearchRef}
              value={desktopSearch}
              onChange={(event) => setDesktopSearch(event.target.value)}
              type="search"
              placeholder="Search products"
              aria-label="Search products"
              className="salt-form-control h-10 w-80 rounded-full border-transparent bg-transparent pl-10 pr-12 shadow-none"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rounded-full border border-border/75 bg-background/88 px-1.5 py-0.5 text-[0.58rem] font-bold uppercase tracking-[0.08em] text-muted-foreground"
            >
              / K
            </span>
          </form>

          <ThemeToggle />

          <Link
            to="/order-history"
            className="salt-glass-rail inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[0.7rem] font-semibold tracking-[0.03em] text-foreground"
            aria-label="Open order history"
          >
            <ClipboardList className="h-3.5 w-3.5" />
            Order History
          </Link>

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
          className="salt-glass-rail inline-flex h-10 w-10 items-center justify-center rounded-full lg:hidden"
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div className="hidden border-t border-border/45 bg-[linear-gradient(180deg,hsl(var(--card)/0.85),hsl(var(--card)/0.7))] lg:block">
        <div className="mx-auto flex w-[min(1320px,96vw)] items-center justify-between gap-4 py-2.5">
          <div className="salt-glass-rail flex flex-wrap items-center gap-2 rounded-full px-2 py-1.5">
            {quickLinks.map((link) => (
              <NavLink key={link.to} to={link.to} className="salt-outline-chip border-transparent bg-transparent">
                {link.label}
              </NavLink>
            ))}
          </div>
          <div className="salt-glass-rail flex items-center gap-2 rounded-full px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Fast dispatch • Easy returns • Encrypted checkout
          </div>
        </div>
      </div>

      {mobileOpen ? (
        <div className="border-t border-border/60 bg-background/94 px-4 py-4 shadow-[0_26px_46px_-34px_rgba(0,0,0,0.65)] backdrop-blur lg:hidden">
          <div className="mx-auto grid w-[min(1320px,96vw)] gap-4">
            <div className="salt-editorial-shell rounded-[1.6rem] p-4">
              <form onSubmit={onMobileSearch} className="flex items-center gap-2">
                <label htmlFor="mobile-header-search" className="sr-only">
                  Search products
                </label>
                <div className="salt-glass-rail relative flex-1 rounded-full px-1.5 py-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="mobile-header-search"
                    ref={mobileSearchRef}
                    type="search"
                    value={mobileSearch}
                    onChange={(event) => setMobileSearch(event.target.value)}
                    placeholder="Search products"
                    className="salt-form-control h-10 w-full rounded-full border-transparent bg-transparent pl-10 pr-3 shadow-none"
                  />
                </div>
                <button
                  type="submit"
                  className="salt-primary-cta h-10 rounded-full px-4 text-[0.66rem] font-bold uppercase tracking-[0.08em]"
                >
                  Search
                </button>
              </form>

              <nav className="mt-4 grid gap-2">
                {navLinks.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    className={navClassName}
                    end={link.to === "/"}
                    onClick={closeMobileMenu}
                  >
                    {link.label}
                  </NavLink>
                ))}
              </nav>
            </div>

            <div className="salt-glass-rail flex flex-wrap gap-2 rounded-[1.35rem] p-2.5">
              {quickLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={closeMobileMenu}
                  className="salt-outline-chip"
                >
                  {link.label}
                </NavLink>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
              <ThemeToggle />
              <Link
                to="/cart"
                onClick={closeMobileMenu}
                className="salt-button-shine inline-flex h-11 items-center justify-center gap-2 rounded-full border border-primary/50 bg-primary px-4 text-sm font-bold text-primary-foreground"
                aria-label={`View cart with ${itemCount} items`}
              >
                <ShoppingBag className="h-4 w-4" />
                View Cart ({itemCount})
              </Link>
            </div>

            <div className="salt-glass-rail grid gap-2 rounded-[1.35rem] p-4">
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Orders and support
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  to="/order-history"
                  onClick={closeMobileMenu}
                  className="salt-outline-chip inline-flex h-9 items-center gap-1.5 px-3 py-0 text-[0.68rem] font-bold uppercase tracking-[0.08em]"
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  Order history
                </Link>
                <Link
                  to="/contact"
                  onClick={closeMobileMenu}
                  className="salt-outline-chip inline-flex h-9 items-center px-3 py-0 text-[0.68rem] font-bold uppercase tracking-[0.08em]"
                >
                  Contact support
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
};

export default MainHeader;
