import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Minus,
  PackageCheck,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Truck,
  Trash2,
} from "lucide-react";
import InnerBreadcrumbs from "@/components/storefront/InnerBreadcrumbs";
import Reveal from "@/components/storefront/Reveal";
import ProductCard from "@/components/storefront/ProductCard";
import SectionHeading from "@/components/storefront/SectionHeading";
import TrustStrip from "@/components/storefront/TrustStrip";
import {
  buildShopifyCheckoutUrl,
  buildShopifyProductUrl,
  buildShopifySearchUrl,
  isValidShopifyVariantId,
  useCart,
} from "@/lib/cart";
import { formatMoney } from "@/lib/formatters";
import { trackMetaPixelInitiateCheckout } from "@/lib/meta-pixel";
import { recordDeviceOrderHistory } from "@/lib/order-history";
import { useProducts } from "@/lib/shopify-data";

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
  const { data: productsPayload } = useProducts();

  const recommendedProducts = (productsPayload?.products || []).slice(0, 5);
  const catalogLookup = useMemo(() => {
    const byHandle = new Map<string, { variantId: number; handle: string }>();
    const byTitle = new Map<string, { variantId: number; handle: string }>();

    for (const product of productsPayload?.products || []) {
      const preferredVariant =
        product.variants.find(
          (variant) => variant.available && isValidShopifyVariantId(Number(variant.id)),
        ) ||
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
  const unresolvedHandleSet = new Set(
    unresolvedEntries.map((entry) => normalizeHandleLookup(entry.item.handle || "")),
  );
  const unresolvedShopifyLinks = unresolvedEntries
    .map((entry) => ({
      id: entry.item.id,
      title: entry.item.title,
      url:
        catalogLookup.byHandle.has(normalizeHandleLookup(entry.item.handle || "")) && entry.productUrl
          ? entry.productUrl
          : buildShopifySearchUrl(entry.item.title || entry.item.handle) || entry.productUrl,
    }))
    .filter(
      (entry): entry is { id: number; title: string; url: string } => Boolean(entry.url),
    );
  const hasUnresolvedCheckoutItems = unresolvedCheckoutItems.length > 0;

  const checkoutHandoffUrl = buildShopifyCheckoutUrl(checkoutItems);
  const checkoutTargetUrl = checkoutHandoffUrl;
  const freeShippingThreshold = 120;
  const freeShippingRemaining = Math.max(0, freeShippingThreshold - subtotal);
  const freeShippingProgress = Math.min(
    100,
    Math.round((Math.min(subtotal, freeShippingThreshold) / freeShippingThreshold) * 100),
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

      return (
        current.shopifyVariantId !== item.shopifyVariantId ||
        current.handle !== item.handle
      );
    });

    if (hasPatch) {
      replaceItems(checkoutItems);
    }
  }, [autoRecoveredCount, checkoutItems, items, replaceItems]);

  if (!items.length) {
    return (
      <section className="mx-auto mt-8 w-[min(880px,calc(100%-20px))] pb-10 text-center sm:w-[min(880px,calc(100%-20px))]">
        <Reveal>
          <div className="salt-surface rounded-[2rem] p-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary">
              <ShoppingBag className="h-8 w-8" />
            </div>
            <h1 className="mt-4 font-display text-4xl">Your cart is empty</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Add a few pieces from the catalog and they will appear here.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link
                to="/shop"
                className="salt-primary-cta h-11 px-6 text-sm font-bold"
              >
                Start shopping
              </Link>
              <Link
                to="/collections"
                className="salt-outline-chip h-11 px-6 py-0 text-sm"
              >
                Browse collections
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    );
  }

  return (
    <section className="mx-auto mt-5 w-[min(1200px,calc(100%-20px))] pb-28 sm:mt-6 sm:w-[min(1200px,calc(100%-20px))] md:pb-10">
      <Reveal>
        <InnerBreadcrumbs
          items={[
            { label: "Home", to: "/" },
            { label: "Cart" },
          ]}
        />
      </Reveal>

      <Reveal>
        <div className="mb-4 mt-3 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="w-full">
            <SectionHeading
              kicker="Cart"
              title="Review your bag"
              description={`${itemCount} item${itemCount === 1 ? "" : "s"} ready for checkout.`}
            />
            <TrustStrip
              className="mt-2"
              items={[
                { icon: ShieldCheck, label: "Secure checkout" },
                { icon: PackageCheck, label: "Live variant validation" },
                { icon: Truck, label: "Fast US shipping" },
              ]}
            />
          </div>
          <button
            type="button"
            onClick={clear}
            className="inline-flex h-10 w-full items-center justify-center rounded-full border border-border px-4 text-xs font-bold uppercase tracking-[0.08em] hover:border-destructive/40 hover:text-destructive sm:w-auto"
          >
            Clear cart
          </button>
        </div>
      </Reveal>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="grid gap-3">
          {items.map((item, index) => (
            <Reveal key={item.id} delayMs={index * 45}>
              <article className="salt-panel-shell rounded-[1.35rem] p-3.5 sm:rounded-2xl sm:p-4">
                <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.title}
                      className="aspect-square w-full rounded-xl border border-border bg-muted object-cover"
                    />
                  ) : (
                    <div className="grid aspect-square w-full place-items-center rounded-xl border border-border bg-[radial-gradient(circle_at_28%_22%,hsl(var(--primary)/0.2),transparent_44%),radial-gradient(circle_at_75%_82%,hsl(var(--salt-blue)/0.2),transparent_42%),hsl(var(--muted))] px-3 text-center">
                      <p className="text-[0.62rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                        Image unavailable
                      </p>
                    </div>
                  )}

                  <div>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="font-display text-xl leading-tight">{item.title}</h2>
                        <p className="mt-1 text-xs text-muted-foreground">Unit price {formatMoney(item.unitPrice)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border hover:border-destructive/40 hover:text-destructive"
                        aria-label={`Remove ${item.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                      <div className="inline-flex h-10 items-center rounded-full border border-border bg-background">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="inline-flex h-10 w-10 items-center justify-center"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="min-w-10 text-center text-sm font-bold">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="inline-flex h-10 w-10 items-center justify-center"
                          aria-label="Increase quantity"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>

                      <p className="font-display text-2xl text-primary sm:text-right">
                        {formatMoney(item.unitPrice * item.quantity)}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delayMs={120}>
          <aside className="salt-panel-shell rounded-[1.45rem] p-4 sm:rounded-[1.8rem] sm:p-6 lg:sticky lg:top-24">
            <h2 className="font-display text-3xl">Order summary</h2>
            <div className="mt-4 space-y-3 border-b border-border pb-4 text-sm">
              <p className="flex items-center justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <strong>{formatMoney(subtotal)}</strong>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span>Calculated at checkout</span>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-muted-foreground">Taxes</span>
                <span>Calculated at checkout</span>
              </p>
            </div>
            <p className="mt-4 flex items-center justify-between font-display text-3xl">
              <span>Total</span>
              <span className="text-primary">{formatMoney(subtotal)}</span>
            </p>
            <div className="mt-3 rounded-xl border border-border/80 bg-background/88 p-3">
              <p className="text-[0.66rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                Free shipping progress
              </p>
              <div className="salt-progress-track mt-2">
                <span className="salt-progress-fill" style={{ width: `${freeShippingProgress}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {freeShippingRemaining > 0
                  ? `${formatMoney(freeShippingRemaining)} away from free shipping.`
                  : "You unlocked free shipping on this order."}
              </p>
            </div>
            <div className="mt-3 hidden gap-2 sm:grid sm:grid-cols-3">
              <p className="salt-kpi-card rounded-xl border border-border/70 px-2.5 py-2 text-center text-[0.62rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Encrypted payment
              </p>
              <p className="salt-kpi-card rounded-xl border border-border/70 px-2.5 py-2 text-center text-[0.62rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Live order tracking
              </p>
              <p className="salt-kpi-card rounded-xl border border-border/70 px-2.5 py-2 text-center text-[0.62rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                30-day returns
              </p>
            </div>

            <p className="mt-4 rounded-xl border border-border/80 bg-background p-3 text-xs text-muted-foreground">
              Express payment options appear inside secure Shopify checkout.
            </p>
            {autoRecoveredCount > 0 ? (
              <p className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-900 dark:text-emerald-100">
                Auto-recovered {autoRecoveredCount} item(s) to live Shopify variants.
              </p>
            ) : null}
            {hasUnresolvedCheckoutItems ? (
              <div className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                <p>
                  {unresolvedCheckoutItems.length} item(s) in this cart could not be mapped to a live Shopify variant. Remove and re-add them before checkout, or remove all unmapped items at once:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {unresolvedShopifyLinks.map((entry) => (
                    <li key={entry.id}>
                      <a
                        href={entry.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-primary"
                      >
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
                  className="mt-2 inline-flex h-9 items-center rounded-full border border-amber-700/40 bg-background px-3 text-[0.7rem] font-bold uppercase tracking-[0.08em] text-amber-900 hover:border-amber-700/70 dark:text-amber-100"
                >
                  Remove unmapped items
                </button>
              </div>
            ) : null}

            <a
              href={checkoutTargetUrl}
              onClick={() => {
                trackMetaPixelInitiateCheckout(checkoutItems);
                recordDeviceOrderHistory({
                  source: "cart",
                  checkoutUrl: checkoutHandoffUrl,
                  items: checkoutItems,
                });
              }}
              aria-disabled={hasUnresolvedCheckoutItems}
                className={`mt-3 salt-button-shine inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold uppercase tracking-[0.08em] text-primary-foreground ${
                hasUnresolvedCheckoutItems
                  ? "pointer-events-none opacity-60"
                  : "hover:brightness-110 hover:shadow-[0_18px_30px_-24px_hsl(var(--primary)/0.95)]"
              }`}
            >
              Continue to checkout
            </a>

            <Link
              to="/shop"
              className="salt-outline-chip mt-2 h-12 w-full justify-center rounded-xl px-5 py-0 text-sm"
            >
              Continue shopping
            </Link>

            <Link
              to="/contact"
              className="salt-outline-chip mt-2 h-10 w-full justify-center rounded-xl px-5 py-0 text-xs"
            >
              Need checkout help?
            </Link>

            <div className="mt-3 grid gap-2 rounded-xl border border-border/80 bg-background p-3 text-xs text-muted-foreground">
              <p className="inline-flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5" /> Payment encryption enabled
              </p>
              <p className="inline-flex items-center gap-2">
                <PackageCheck className="h-3.5 w-3.5" /> Tracking details after dispatch
              </p>
            </div>
          </aside>
        </Reveal>
      </div>

      {recommendedProducts.length > 0 ? (
        <section className="mt-8">
          <Reveal>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Add-on picks</p>
                <h2 className="font-display text-[clamp(1.7rem,2.6vw,2.5rem)]">Complete the basket</h2>
              </div>
            </div>
          </Reveal>
          <div className="salt-section-shell rounded-[1.7rem] p-4">
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-6 xl:grid-cols-5">
              {recommendedProducts.map((product, index) => (
                <Reveal key={product.id} delayMs={index * 60} className="h-full">
                  <ProductCard product={product} variant="shop" />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/96 px-3 pb-[calc(0.7rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden">
        <div className="mx-auto flex w-[min(1280px,100%)] items-center gap-3">
          <div className="min-w-0 shrink-0">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {itemCount} item{itemCount === 1 ? "" : "s"}
            </p>
            <p className="font-display text-[1.4rem] leading-none text-primary">{formatMoney(subtotal)}</p>
          </div>
          <a
            href={checkoutTargetUrl}
            onClick={() => {
              trackMetaPixelInitiateCheckout(checkoutItems);
              recordDeviceOrderHistory({
                source: "cart",
                checkoutUrl: checkoutHandoffUrl,
                items: checkoutItems,
              });
            }}
            aria-disabled={hasUnresolvedCheckoutItems}
            className={`salt-button-shine salt-primary-cta inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold uppercase tracking-[0.08em] ${
              hasUnresolvedCheckoutItems
                ? "pointer-events-none opacity-60"
                : "hover:brightness-110 hover:shadow-[0_18px_30px_-24px_hsl(var(--primary)/0.95)]"
            }`}
          >
            Continue to checkout
          </a>
        </div>
      </div>
    </section>
  );
};

export default CartPage;
