import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUp, ClipboardList, ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart";

const SCROLL_VISIBILITY_THRESHOLD = 460;

const FloatingActions = () => {
  const [isVisible, setIsVisible] = useState(false);
  const { itemCount, isDrawerOpen, openCartDrawer } = useCart();
  const { pathname } = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onScroll = () => {
      setIsVisible(window.scrollY > SCROLL_VISIBILITY_THRESHOLD);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const showCartShortcut = useMemo(
    () => pathname !== "/cart" && !pathname.startsWith("/account") && !pathname.startsWith("/checkout"),
    [pathname],
  );
  const showOrderShortcut = useMemo(() => pathname !== "/order-history", [pathname]);

  if (!isVisible || isDrawerOpen) {
    return null;
  }

  return (
    <div
      className="fixed right-4 z-[70] flex flex-col gap-2"
      style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      {showCartShortcut ? (
        <button
          type="button"
          onClick={openCartDrawer}
          className="salt-primary-cta inline-flex h-11 items-center gap-2 rounded-full px-4 text-xs font-semibold uppercase tracking-[0.1em]"
          aria-label={`Open cart (${itemCount} items)`}
        >
          <ShoppingBag className="h-4 w-4" />
          Cart
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/16 px-1 text-[0.68rem] leading-none">
            {itemCount}
          </span>
        </button>
      ) : null}
      {showOrderShortcut ? (
        <Link
          to="/order-history"
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-border/80 bg-card/92 px-3 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-foreground shadow-[0_18px_34px_-28px_rgba(15,23,42,0.24)] transition hover:border-primary/45 hover:text-primary"
          aria-label="Open order history"
        >
          <ClipboardList className="h-3.5 w-3.5" />
          Orders
        </Link>
      ) : null}
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, left: 0, behavior: "smooth" })}
        className="inline-flex h-10 items-center justify-center gap-1 rounded-full border border-border/80 bg-card/92 px-3 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-foreground shadow-[0_18px_34px_-28px_rgba(15,23,42,0.24)] transition hover:border-primary/45 hover:text-primary"
        aria-label="Back to top"
      >
        <ArrowUp className="h-3.5 w-3.5" />
        Top
      </button>
    </div>
  );
};

export default FloatingActions;
