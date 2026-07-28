import { memo, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { ArrowUpRight, Heart, ShoppingBag, Sparkles, Star } from "lucide-react";
import { useCart } from "@/lib/cart";
import { isNativeApp } from "@/lib/mobile";
import {
  compareAt,
  conciseTitle,
  formatMoney,
  minPrice,
  productImage,
  savingsPercent,
} from "@/lib/formatters";
import { getMinimumProductQuantity } from "@/lib/minimum-quantity-rules";
import type { JudgeMeReviewSummary } from "@/lib/judgeme";
import { useWishlist, wishlistItemFromProduct } from "@/lib/wishlist";
import { useJudgeMeProductRating } from "@/lib/judgeme";
import { useProductByHandle } from "@/lib/shopify-data";
import type { ShopifyProduct } from "@/types/shopify";

export type ProductCardVariant = "default" | "dense" | "shop";

type ProductCardProps = {
  product: ShopifyProduct;
  variant?: ProductCardVariant;
  reviewSummary?: JudgeMeReviewSummary | null;
};

const ProductCard = ({ product: snapshotProduct, variant = "default", reviewSummary }: ProductCardProps) => {
  const cardRef = useRef<HTMLElement | null>(null);
  const [shouldRefreshLive, setShouldRefreshLive] = useState(false);

  useEffect(() => {
    const node = cardRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setShouldRefreshLive(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }

        setShouldRefreshLive(true);
        observer.disconnect();
      },
      { rootMargin: "240px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const { data: liveProduct } = useProductByHandle(snapshotProduct.handle, shouldRefreshLive, true);
  const product = useMemo<ShopifyProduct>(() => {
    if (!liveProduct) {
      return snapshotProduct;
    }

    // Shopify owns operational fields in real time. Keep curated merchandising
    // copy from the instant local snapshot when the public product endpoint
    // does not expose those app-managed metafields.
    return {
      ...snapshotProduct,
      ...liveProduct,
      body_html: liveProduct.body_html || snapshotProduct.body_html,
      product_type: liveProduct.product_type || snapshotProduct.product_type,
      customData: snapshotProduct.customData,
      images: liveProduct.images.length ? liveProduct.images : snapshotProduct.images,
      variants: liveProduct.variants.length ? liveProduct.variants : snapshotProduct.variants,
    };
  }, [liveProduct, snapshotProduct]);
  const { addItem } = useCart();
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const { isWishlisted, toggleItem } = useWishlist();
  const reviewSummaryProvided = reviewSummary !== undefined;
  const { summary: fetchedSummary } = useJudgeMeProductRating(reviewSummaryProvided ? undefined : product.id);
  const nativeApp = isNativeApp();
  const isDense = variant === "dense";
  const isShop = variant === "shop";
  const sale = savingsPercent(product);
  const min = minPrice(product);
  const compare = compareAt(product);
  const image = productImage(product);
  const title = conciseTitle(product.title, isShop ? 64 : isDense ? 58 : 64);
  const subtitle = conciseTitle(product.customData?.subtitle || product.product_type || "Curated pick", isShop ? 44 : 58);
  const minimumQuantity = getMinimumProductQuantity(
    product.handle,
    min,
    product.customData?.shopChannelMinimumQuantity,
  );
  const highlights = (product.customData?.highlights || []).filter(Boolean).slice(0, 2);
  const wishlisted = isWishlisted(product.handle);
  const summary = reviewSummaryProvided ? reviewSummary ?? null : fetchedSummary;
  const fallbackSummary =
    Number(product.average_rating || 0) > 0 && Number(product.total_reviews || 0) > 0
      ? {
          rating: Number(product.average_rating || 0),
          reviewCount: Number(product.total_reviews || 0),
          purchasedLastMonth: 0,
        }
      : null;
  const displaySummary = summary && summary.reviewCount > 0 ? summary : fallbackSummary;
  const publishedAt = new Date(product.published_at || product.created_at || "").getTime();
  const isNew = Number.isFinite(publishedAt) && Date.now() - publishedAt <= 1000 * 60 * 60 * 24 * 45;
  const badgeLabel = product.customData?.badgeText?.trim() || (sale > 0 ? `Save ${sale}%` : isNew ? "New" : "SALT pick");
  const hasReviews = Boolean(displaySummary && displaySummary.reviewCount > 0);
  const formattedRating = hasReviews ? displaySummary.rating.toFixed(1) : "";

  if (isShop) {
    return (
      <article
        ref={cardRef}
        className="group relative flex h-full flex-col overflow-hidden rounded-[1.45rem] border border-border/70 bg-background/92 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.22)] transition duration-500 hover:-translate-y-1 hover:border-primary/20 hover:shadow-[0_24px_46px_-32px_rgba(15,23,42,0.16)]"
      >
        <button
          type="button"
          onClick={() => {
            const nextSaved = !wishlisted;
            toggleItem(wishlistItemFromProduct(product));
            toast.success(nextSaved ? "Saved to wishlist" : "Removed from wishlist", {
              description: title,
            });
          }}
          aria-pressed={wishlisted ? "true" : "false"}
          aria-label={wishlisted ? `Remove ${title} from wishlist` : `Save ${title} to wishlist`}
          title={wishlisted ? "Remove from wishlist" : "Save to wishlist"}
          className="absolute right-3 top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-background/96 text-foreground shadow-[0_8px_18px_-16px_rgba(15,23,42,0.32)] transition hover:border-primary/20 hover:text-primary"
        >
          <Heart className={`h-4 w-4 ${wishlisted ? (nativeApp ? "fill-primary/16 text-primary" : "fill-primary/20 text-primary") : ""}`} />
        </button>

        <Link
          to={`/products/${product.handle}`}
          className="flex h-full flex-col"
        >
          <div className={`relative overflow-hidden ${nativeApp ? "bg-muted/18" : "bg-muted/20"}`}>
            {image ? (
              <div className="aspect-[0.98/1.03] overflow-hidden">
                <img
                  src={image}
                  alt={product.title}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                />
              </div>
            ) : (
              <div className={`grid aspect-[0.98/1.03] w-full place-items-center px-4 text-center text-[0.68rem] font-semibold uppercase tracking-[0.14em] ${
                nativeApp
                  ? "bg-[linear-gradient(135deg,hsl(var(--background)/0.98),hsl(var(--muted)/0.82))] text-muted-foreground"
                  : "bg-[linear-gradient(135deg,hsl(var(--background)/0.98),hsl(var(--card)/0.92))] text-primary"
              }`}>
                Image unavailable
              </div>
            )}

            <div className={`absolute left-3 top-3 rounded-full border px-2.5 py-1 text-[0.54rem] font-semibold uppercase tracking-[0.16em] shadow-[0_10px_20px_-18px_rgba(15,23,42,0.24)] backdrop-blur ${
              nativeApp
                ? "border-border/70 bg-background/92 text-foreground"
                : "salt-editorial-meta border-border/70 bg-background/88 text-primary"
            }`}>
              {badgeLabel}
            </div>
          </div>

          <div className="flex flex-1 flex-col p-3.5 sm:p-4">
            <p className="text-[0.56rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {subtitle}
            </p>
            <h3 className={`mt-2 line-clamp-2 font-display text-[1rem] leading-[1.08] tracking-[-0.03em] ${
              nativeApp ? "text-foreground" : "text-foreground"
            }`}>
              {title}
            </h3>
            <p className="mt-1 line-clamp-1 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {product.product_type || "Curated pick"}
            </p>
            {highlights.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {highlights.map((highlight) => (
                  <span
                    key={highlight}
                    className="salt-editorial-meta rounded-full px-2 py-0.5 text-[0.55rem] font-semibold uppercase tracking-[0.08em]"
                  >
                    {highlight}
                  </span>
                ))}
              </div>
            ) : null}

            {displaySummary && displaySummary.reviewCount > 0 ? (
              <div className="salt-editorial-meta mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.08em]">
                <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                {formattedRating}
                <span className="text-muted-foreground">•</span>
                {displaySummary.reviewCount.toLocaleString()} reviews
              </div>
            ) : null}

            <div className="mt-auto flex items-end justify-between gap-2 pt-4">
              <div className="min-w-0">
                <p className="font-display text-[1.3rem] leading-none text-foreground">
                  {formatMoney(min)}
                </p>
                {compare > min ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <s>{formatMoney(compare)}</s>
                  </p>
                ) : null}
              </div>
              <span className={`salt-editorial-meta inline-flex h-8 shrink-0 items-center justify-center px-3 text-[0.62rem] font-bold uppercase tracking-[0.1em] transition group-hover:-translate-y-[1px] ${
                nativeApp
                  ? "border-border/70 bg-background text-foreground group-hover:border-primary/20 group-hover:text-primary"
                  : "group-hover:border-primary/30 group-hover:bg-background"
              }`}>
                Shop
              </span>
            </div>

            {minimumQuantity > 1 ? (
              <p className="mt-2 text-[0.62rem] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                Buy {minimumQuantity}
              </p>
            ) : null}
          </div>
        </Link>
      </article>
    );
  }

  return (
    <article
      ref={cardRef}
      className={`group relative flex h-full flex-col overflow-hidden rounded-[1.1rem] p-2 shadow-[0_16px_38px_-30px_rgba(22,77,160,0.28)] transition duration-500 hover:-translate-y-0.5 sm:p-2 ${
        nativeApp
          ? "border border-border/70 bg-background/96 hover:border-primary/20 hover:shadow-[0_22px_48px_-32px_rgba(15,23,42,0.16)]"
          : "border border-border/70 bg-background/92 hover:border-primary/20 hover:shadow-[0_22px_48px_-32px_rgba(15,23,42,0.18)]"
      }`}
    >
      <button
        type="button"
        onClick={() => {
          const nextSaved = !wishlisted;
          toggleItem(wishlistItemFromProduct(product));
          toast.success(nextSaved ? "Saved to wishlist" : "Removed from wishlist", {
            description: title,
          });
        }}
        aria-pressed={wishlisted ? "true" : "false"}
        aria-label={wishlisted ? `Remove ${title} from wishlist` : `Save ${title} to wishlist`}
        title={wishlisted ? "Remove from wishlist" : "Save to wishlist"}
        className={`absolute right-3 top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border shadow-[0_8px_18px_-16px_rgba(15,23,42,0.4)] transition ${
          nativeApp
            ? "border-border/70 bg-background/96 text-foreground hover:border-primary/20 hover:text-primary"
            : "border-white/40 bg-white/90 text-primary hover:border-primary/30 hover:text-primary/80"
        }`}
      >
        <Heart className={`h-4 w-4 ${wishlisted ? (nativeApp ? "fill-primary/16 text-primary" : "fill-primary/20 text-primary") : ""}`} />
      </button>

      <Link
        to={`/products/${product.handle}`}
        className={`relative isolate block overflow-hidden rounded-[0.9rem] bg-muted ${
          nativeApp ? "border border-border/70" : "border border-border/70"
        }`}
      >
        {image ? (
          <div className="aspect-square w-full overflow-hidden">
            <div className="salt-category-scroll-track h-full w-full">
              <img
                src={image}
                alt={product.title}
                loading="lazy"
                decoding="async"
                className="h-[112%] w-full object-cover transition duration-700 ease-out group-hover:scale-[1.04]"
              />
            </div>
          </div>
        ) : (
          <div className="grid aspect-square w-full place-items-center bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--card)))] text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Image unavailable
          </div>
        )}

        <div
          className={`absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.52rem] font-semibold uppercase tracking-[0.11em] ${
            nativeApp
              ? "border-border/70 bg-foreground text-background"
              : "salt-editorial-meta border-border/70 bg-background/86 text-foreground"
          }`}
        >
          <Sparkles className={`h-3 w-3 ${nativeApp ? "text-background" : "text-amber-400"}`} />
          {badgeLabel}
        </div>
      </Link>

      <div className="mt-2 flex flex-1 flex-col">
        <p className={`line-clamp-2 font-display text-[clamp(0.98rem,2vw,1.1rem)] leading-[1.12] ${nativeApp ? "text-foreground" : "text-foreground"}`}>
          {title}
        </p>
        {subtitle ? (
          <p className="mt-0.5 line-clamp-1 text-[0.64rem] font-medium tracking-[0.08em] text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
        <p className="mt-0.5 line-clamp-1 text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {product.product_type || "Curated pick"}
        </p>
        {highlights.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {highlights.map((highlight) => (
              <span
                key={highlight}
                className="rounded-full border border-border/70 bg-background px-2 py-0.5 text-[0.55rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
              >
                {highlight}
              </span>
            ))}
          </div>
        ) : null}

        {displaySummary && displaySummary.reviewCount > 0 ? (
          <div className="mt-1 flex items-center gap-1 text-amber-500">
            {Array.from({ length: 5 }, (_, index) => (
              <Star
                key={index}
                className={`h-3 w-3 ${index < displaySummary.rating ? "fill-current" : ""}`}
              />
            ))}
          </div>
        ) : null}

        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className={`font-display text-[1.2rem] leading-none ${nativeApp ? "text-foreground" : "text-primary"}`}>{formatMoney(min)}</p>
            {compare > min ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                <s>{formatMoney(compare)}</s>
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setIsAddingToCart(true);
                addItem(
                  {
                    id: product.id,
                    handle: product.handle,
                    title: product.title,
                    image: image || "",
                    unitPrice: min,
                    shopifyVariantId: product.variants[0]?.id,
                    productType: product.product_type,
                    minimumQuantity,
                  },
                  1,
                  { openDrawer: true },
                );
                setIsAddingToCart(false);
                toast.success("Added to cart", { description: title });
              }}
              className="salt-primary-cta h-7 w-7 shrink-0 items-center justify-center rounded-full text-white transition disabled:pointer-events-none disabled:opacity-50"
              disabled={isAddingToCart}
              aria-label={`Add ${title} to cart`}
            >
              <ShoppingBag className="h-3.5 w-3.5" />
            </button>
            <Link
              to={`/products/${product.handle}`}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/96 text-primary transition hover:border-primary/20 hover:text-primary/80"
              aria-label="View item details"
            >
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
};

const MemoizedProductCard = memo(ProductCard);

export default MemoizedProductCard;
