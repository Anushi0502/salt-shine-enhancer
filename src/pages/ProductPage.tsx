import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  ChevronRight,
  History,
  Minus,
  PackageCheck,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import Reveal from "@/components/storefront/Reveal";
import ProductCard from "@/components/storefront/ProductCard";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { useCart } from "@/lib/cart";
import {
  compareAt,
  formatMoney,
  productImage,
  productTagList,
  sortVariantsByPrice,
  stripHtml,
} from "@/lib/formatters";
import { useProducts } from "@/lib/shopify-data";

const RECENTLY_VIEWED_KEY = "salt-recently-viewed-handles";
const SHOP_BASE = import.meta.env.VITE_SALT_SHOP_URL || "https://saltonlinestore.com";

const ProductPage = () => {
  const { handle } = useParams();
  const { addItem } = useCart();
  const { data, isLoading, error, refetch } = useProducts();

  const products = data?.products || [];
  const product = products.find((entry) => entry.handle === handle);

  const variants = useMemo(() => (product ? sortVariantsByPrice(product.variants) : []), [product]);
  const [selectedVariantId, setSelectedVariantId] = useState<number>(0);
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState("");
  const [recentHandles, setRecentHandles] = useState<string[]>([]);

  useEffect(() => {
    if (!product) {
      return;
    }

    const firstVariant = variants[0];
    setSelectedVariantId(firstVariant?.id || 0);
    setQuantity(1);
    setActiveImage(productImage(product));
  }, [product, variants]);

  useEffect(() => {
    if (!product || typeof window === "undefined") {
      return;
    }

    let existing: string[] = [];
    const raw = window.localStorage.getItem(RECENTLY_VIEWED_KEY);

    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          existing = parsed.filter((value): value is string => typeof value === "string");
        }
      } catch {
        existing = [];
      }
    }

    const next = [product.handle, ...existing.filter((handle) => handle !== product.handle)].slice(0, 12);
    window.localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next));
    setRecentHandles(next);
  }, [product]);

  if (isLoading) {
    return <LoadingState title="Loading product" subtitle="Preparing details, variants, and delivery info." />;
  }

  if (error) {
    return (
      <ErrorState
        title="We could not load this product"
        subtitle="Please retry or return to the catalog."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
            >
              Retry
            </button>
            <Link
              to="/shop"
              className="inline-flex h-11 items-center rounded-xl border border-border bg-background px-5 text-sm font-bold"
            >
              Back to shop
            </Link>
          </div>
        }
      />
    );
  }

  if (!product) {
    return (
      <ErrorState
        title="Product not found"
        subtitle="The requested product handle is unavailable in the current catalog."
        action={
          <Link
            to="/shop"
            className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
          >
            Browse products
          </Link>
        }
      />
    );
  }

  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId) || variants[0];
  const price = Number(selectedVariant?.price || 0);
  const comparePrice = Number(selectedVariant?.compare_at_price || 0) || compareAt(product);
  const isAvailable = selectedVariant?.available ?? true;
  const selectedQuantity = Math.max(1, Math.floor(quantity || 1));
  const shopPayUrl = selectedVariant
    ? `${SHOP_BASE}/cart/${selectedVariant.id}:${selectedQuantity}?payment=shop_pay`
    : `${SHOP_BASE}/cart`;

  const relatedProducts = products
    .filter((entry) => entry.id !== product.id && entry.product_type === product.product_type)
    .slice(0, 4);

  const imageSources = product.images.length
    ? product.images.map((image) => image.src)
    : [productImage(product)];

  const highlights = [
    product.product_type ? `${product.product_type} essential` : "Curated everyday essential",
    ...productTagList(product).slice(0, 2),
  ];

  const recentlyViewedProducts = recentHandles
    .filter((entry) => entry !== product.handle)
    .map((entry) => products.find((candidate) => candidate.handle === entry))
    .filter((entry): entry is (typeof products)[number] => Boolean(entry))
    .slice(0, 4);

  const deliveryStart = new Date();
  deliveryStart.setDate(deliveryStart.getDate() + 3);
  const deliveryEnd = new Date();
  deliveryEnd.setDate(deliveryEnd.getDate() + 6);

  const deliveryRange = `${deliveryStart.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} - ${deliveryEnd.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`;

  const addToCart = () => {
    if (!selectedVariant || !isAvailable) {
      return;
    }

    addItem(
      {
        id: selectedVariant.id,
        shopifyVariantId: selectedVariant.id,
        handle: product.handle,
        title: `${product.title} (${selectedVariant.title})`,
        image: activeImage || productImage(product),
        unitPrice: price,
      },
      quantity,
    );

    toast.success("Added to cart", {
      description: `${quantity} x ${product.title}`,
    });
  };

  return (
    <section className="mx-auto mt-8 w-[min(1280px,96vw)] pb-20 md:pb-8">
      <Reveal>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-primary">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link to="/shop" className="hover:text-primary">
            Shop
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="line-clamp-1">{product.title}</span>
        </div>
      </Reveal>

      <Reveal>
        <Link
          to="/shop"
          className="mt-3 inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-xs font-bold uppercase tracking-[0.08em] hover:border-primary/50"
        >
          <ArrowLeft className="h-4 w-4" /> Back to shop
        </Link>
      </Reveal>

      <div className="mt-4 grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
        <Reveal>
          <div className="rounded-[2rem] border border-border/80 bg-card p-4 shadow-soft sm:p-5">
            <div className="overflow-hidden rounded-[1.4rem] border border-border bg-muted">
              <img
                src={activeImage || productImage(product)}
                alt={product.title}
                className="aspect-square w-full object-cover"
              />
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {imageSources.slice(0, 8).map((source, index) => (
                <button
                  key={`${source}-${index}`}
                  type="button"
                  onClick={() => setActiveImage(source)}
                  className={`overflow-hidden rounded-lg border ${
                    (activeImage || productImage(product)) === source
                      ? "border-primary"
                      : "border-border hover:border-primary/40"
                  }`}
                  aria-label={`View product image ${index + 1}`}
                >
                  <img src={source} alt={`${product.title} view ${index + 1}`} className="aspect-square w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal delayMs={80}>
          <aside className="rounded-[2rem] border border-border/80 bg-card p-5 shadow-soft sm:p-7 lg:sticky lg:top-24">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{product.product_type || "Featured"}</p>
            <h1 className="mt-1 font-display text-[clamp(1.8rem,3vw,2.9rem)] leading-[0.95]">{product.title}</h1>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{stripHtml(product.body_html)}</p>

            <div className="mt-4 flex flex-wrap items-baseline gap-2">
              <strong className="font-display text-3xl text-primary">{formatMoney(price)}</strong>
              {comparePrice > price ? <s className="text-sm text-muted-foreground">{formatMoney(comparePrice)}</s> : null}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <p className={`rounded-full border px-3 py-1 text-xs font-semibold ${isAvailable ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
                {isAvailable ? "In stock and ready to ship" : "Out of stock"}
              </p>
              <p className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                Est. delivery {deliveryRange}
              </p>
            </div>

            {variants.length > 0 ? (
              <label className="mt-5 block text-sm font-semibold">
                Variant
                <select
                  className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/60"
                  value={selectedVariant?.id || ""}
                  onChange={(event) => setSelectedVariantId(Number(event.target.value))}
                >
                  {variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.title} - {formatMoney(Number(variant.price || 0))}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="mt-4">
              <p className="text-sm font-semibold">Quantity</p>
              <div className="mt-2 inline-flex h-11 items-center rounded-full border border-border bg-background">
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                  className="inline-flex h-11 w-11 items-center justify-center"
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="min-w-10 text-center text-sm font-bold">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.min(99, value + 1))}
                  className="inline-flex h-11 w-11 items-center justify-center"
                  aria-label="Increase quantity"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <a
              href={shopPayUrl}
              aria-disabled={!isAvailable}
              className={`mt-5 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,#5c3bff_0%,#3a2fd6_100%)] px-5 text-base font-semibold text-white transition ${
                isAvailable
                  ? "hover:brightness-110"
                  : "pointer-events-none opacity-60"
              }`}
            >
              Buy with <span className="ml-1 text-[1.9rem] font-black lowercase leading-none">shop</span>
            </a>

            <button
              type="button"
              onClick={addToCart}
              disabled={!isAvailable}
              className="mt-2 salt-button-shine inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold uppercase tracking-[0.08em] text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShoppingBag className="h-4 w-4" />
              {isAvailable ? `Add to cart • ${formatMoney(price * quantity)}` : "Unavailable"}
            </button>


            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Link
                to={product.product_type ? `/shop?type=${encodeURIComponent(product.product_type)}` : "/shop"}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-3 text-[0.68rem] font-bold uppercase tracking-[0.08em] hover:border-primary/50"
              >
                Similar products
              </Link>
              <Link
                to="/contact"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-3 text-[0.68rem] font-bold uppercase tracking-[0.08em] hover:border-primary/50"
              >
                Ask support
              </Link>
            </div>

            <div className="mt-5 grid gap-2 rounded-xl border border-border/80 bg-background p-3 text-xs text-muted-foreground">
              <p className="flex items-center gap-2">
                <Truck className="h-3.5 w-3.5" /> Free shipping over $49
              </p>
              <p className="flex items-center gap-2">
                <PackageCheck className="h-3.5 w-3.5" /> Fast US fulfillment and tracking
              </p>
              <p className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5" /> 30-day returns on eligible items
              </p>
              <p className="flex items-center gap-2">
                <BadgeCheck className="h-3.5 w-3.5" /> Secure payment processing
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {highlights.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.1em] text-muted-foreground"
                >
                  {item}
                </span>
              ))}
            </div>
          </aside>
        </Reveal>
      </div>

      {relatedProducts.length > 0 ? (
        <section className="mt-12">
          <Reveal>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Related</p>
                <h2 className="font-display text-[clamp(1.7rem,2.6vw,2.5rem)]">You may also like</h2>
              </div>
            </div>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {relatedProducts.map((related, index) => (
              <Reveal key={related.id} delayMs={index * 70}>
                <ProductCard product={related} />
              </Reveal>
            ))}
          </div>
        </section>
      ) : null}

      {recentlyViewedProducts.length > 0 ? (
        <section className="mt-10">
          <Reveal>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Recently viewed</p>
                <h2 className="inline-flex items-center gap-2 font-display text-[clamp(1.6rem,2.4vw,2.3rem)]">
                  <History className="h-5 w-5 text-primary" /> Continue exploring
                </h2>
              </div>
            </div>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recentlyViewedProducts.map((entry, index) => (
              <Reveal key={entry.id} delayMs={index * 55}>
                <ProductCard product={entry} />
              </Reveal>
            ))}
          </div>
        </section>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={addToCart}
          disabled={!isAvailable}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold uppercase tracking-[0.08em] text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShoppingBag className="h-4 w-4" />
          {isAvailable ? `Add to cart - ${formatMoney(price)}` : "Unavailable"}
        </button>
      </div>
    </section>
  );
};

export default ProductPage;
