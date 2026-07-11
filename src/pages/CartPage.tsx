import { useEffect, useMemo, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { Minus, PackageCheck, Plus, ShieldCheck, ShoppingBag, Trash2, Truck } from "lucide-react";
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
import { useCollectionProductsMap, useProducts } from "@/lib/shopify-data";
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
  const { data: productsPayload } = useProducts();
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
      <section className="mx-auto mt-8 w-[min(840px,calc(100%-24px))] pb-10 text-center">
        <div className="rounded-[1.6rem] border border-[#d8e6f5] bg-white p-8 shadow-[0_22px_44px_-34px_rgba(12,32,72,0.18)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#ECF4FC] text-[#15479a]">
            <ShoppingBag className="h-8 w-8" />
          </div>
          <h1 className="mt-4 text-[clamp(2rem,4vw,3rem)] font-semibold tracking-tight text-[#102A43]">
            Your cart is empty
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#5C748F]">
            Add products from the catalog and they will appear here for checkout.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2.5">
            <Link
              to="/shop?collection=all-products"
              className="inline-flex h-11 items-center justify-center rounded-full bg-[#15479a] px-6 text-sm font-bold text-white transition hover:bg-[#123c81]"
            >
              Start shopping
            </Link>
            <Link
              to="/collections"
              className="inline-flex h-11 items-center justify-center rounded-full border border-[#bfd7f2] bg-white px-6 text-sm font-bold text-[#102A43] transition hover:bg-[#f5faff]"
            >
              Browse collections
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto mt-6 w-[min(1280px,calc(100%-24px))] pb-28 md:pb-10">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4">
          <div className="rounded-[1.35rem] border border-[#d8e6f5] bg-white p-5 shadow-[0_20px_42px_-34px_rgba(12,32,72,0.16)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[#5C748F]">Cart</p>
                <h1 className="mt-1 text-[clamp(1.95rem,4vw,3rem)] font-semibold tracking-tight text-[#102A43]">
                  Shopping Cart
                </h1>
                <p className="mt-2 text-sm leading-6 text-[#5C748F]">
                  {itemCount} item{itemCount === 1 ? "" : "s"} ready for checkout.
                </p>
              </div>
              <button
                type="button"
                onClick={clear}
                className="inline-flex h-10 items-center justify-center rounded-full border border-[#d8e6f5] bg-white px-4 text-xs font-bold uppercase tracking-[0.08em] text-[#102A43] transition hover:border-[#d54c4c]/35 hover:text-[#b42318]"
              >
                Clear cart
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d8e6f5] bg-[#f7fbff] px-3 py-1.5 text-[0.68rem] font-semibold text-[#102A43]">
                <ShieldCheck className="h-3.5 w-3.5 text-[#15479a]" />
                Secure checkout
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d8e6f5] bg-[#f7fbff] px-3 py-1.5 text-[0.68rem] font-semibold text-[#102A43]">
                <PackageCheck className="h-3.5 w-3.5 text-[#15479a]" />
                Live stock validation
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d8e6f5] bg-[#f7fbff] px-3 py-1.5 text-[0.68rem] font-semibold text-[#102A43]">
                <Truck className="h-3.5 w-3.5 text-[#15479a]" />
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
                className="rounded-[1.35rem] border border-[#d8e6f5] bg-white p-4 shadow-[0_18px_36px_-32px_rgba(12,32,72,0.14)] sm:p-5"
              >
                <div className="grid gap-4 sm:grid-cols-[112px_minmax(0,1fr)]">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.title}
                      className="aspect-square w-full rounded-[1rem] border border-[#e2edf8] bg-[#f7fbff] object-cover"
                    />
                  ) : (
                    <div className="grid aspect-square w-full place-items-center rounded-[1rem] border border-[#e2edf8] bg-[#f7fbff] px-3 text-center">
                      <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-[#5C748F]">
                        Image unavailable
                      </p>
                    </div>
                  )}

                  <div className="flex min-w-0 flex-col gap-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-[#2e7d32]">
                          {method === "unresolved" ? "Needs remap" : "In stock"}
                        </p>
                        <h2 className="mt-1 text-lg font-semibold leading-tight text-[#102A43] sm:text-[1.2rem]">
                          {item.title}
                        </h2>
                        <p className="mt-1 text-sm text-[#5C748F]">Sold by SALT</p>
                        <a
                          href={unresolvedLookupUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex text-sm font-semibold text-[#15479a] transition hover:text-[#123c81]"
                        >
                          View product
                        </a>
                      </div>

                      <div className="shrink-0 text-left sm:text-right">
                        <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-[#5C748F]">
                          Item total
                        </p>
                        <p className="mt-1 text-[1.7rem] font-semibold leading-none text-[#102A43]">
                          {formatMoney(item.unitPrice * item.quantity)}
                        </p>
                        <p className="mt-1 text-sm text-[#5C748F]">{formatMoney(item.unitPrice)} each</p>
                      </div>
                    </div>

                    {method === "unresolved" ? (
                      <div className="rounded-[1rem] border border-amber-400/40 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                        This item could not be mapped to a live Shopify variant. Reopen the product and add it again before checkout.
                      </div>
                    ) : null}

                    <div className="flex flex-col gap-3 border-t border-[#e2edf8] pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="inline-flex h-10 items-center rounded-full border border-[#d8e6f5] bg-[#f7fbff]">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          disabled={item.quantity <= getMinimumProductQuantity(item.handle, item.unitPrice, item.minimumQuantity)}
                          className="inline-flex h-10 w-10 items-center justify-center text-[#102A43] disabled:cursor-not-allowed disabled:opacity-35"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="min-w-12 text-center text-sm font-bold text-[#102A43]">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="inline-flex h-10 w-10 items-center justify-center text-[#102A43]"
                          aria-label="Increase quantity"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      {getMinimumProductQuantity(item.handle, item.unitPrice, item.minimumQuantity) > 1 ? (
                        <p className="mt-1 text-[0.72rem] text-[#5C748F]">
                          Shop floor: buy {getMinimumProductQuantity(item.handle, item.unitPrice, item.minimumQuantity)}.
                        </p>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[#d8e6f5] bg-white px-4 text-sm font-semibold text-[#102A43] transition hover:border-[#d54c4c]/35 hover:text-[#b42318]"
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

        <aside className="rounded-[1.35rem] border border-[#d8e6f5] bg-white p-5 shadow-[0_20px_42px_-34px_rgba(12,32,72,0.16)] lg:sticky lg:top-24 lg:self-start">
          <h2 className="text-[1.7rem] font-semibold tracking-tight text-[#102A43]">Order Summary</h2>

          <div className="mt-5 space-y-3 border-b border-[#e2edf8] pb-5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[#5C748F]">Items ({itemCount})</span>
              <strong className="text-[#102A43]">{formatMoney(subtotal)}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[#5C748F]">Shipping</span>
              <span className="text-[#102A43]">Calculated at checkout</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[#5C748F]">Estimated tax</span>
              <span className="text-[#102A43]">Calculated at checkout</span>
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-base font-semibold text-[#102A43]">Subtotal</span>
              <span className="text-[1.8rem] font-semibold leading-none text-[#102A43]">
                {formatMoney(subtotal)}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-[#5C748F]">
              Express payment options appear inside secure Shopify checkout.
            </p>
          </div>

          <div className="mt-5 rounded-[1rem] border border-[#d8e6f5] bg-[#f7fbff] p-4">
            <p className="text-[0.66rem] font-bold uppercase tracking-[0.12em] text-[#5C748F]">
              Free shipping progress
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#dbe8f7]">
              <span
                className="block h-full rounded-full bg-[#15479a] transition-[width] duration-300"
                style={{ width: `${freeShippingProgress}%` }}
              />
            </div>
            <p className="mt-2 text-sm leading-6 text-[#5C748F]">
              {freeShippingRemaining > 0
                ? `${formatMoney(freeShippingRemaining)} away from free shipping.`
                : "Free shipping unlocked for this order."}
            </p>
          </div>

          {hasUnresolvedCheckoutItems ? (
            <div className="mt-4 rounded-[1rem] border border-amber-400/40 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
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
                className="mt-3 inline-flex h-10 items-center justify-center rounded-full border border-amber-700/30 bg-white px-4 text-xs font-bold uppercase tracking-[0.08em] text-amber-900 transition hover:border-amber-700/50"
              >
                Remove unmapped items
              </button>
            </div>
          ) : null}

          <a
            href={checkoutHandoffUrl}
            onClick={handleCheckoutClick}
            aria-disabled={hasUnresolvedCheckoutItems}
            className={`mt-5 inline-flex h-12 w-full items-center justify-center rounded-full px-5 text-sm font-bold uppercase tracking-[0.08em] text-white transition ${
              hasUnresolvedCheckoutItems
                ? "pointer-events-none bg-[#7d8fa8] opacity-65"
                : "bg-[#15479a] hover:bg-[#123c81]"
            }`}
          >
            Proceed to checkout
          </a>

          <Link
            to="/shop?collection=all-products"
            className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-full border border-[#bfd7f2] bg-white px-5 text-sm font-bold text-[#102A43] transition hover:bg-[#f5faff]"
          >
            Continue shopping
          </Link>

          {recommendedProducts.length > 0 ? (
            <div className="mt-5 rounded-[1rem] border border-[#d8e6f5] bg-[#f7fbff] p-4">
              <p className="text-[0.66rem] font-bold uppercase tracking-[0.12em] text-[#5C748F]">
                Pair with these picks
              </p>
              <div className="mt-3 space-y-3">
                {recommendedProducts.slice(0, 3).map((product) => {
                  const image = productImage(product);

                  return (
                    <Link
                      key={product.id}
                      to={`/products/${product.handle}`}
                      className="flex items-center gap-3 rounded-[0.95rem] border border-[#d8e6f5] bg-white p-2.5 transition hover:border-[#bfd7f2] hover:bg-[#fbfdff]"
                    >
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[0.8rem] border border-[#e2edf8] bg-[#f1f7ff]">
                        {image ? (
                          <img src={image} alt={product.title} className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-[0.52rem] font-bold uppercase tracking-[0.08em] text-[#5C748F]">
                            No image
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-semibold leading-5 text-[#102A43]">
                          {product.title}
                        </p>
                        <p className="mt-1 text-[0.66rem] uppercase tracking-[0.12em] text-[#5C748F]">
                          {product.product_type || "Curated pick"}
                        </p>
                      </div>
                      <strong className="shrink-0 text-sm text-[#15479a]">
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
            className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-full border border-[#d8e6f5] bg-[#f7fbff] px-5 text-xs font-bold uppercase tracking-[0.08em] text-[#102A43] transition hover:bg-white"
          >
            Need checkout help?
          </Link>

          <div className="mt-4 grid gap-2 rounded-[1rem] border border-[#e2edf8] bg-[#f7fbff] p-4 text-sm text-[#5C748F]">
            <p className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#15479a]" />
              Secure Shopify checkout
            </p>
            <p className="inline-flex items-center gap-2">
              <PackageCheck className="h-4 w-4 text-[#15479a]" />
              Live variant validation
            </p>
            <p className="inline-flex items-center gap-2">
              <Truck className="h-4 w-4 text-[#15479a]" />
              Tracking after dispatch
            </p>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#d8e6f5] bg-white/96 px-3 pb-[calc(0.7rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-18px_40px_-32px_rgba(12,32,72,0.2)] backdrop-blur md:hidden">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3">
          <div className="min-w-0 shrink-0">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-[#5C748F]">
              {itemCount} item{itemCount === 1 ? "" : "s"}
            </p>
            <p className="text-[1.4rem] font-semibold leading-none text-[#102A43]">{formatMoney(subtotal)}</p>
          </div>
          <a
            href={checkoutHandoffUrl}
            onClick={handleCheckoutClick}
            aria-disabled={hasUnresolvedCheckoutItems}
            className={`inline-flex h-12 flex-1 items-center justify-center rounded-full px-5 text-sm font-bold uppercase tracking-[0.08em] text-white transition ${
              hasUnresolvedCheckoutItems
                ? "pointer-events-none bg-[#7d8fa8] opacity-65"
                : "bg-[#15479a] hover:bg-[#123c81]"
            }`}
          >
            Checkout
          </a>
        </div>
      </div>
    </section>
  );
};

export default CartPage;
