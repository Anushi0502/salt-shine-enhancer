import { memo, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import { isNativeApp } from "@/lib/mobile";
import {
  compareAt,
  conciseTitle,
  formatMoney,
  minPrice,
  productImage,
  responsiveShopifyImageSrcSet,
  responsiveShopifyImageUrl,
} from "@/lib/formatters";
import { getMinimumProductQuantity } from "@/lib/minimum-quantity-rules";
import type { JudgeMeReviewSummary } from "@/lib/judgeme";
import { useWishlist, wishlistItemFromProduct } from "@/lib/wishlist";
import type { ShopifyProduct } from "@/types/shopify";
import ProductRating from "@/components/storefront/ProductRating";

export type ProductCardVariant = "default" | "dense" | "shop" | "hero";

type ProductCardProps = {
  product: ShopifyProduct;
  variant?: ProductCardVariant;
  reviewSummary?: JudgeMeReviewSummary | null;
  className?: string;
};

const ProductCard = ({ product, variant = "default", reviewSummary, className = "" }: ProductCardProps) => {
  const cardRef = useRef<HTMLElement | null>(null);
  const [hasEnteredViewport, setHasEnteredViewport] = useState(false);

  useEffect(() => {
    const node = cardRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setHasEnteredViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }

        // Keep a card's media eager after its first viewport entry. The card
        // remains mounted while scrolling, so Safari/Chrome do not discard a
        // product that has already been painted to save lazy-image memory.
        setHasEnteredViewport(true);
        observer.disconnect();
      },
      // Keep a generous warm-up window so rapid scrolling never exposes a
      // blank card, while still avoiding eager requests for the whole grid.
      { rootMargin: "480px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const isHero = variant === "hero";
  const isShop = variant === "shop" || isHero;
  const { isWishlisted, toggleItem } = useWishlist();
  const nativeApp = isNativeApp();
  const isDense = variant === "dense";
  const min = minPrice(product);
  const compare = compareAt(product);
  const discountPercent = compare > min ? Math.round(((compare - min) / compare) * 100) : 0;
  const image = productImage(product);
  const imageLoading = hasEnteredViewport ? "eager" : "lazy";
  const cardImage = responsiveShopifyImageUrl(image, 720);
  const cardImageSrcSet = responsiveShopifyImageSrcSet(image);
  const title = conciseTitle(product.title, isShop ? 64 : isDense ? 58 : 64);
  const minimumQuantity = getMinimumProductQuantity(
    product.handle,
    min,
    product.customData?.shopChannelMinimumQuantity,
  );
  const highlights = (product.customData?.highlights || []).filter(Boolean).slice(0, 2);
  const wishlisted = isWishlisted(product.handle);
  const fallbackSummary =
    Number(product.average_rating || 0) > 0 && Number(product.total_reviews || 0) > 0
      ? {
          rating: Number(product.average_rating || 0),
          reviewCount: Number(product.total_reviews || 0),
          purchasedLastMonth: 0,
        }
      : null;
  // Request-time Shopify Liquid includes Judge.me's synced badge summary.
  // Prefer the source with the larger published-review count so a stale
  // preview API response can never override the canonical card metadata.
  const displaySummary =
    fallbackSummary && (!reviewSummary || fallbackSummary.reviewCount >= reviewSummary.reviewCount)
      ? fallbackSummary
      : reviewSummary && reviewSummary.reviewCount > 0
        ? reviewSummary
        : null;

  if (isShop) {
    return (
      <article
        ref={cardRef}
        className={`group relative flex min-w-0 flex-col ${isHero ? "" : "h-full"} ${className}`.trim()}
      >
        <div className="relative overflow-hidden rounded-[1.65rem] border border-border/70 bg-muted shadow-[0_14px_30px_-24px_rgba(15,23,42,0.42)] transition duration-300 group-hover:-translate-y-0.5 group-hover:border-primary/35 group-hover:shadow-[0_22px_40px_-24px_rgba(15,23,42,0.45)]">
          <Link
            to={`/products/${product.handle}`}
            className={`relative block overflow-hidden ${isHero ? "aspect-[1.28]" : "aspect-square"}`}
          >
            {image ? (
              <img
                src={cardImage}
                srcSet={cardImageSrcSet}
                sizes="(min-width: 1280px) 20vw, (min-width: 768px) 25vw, 50vw"
                alt={product.title}
                loading={imageLoading}
                decoding="async"
                className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.045]"
              />
            ) : (
              <div className="grid h-full w-full place-items-center bg-card px-4 text-center text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-primary">
                Image unavailable
              </div>
            )}

            {discountPercent > 0 ? (
              <span
                className={`absolute z-10 rounded-full bg-black font-bold lowercase tracking-[-0.01em] text-white shadow-[0_8px_16px_-12px_rgba(0,0,0,0.8)] ${
                  isHero
                    ? "left-3 top-3 px-3 py-1 text-[0.62rem] sm:left-3 sm:top-3 sm:px-3.5 sm:py-1.5 sm:text-[0.72rem]"
                    : "left-4 top-4 px-3.5 py-1.5 text-[0.68rem] sm:left-5 sm:top-5 sm:px-4 sm:py-2 sm:text-[0.9rem]"
                }`}
              >
                {discountPercent}% off
              </span>
            ) : null}
          </Link>

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
            className={`absolute z-20 inline-flex items-center justify-center rounded-full border border-white/20 bg-foreground/65 shadow-[0_10px_22px_-14px_rgba(15,23,42,0.75)] backdrop-blur-sm transition hover:scale-[1.06] hover:bg-foreground/80 ${
              isHero
                ? "bottom-3 right-3 h-10 w-10 sm:bottom-3 sm:right-3 sm:h-11 sm:w-11 lg:h-12 lg:w-12"
                : "bottom-3 right-3 h-9 w-9 sm:bottom-4 sm:right-4 sm:h-10 sm:w-10 lg:h-11 lg:w-11"
            } ${wishlisted ? "text-red-500" : "text-background"}`}
          >
            <Heart className={`${isHero ? "h-5 w-5 sm:h-5 sm:w-5 lg:h-6 lg:w-6" : "h-4 w-4 sm:h-5 sm:w-5 lg:h-5 lg:w-5"} ${wishlisted ? "fill-red-500 text-red-500" : ""}`} />
          </button>
        </div>

        <div className={`min-w-0 px-1 ${isHero ? "pt-2 sm:pt-2.5" : "pt-4 sm:pt-5"}`}>
          <Link
            to={`/products/${product.handle}`}
            className={`block truncate font-display font-semibold leading-[1.15] tracking-[-0.02em] text-foreground ${
              isHero ? "text-[clamp(0.78rem,1.1vw,1.02rem)]" : "text-[clamp(0.92rem,1.45vw,1.22rem)]"
            }`}
          >
            {title}
          </Link>

          {displaySummary && displaySummary.reviewCount > 0 ? (
            <ProductRating
              summary={displaySummary}
              className={`${isHero ? "mt-1.5 text-[0.65rem] [&_svg]:h-3.5 [&_svg]:w-3.5" : "mt-2 text-[0.74rem] [&_svg]:h-4 [&_svg]:w-4 sm:text-[0.84rem] sm:[&_svg]:h-5 sm:[&_svg]:w-5"} gap-1 font-semibold text-foreground`}
            />
          ) : null}

          <div className={`${isHero ? "mt-1.5 gap-1.5" : "mt-2 gap-2 sm:gap-2.5"} flex min-w-0 items-baseline`}>
            <p className={`font-display font-semibold leading-none tracking-[-0.015em] text-foreground ${isHero ? "text-[clamp(0.9rem,1.25vw,1.18rem)]" : "text-[clamp(1rem,1.55vw,1.42rem)]"}`}>
              {formatMoney(min)}
            </p>
            <p
              className={`truncate leading-none ${isHero ? "text-[clamp(0.72rem,0.95vw,0.92rem)]" : "text-[clamp(0.86rem,1.2vw,1.12rem)]"} ${
                compare > min ? "text-muted-foreground" : "text-transparent"
              }`}
              aria-hidden={compare <= min ? "true" : undefined}
            >
              {compare > min ? <s>{formatMoney(compare)}</s> : "\u00a0"}
            </p>
          </div>

          {minimumQuantity > 1 ? (
            <p className={`${isHero ? "mt-1" : "mt-2"} text-[0.55rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:text-[0.62rem]`}>
              Pack x{minimumQuantity}
            </p>
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <article
      ref={cardRef}
      className={`group relative flex h-full flex-col overflow-hidden rounded-[1.55rem] border border-border/80 bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--card)/0.94))] shadow-[0_16px_38px_-30px_rgba(22,77,160,0.18)] transition duration-300 hover:-translate-y-0.5 hover:border-primary/30 ${
        nativeApp
          ? "border border-border/70 bg-background/96 hover:border-primary/20 hover:shadow-[0_22px_48px_-32px_rgba(15,23,42,0.16)]"
        : "hover:shadow-[0_22px_48px_-32px_rgba(15,23,42,0.18)]"
      } ${className}`.trim()}
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
        className={`absolute left-3 top-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border bg-background/95 shadow-[0_8px_18px_-16px_rgba(15,23,42,0.4)] transition sm:h-11 sm:w-11 ${
          wishlisted
            ? "border-red-200 text-red-500"
            : nativeApp
              ? "border-border/70 text-foreground hover:border-primary/20 hover:text-primary"
              : "border-border/70 text-primary hover:border-primary/30 hover:text-primary"
        }`}
      >
        <Heart className={`h-4 w-4 ${wishlisted ? "fill-red-500 text-red-500" : ""}`} />
      </button>

      <Link
        to={`/products/${product.handle}`}
        className="relative isolate block overflow-hidden rounded-t-[1.55rem] border-b border-border/70 bg-muted"
      >
        {image ? (
          <div className="relative aspect-square w-full overflow-hidden">
            <div className="salt-category-scroll-track h-full w-full">
              <img
                src={cardImage}
                srcSet={cardImageSrcSet}
                sizes="(min-width: 1280px) 17rem, (min-width: 768px) 30vw, 50vw"
                alt={product.title}
                loading={imageLoading}
                decoding="async"
                className="h-[112%] w-full object-cover transition duration-700 ease-out group-hover:scale-[1.04]"
              />
            </div>
            {discountPercent > 0 ? (
              <span className="absolute right-3 top-3 rounded-full border border-white/70 bg-[#314979] px-4 py-2 text-xs font-semibold tracking-[0.18em] text-white shadow-[0_8px_18px_-12px_rgba(15,23,42,0.6)]">
                {discountPercent}% OFF
              </span>
            ) : null}
          </div>
        ) : (
          <div className="grid aspect-square w-full place-items-center bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--card)))] text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Image unavailable
          </div>
        )}

      </Link>

      <div className="flex min-h-[10.25rem] flex-1 flex-col p-4 sm:p-5">
        <p className={`line-clamp-2 font-display text-[clamp(0.98rem,2vw,1.1rem)] leading-[1.12] ${nativeApp ? "text-foreground" : "text-foreground"}`}>
          {title}
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

        <div className="mt-auto flex items-end justify-between gap-2 pt-5">
          <div className="min-w-0">
            <p className={`font-display text-[1.2rem] leading-none ${nativeApp ? "text-foreground" : "text-primary"}`}>{formatMoney(min)}</p>
            <p
              className={`mt-0.5 min-h-[0.85rem] text-xs leading-none ${
                compare > min ? "text-muted-foreground" : "text-transparent"
              }`}
              aria-hidden={compare <= min ? "true" : undefined}
            >
              {compare > min ? <s>{formatMoney(compare)}</s> : "\u00a0"}
            </p>
          </div>
          <ProductRating summary={displaySummary} compact />
        </div>

      </div>
    </article>
  );
};

const MemoizedProductCard = memo(ProductCard);

export default MemoizedProductCard;
