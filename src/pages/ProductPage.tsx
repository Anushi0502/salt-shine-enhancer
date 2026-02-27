import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  History,
  Leaf,
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
import { buildShopifyCartUrl, buildShopifyShopPayUrl, useCart } from "@/lib/cart";
import {
  compareAt,
  formatMoney,
  isPlausibleComparePrice,
  productImage,
  productTagList,
  sortVariantsByPrice,
  stripHtml,
} from "@/lib/formatters";
import { useProducts } from "@/lib/shopify-data";

const RECENTLY_VIEWED_KEY = "salt-recently-viewed-handles";

function displayVariantTitle(title?: string): string {
  const normalized = (title || "").trim();
  if (!normalized || normalized.toLowerCase() === "default title") {
    return "Standard Option";
  }

  return normalized;
}

function variantOptionTokens(title?: string): string[] {
  const normalized = displayVariantTitle(title);
  const parts = normalized
    .split(/\s*\/\s*|\s-\s/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return [];
  }

  return parts.slice(0, 3);
}

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
    setActiveImage(productImage(product) || "");
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
  const lowestVariantPrice = Number(variants[0]?.price || 0);
  const availableVariantsCount = variants.filter((variant) => variant.available).length;
  const comparePriceCandidate = Number(selectedVariant?.compare_at_price || 0) || compareAt(product);
  const comparePrice = isPlausibleComparePrice(price, comparePriceCandidate) ? comparePriceCandidate : 0;
  const isAvailable = selectedVariant?.available ?? true;
  const savingsAmount = comparePrice > price ? comparePrice - price : 0;
  const selectedQuantity = Math.max(1, Math.floor(quantity || 1));
  const shopPayUrl = selectedVariant
    ? buildShopifyShopPayUrl(selectedVariant.id, selectedQuantity)
    : buildShopifyCartUrl();

  const relatedProducts = products
    .filter((entry) => entry.id !== product.id && entry.product_type === product.product_type)
    .slice(0, 4);

  const primaryImage = productImage(product) || "";
  const imageSources = (product.images.length
    ? product.images.map((image) => image.src)
    : [primaryImage]).filter(Boolean);

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
        image: activeImage || primaryImage,
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
          className="salt-outline-chip mt-3 h-10 gap-2 px-4 py-0 text-xs"
        >
          <ArrowLeft className="h-4 w-4" /> Back to shop
        </Link>
      </Reveal>

      <div className="mt-4 grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
        <Reveal>
          <div className="salt-panel-shell rounded-[2rem] p-4 sm:p-5">
            <div className="overflow-hidden rounded-[1.4rem] border border-border bg-muted">
              {activeImage || primaryImage ? (
                <img
                  src={activeImage || primaryImage}
                  alt={product.title}
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <div className="grid aspect-square w-full place-items-center bg-[radial-gradient(circle_at_28%_22%,hsl(var(--primary)/0.2),transparent_44%),radial-gradient(circle_at_75%_82%,hsl(var(--salt-olive)/0.2),transparent_42%),hsl(var(--muted))] px-3 text-center">
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                    Image unavailable
                  </p>
                </div>
              )}
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {imageSources.slice(0, 8).map((source, index) => (
                <button
                  key={`${source}-${index}`}
                  type="button"
                  onClick={() => setActiveImage(source)}
                  className={`overflow-hidden rounded-lg border ${
                    (activeImage || primaryImage) === source
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
          <aside className="salt-panel-shell rounded-[2rem] p-5 sm:p-7 lg:sticky lg:top-24">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{product.product_type || "Featured"}</p>
            <h1 className="mt-1 font-display text-[clamp(1.8rem,3vw,2.9rem)] leading-[0.95]">{product.title}</h1>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{stripHtml(product.body_html)}</p>

            <div className="mt-4 flex flex-wrap items-baseline gap-2">
              <strong className="font-display text-3xl text-primary">{formatMoney(price)}</strong>
              {comparePrice > price ? <s className="text-sm text-muted-foreground">{formatMoney(comparePrice)}</s> : null}
              {savingsAmount > 0 ? (
                <span className="rounded-full border border-emerald-500/35 bg-emerald-500/12 px-2.5 py-1 text-[0.64rem] font-bold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300">
                  Save {formatMoney(savingsAmount)}
                </span>
              ) : null}
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
              <div className="mt-5 rounded-2xl border border-border/75 bg-background/70 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Choose option</p>
                  <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    {availableVariantsCount} of {variants.length} available
                  </span>
                </div>

                {selectedVariant ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-primary/8 px-3 py-2 text-xs">
                    <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      {displayVariantTitle(selectedVariant.title)}
                    </span>
                    <span className="rounded-full border border-border/70 bg-background px-2 py-0.5 font-semibold text-primary">
                      {formatMoney(price)}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 ${
                        isAvailable
                          ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "border-destructive/40 bg-destructive/10 text-destructive"
                      }`}
                    >
                      {isAvailable ? "Ready to ship" : "Unavailable"}
                    </span>
                  </div>
                ) : null}

                <div className="salt-quiet-scroll mt-3 grid max-h-64 gap-2 overflow-auto pr-1 sm:grid-cols-2">
                  {variants.map((variant) => {
                    const variantPrice = Number(variant.price || 0);
                    const variantComparePrice = Number(variant.compare_at_price || 0);
                    const variantAvailable = variant.available;
                    const isVariantSelected = variant.id === selectedVariant?.id;
                    const variantTitle = displayVariantTitle(variant.title);
                    const optionTokens = variantOptionTokens(variant.title);
                    const variantPriceDelta = variantPrice - lowestVariantPrice;
                    const hasVariantSavings = isPlausibleComparePrice(variantPrice, variantComparePrice);

                    return (
                      <button
                        key={variant.id}
                        type="button"
                        onClick={() => setSelectedVariantId(variant.id)}
                        disabled={!variantAvailable}
                        aria-pressed={isVariantSelected}
                        className={`group relative overflow-hidden rounded-xl border px-3 py-2.5 text-left transition ${
                          isVariantSelected
                            ? "border-primary bg-primary/12 shadow-[0_14px_28px_-22px_hsl(var(--primary)/0.95)]"
                            : "border-border bg-background hover:border-primary/45"
                        } ${variantAvailable ? "" : "cursor-not-allowed opacity-50"}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold leading-tight text-foreground">
                            {variantTitle}
                          </p>
                          {isVariantSelected ? (
                            <span className="rounded-full border border-primary/40 bg-primary/14 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.08em] text-primary">
                              Selected
                            </span>
                          ) : null}
                        </div>

                        {optionTokens.length > 0 ? (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {optionTokens.map((token) => (
                              <span
                                key={`${variant.id}-${token}`}
                                className="rounded-full border border-border/70 bg-background px-2 py-0.5 text-[0.58rem] font-bold uppercase tracking-[0.08em] text-muted-foreground"
                              >
                                {token}
                              </span>
                            ))}
                          </div>
                        ) : null}

                        <div className="mt-2 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-primary">{formatMoney(variantPrice)}</span>
                            {hasVariantSavings ? (
                              <s className="text-[0.68rem] text-muted-foreground">
                                {formatMoney(variantComparePrice)}
                              </s>
                            ) : null}
                          </div>
                          <span className={variantAvailable ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"}>
                            {variantAvailable ? "Available" : "Unavailable"}
                          </span>
                        </div>

                        <p className="mt-1 text-[0.68rem] text-muted-foreground">
                          {variantPriceDelta <= 0
                            ? "Base price option"
                            : `${formatMoney(variantPriceDelta)} above base`}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
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
                  ? "hover:brightness-110 hover:shadow-[0_18px_32px_-24px_rgba(73,55,224,0.95)]"
                  : "pointer-events-none opacity-60"
              }`}
            >
              Buy with <span className="ml-1 text-[1.9rem] font-black lowercase leading-none">shop</span>
            </a>

            <button
              type="button"
              onClick={addToCart}
              disabled={!isAvailable}
              className="mt-2 salt-button-shine salt-primary-cta h-12 w-full gap-2 rounded-xl px-5 text-sm font-bold uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShoppingBag className="h-4 w-4" />
              {isAvailable ? `Add to cart • ${formatMoney(price * quantity)}` : "Unavailable"}
            </button>


            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Link
                to={product.product_type ? `/shop?type=${encodeURIComponent(product.product_type)}` : "/shop"}
                className="salt-outline-chip h-10 justify-center rounded-xl px-3 py-0 text-[0.68rem]"
              >
                Similar products
              </Link>
              <Link
                to="/contact"
                className="salt-outline-chip h-10 justify-center rounded-xl px-3 py-0 text-[0.68rem]"
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
              <p className="flex items-center gap-2">
                <Leaf className="h-3.5 w-3.5" /> Curated quality checks before listing
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {highlights.map((item) => (
                <span
                  key={item}
                  className="salt-outline-chip px-2.5 py-1 text-[0.62rem]"
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
          <div className="salt-panel-shell rounded-[1.7rem] p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {relatedProducts.map((related, index) => (
                <Reveal key={related.id} delayMs={index * 70}>
                  <ProductCard product={related} />
                </Reveal>
              ))}
            </div>
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
          <div className="salt-panel-shell rounded-[1.7rem] p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {recentlyViewedProducts.map((entry, index) => (
                <Reveal key={entry.id} delayMs={index * 55}>
                  <ProductCard product={entry} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={addToCart}
          disabled={!isAvailable}
          className="salt-primary-cta h-12 w-full gap-2 rounded-xl px-5 text-sm font-bold uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShoppingBag className="h-4 w-4" />
          {isAvailable ? `Add to cart - ${formatMoney(price)}` : "Unavailable"}
        </button>
      </div>
    </section>
  );
};

export default ProductPage;
