import { Link } from "react-router-dom";
import { ArrowUpRight, Clock3, PackageCheck, ShoppingBag, Sparkles, Star } from "lucide-react";
import { useCart } from "@/lib/cart";
import {
  conciseTitle,
  compareAt,
  formatMoney,
  minPrice,
  productImage,
  savingsPercent,
} from "@/lib/formatters";
import { useJudgeMeProductRating } from "@/lib/judgeme";
import type { ShopifyProduct } from "@/types/shopify";

export type ProductCardVariant = "default" | "dense";

type ProductCardProps = {
  product: ShopifyProduct;
  variant?: ProductCardVariant;
};

function merchandisingLine(product: ShopifyProduct): string {
  const source = `${product.title} ${product.product_type}`.toLowerCase();

  if (/book|planner|legacy/.test(source)) {
    return "Giftable, practical, and built for repeat use.";
  }

  if (/cook|kitchen|pan|pot|mold/.test(source)) {
    return "Useful home essentials with strong gifting appeal.";
  }

  if (/dress|robe|wear|apparel|shirt|tops/.test(source)) {
    return "Easy style with stronger everyday wearability.";
  }

  if (/garden|tool|camp|outdoor/.test(source)) {
    return "Functional picks designed for seasonal utility.";
  }

  return "Curated product surfaced for stronger purchase intent.";
}

