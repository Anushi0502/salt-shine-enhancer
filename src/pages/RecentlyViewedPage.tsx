import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Clock3, Sparkles } from "lucide-react";
import ProductCard from "@/components/storefront/ProductCard";
import Reveal from "@/components/storefront/Reveal";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { readRecentlyViewedHandles, RECENTLY_VIEWED_UPDATED_EVENT } from "@/lib/recently-viewed";
import { useProducts } from "@/lib/shopify-data";
import type { ShopifyProduct } from "@/types/shopify";

const RecentlyViewedPage = () => {
  const { data, isLoading, error, refetch } = useProducts();
  const [recentHandles, setRecentHandles] = useState<string[]>(() => readRecentlyViewedHandles());

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const syncRecentHistory = () => {
      setRecentHandles(readRecentlyViewedHandles());
    };

    syncRecentHistory();
    window.addEventListener("storage", syncRecentHistory);
    window.addEventListener(RECENTLY_VIEWED_UPDATED_EVENT, syncRecentHistory as EventListener);

    return () => {
      window.removeEventListener("storage", syncRecentHistory);
      window.removeEventListener(RECENTLY_VIEWED_UPDATED_EVENT, syncRecentHistory as EventListener);
    };
  }, []);

  const recentProducts = useMemo(() => {
    const products = data?.products || [];
    const byHandle = new Map(products.map((product) => [product.handle.trim().toLowerCase(), product]));

    return recentHandles
      .map((handle) => byHandle.get(handle))
      .filter((product): product is ShopifyProduct => Boolean(product));
  }, [data?.products, recentHandles]);

  const unresolvedCount = Math.max(0, recentHandles.length - recentProducts.length);

  if (isLoading) {
    return (
      <LoadingState
        title="Loading recently viewed"
        subtitle="Refreshing your device history and the live Shopify catalog."
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Recently viewed is unavailable"
        subtitle="Retry to sync the latest catalog before browsing your device history."
        action={
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
          >
            Retry
          </button>
        }
      />
    );
  }

  if (!recentHandles.length || !recentProducts.length) {
    return (
      <section className="mx-auto mt-8 w-[min(920px,calc(100%-20px))] pb-12 text-center">
        <Reveal>
          <div className="salt-surface rounded-[2rem] p-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Clock3 className="h-8 w-8" />
            </div>
            <h1 className="mt-4 font-display text-4xl">No recently viewed items yet</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              As you open products, this device history fills automatically and stays linked to the live catalog.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link to="/shop" className="salt-primary-cta h-11 px-6 text-sm font-bold">
                Browse shop
              </Link>
              <Link to="/collections" className="salt-outline-chip h-11 px-6 py-0 text-sm">
                Browse collections
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    );
  }

  return (
    <section className="mx-auto mt-5 w-[min(1280px,calc(100%-20px))] pb-10 sm:mt-6 sm:w-[min(1280px,calc(100%-20px))]">
      <Reveal>
        <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Recently viewed</p>
            <h1 className="font-display text-[clamp(2rem,4vw,3.2rem)] leading-[0.95]">
              Your live browsing trail
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {recentProducts.length.toLocaleString()} item{recentProducts.length === 1 ? "" : "s"} pulled from this
              device history.
            </p>
            {unresolvedCount > 0 ? (
              <p className="mt-2 inline-flex items-center gap-1 rounded-full border border-border/75 bg-card px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                {unresolvedCount.toLocaleString()} item{unresolvedCount === 1 ? "" : "s"} waiting on a catalog refresh
              </p>
            ) : null}
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Link to="/shop" className="salt-outline-chip h-11 justify-center px-5 py-0 text-sm">
              Continue shopping
            </Link>
            <Link to="/wishlist" className="salt-primary-cta h-11 justify-center px-5 text-sm font-bold">
              Open wishlist
            </Link>
          </div>
        </div>
      </Reveal>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        {recentProducts.map((product, index) => (
          <Reveal key={`${product.handle}-${product.id}`} delayMs={index * 45}>
            <ProductCard product={product} variant="shop" />
          </Reveal>
        ))}
      </div>
    </section>
  );
};

export default RecentlyViewedPage;
