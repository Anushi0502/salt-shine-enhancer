import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CircleUserRound, Heart, Menu, Search, ShoppingBag, X } from "lucide-react";
import BrandLogo from "@/components/layout/BrandLogo";
import { useCart } from "@/lib/cart";
import { buildCustomerAccessPath, useCustomerAuth } from "@/lib/customer-auth";
import { useWishlist } from "@/lib/wishlist";

type NavItem = {
  label: string;
  to: string;
  isActive?: (pathname: string) => boolean;
};

const primaryNav: NavItem[] = [
  {
    label: "Shop",
    to: "/shop",
    isActive: (pathname) => pathname === "/shop" || pathname.startsWith("/search"),
  },
  {
    label: "Kitchen",
    to: "/collections/cookware",
  },
  {
    label: "Home",
    to: "/collections/home-decor",
  },
  {
    label: "Gifts",
    to: "/collections/gifts",
  },
  {
    label: "Wellness",
    to: "/collections/personal-care",
  },
  {
    label: "Blog",
    to: "/blog",
  },
];

const mobileNav: NavItem[] = [
  ...primaryNav,
  {
    label: "About",
    to: "/about",
  },
  {
    label: "Contact",
    to: "/contact",
  },
];

function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.isActive) {
    return item.isActive(pathname);
  }

  if (item.to === "/") {
    return pathname === "/";
  }

  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

const actionButtonClassName =
  "relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#b8ceff] bg-[#eef4ff] text-[#1f4f9b] transition hover:border-[#5f89e8] hover:text-[#f2b600] sm:h-10 sm:w-10";

const MainHeader = () => {
  const location = useLocation();
  const { itemCount, openCartDrawer } = useCart();
  const { itemCount: wishlistCount } = useWishlist();
  const { isAuthenticated, logout } = useCustomerAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const accountHref = useMemo(
    () =>
      isAuthenticated
        ? "/order-history"
        : buildCustomerAccessPath({
            mode: "login",
            next: "/order-history",
            reason: "account",
          }),
    [isAuthenticated],
  );

  const signupHref = useMemo(
    () =>
      buildCustomerAccessPath({
        mode: "signup",
        next: "/order-history",
        reason: "account",
      }),
    [],
  );

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!mobileOpen || typeof window === "undefined") {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [mobileOpen]);

  const closeMobileMenu = () => {
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[#c7dbff] bg-[#f4f8ff] shadow-[0_16px_42px_-34px_rgba(31,79,155,0.26)]">
      <div className="border-b border-[#d6e5ff]">
        <div className="mx-auto flex max-w-[1120px] items-center justify-center px-3 py-2 text-center text-[0.62rem] font-semibold tracking-[0.08em] text-[#28529d] sm:px-4 sm:text-[0.72rem]">
          <span>Free Shipping on All US Orders</span>
          <span className="mx-3 text-[#8fb1ea]">|</span>
          <span>30-Day Easy Returns</span>
        </div>
      </div>

      <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-4">
        <Link to="/" className="shrink-0" aria-label="Go to SALT homepage">
          <BrandLogo withWordmark size="sm" />
        </Link>

        <nav className="hidden items-center gap-4 lg:flex xl:gap-5">
          {primaryNav.map((item) => {
            const active = isNavItemActive(item, location.pathname);

            return (
              <Link
                key={item.label}
                to={item.to}
                className={`font-display text-[0.95rem] leading-none transition xl:text-[1rem] ${
                  active ? "text-[#f2b600]" : "text-[#1d4f9a] hover:text-[#f2b600]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1.5 min-[420px]:gap-2">
          <Link to="/shop" className={actionButtonClassName} aria-label="Search catalog">
            <Search className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
          </Link>

          <Link to={accountHref} className={actionButtonClassName} aria-label="Open account">
            <CircleUserRound className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
          </Link>

          <Link to="/wishlist" className={actionButtonClassName} aria-label="Open wishlist">
            <Heart
              className={`h-4 w-4 sm:h-4.5 sm:w-4.5 ${
                wishlistCount > 0 ? "fill-[#f2b600] text-[#f2b600]" : ""
              }`}
            />
            {wishlistCount > 0 ? (
              <span className="absolute right-0.5 top-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#f2b600] text-[0.58rem] font-bold text-[#153a80]">
                {wishlistCount}
              </span>
            ) : null}
          </Link>

          <button
            type="button"
            onClick={openCartDrawer}
            className={actionButtonClassName}
            aria-label={`Open cart with ${itemCount} item${itemCount === 1 ? "" : "s"}`}
          >
            <ShoppingBag className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            {itemCount > 0 ? (
              <span className="absolute right-0.5 top-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#225ed6] text-[0.58rem] font-bold text-white">
                {itemCount}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            className={`${actionButtonClassName} lg:hidden`}
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? (
              <X className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            ) : (
              <Menu className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            )}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="border-t border-[#d6e5ff] bg-[#f6faff] px-3 py-4 lg:hidden">
          <div className="mx-auto grid max-w-[1120px] gap-2">
            {mobileNav.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                onClick={closeMobileMenu}
                className={`inline-flex h-11 items-center justify-center rounded-[0.9rem] border border-[#c8d9ff] bg-white px-4 font-display text-[1rem] transition ${
                  isNavItemActive(item, location.pathname)
                    ? "text-[#f2b600]"
                    : "text-[#1f4f9b] hover:border-[#5f89e8] hover:text-[#f2b600]"
                }`}
              >
                {item.label}
              </Link>
            ))}

            <div className="mt-1 grid grid-cols-2 gap-2">
              <Link
                to="/wishlist"
                onClick={closeMobileMenu}
                className="inline-flex h-10 items-center justify-center rounded-[0.85rem] border border-[#c8d9ff] bg-white text-[0.74rem] font-semibold uppercase tracking-[0.11em] text-[#1f4f9b]"
              >
                Wishlist
              </Link>
              <button
                type="button"
                onClick={() => {
                  closeMobileMenu();
                  openCartDrawer();
                }}
                className="inline-flex h-10 items-center justify-center rounded-[0.85rem] bg-[#225ed6] px-4 text-[0.74rem] font-semibold uppercase tracking-[0.11em] text-white"
              >
                Cart ({itemCount})
              </button>
            </div>

            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => {
                  logout();
                  closeMobileMenu();
                }}
                className="mt-1 inline-flex h-10 items-center justify-center rounded-[0.85rem] border border-[#c8d9ff] bg-white text-[0.74rem] font-semibold uppercase tracking-[0.11em] text-[#1f4f9b]"
              >
                Log out
              </button>
            ) : (
              <div className="mt-1 grid grid-cols-2 gap-2">
                <Link
                  to={accountHref}
                  onClick={closeMobileMenu}
                  className="inline-flex h-10 items-center justify-center rounded-[0.85rem] border border-[#c8d9ff] bg-white text-[0.74rem] font-semibold uppercase tracking-[0.11em] text-[#1f4f9b]"
                >
                  Login
                </Link>
                <Link
                  to={signupHref}
                  onClick={closeMobileMenu}
                  className="inline-flex h-10 items-center justify-center rounded-[0.85rem] bg-[#f2b600] px-4 text-[0.74rem] font-semibold uppercase tracking-[0.11em] text-[#153a80]"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
};

export default MainHeader;