const ProductCard = ({ product, variant = "default" }: ProductCardProps) => {
  const { addItem } = useCart();
  const isDense = variant === "dense";
  const sale = savingsPercent(product);
  const min = minPrice(product);
  const compare = compareAt(product);
  const savingsValue = compare > min ? compare - min : 0;
  const inStock = product.variants.some((entry) => entry.available);
  const availableVariantCount = product.variants.filter((entry) => entry.available).length;
  const defaultVariant = product.variants.find((entry) => entry.available) || null;
  const title = conciseTitle(product.title);
  const image = productImage(product);
  const merchandisingCopy = merchandisingLine(product);
  const { summary: reviewSummary } = useJudgeMeProductRating(product.id);
  const optionCount = Math.max(availableVariantCount, product.variants.length || 1);
  const optionCountText = `${optionCount} ${optionCount === 1 ? "option" : "options"}`;
  const reviewCountText = reviewSummary
    ? `${reviewSummary.reviewCount.toLocaleString()} ${reviewSummary.reviewCount === 1 ? "review" : "reviews"}`
    : "Review data syncing";
  const mediaRatio = isDense ? "aspect-[4/4.3]" : "aspect-[4/4.5]";
  const titleClasses = isDense
    ? "min-h-[3.4rem] text-[1.06rem] leading-[1.34]"
    : "min-h-[3.9rem] text-[1.2rem] leading-[1.36]";

  return (
    <article
      className={`group flex h-full flex-col overflow-hidden rounded-[1.65rem] border border-border/80 bg-[linear-gradient(180deg,hsl(var(--card)),hsl(var(--card)/0.97))] shadow-[0_24px_60px_-34px_rgba(0,0,0,0.28)] transition duration-500 hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_36px_84px_-44px_rgba(0,0,0,0.34)] ${
        isDense ? "" : "salt-card-hover"
      }`}
    >
      <Link
        to={`/products/${product.handle}`}
        className={`relative isolate block overflow-hidden bg-[linear-gradient(145deg,hsl(var(--muted)),hsl(var(--card)))] ${mediaRatio}`}
      >
        {image ? (
          <img
            src={image}
            alt={product.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.045]"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_20%_18%,hsl(var(--primary)/0.24),transparent_32%),radial-gradient(circle_at_84%_80%,hsl(var(--salt-blue)/0.22),transparent_36%),linear-gradient(160deg,hsl(var(--muted)),hsl(var(--card)))] px-6 text-center">
            <div className="space-y-2 rounded-[1.2rem] border border-white/25 bg-black/20 px-5 py-4 text-white backdrop-blur-md">
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-white/92">
                Product image unavailable
              </p>
              <p className="text-xs text-white/72">
                Open details to view live catalog information.
              </p>
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,9,12,0.08)_0%,rgba(8,10,14,0)_34%,rgba(8,9,14,0.12)_56%,rgba(8,9,14,0.78)_100%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/28 via-black/8 to-transparent" />

        <div className="absolute left-3 top-3 flex items-center gap-2">
          {sale > 0 ? (
            <span className={`inline-flex items-center gap-1 rounded-full border border-white/22 bg-[linear-gradient(125deg,hsl(var(--primary)),hsl(var(--salt-accent-deep))_84%)] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--salt-paper))] shadow-[0_16px_28px_-18px_rgba(0,0,0,0.7)] ${
              isDense ? "px-2.5 py-1 text-[0.62rem]" : "px-3 py-1.5 text-[0.7rem]"
            }`}>
              <Sparkles className="h-3 w-3" /> Save {sale}%
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1 rounded-full border border-white/18 bg-black/28 font-bold uppercase tracking-[0.12em] text-white/88 backdrop-blur-md ${
              isDense ? "px-2.5 py-1 text-[0.58rem]" : "px-3 py-1.5 text-[0.64rem]"
            }`}>
              Featured pick
            </span>
          )}
        </div>

        <div className="absolute right-3 top-3 flex items-center gap-2">
          {reviewSummary?.reviewCount ? (
            <span className={`rounded-full border border-white/28 bg-black/28 font-semibold text-white/92 backdrop-blur-md ${
              isDense ? "px-2.5 py-1 text-[0.58rem]" : "px-3 py-1 text-[0.62rem]"
            }`}>
              {reviewSummary.rating.toFixed(1)} avg
            </span>
          ) : (
            <span className={`rounded-full border border-white/28 bg-black/28 font-semibold uppercase tracking-[0.08em] text-white/92 backdrop-blur-md ${
              isDense ? "px-2.5 py-1 text-[0.58rem]" : "px-3 py-1 text-[0.62rem]"
            }`}>
              {optionCountText}
            </span>
          )}
        </div>

        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-3">
          <span className={`inline-flex items-center rounded-full border border-white/30 bg-black/30 font-bold uppercase tracking-[0.1em] text-white backdrop-blur-md shadow-[0_10px_24px_-18px_rgba(0,0,0,0.7)] ${
            isDense ? "px-2.5 py-1 text-[0.64rem]" : "px-3 py-1.5 text-[0.72rem]"
          }`}>
            {inStock ? "In stock" : "Unavailable"}
          </span>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/28 bg-black/24 text-white/95 opacity-0 backdrop-blur-md transition duration-300 group-hover:opacity-100 group-hover:translate-y-0">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>
      </Link>

      <div className={`grid flex-1 grid-rows-[auto_auto_auto_1fr_auto] gap-3 ${isDense ? "p-3.5" : "p-[1.125rem]"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full border border-border/80 bg-background/88 px-2.5 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {product.product_type || "Curated pick"}
          </span>
          {availableVariantCount > 1 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-background/88 px-2.5 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <PackageCheck className="h-3.5 w-3.5 text-primary" />
              {optionCountText}
            </span>
          ) : null}
        </div>

        <div className="space-y-2">
          <h3 className={`font-semibold tracking-[-0.02em] text-foreground ${titleClasses}`}>
            <Link to={`/products/${product.handle}`} className="transition hover:text-primary">
              <span className="line-clamp-2">{title}</span>
            </Link>
          </h3>

          <p className={`line-clamp-2 text-muted-foreground ${isDense ? "text-[0.8rem] leading-6" : "text-[0.88rem] leading-6"}`}>
            {merchandisingCopy}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-x-2 gap-y-1.5">
          <strong className={`${isDense ? "text-[1.26rem]" : "text-[1.5rem]"} font-extrabold leading-none text-primary`}>
            {formatMoney(min)}
          </strong>
          {compare > min ? (
            <s className={`${isDense ? "text-[0.86rem]" : "text-[0.96rem]"} font-medium text-muted-foreground`}>
              {formatMoney(compare)}
            </s>
          ) : null}
          {savingsValue > 0 ? (
            <span className={`inline-flex items-center rounded-full border border-emerald-500/22 bg-emerald-500/8 font-bold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300 ${
              isDense ? "px-2 py-0.5 text-[0.58rem]" : "px-2.5 py-1 text-[0.62rem]"
            }`}>
              Save {formatMoney(savingsValue)}
            </span>
          ) : null}
        </div>

        <div className={`rounded-[1rem] border border-border/70 bg-[linear-gradient(180deg,hsl(var(--background)/0.95),hsl(var(--background)/0.8))] ${isDense ? "min-h-[6rem] p-2.5" : "min-h-[6.5rem] p-3"}`}>
          <div className={`flex flex-wrap items-center gap-2 ${isDense ? "text-[0.8rem]" : "text-[0.86rem]"}`}>
            <span className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-background/92 px-2.5 py-1 font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
              <Star className={`h-3.5 w-3.5 ${reviewSummary ? "fill-primary text-primary" : "text-muted-foreground"}`} />
              {reviewSummary ? reviewSummary.rating.toFixed(1) : "New"}
            </span>
            <span className="font-medium text-muted-foreground">{reviewCountText}</span>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-background/88 px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5 text-primary" />
              {reviewSummary?.purchasedLastMonth
                ? `${reviewSummary.purchasedLastMonth.toLocaleString()} bought last month`
                : inStock
                  ? "Ready for fast dispatch"
                  : "Waiting for restock"}
            </span>
          </div>
        </div>

        <div className={`grid gap-2 ${isDense ? "grid-cols-[1fr_auto]" : "sm:grid-cols-[1fr_auto]"}`}>
          <button
            type="button"
            onClick={() =>
              defaultVariant
                ? addItem({
                    id: defaultVariant.id,
                    shopifyVariantId: defaultVariant.id,
                    handle: product.handle,
                    title: product.title,
                    image: image || "",
                    unitPrice: min,
                  })
                : undefined
            }
            disabled={!defaultVariant}
            className={`salt-primary-cta inline-flex items-center justify-center gap-2 rounded-[1rem] border border-primary/40 px-4 font-bold uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-50 ${
              isDense ? "h-10 text-[0.68rem]" : "h-11 text-[0.72rem]"
            }`}
          >
            <ShoppingBag className="h-4 w-4" />
            {defaultVariant ? (isDense ? "Quick add" : "Add to cart") : "Unavailable"}
          </button>

          <Link
            to={`/products/${product.handle}`}
            className={`inline-flex items-center justify-center gap-1.5 rounded-[1rem] border border-border bg-background/88 px-3 font-bold uppercase tracking-[0.1em] text-foreground transition hover:border-primary/50 hover:text-primary ${
              isDense ? "h-10 text-[0.63rem]" : "h-11 text-[0.68rem]"
            }`}
          >
            View
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </article>
  );
};

export default ProductCard;
