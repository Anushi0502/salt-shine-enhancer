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
import { useJudgeMeProductRating } from "@/lib/judgeme";
import type { ShopifyProduct } from "@/types/shopify";
import ProductRating from "@/components/storefront/ProductRating";

export type ProductCardVariant = "default" | "dense" | "shop";

type ProductCardProps = {
  product: ShopifyProduct;
  variant?: ProductCardVariant;
  reviewSummary?: JudgeMeReviewSummary | null;
  className?: string;
};

const ProductCard = ({ product: snapshotProduct, variant = "default", reviewSummary, className = "" }: ProductCardProps) => {
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

  const isShop = variant === "shop";
  // Cards are rendered from the synced catalog snapshot. A card only needs
  // display data; refreshing every visible card from Shopify creates a burst
  // of requests and makes collection/home navigation feel sluggish. The PDP
  // still loads the authoritative product detail when the shopper opens it.
  const product = snapshotProduct;
  const { isWishlisted, toggleItem } = useWishlist();
  const reviewSummaryProvided = reviewSummary !== undefined;
  const { summary: fetchedSummary } = useJudgeMeProductRating(reviewSummaryProvided ? undefined : product.id);
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

  if (isShop) {
    return (
      <article
        ref={cardRef}
        className={`group relative flex h-full flex-col overflow-hidden rounded-[2rem] border border-border/60 bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--card)/0.96))] shadow-[0_18px_42px_-30px_rgba(15,23,42,0.18)] transition duration-300 hover:-translate-y-1 hover:border-primary/28 hover:shadow-[0_28px_54px_-34px_rgba(15,23,42,0.22)] ${className}`.trim()}
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
          className="absolute left-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-background/95 text-foreground shadow-[0_8px_18px_-16px_rgba(15,23,42,0.32)] transition hover:border-primary/20 hover:text-primary sm:h-11 sm:w-11"
        >
          <Heart className={`h-4 w-4 ${wishlisted ? (nativeApp ? "fill-primary/16 text-primary" : "fill-primary/20 text-primary") : ""}`} />
        </button>

        <div className="flex flex-1 flex-col">
          <Link to={`/products/${product.handle}`} className="block">
            <div className="relative overflow-hidden p-3 pb-0">
            {image ? (
              <div className="relative aspect-[1.02/1] overflow-hidden rounded-[1.45rem] border border-white/55 bg-white/40 shadow-[0_20px_36px_-28px_rgba(15,23,42,0.22)]">
                <img
                  src={cardImage}
                  srcSet={cardImageSrcSet}
                  sizes="(min-width: 1280px) 17rem, (min-width: 768px) 30vw, 50vw"
                  alt={product.title}
                  loading={imageLoading}
                  decoding="async"
                  className="h-full w-full object-cover object-center transition duration-700 ease-out group-hover:scale-[1.06]"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_48%,hsl(var(--foreground)/0.1)_100%)]" />
              </div>
            ) : (
              <div className={`grid aspect-[1.02/1] w-full place-items-center rounded-[1.5rem] border border-border/60 px-4 text-center text-[0.68rem] font-semibold uppercase tracking-[0.14em] ${
                nativeApp
                  ? "bg-[linear-gradient(135deg,hsl(var(--background)/0.98),hsl(var(--muted)/0.82))] text-muted-foreground"
                  : "bg-[linear-gradient(135deg,hsl(var(--background)/0.98),hsl(var(--card)/0.92))] text-primary"
              }`}>
                Image unavailable
              </div>
            )}
            <div className="absolute left-6 top-6 flex flex-wrap gap-1.5">
              {discountPercent > 0 ? (
                <span className="rounded-full border border-white/70 bg-[#314979] px-3.5 py-1.5 text-[0.62rem] font-semibold tracking-[0.16em] text-white shadow-[0_10px_22px_-14px_rgba(15,23,42,0.6)]">
                  {discountPercent}% OFF
                </span>
              ) : null}
              {minimumQuantity > 1 ? (
                <span className="rounded-full border border-white/70 bg-white/88 px-3 py-1.5 text-[0.58rem] font-bold uppercase tracking-[0.14em] text-slate-700 shadow-[0_10px_22px_-14px_rgba(15,23,42,0.35)]">
                  Pack x{minimumQuantity}
                </span>
              ) : null}
            </div>
          </div>
          </Link>

          <div className="flex min-h-[10.5rem] flex-1 flex-col px-4 pb-4 pt-3 sm:min-h-[11rem] sm:px-5 sm:pb-5">
            <Link to={`/products/${product.handle}`} className={`line-clamp-2 font-display text-[1.04rem] leading-[1.06] tracking-[-0.035em] ${
              nativeApp ? "text-foreground" : "text-foreground"
            } sm:text-[1.08rem]`}>
              {title}
            </Link>
            {highlights.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {highlights.slice(0, 2).map((highlight, index) => (
                  <span
                    key={`${highlight}-${index}`}
                    className="rounded-full border border-border/65 bg-background/90 px-2.5 py-1 text-[0.56rem] font-semibold uppercase tracking-[0.09em] text-muted-foreground shadow-[0_8px_18px_-18px_rgba(15,23,42,0.3)]"
                  >
                    {highlight}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="mt-auto pt-4">
              <div className="flex items-end justify-between gap-3 rounded-[1.2rem] border border-border/65 bg-[linear-gradient(180deg,hsl(var(--background)/0.98),hsl(var(--muted)/0.48))] p-3 shadow-[0_14px_24px_-24px_rgba(15,23,42,0.18)]">
                <div className="min-w-0">
                  <p className="font-display text-[1.18rem] leading-none tracking-[0.1em] text-primary sm:text-[1.34rem]">
                    {formatMoney(min)}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-primary/16 bg-primary/6 px-2 py-0.5 text-[0.54rem] font-bold uppercase tracking-[0.12em] text-primary">
                      Curated
                    </span>
                    {compare > min ? (
                      <span className="text-[0.62rem] font-medium text-muted-foreground line-through decoration-muted-foreground/60">
                        {formatMoney(compare)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <ProductRating summary={displaySummary} compact />
              </div>

              <div className="mt-2 flex items-center justify-between gap-2 px-1">
                <span className="text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  View product
                </span>
                {minimumQuantity > 1 ? (
                  <span className="text-[0.58rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Min qty {minimumQuantity}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
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
        className={`absolute left-3 top-3 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border bg-background/95 shadow-[0_8px_18px_-16px_rgba(15,23,42,0.4)] transition ${
          nativeApp
            ? "border-border/70 text-foreground hover:border-primary/20 hover:text-primary"
            : "border-border/70 text-primary hover:border-primary/30 hover:text-primary/80"
        }`}
      >
        <Heart className={`h-4 w-4 ${wishlisted ? (nativeApp ? "fill-primary/16 text-primary" : "fill-primary/20 text-primary") : ""}`} />
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
