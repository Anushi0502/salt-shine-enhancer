import { memo, useState } from "react";
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
import type { JudgeMeReviewSummary } from "@/lib/judgeme";
import { useWishlist, wishlistItemFromProduct } from "@/lib/wishlist";
import { useJudgeMeProductRating } from "@/lib/judgeme";
import type { ShopifyProduct } from "@/types/shopify";

export type ProductCardVariant = "default" | "dense" | "shop";

type ProductCardProps = {
  product: ShopifyProduct;
  variant?: ProductCardVariant;
  reviewSummary?: JudgeMeReviewSummary | null;
};

const ProductCard = ({ product, variant = "default", reviewSummary }: ProductCardProps) => {
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
  const wishlisted = isWishlisted(product.handle);
  const summary = reviewSummaryProvided ? reviewSummary ?? null : fetchedSummary;
  const publishedAt = new Date(product.published_at || product.created_at || "").getTime();
  const isNew = Number.isFinite(publishedAt) && Date.now() - publishedAt <= 1000 * 60 * 60 * 24 * 45;
  const badgeLabel = sale > 0 ? `Save ${sale}%` : isNew ? "New" : "SALT pick";
  const hasReviews = Boolean(summary && summary.reviewCount > 0);
  const formattedRating = hasReviews ? summary.rating.toFixed(1) : "";

  if (isShop) {
    return (
      <article className="h-full">
        <Link
          to={`/products/${product.handle}`}
          className={`group relative block h-full overflow-hidden shadow-[0_14px_30px_-24px_rgba(14,48,109,0.35)] ${
            nativeApp
              ? "border border-[#ded6ca] bg-[#ffffff]"
              : "border border-[#d2e4ff] bg-[#eef5ff]"
          }`}
        >
          {image ? (
            <div className="aspect-[1.04/0.93] overflow-hidden sm:aspect-[1.2/1.4]">
                <img
                  src={image}
                  alt={product.title}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                />
            </div>
          ) : (
            <div className="grid aspect-[1.04/0.93] w-full place-items-center bg-[linear-gradient(180deg,#dce8fb_0%,#c6dafd_100%)] text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#31538c] sm:aspect-[1/0.9]">
              Image unavailable
            </div>
          )}

          <div
            className={`absolute inset-x-0 bottom-0 px-2 py-1.5 text-center sm:px-3 sm:py-[0.6rem] ${
              nativeApp
                ? "bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(15,15,15,0.92)_44%,rgba(15,15,15,0.98))] text-white"
                : "bg-[linear-gradient(180deg,rgba(8,30,73,0.12),rgba(8,30,73,0.9)_40%,rgba(8,30,73,0.98))] text-white"
            }`}
          >
            <h3 className="line-clamp-2 font-display text-[0.7rem] font-semibold leading-[1.06] drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)] sm:text-[0.98rem] sm:leading-[1.12]">
              {title}
            </h3>
            <div className="mt-1.25 flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 text-[0.58rem] font-semibold text-white/92 sm:gap-x-1.5 sm:gap-y-1 sm:text-[0.78rem]">
              <span className="text-[0.96rem] font-black leading-none tracking-[0.01em] text-[#ffe36b] [text-shadow:0_2px_8px_rgba(0,0,0,0.45)] sm:text-[1.2rem]">
                {formatMoney(min)}
              </span>
              {hasReviews ? (
                <>
                  <span className="text-white/40">•</span>
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3 w-3 fill-[#f2c100] text-[#f2c100]" />
                    {formattedRating}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </Link>
      </article>
    );
  }

  return (
    <article
      className={`group relative flex h-full flex-col overflow-hidden rounded-[1.1rem] p-2 shadow-[0_16px_38px_-30px_rgba(22,77,160,0.28)] transition duration-500 hover:-translate-y-0.5 sm:p-2 ${
        nativeApp
          ? "border border-[#ded6ca] bg-[#ffffff] hover:border-[#c8beb2] hover:shadow-[0_22px_48px_-32px_rgba(17,17,17,0.16)]"
          : "border border-[#c7dcff] bg-[#eef5ff] hover:border-[#9bc1ff] hover:shadow-[0_22px_48px_-32px_rgba(22,77,160,0.32)]"
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
            ? "border-[#ded6ca] bg-white/96 text-[#151515] hover:border-[#c8beb2] hover:text-[#d61f26]"
            : "border-white/40 bg-white/90 text-[#214d95] hover:border-[#90b8ff] hover:text-[#1f63d8]"
        }`}
      >
        <Heart className={`h-4 w-4 ${wishlisted ? (nativeApp ? "fill-[#d61f26]/16 text-[#d61f26]" : "fill-[#1f63d8]/20 text-[#1f63d8]") : ""}`} />
      </button>

      <Link
        to={`/products/${product.handle}`}
        className={`relative isolate block overflow-hidden rounded-[0.9rem] bg-muted ${
          nativeApp ? "border border-[#ded6ca]" : "border border-[#bfd6ff]/70"
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
              ? "border-[#121212]/10 bg-[rgba(17,17,17,0.9)] text-white"
              : "border-white/25 bg-[rgba(18,48,104,0.74)] text-white"
          }`}
        >
          <Sparkles className={`h-3 w-3 ${nativeApp ? "text-white" : "text-[#ffe27a]"}`} />
          {badgeLabel}
        </div>
      </Link>

      <div className="mt-2 flex flex-1 flex-col">
        <p className={`line-clamp-2 font-display text-[clamp(0.98rem,2vw,1.1rem)] leading-[1.12] ${nativeApp ? "text-[#131313]" : "text-[#1f4f9b]"}`}>
          {title}
        </p>
        <p className="mt-0.5 line-clamp-1 text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {product.product_type || "Curated pick"}
        </p>

        {summary && summary.reviewCount > 0 ? (
          <div className="mt-1 flex items-center gap-1 text-[#f2c100]">
            {Array.from({ length: 5 }, (_, index) => (
              <Star
                key={index}
                className={`h-3 w-3 ${index < summary.rating ? "fill-current" : ""}`}
              />
            ))}
          </div>
        ) : null}

        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className={`font-display text-[1.2rem] leading-none ${nativeApp ? "text-[#111111]" : "text-[#1f63d8]"}`}>{formatMoney(min)}</p>
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
                  },
                  1,
                  { openDrawer: true },
                );
                setIsAddingToCart(false);
                toast.success("Added to cart", { description: title });
              }}
              className={`salt-primary-cta h-7 w-7 shrink-0 items-center justify-center rounded-full text-white transition disabled:pointer-events-none disabled:opacity-50 ${
                nativeApp ? "bg-[#151515] hover:bg-[#d61f26]" : ""
              }`}
              disabled={isAddingToCart}
              aria-label={`Add ${title} to cart`}
            >
              <ShoppingBag className="h-3.5 w-3.5" />
            </button>
            <Link
              to={`/products/${product.handle}`}
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-white transition ${
                nativeApp
                  ? "border-[#ded6ca] text-[#151515] hover:border-[#c8beb2] hover:text-[#d61f26]"
                  : "border-[#aac8fb] text-[#1f4f9b] hover:border-[#7fb0ff] hover:text-[#1f63d8]"
              }`}
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
