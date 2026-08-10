import { useEffect, useMemo, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { Minus, PackageCheck, Plus, ShieldCheck, ShoppingBag, Trash2, Truck } from "lucide-react";
import SeoMetadata from "@/components/storefront/SeoMetadata";
import {
  buildShopifyCheckoutUrl,
  buildShopifyProductUrl,
  buildShopifySearchUrl,
  isValidShopifyVariantId,
  useCart,
} from "@/lib/cart";
import { formatMoney, productImage } from "@/lib/formatters";
import { openExternalUrl } from "@/lib/mobile";
import { trackMetaPixelInitiateCheckout } from "@/lib/meta-pixel";
import { recordDeviceOrderHistory } from "@/lib/order-history";
import { getMinimumProductQuantity } from "@/lib/minimum-quantity-rules";
import { useCollectionProductsMap, useProductSearchIndex } from "@/lib/shopify-data";
import {
  buildCartRecommendations,
  buildProductCollectionIndex,
} from "@/lib/sales-optimization";

function normalizeHandleLookup(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/+/, "")
    .replace(/^products\//i, "")
    .split(/[/?#]/)[0];
}

function normalizeTitleLookup(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const CartPage = () => {
  const { items, subtotal, itemCount, updateQuantity, removeItem, replaceItems, clear } = useCart();
  const { data: productsPayload } = useProductSearchIndex();
  const { data: collectionProductsMapPayload } = useCollectionProductsMap();
  const collectionIndex = useMemo(
    () => buildProductCollectionIndex(collectionProductsMapPayload),
    [collectionProductsMapPayload],
  );

  const catalogLookup = useMemo(() => {
    const byHandle = new Map<string, { variantId: number; handle: string }>();
    const byTitle = new Map<string, { variantId: number; handle: string }>();

    for (const product of productsPayload?.products || []) {
      const preferredVariant =
        product.variants.find((variant) => variant.available && isValidShopifyVariantId(Number(variant.id))) ||
        product.variants.find((variant) => isValidShopifyVariantId(Number(variant.id)));

      if (!preferredVariant) {
        continue;
      }

      const entry = {
        variantId: Number(preferredVariant.id),
        handle: product.handle,
      };

      const handleKey = normalizeHandleLookup(product.handle || "");
      if (handleKey) {
        byHandle.set(handleKey, entry);
      }

      const titleKey = normalizeTitleLookup(product.title || "");
      if (titleKey && !byTitle.has(titleKey)) {
        byTitle.set(titleKey, entry);
      }
    }

    return { byHandle, byTitle };
  }, [productsPayload]);

  const resolvedCheckout = useMemo(
    () =>
      items.map((item) => {
        if (isValidShopifyVariantId(item.shopifyVariantId)) {
          return {
            method: "direct" as const,
            item,
            productUrl: buildShopifyProductUrl(item.handle),
          };
        }

        const byHandle = catalogLookup.byHandle.get(normalizeHandleLookup(item.handle || ""));
        if (byHandle) {
          return {
            method: "handle" as const,
            item: {
              ...item,
              handle: byHandle.handle,
              shopifyVariantId: byHandle.variantId,
            },
            productUrl: buildShopifyProductUrl(byHandle.handle),
          };
        }

        const byTitle = catalogLookup.byTitle.get(normalizeTitleLookup(item.title || ""));
        if (byTitle) {
          return {
            method: "title" as const,
            item: {
              ...item,
              handle: byTitle.handle,
              shopifyVariantId: byTitle.variantId,
            },
            productUrl: buildShopifyProductUrl(byTitle.handle),
          };
        }

        return {
          method: "unresolved" as const,
          item,
          productUrl: buildShopifyProductUrl(item.handle),
        };
      }),
    [items, catalogLookup],
  );

  const checkoutItems = resolvedCheckout.map((entry) => entry.item);
  const autoRecoveredCount = resolvedCheckout.filter(
    (entry) => entry.method === "handle" || entry.method === "title",
  ).length;
  const unresolvedEntries = resolvedCheckout.filter((entry) => entry.method === "unresolved");
  const unresolvedCheckoutItems = unresolvedEntries.map((entry) => entry.item);
  const unresolvedShopifyLinks = unresolvedEntries
    .map((entry) => ({
      id: entry.item.id,
      title: entry.item.title,
      url:
        catalogLookup.byHandle.has(normalizeHandleLookup(entry.item.handle || "")) && entry.productUrl
          ? entry.productUrl
          : buildShopifySearchUrl(entry.item.title || entry.item.handle) || entry.productUrl,
    }))
    .filter((entry): entry is { id: number; title: string; url: string } => Boolean(entry.url));
  const unresolvedShopifyLinksById = useMemo(
    () => new Map(unresolvedShopifyLinks.map((entry) => [entry.id, entry.url])),
    [unresolvedShopifyLinks],
  );
  const hasUnresolvedCheckoutItems = unresolvedCheckoutItems.length > 0;
  const recommendationPlan = useMemo(
    () =>
      buildCartRecommendations(items, productsPayload?.products || [], collectionIndex, {
        focusLimit: 2,
        relatedLimit: 3,
        complementaryLimit: 3,
      }),
    [collectionIndex, items, productsPayload?.products],
  );
  const recommendedProducts = useMemo(
    () => [...recommendationPlan.relatedProducts, ...recommendationPlan.complementaryProducts],
    [recommendationPlan],
  );

  const checkoutHandoffUrl = buildShopifyCheckoutUrl(checkoutItems);
  const freeShippingThreshold = 120;
  const freeShippingRemaining = Math.max(0, freeShippingThreshold - subtotal);
  const freeShippingProgress = Math.min(
    100,
    Math.round((Math.min(subtotal, freeShippingThreshold) / freeShippingThreshold) * 100),
  );
  const seoMetadata = (
    <SeoMetadata
      title="Cart | SALT Online Store"
      description="Review your items and continue to secure Shopify checkout."
      canonicalPath="/cart"
      noIndex
    />
  );

  useEffect(() => {
    if (autoRecoveredCount <= 0) {
      return;
    }

    const hasPatch = checkoutItems.some((item, index) => {
      const current = items[index];
      if (!current) {
        return false;
      }

      return current.shopifyVariantId !== item.shopifyVariantId || current.handle !== item.handle;
    });

    if (hasPatch) {
      replaceItems(checkoutItems);
    }
  }, [autoRecoveredCount, checkoutItems, items, replaceItems]);

  const handleCheckoutClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();

    if (hasUnresolvedCheckoutItems) {
      return;
    }

    trackMetaPixelInitiateCheckout(checkoutItems);
    recordDeviceOrderHistory({
      source: "cart",
      checkoutUrl: checkoutHandoffUrl,
      items: checkoutItems,
    });

    void openExternalUrl(checkoutHandoffUrl);
  };

  if (!items.length) {
    return (
      <>
        {seoMetadata}
        <section className="mx-auto mt-8 w-[min(840px,calc(100%_-_24px))] pb-10 text-center">
          <div className="salt-surface rounded-[1.8rem] p-8 shadow-[0_22px_44px_-34px_rgba(12,32,72,0.18)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShoppingBag className="h-8 w-8" />
            </div>
            <h1 className="mt-4 font-display text-[clamp(2rem,4vw,3rem)] tracking-[-0.04em] text-foreground">
              Your cart is empty
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Add products from the catalog and they will appear here for checkout.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2.5">
              <Link to="/shop?collection=all-products" className="salt-primary-cta h-11 px-6 text-sm font-bold">
                Start shopping
              </Link>
              <Link to="/collections" className="salt-outline-chip h-11 px-6 py-0 text-sm font-bold">
                Browse collections
              </Link>
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      {seoMetadata}
      <section className="mx-auto mt-6 w-[min(1280px,calc(100%_-_24px))] pb-28 md:pb-10">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-4">
            <div className="salt-panel-shell rounded-[1.7rem] p-5 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="salt-kicker">Cart</p>
                  <h1 className="mt-1 font-display text-[clamp(1.95rem,4vw,3rem)] tracking-[-0.045em] text-foreground">
                    Shopping Cart
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {itemCount} item{itemCount === 1 ? "" : "s"} ready for checkout.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clear}
                  className="salt-outline-chip h-10 px-4 text-xs font-bold uppercase tracking-[0.08em]"
                >
                  Clear cart
                </button>
              </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="salt-editorial-meta inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.68rem] font-semibold">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                Secure checkout
              </span>
              <span className="salt-editorial-meta inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.68rem] font-semibold">
                <PackageCheck className="h-3.5 w-3.5 text-primary" />
                Live stock validation
              </span>
              <span className="salt-editorial-meta inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.68rem] font-semibold">
                <Truck className="h-3.5 w-3.5 text-primary" />
                Fast US shipping
              </span>
            </div>

            {autoRecoveredCount > 0 ? (
              <p className="mt-4 rounded-[1rem] border border-emerald-500/20 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-900">
                {autoRecoveredCount} item{autoRecoveredCount === 1 ? "" : "s"} were automatically matched to live Shopify variants.
              </p>
            ) : null}
          </div>

          {resolvedCheckout.map((entry, index) => {
            const { item, productUrl, method } = entry;
            const unresolvedLookupUrl = unresolvedShopifyLinksById.get(item.id) || productUrl;

            return (
              <article
                key={item.id}
                className="salt-surface rounded-[1.65rem] p-4 sm:p-5"
              >
                <div className="grid gap-4 sm:grid-cols-[112px_minmax(0,1fr)]">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.title}
                      className="aspect-square w-full rounded-[1rem] border border-border/70 bg-muted/20 object-cover"
                    />
                  ) : (
                    <div className="grid aspect-square w-full place-items-center rounded-[1rem] border border-border/70 bg-muted/20 px-3 text-center">
                      <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        Image unavailable
                      </p>
                    </div>
                  )}

                  <div className="flex min-w-0 flex-col gap-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-emerald-700">
                          {method === "unresolved" ? "Needs remap" : "In stock"}
                        </p>
                        <h2 className="mt-1 font-display text-lg leading-tight tracking-[-0.03em] text-foreground sm:text-[1.2rem]">
                          {item.title}
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">Sold by SALT</p>
                        <a
                          href={unresolvedLookupUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex text-sm font-semibold text-primary transition hover:text-primary/80"
                        >
                          View product
                        </a>
                      </div>

                      <div className="shrink-0 text-left sm:text-right">
                        <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                          Item total
                        </p>
                        <p className="mt-1 font-display text-[1.7rem] leading-none text-foreground">
                          {formatMoney(item.unitPrice * item.quantity)}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">{formatMoney(item.unitPrice)} each</p>
                      </div>
                    </div>

                    {method === "unresolved" ? (
                      <div className="rounded-[1rem] border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-sm leading-6 text-amber-900">
                        This item could not be mapped to a live Shopify variant. Reopen the product and add it again before checkout.
                      </div>
                    ) : null}

                    <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="inline-flex h-10 items-center rounded-full border border-border/70 bg-background/92">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          disabled={item.quantity <= getMinimumProductQuantity(item.handle, item.unitPrice, item.minimumQuantity)}
                          className="inline-flex h-10 w-10 items-center justify-center text-foreground disabled:cursor-not-allowed disabled:opacity-35"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="min-w-12 text-center text-sm font-bold text-foreground">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="inline-flex h-10 w-10 items-center justify-center text-foreground"
                          aria-label="Increase quantity"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      {getMinimumProductQuantity(item.handle, item.unitPrice, item.minimumQuantity) > 1 ? (
                        <p className="mt-1 text-[0.72rem] text-muted-foreground">
                          Shop floor: buy {getMinimumProductQuantity(item.handle, item.unitPrice, item.minimumQuantity)}.
                        </p>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border/70 bg-background/92 px-4 text-sm font-semibold text-foreground transition hover:border-destructive/30 hover:text-destructive"
                          aria-label={`Remove ${item.title}`}
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

          <aside className="salt-section-shell rounded-[1.65rem] p-5 lg:sticky lg:top-24 lg:self-start">
            <h2 className="font-display text-[1.7rem] tracking-[-0.04em] text-foreground">Order Summary</h2>

          <div className="mt-5 space-y-3 border-b border-border/70 pb-5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Items ({itemCount})</span>
              <strong className="text-foreground">{formatMoney(subtotal)}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Shipping</span>
              <span className="text-foreground">Calculated at checkout</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Estimated tax</span>
              <span className="text-foreground">Calculated at checkout</span>
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-base font-semibold text-foreground">Subtotal</span>
              <span className="font-display text-[1.8rem] leading-none text-foreground">
                {formatMoney(subtotal)}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Express payment options appear inside secure Shopify checkout.
            </p>
          </div>

          <div className="mt-5 rounded-[1rem] border border-border/70 bg-background/92 p-4">
            <p className="text-[0.66rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Free shipping progress
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted/50">
              <span
                className="block h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${freeShippingProgress}%` }}
              />
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {freeShippingRemaining > 0
                ? `${formatMoney(freeShippingRemaining)} away from free shipping.`
                : "Free shipping unlocked for this order."}
            </p>
          </div>

          {hasUnresolvedCheckoutItems ? (
            <div className="mt-4 rounded-[1rem] border border-amber-500/20 bg-amber-500/8 p-4 text-sm leading-6 text-amber-900">
              <p>
                {unresolvedCheckoutItems.length} item{unresolvedCheckoutItems.length === 1 ? "" : "s"} must be re-added before checkout.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {unresolvedShopifyLinks.map((entry) => (
                  <li key={entry.id}>
                    <a href={entry.url} target="_blank" rel="noreferrer" className="underline">
                      {entry.title}
                    </a>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => {
                  unresolvedCheckoutItems.forEach((item) => removeItem(item.id));
                }}
                className="mt-3 inline-flex h-10 items-center justify-center rounded-full border border-amber-700/30 bg-background px-4 text-xs font-bold uppercase tracking-[0.08em] text-amber-900 transition hover:border-amber-700/50"
              >
                Remove unmapped items
              </button>
            </div>
          ) : null}

          <a
            href={checkoutHandoffUrl}
            onClick={handleCheckoutClick}
            aria-disabled={hasUnresolvedCheckoutItems}
            className={`salt-primary-cta mt-5 h-12 w-full justify-center px-5 text-sm font-bold uppercase tracking-[0.08em] ${
              hasUnresolvedCheckoutItems
                ? "pointer-events-none bg-muted-foreground/60 opacity-65"
                : ""
            }`}
          >
            Proceed to checkout
          </a>

          <Link
            to="/shop?collection=all-products"
            className="salt-outline-chip mt-2 h-11 w-full justify-center px-5 text-sm font-bold"
          >
            Continue shopping
          </Link>

          {recommendedProducts.length > 0 ? (
            <div className="mt-5 rounded-[1rem] border border-border/70 bg-background/92 p-4">
              <p className="text-[0.66rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Pair with these picks
              </p>
              <div className="mt-3 space-y-3">
                {recommendedProducts.slice(0, 3).map((product) => {
                  const image = productImage(product);

                  return (
                    <Link
                    key={product.id}
                    to={`/products/${product.handle}`}
                    className="flex items-center gap-3 rounded-[0.95rem] border border-border/70 bg-background/92 p-2.5 transition hover:border-primary/20 hover:bg-background"
                  >
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[0.8rem] border border-border/70 bg-muted/20">
                      {image ? (
                        <img src={image} alt={product.title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-[0.52rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                          No image
                        </div>
                      )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">
                          {product.title}
                        </p>
                      </div>
                      <strong className="shrink-0 text-sm text-primary">
                        {formatMoney(Number(product.variants[0]?.price || 0))}
                      </strong>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}

          <Link
            to="/contact"
            className="salt-outline-chip mt-2 h-10 w-full justify-center px-5 text-xs font-bold uppercase tracking-[0.08em]"
          >
            Need checkout help?
          </Link>

          <div className="mt-4 grid gap-2 rounded-[1rem] border border-border/70 bg-background/92 p-4 text-sm text-muted-foreground">
            <p className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Secure Shopify checkout
            </p>
            <p className="inline-flex items-center gap-2">
              <PackageCheck className="h-4 w-4 text-primary" />
              Live variant validation
            </p>
            <p className="inline-flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />
              Tracking after dispatch
            </p>
          </div>
          </aside>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/96 px-3 pb-[calc(0.7rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-18px_40px_-32px_rgba(15,23,42,0.18)] backdrop-blur md:hidden">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-3">
            <div className="min-w-0 shrink-0">
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {itemCount} item{itemCount === 1 ? "" : "s"}
              </p>
              <p className="font-display text-[1.4rem] leading-none text-foreground">{formatMoney(subtotal)}</p>
            </div>
            <a
              href={checkoutHandoffUrl}
              onClick={handleCheckoutClick}
              aria-disabled={hasUnresolvedCheckoutItems}
              className={`salt-primary-cta inline-flex h-12 flex-1 items-center justify-center px-5 text-sm font-bold uppercase tracking-[0.08em] ${
                hasUnresolvedCheckoutItems
                  ? "pointer-events-none bg-muted-foreground/60 opacity-65"
                  : ""
              }`}
            >
              Checkout
            </a>
          </div>
        </div>
      </section>
    </>
  );
};

export default CartPage;
