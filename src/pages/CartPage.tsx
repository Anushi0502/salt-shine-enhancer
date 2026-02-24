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
import { useCart } from "@/lib/cart";
import { formatMoney } from "@/lib/formatters";
import { useProducts } from "@/lib/shopify-data";

const FREE_SHIPPING_THRESHOLD = 49;

const CartPage = () => {
  const { items, subtotal, itemCount, updateQuantity, removeItem, clear } = useCart();
  const { data: productsPayload } = useProducts();

  const recommendedProducts = (productsPayload?.products || []).slice(0, 4);
  const shippingGap = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  const shippingProgress = Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100);

  if (!items.length) {
    return (
      <section className="mx-auto mt-10 w-[min(880px,92vw)] pb-10 text-center">
        <Reveal>
          <div className="rounded-[2rem] border border-border/80 bg-card p-10 shadow-soft">
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
                className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground hover:brightness-110"
              >
                Start shopping
              </Link>
              <Link
                to="/collections"
                className="inline-flex h-11 items-center rounded-full border border-border bg-background px-6 text-sm font-bold"
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
        <div className="mb-5 rounded-2xl border border-border/80 bg-card p-4 shadow-soft">
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
              <article className="rounded-2xl border border-border/80 bg-card p-4 shadow-soft sm:p-5">
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
          <aside className="rounded-[2rem] border border-border/80 bg-card p-5 shadow-soft sm:p-6 lg:sticky lg:top-24">
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

            <a
              href="https://saltonlinestore.com/cart"
              target="_blank"
              rel="noreferrer"
              className="mt-5 salt-button-shine inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold uppercase tracking-[0.08em] text-primary-foreground hover:brightness-110"
            >
              Checkout on Shopify <ArrowRight className="h-4 w-4" />
            </a>

            <Link
              to="/shop"
              className="mt-2 inline-flex h-12 w-full items-center justify-center rounded-xl border border-border bg-background px-5 text-sm font-bold uppercase tracking-[0.08em] hover:border-primary/50"
            >
              Continue shopping
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recommendedProducts.map((product, index) => (
              <Reveal key={product.id} delayMs={index * 60}>
                <ProductCard product={product} />
              </Reveal>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
};

export default CartPage;
