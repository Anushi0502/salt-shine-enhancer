import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Minus,
  PackageCheck,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Truck,
} from "lucide-react";
import Reveal from "@/components/storefront/Reveal";
import ProductCard from "@/components/storefront/ProductCard";
import {
  buildShopifyCartUrl,
  buildShopifyCheckoutUrl,
  buildShopifyProductUrl,
  buildShopifySearchUrl,
  isValidShopifyVariantId,
  useCart,
} from "@/lib/cart";
import { formatMoney } from "@/lib/formatters";
import { useProducts } from "@/lib/shopify-data";

const FREE_SHIPPING_THRESHOLD = 49;
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

  const recommendedProducts = (productsPayload?.products || []).slice(0, 4);
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

  const shippingGap = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  const shippingProgress = Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100);
  const checkoutUrl = buildShopifyCheckoutUrl(checkoutItems);
  const shopifyCartUrl = buildShopifyCartUrl();

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
      <section className="mx-auto mt-10 w-[min(880px,92vw)] pb-10 text-center">
        <Reveal>
          <div className="salt-surface rounded-[2rem] p-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary">
              <ShoppingBag className="h-8 w-8" />
            </div>
            <h1 className="mt-4 font-display text-4xl">Your cart is empty</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Add products from the catalog and they will appear here instantly.
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
    <section className="mx-auto mt-8 w-[min(1280px,96vw)] pb-10">
      <Reveal>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Cart</p>
            <h1 className="font-display text-[clamp(2rem,4vw,3.2rem)] leading-[0.95]">Review your order</h1>
            <p className="mt-2 text-sm text-muted-foreground">{itemCount} items currently in your cart.</p>
          </div>
          <button
            type="button"
            onClick={clear}
            className="inline-flex h-10 items-center rounded-full border border-border px-4 text-xs font-bold uppercase tracking-[0.08em] hover:border-destructive/40 hover:text-destructive"
          >
            Clear cart
          </button>
        </div>
      </Reveal>

      <Reveal delayMs={40}>
        <div className="salt-panel-shell mb-5 rounded-2xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="inline-flex items-center gap-1.5 font-semibold">
              <Truck className="h-4 w-4 text-primary" />
              {shippingGap > 0
                ? `${formatMoney(shippingGap)} away from free shipping`
                : "You unlocked free shipping"}
            </p>
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
              Threshold {formatMoney(FREE_SHIPPING_THRESHOLD)}
            </p>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${shippingProgress}%` }} />
          </div>
        </div>
      </Reveal>

      <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="grid gap-3">
          {items.map((item, index) => (
            <Reveal key={item.id} delayMs={index * 45}>
              <article className="salt-panel-shell rounded-2xl p-4 sm:p-5">
                <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
                  <img
                    src={item.image || "/placeholder.svg"}
                    alt={item.title}
                    className="aspect-square w-full rounded-xl border border-border bg-muted object-cover"
                  />

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

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
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

                      <p className="font-display text-2xl text-primary">
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
          <aside className="salt-panel-shell rounded-[2rem] p-5 sm:p-6 lg:sticky lg:top-24">
            <h2 className="font-display text-3xl">Order summary</h2>
            <div className="mt-5 space-y-3 border-b border-border pb-5 text-sm">
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
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <p className="rounded-xl border border-border/70 bg-background px-2.5 py-2 text-center text-[0.62rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Encrypted payment
              </p>
              <p className="rounded-xl border border-border/70 bg-background px-2.5 py-2 text-center text-[0.62rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Live order tracking
              </p>
              <p className="rounded-xl border border-border/70 bg-background px-2.5 py-2 text-center text-[0.62rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                30-day returns
              </p>
            </div>

            <p className="mt-5 rounded-xl border border-border/80 bg-background p-3 text-xs text-muted-foreground">
              Standard checkout is recommended. Express options (including Shop Pay) appear inside Shopify checkout.
            </p>
            {autoRecoveredCount > 0 ? (
              <p className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-900 dark:text-emerald-100">
                Auto-recovered {autoRecoveredCount} item(s) to live Shopify variants.
              </p>
            ) : null}
            {hasUnresolvedCheckoutItems ? (
              <div className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                <p>
                  {unresolvedCheckoutItems.length} item(s) in this cart could not be mapped to a
                  live Shopify variant. Remove and re-add those item(s) before checkout, or click the button below to remove all unmapped items at once. You can also try searching for the item(s) on Shopify using the links below:
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
              href={hasUnresolvedCheckoutItems ? shopifyCartUrl : checkoutUrl}
              target="_blank"
              rel="noreferrer"
              aria-disabled={hasUnresolvedCheckoutItems}
              className={`mt-3 salt-button-shine inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold uppercase tracking-[0.08em] text-primary-foreground ${
                hasUnresolvedCheckoutItems
                  ? "pointer-events-none opacity-60"
                  : "hover:brightness-110 hover:shadow-[0_18px_30px_-24px_hsl(var(--primary)/0.95)]"
              }`}
            >
              Continue to Checkout <ArrowRight className="h-4 w-4" />
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

            <div className="mt-4 grid gap-2 rounded-xl border border-border/80 bg-background p-3 text-xs text-muted-foreground">
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
        <section className="mt-10">
          <Reveal>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Add-on picks</p>
                <h2 className="font-display text-[clamp(1.7rem,2.6vw,2.5rem)]">Complete your order</h2>
              </div>
            </div>
          </Reveal>
          <div className="salt-section-shell rounded-[1.7rem] p-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {recommendedProducts.map((product, index) => (
                <Reveal key={product.id} delayMs={index * 60}>
                  <ProductCard product={product} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </section>
  );
};

export default CartPage;
