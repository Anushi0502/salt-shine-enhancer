import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  History,
  Heart,
  Minus,
  PackageCheck,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Star,
  ToggleLeft,
  ToggleRight,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import InnerBreadcrumbs from "@/components/storefront/InnerBreadcrumbs";
import Reveal from "@/components/storefront/Reveal";
import ProductCard from "@/components/storefront/ProductCard";
import SectionHeading from "@/components/storefront/SectionHeading";
import ShopifyProductReviews from "@/components/storefront/ShopifyProductReviews";
import TrustStrip from "@/components/storefront/TrustStrip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { buildShopifyCartUrl, buildShopifyDirectCheckoutUrl, useCart } from "@/lib/cart";
import { buildCustomerAccessPath, useCustomerAuth } from "@/lib/customer-auth";
import {
  compareAt,
  formatMoney,
  isPlausibleComparePrice,
  minPrice,
  productImage,
  productTagList,
  sanitizeRichHtml,
  sortVariantsByPrice,
  stripHtml,
} from "@/lib/formatters";
import { useJudgeMeProductRating } from "@/lib/judgeme";
import { trackMetaPixelInitiateCheckout, trackMetaPixelViewContent } from "@/lib/meta-pixel";
import {
  getProductPurchasesLast30Days,
  recordDeviceOrderHistory,
  useDeviceOrderHistory,
} from "@/lib/order-history";
import { useProducts } from "@/lib/shopify-data";
import { useWishlist, wishlistItemFromProduct } from "@/lib/wishlist";

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
  const { isWishlisted, toggleItem } = useWishlist();
  const { isAuthenticated, session } = useCustomerAuth();
  const { data, isLoading, error, refetch } = useProducts();
  const { entries: deviceOrderEntries } = useDeviceOrderHistory();

  const products = data?.products || [];
  const product = products.find((entry) => entry.handle === handle);

  const variants = useMemo(() => (product ? sortVariantsByPrice(product.variants) : []), [product]);
  const [selectedVariantId, setSelectedVariantId] = useState<number>(0);
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState("");
  const [recentHandles, setRecentHandles] = useState<string[]>([]);
  const [showAvailableOnly, setShowAvailableOnly] = useState(true);
  const { summary: reviewSummary } = useJudgeMeProductRating(product?.id);
  const selectedVariant = useMemo(
    () => variants.find((variant) => variant.id === selectedVariantId) || variants[0],
    [selectedVariantId, variants],
  );

  useEffect(() => {
    if (!product) {
      return;
    }

    const firstVariant = variants.find((variant) => variant.available) || variants[0];
    setSelectedVariantId(firstVariant?.id || 0);
    setQuantity(1);
    setActiveImage(productImage(product) || "");
  }, [product, variants]);

  useEffect(() => {
    if (!showAvailableOnly || !selectedVariantId) {
      return;
    }

    const selectedVariant = variants.find((variant) => variant.id === selectedVariantId);
    if (selectedVariant?.available) {
      return;
    }

    const firstAvailable = variants.find((variant) => variant.available);
    if (firstAvailable) {
      setSelectedVariantId(firstAvailable.id);
    }
  }, [showAvailableOnly, selectedVariantId, variants]);

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

  useEffect(() => {
    if (!product) {
      return;
    }

    trackMetaPixelViewContent(product, selectedVariant);
  }, [product, selectedVariant]);

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
  const displayedVariants = showAvailableOnly ? variants.filter((variant) => variant.available) : variants;
  const price = Number(selectedVariant?.price || 0);
  const lowestVariantPrice = Number(variants[0]?.price || 0);
  const availableVariantsCount = variants.filter((variant) => variant.available).length;
  const comparePriceCandidate = Number(selectedVariant?.compare_at_price || 0) || compareAt(product);
  const comparePrice = isPlausibleComparePrice(price, comparePriceCandidate) ? comparePriceCandidate : 0;
  const isAvailable = selectedVariant?.available ?? true;
  const savingsAmount = comparePrice > price ? comparePrice - price : 0;
  const selectedQuantity = Math.max(1, Math.floor(quantity || 1));
  const directCheckoutUrl = selectedVariant
    ? buildShopifyDirectCheckoutUrl(selectedVariant.id, selectedQuantity)
    : buildShopifyCartUrl();
  const checkoutHandoffUrl = directCheckoutUrl;
  const checkoutTargetUrl = isAuthenticated
    ? checkoutHandoffUrl
    : buildCustomerAccessPath({ mode: "login", next: checkoutHandoffUrl, reason: "checkout" });
  const devicePurchasesLast30Days = getProductPurchasesLast30Days(
    deviceOrderEntries,
    product.handle,
  );
  const purchasedLastMonth = Math.max(
    devicePurchasesLast30Days,
    reviewSummary?.purchasedLastMonth || 0,
  );
  const reviewConfidenceScore = reviewSummary
    ? Math.min(
        99,
        Math.round(
          (Math.max(0, Math.min(reviewSummary.rating, 5)) / 5) * 70 +
            (Math.min(reviewSummary.reviewCount, 250) / 250) * 30,
        ),
      )
    : 0;
  const reviewConfidenceLabel = reviewConfidenceScore >= 90
    ? "Very high trust signal"
    : reviewConfidenceScore >= 75
      ? "Strong trust signal"
      : reviewConfidenceScore > 0
        ? "Emerging trust signal"
        : "";

  const relatedProducts = products
    .filter((entry) => entry.id !== product.id && entry.product_type === product.product_type)
    .slice(0, 4);

  const primaryImage = productImage(product) || "";
  const imageSources = (product.images.length
    ? product.images.map((image) => image.src)
    : [primaryImage]).filter(Boolean);

  const highlights = [
    product.product_type ? `${product.product_type} essential` : "Curated essential",
    ...productTagList(product).slice(0, 2),
  ];
  const shortDescription = stripHtml(product.body_html);
  const wishlisted = isWishlisted(product.handle);

  const toggleWishlistState = () => {
    const nextSaved = !wishlisted;
    toggleItem(wishlistItemFromProduct(product));
    toast.success(nextSaved ? "Saved to wishlist" : "Removed from wishlist", {
      description: product.title,
    });
  };

  const recentlyViewedProducts = recentHandles
    .filter((entry) => entry !== product.handle)
    .map((entry) => products.find((candidate) => candidate.handle === entry))
    .filter((entry): entry is (typeof products)[number] => Boolean(entry))
    .slice(0, 4);

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
        productType: product.product_type,
      },
      quantity,
    );

    toast.success("Added to cart", {
      description: `${quantity} x ${product.title}`,
    });
  };

  return (
    <section className="mx-auto mt-4 w-[min(1200px,94vw)] pb-28 sm:mt-6 sm:w-[min(1200px,96vw)] md:pb-8">
      <Reveal>
        <InnerBreadcrumbs
          className="hidden sm:flex"
          items={[
            { label: "Home", to: "/" },
            { label: "Shop", to: "/shop" },
            { label: product.title },
          ]}
        />
      </Reveal>

      <Reveal>
        <Link to="/shop" className="salt-outline-chip mt-2 h-9 gap-2 px-3.5 py-0 text-[0.7rem] sm:mt-3 sm:h-10 sm:px-4 sm:text-xs">
          <ArrowLeft className="h-4 w-4" /> Back to shop
        </Link>
      </Reveal>

      <div className="mt-3 grid gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-[1.08fr_0.92fr]">
        <Reveal>
          <div className="salt-panel-shell rounded-[1.3rem] p-2.5 sm:rounded-[1.8rem] sm:p-4">
            <div className="overflow-hidden rounded-[1.15rem] border border-border bg-muted sm:rounded-[1.4rem]">
              {activeImage || primaryImage ? (
                <img
                  src={activeImage || primaryImage}
                  alt={product.title}
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <div className="grid aspect-square w-full place-items-center bg-[radial-gradient(circle_at_28%_22%,hsl(var(--primary)/0.2),transparent_44%),radial-gradient(circle_at_75%_82%,hsl(var(--salt-blue)/0.2),transparent_42%),hsl(var(--muted))] px-3 text-center">
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                    Image unavailable
                  </p>
                </div>
              )}
            </div>
            <div className="mt-2.5 grid grid-cols-4 gap-2 sm:mt-3">
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
          <aside className="salt-panel-shell rounded-[1.3rem] p-3.5 sm:rounded-[1.8rem] sm:p-6 lg:sticky lg:top-24">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{product.product_type || "Featured"}</p>
            <h1 className="mt-1 font-display text-[clamp(1.8rem,3vw,2.9rem)] leading-[0.95]">{product.title}</h1>
            <div className="mt-4 flex flex-wrap items-baseline gap-2">
              <strong className="font-display text-3xl text-primary">{formatMoney(price)}</strong>
              {comparePrice > price ? <s className="text-sm text-muted-foreground">{formatMoney(comparePrice)}</s> : null}
              {savingsAmount > 0 ? (
                <span className="rounded-full border border-emerald-500/35 bg-emerald-500/12 px-2.5 py-1 text-[0.64rem] font-bold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300">
                  Save {formatMoney(savingsAmount)}
                </span>
              ) : null}
            </div>
            {reviewSummary ? (
              <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-background px-3 py-1.5 text-sm font-semibold text-foreground">
                    <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                    {reviewSummary.rating.toFixed(1)}
                  </span>
                  <span className="text-base font-medium text-foreground/90">{reviewSummary.reviewCount.toLocaleString()} total reviews</span>
                  {purchasedLastMonth > 0 ? (
                    <span className="rounded-full border border-border/80 bg-background px-2.5 py-1 text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-foreground">
                      {purchasedLastMonth.toLocaleString()} bought last month
                    </span>
                  ) : null}
                </div>
                <div className="rounded-xl border border-border/80 bg-background/85 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      Shopper confidence
                    </p>
                    <p className="text-[0.68rem] font-bold text-foreground">
                      {reviewConfidenceScore}%
                    </p>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-primary transition-[width] duration-500"
                      style={{ width: `${reviewConfidenceScore}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[0.65rem] text-muted-foreground">{reviewConfidenceLabel}</p>
                </div>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <p className={`rounded-full border px-3 py-1 text-xs font-semibold ${isAvailable ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
                {isAvailable ? "In stock" : "Out of stock"}
              </p>
            </div>

            {variants.length > 0 ? (
              <div className="salt-section-shell mt-4 rounded-[1.2rem] border border-border/75 p-3 sm:mt-5 sm:rounded-2xl sm:p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Choose option</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAvailableOnly((value) => !value)}
                      className="salt-outline-chip h-8 px-2.5 py-0 text-[0.6rem]"
                      aria-pressed={showAvailableOnly ? "true" : "false"}
                    >
                      {showAvailableOnly ? <ToggleRight className="mr-1 h-3.5 w-3.5" /> : <ToggleLeft className="mr-1 h-3.5 w-3.5" />}
                      {showAvailableOnly ? "Available only" : "All options"}
                    </button>
                    <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                      {availableVariantsCount} of {variants.length} available
                    </span>
                  </div>
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
                  {displayedVariants.map((variant) => {
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
                        aria-pressed={isVariantSelected ? "true" : "false"}
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
                  {displayedVariants.length === 0 ? (
                    <p className="col-span-full rounded-xl border border-border/75 bg-background px-3 py-2 text-xs text-muted-foreground">
                      No available options right now. Turn off "Available only" to view all variants.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="mt-4">
              <p className="text-sm font-semibold">Quantity</p>
              <div className="mt-2 inline-flex h-11 w-full items-center justify-between rounded-full border border-border bg-background sm:w-auto">
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
              href={checkoutTargetUrl}
              onClick={() => {
                if (!isAuthenticated || !selectedVariant || !isAvailable) {
                  return;
                }

                trackMetaPixelInitiateCheckout([
                  {
                    id: selectedVariant.id,
                    shopifyVariantId: selectedVariant.id,
                    handle: product.handle,
                    title: `${product.title} (${selectedVariant.title})`,
                    unitPrice: price,
                    quantity: selectedQuantity,
                    productType: product.product_type,
                  },
                ]);

                recordDeviceOrderHistory({
                  source: "buy-now",
                  checkoutUrl: checkoutHandoffUrl,
                  items: [
                    {
                      id: selectedVariant.id,
                      shopifyVariantId: selectedVariant.id,
                      handle: product.handle,
                      title: `${product.title} (${selectedVariant.title})`,
                      image: activeImage || primaryImage,
                      unitPrice: price,
                      quantity: selectedQuantity,
                      productType: product.product_type,
                    },
                  ],
                  userId: session?.user?.id,
                });
              }}
              aria-disabled={isAvailable ? "false" : "true"}
              className={`mt-5 inline-flex h-12 w-full items-center justify-center rounded-xl border border-[#f3d45d] bg-[linear-gradient(135deg,#ffe071_0%,#f6cf3e_38%,#dda611_100%)] px-5 text-base font-semibold text-[#1c2233] shadow-[inset_0_1px_0_rgba(255,255,255,0.38),0_18px_34px_-24px_rgba(221,166,17,0.68)] transition ${
                isAvailable
                  ? "hover:-translate-y-[1px] hover:brightness-[1.03] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_22px_40px_-24px_rgba(221,166,17,0.78)]"
                  : "pointer-events-none opacity-60"
              }`}
            >
              {isAuthenticated ? "Buy now" : "Login to buy"}
            </a>
            <button
              type="button"
              onClick={addToCart}
              disabled={!isAvailable}
              className="mt-2 salt-button-shine salt-primary-cta h-12 w-full gap-2 rounded-xl px-5 text-sm font-bold uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShoppingBag className="h-4 w-4" />
              {isAvailable ? `Add to cart - ${formatMoney(price * quantity)}` : "Unavailable"}
            </button>

            <button
              type="button"
              onClick={toggleWishlistState}
              aria-pressed={wishlisted ? "true" : "false"}
              className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-5 text-sm font-bold uppercase tracking-[0.08em] text-foreground transition hover:border-primary/40 hover:text-primary"
            >
              <Heart className={`h-4 w-4 ${wishlisted ? "fill-primary/20 text-primary" : ""}`} />
              {wishlisted ? "Saved to wishlist" : "Save to wishlist"}
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

            <Accordion type="multiple" className="mt-4 rounded-[1.2rem] border border-border/80 bg-card/86 px-4">
              <AccordionItem value="details" className="border-border/70">
                <AccordionTrigger className="py-4 text-sm font-semibold text-foreground hover:no-underline">
                  Product details
                </AccordionTrigger>
                <AccordionContent>
                  <div
                    className="salt-product-description pb-4 text-sm text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(product.body_html) }}
                  />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="shipping" className="border-border/70">
                <AccordionTrigger className="py-4 text-sm font-semibold text-foreground hover:no-underline">
                  Shipping and returns
                </AccordionTrigger>
                <AccordionContent className="pb-4 text-sm leading-6 text-muted-foreground">
                  Shipping and taxes are calculated at Shopify checkout. Eligible items can be returned within the policy window.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="service" className="border-none">
                <AccordionTrigger className="py-4 text-sm font-semibold text-foreground hover:no-underline">
                  Why shoppers choose SALT
                </AccordionTrigger>
                <AccordionContent className="pb-4 text-sm leading-6 text-muted-foreground">
                  Curated assortment, clearer variant selection, visible savings, and support that stays close.
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="mt-4 rounded-xl border border-border/80 bg-background p-3">
              <TrustStrip
                items={[
                  { icon: Truck, label: "Free US shipping" },
                  { icon: PackageCheck, label: "Tracked fulfillment" },
                  { icon: ShieldCheck, label: "30-day returns" },
                  { icon: BadgeCheck, label: "Secure payment" },
                ]}
              />
              {purchasedLastMonth > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {purchasedLastMonth.toLocaleString()} shoppers bought this in the last month.
                </p>
              ) : null}
            </div>

            <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
              {highlights.map((item) => (
                <span
                  key={item}
                  className="salt-outline-chip shrink-0 px-2.5 py-1 text-[0.62rem]"
                >
                  {item}
                </span>
              ))}
            </div>
          </aside>
        </Reveal>
      </div>


      <ShopifyProductReviews productId={product.id} productHandle={product.handle} />

      {relatedProducts.length > 0 ? (
        <section className="mt-10">
          <Reveal>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Related</p>
                <h2 className="font-display text-[clamp(1.7rem,2.6vw,2.5rem)]">You may also like</h2>
              </div>
            </div>
          </Reveal>
          <div className="salt-panel-shell rounded-[1.7rem] p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-6">
              {relatedProducts.map((related, index) => (
                <Reveal key={related.id} delayMs={index * 70} className="h-full">
                  <ProductCard product={related} variant="dense" />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {recentlyViewedProducts.length > 0 ? (
        <section className="mt-8">
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
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-6">
              {recentlyViewedProducts.map((entry, index) => (
                <Reveal key={entry.id} delayMs={index * 55} className="h-full">
                  <ProductCard product={entry} variant="dense" />
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
              {isAvailable ? "Ready to ship" : "Unavailable"}
            </p>
            <p className="font-display text-[1.45rem] leading-none text-primary">{formatMoney(price)}</p>
          </div>
          <button
            type="button"
            onClick={toggleWishlistState}
            aria-pressed={wishlisted ? "true" : "false"}
            aria-label={wishlisted ? "Remove from wishlist" : "Save to wishlist"}
            className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-background text-foreground transition hover:border-primary/40 hover:text-primary"
          >
            <Heart className={`h-4.5 w-4.5 ${wishlisted ? "fill-primary/20 text-primary" : ""}`} />
          </button>
          <button
            type="button"
            onClick={addToCart}
            disabled={!isAvailable}
            className="salt-primary-cta h-12 flex-1 gap-2 rounded-xl px-5 text-sm font-bold uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ShoppingBag className="h-4 w-4" />
            {isAvailable ? "Add to cart" : "Unavailable"}
          </button>
        </div>
      </div>
    </section>
  );
};

export default ProductPage;
