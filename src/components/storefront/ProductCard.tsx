import { Link } from "react-router-dom";
import { ArrowUpRight, PackageCheck, ShieldCheck, ShoppingBag, Sparkles, Star } from "lucide-react";
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

const ProductCard = ({ product, variant = "default" }: ProductCardProps) => {
  const { addItem } = useCart();
  const isDense = variant === "dense";
  const sale = savingsPercent(product);
  const min = minPrice(product);
  const compare = compareAt(product);
  const savingsValue = compare > min ? compare - min : 0;
  const inStock = product.variants.some((variant) => variant.available);
  const availableVariantCount = product.variants.filter((variant) => variant.available).length;
  const defaultVariant = product.variants.find((variant) => variant.available) || null;
  const title = conciseTitle(product.title);
  const image = productImage(product);
  const { summary: reviewSummary } = useJudgeMeProductRating(product.id);
  const reviewCountText = reviewSummary
    ? `${reviewSummary.reviewCount.toLocaleString()} ${reviewSummary.reviewCount === 1 ? "review" : "reviews"}`
    : "No reviews yet";
  const optionCountText = `${Math.max(availableVariantCount, product.variants.length || 1)} ${Math.max(availableVariantCount, product.variants.length || 1) === 1 ? "option" : "options"}`;

  return (
    <article
      className={`salt-card-hover salt-metric-card salt-product-card group flex h-full flex-col overflow-hidden border border-border/80 shadow-soft ${
        isDense ? "rounded-[1.2rem]" : "rounded-[1.55rem]"
      }`}
    >
      <Link
        to={`/products/${product.handle}`}
        className={`relative isolate block overflow-hidden bg-[linear-gradient(145deg,hsl(var(--muted)),hsl(var(--card)))] ${
          isDense ? "aspect-[4/4.12]" : "aspect-[4/4.28]"
        }`}
      >
        {image ? (
          <img
            src={image}
            alt={product.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.045]"
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

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,9,12,0.06)_0%,rgba(8,10,14,0)_34%,rgba(8,9,14,0.16)_58%,rgba(8,9,14,0.82)_100%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/38 via-black/10 to-transparent" />

        <div className="absolute left-3 top-3 flex items-center gap-2">
          {sale > 0 ? (
            <span className={`inline-flex items-center gap-1 rounded-full border border-white/22 bg-[linear-gradient(125deg,hsl(var(--primary)),hsl(var(--salt-accent-deep))_84%)] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--salt-paper))] shadow-[0_16px_28px_-18px_rgba(0,0,0,0.7)] ${
              isDense ? "px-2.5 py-1 text-[0.62rem]" : "px-3 py-1.5 text-[0.7rem]"
            }`}>
              <Sparkles className="h-3 w-3" /> Save {sale}%
            </span>
          ) : null}
        </div>

        <div className="absolute right-3 top-3 flex items-center gap-2">
          <span className={`rounded-full border border-white/28 bg-black/28 font-semibold uppercase tracking-[0.08em] text-white/92 backdrop-blur-md ${
            isDense ? "px-2 py-1 text-[0.58rem]" : "px-2.5 py-1 text-[0.62rem]"
          }`}>
            {optionCountText}
          </span>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/28 bg-black/24 text-white/95 opacity-0 backdrop-blur-md transition duration-300 group-hover:opacity-100 group-hover:translate-y-0">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>

        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-3">
          <span className={`inline-flex items-center rounded-full border border-white/30 bg-black/30 font-bold uppercase tracking-[0.1em] text-white backdrop-blur-md shadow-[0_10px_24px_-18px_rgba(0,0,0,0.7)] ${
            isDense ? "px-2.5 py-1 text-[0.64rem]" : "px-3 py-1.5 text-[0.72rem]"
          }`}>
            {inStock ? "In stock" : "Out of stock"}
          </span>
        </div>
      </Link>

      <div className={`flex flex-1 flex-col ${isDense ? "gap-3 p-3.5" : "gap-3.5 p-[1.125rem]"}`}>
        <div className="flex-1 space-y-3">
          <div className="space-y-2">
            <h3
              className={`font-semibold tracking-[-0.02em] text-foreground ${
                isDense ? "min-h-[3.2rem] text-[1.04rem] leading-[1.38]" : "min-h-[3.55rem] text-[1.18rem] leading-[1.42]"
              }`}
            >
              <Link to={`/products/${product.handle}`} className="transition hover:text-primary">
                <span className="line-clamp-2">{title}</span>
              </Link>
            </h3>

            <div className="flex flex-wrap items-end gap-x-2 gap-y-1.5">
              <strong className={`${isDense ? "text-[1.2rem]" : "text-[1.42rem]"} font-extrabold leading-none text-primary`}>
                {formatMoney(min)}
              </strong>
              {compare > min ? (
                <s className={`${isDense ? "text-[0.84rem]" : "text-[0.92rem]"} font-medium text-muted-foreground`}>
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
          </div>

          <div className={`salt-ambient-card rounded-[1rem] border border-border/70 ${isDense ? "p-2.5" : "p-3"}`}>
            <div className={`flex flex-wrap items-center gap-2 ${isDense ? "text-[0.8rem]" : "text-[0.86rem]"}`}>
              {reviewSummary ? (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-background/92 px-2.5 py-1 font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
                    <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                    {reviewSummary.rating.toFixed(1)}
                  </span>
                  <span className="font-medium text-muted-foreground">{reviewCountText}</span>
                </>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-background/92 px-2.5 py-1 font-semibold text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
                  <Star className="h-3.5 w-3.5 text-muted-foreground" />
                  No reviews yet
                </span>
              )}
              {reviewSummary?.purchasedLastMonth ? (
                <span className={`rounded-full border border-border/80 bg-background/86 px-2.5 py-1 font-semibold uppercase tracking-[0.08em] text-muted-foreground ${
                  isDense ? "hidden sm:inline-flex" : ""
                }`}>
                  {reviewSummary.purchasedLastMonth.toLocaleString()} bought last month
                </span>
              ) : null}
            </div>

          </div>

          {!isDense ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-[0.95rem] border border-border/70 bg-background/78 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
                <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Stock status
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {inStock ? "Ready to dispatch" : "Currently unavailable"}
                </p>
              </div>
              <div className="rounded-[0.95rem] border border-border/70 bg-background/78 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
                <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Purchase setup
                </p>
                <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <PackageCheck className="h-4 w-4 text-primary" />
                  {optionCountText}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="salt-separator" />

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
            {isDense ? "View" : "Details"}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </article>
  );
};

export default ProductCard;
