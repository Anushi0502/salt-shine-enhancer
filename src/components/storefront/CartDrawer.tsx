import { useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { Minus, Plus, ShieldCheck, ShoppingBag, Trash2, Truck } from "lucide-react";
import {
  buildShopifyCheckoutUrl,
  isValidShopifyVariantId,
  useCart,
} from "@/lib/cart";
import { formatMoney, productImage } from "@/lib/formatters";
import { recordDeviceOrderHistory } from "@/lib/order-history";
import { useProducts } from "@/lib/shopify-data";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const CartDrawer = () => {
  const location = useLocation();
  const { data: productsPayload } = useProducts();
  const {
    items,
    itemCount,
    subtotal,
    isDrawerOpen,
    closeCartDrawer,
    updateQuantity,
    removeItem,
    addItem,
  } = useCart();

  useEffect(() => {
    closeCartDrawer();
  }, [location.pathname, location.search]);

  const cartHandleSet = useMemo(
    () => new Set(items.map((item) => item.handle.trim().toLowerCase()).filter(Boolean)),
    [items],
  );
  const recommendedProducts = useMemo(
    () =>
      (productsPayload?.products || [])
        .filter((product) => !cartHandleSet.has(product.handle.trim().toLowerCase()))
        .slice(0, 3),
    [cartHandleSet, productsPayload],
  );

  const invalidItemCount = items.filter((item) => !isValidShopifyVariantId(item.shopifyVariantId)).length;
  const checkoutUrl = buildShopifyCheckoutUrl(items);
  const canCheckout = items.length > 0 && invalidItemCount === 0;

  return (
    <Sheet open={isDrawerOpen} onOpenChange={(open) => (open ? undefined : closeCartDrawer())}>
      <SheetContent
        side="right"
        className="w-full max-w-[30rem] overflow-y-auto border-l border-border/70 bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--card)))] px-0"
      >
        <div className="flex min-h-full flex-col">
          <SheetHeader className="border-b border-border/70 px-5 pb-5 pt-12 text-left sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-primary">
                  Cart
                </p>
                <SheetTitle className="mt-2 font-display text-[clamp(1.8rem,4vw,2.4rem)] leading-[0.95]">
                  {itemCount > 0 ? `${itemCount} item${itemCount === 1 ? "" : "s"} saved` : "Your bag is ready"}
                </SheetTitle>
                <SheetDescription className="mt-2 max-w-sm text-sm leading-6">
                  Live Shopify pricing and a quick path back to browsing.
                </SheetDescription>
              </div>
              <div className="rounded-[1.25rem] border border-border/70 bg-card/80 px-4 py-3 text-right shadow-[0_18px_36px_-30px_rgba(15,23,42,0.18)]">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Subtotal
                </p>
                <p className="mt-1 font-display text-2xl text-foreground">{formatMoney(subtotal)}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <div className="rounded-[1.1rem] border border-border/70 bg-card/85 px-4 py-3 text-sm text-muted-foreground">
                <p className="inline-flex items-center gap-2 font-medium text-foreground">
                  <Truck className="h-4 w-4 text-primary" />
                  Dispatch-ready checkout
                </p>
                <p className="mt-1 text-[0.82rem] leading-5">
                  Shipping and tax stay transparent at checkout.
                </p>
              </div>
              <div className="rounded-[1.1rem] border border-border/70 bg-card/85 px-4 py-3 text-sm text-muted-foreground">
                <p className="inline-flex items-center gap-2 font-medium text-foreground">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Secure handoff
                </p>
                <p className="mt-1 text-[0.82rem] leading-5">
                  Encrypted payment and verified variant selection stay preserved.
                </p>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 px-5 py-5 sm:px-6">
            {items.length === 0 ? (
              <div className="rounded-[1.7rem] border border-dashed border-border/80 bg-card/70 px-5 py-10 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-border/70 bg-background text-primary">
                  <ShoppingBag className="h-6 w-6" />
                </div>
                <h2 className="mt-4 font-display text-3xl leading-none">Your bag is empty</h2>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
                  Start with a collection or search for the kind of piece you want.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <Link
                    to="/collections"
                    onClick={closeCartDrawer}
                    className="salt-primary-cta h-11 px-5 text-[0.72rem] font-semibold uppercase tracking-[0.1em]"
                  >
                    Explore collections
                  </Link>
                  <Link
                    to="/shop"
                    onClick={closeCartDrawer}
                    className="salt-outline-chip h-11 px-5 py-0 text-[0.72rem]"
                  >
                    Shop all products
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-[1.5rem] border border-border/70 bg-card/85 p-4 shadow-[0_22px_40px_-34px_rgba(15,23,42,0.16)]"
                  >
                    <div className="flex gap-3">
                      <div className="h-24 w-20 overflow-hidden rounded-[1rem] border border-border/70 bg-muted">
                        {item.image ? (
                          <img src={item.image} alt={item.title} className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            No image
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="line-clamp-2 text-base font-semibold leading-6 text-foreground">
                              {item.title}
                            </p>
                            <p className="mt-1 text-[0.76rem] uppercase tracking-[0.12em] text-muted-foreground">
                              Unit price {formatMoney(item.unitPrice)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-background/85 text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                            aria-label={`Remove ${item.title}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-3">
                          <div className="inline-flex h-10 items-center rounded-full border border-border/70 bg-background/90 px-1">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:text-foreground"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <span className="min-w-8 text-center text-sm font-semibold text-foreground">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:text-foreground"
                              aria-label="Increase quantity"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="text-right">
                            <p className="text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
                              Line total
                            </p>
                            <p className="mt-1 font-display text-xl text-foreground">
                              {formatMoney(item.unitPrice * item.quantity)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {recommendedProducts.length > 0 ? (
              <section className="mt-6">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-primary">
                      Pair with
                    </p>
                    <h2 className="mt-1 font-display text-[1.55rem] leading-none">Finish the basket</h2>
                  </div>
                  <Link
                    to="/shop?sort=newest"
                    onClick={closeCartDrawer}
                    className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition hover:text-foreground"
                  >
                    View more
                  </Link>
                </div>

                <div className="space-y-3">
                  {recommendedProducts.map((product) => {
                    const image = productImage(product);
                    const defaultVariant = product.variants.find((variant) => variant.available) || product.variants[0];

                    return (
                      <article
                        key={product.id}
                        className="flex items-center gap-3 rounded-[1.35rem] border border-border/70 bg-card/82 p-3"
                      >
                        <Link
                          to={`/products/${product.handle}`}
                          onClick={closeCartDrawer}
                          className="h-20 w-16 overflow-hidden rounded-[0.95rem] border border-border/70 bg-muted"
                        >
                          {image ? (
                            <img src={image} alt={product.title} className="h-full w-full object-cover" />
                          ) : (
                            <div className="grid h-full w-full place-items-center text-[0.52rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              No image
                            </div>
                          )}
                        </Link>

                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/products/${product.handle}`}
                            onClick={closeCartDrawer}
                            className="line-clamp-2 text-sm font-semibold leading-5 text-foreground transition hover:text-primary"
                          >
                            {product.title}
                          </Link>
                          <p className="mt-1 text-[0.72rem] uppercase tracking-[0.14em] text-muted-foreground">
                            {product.product_type || "Curated pick"}
                          </p>
                          <p className="mt-2 text-base font-semibold text-foreground">
                            {formatMoney(Number(defaultVariant?.price || 0))}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (!defaultVariant) {
                              return;
                            }

                            addItem(
                              {
                                id: defaultVariant.id,
                                shopifyVariantId: defaultVariant.id,
                                handle: product.handle,
                                title: product.title,
                                image: image || "",
                                unitPrice: Number(defaultVariant.price || 0),
                              },
                              1,
                            );
                          }}
                          disabled={!defaultVariant}
                          className="salt-outline-chip h-10 shrink-0 px-3 py-0 text-[0.68rem]"
                        >
                          Add
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>

          <div className="sticky bottom-0 border-t border-border/70 bg-background/92 px-5 py-5 backdrop-blur sm:px-6">
            {invalidItemCount > 0 ? (
              <p className="mb-3 rounded-[1rem] border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-[0.78rem] leading-6 text-amber-900 dark:text-amber-100">
                {invalidItemCount} item{invalidItemCount === 1 ? "" : "s"} need a quick review before checkout.
              </p>
            ) : null}

            <div className="grid gap-2">
              {canCheckout ? (
                <a
                  href={checkoutUrl}
                  onClick={() => {
                    recordDeviceOrderHistory({
                      source: "cart",
                      checkoutUrl,
                      items,
                    });
                  }}
                  className="salt-primary-cta h-12 justify-center px-5 text-sm font-semibold uppercase tracking-[0.12em]"
                >
                  Continue to checkout
                </a>
              ) : (
                <Link
                  to="/cart"
                  onClick={closeCartDrawer}
                  className="salt-primary-cta h-12 justify-center px-5 text-sm font-semibold uppercase tracking-[0.12em]"
                >
                  Review full cart
                </Link>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <Link
                  to="/cart"
                  onClick={closeCartDrawer}
                  className="salt-outline-chip h-11 justify-center px-5 py-0 text-[0.72rem]"
                >
                  Open full cart
                </Link>
                <Link
                  to="/shop"
                  onClick={closeCartDrawer}
                  className="salt-outline-chip h-11 justify-center px-5 py-0 text-[0.72rem]"
                >
                  Keep shopping
                </Link>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default CartDrawer;
