import { Link } from "react-router-dom";
import { ArrowUpRight, ShoppingBag, Sparkles, Star } from "lucide-react";
import { useCart } from "@/lib/cart";
import {
  conciseTitle,
  compareAt,
  formatMoney,
  minPrice,
  productImage,
  productTagList,
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
  const tags = productTagList(product).slice(0, isDense ? 1 : 2);
  const inStock = product.variants.some((variant) => variant.available);
  const defaultVariant = product.variants.find((variant) => variant.available) || null;
  const title = conciseTitle(product.title);
  const image = productImage(product);
  const { summary: reviewSummary } = useJudgeMeProductRating(product.id);
  const reviewSignalLabel = reviewSummary
    ? reviewSummary.reviewCount >= 100 && reviewSummary.rating >= 4.2
      ? "Top rated pick"
      : reviewSummary.reviewCount >= 35
        ? "Shopper favorite"
        : reviewSummary.reviewCount > 0
          ? "Customer feedback"
          : null
    : null;

  return (
    <article
      className={`salt-card-hover salt-metric-card salt-product-card group flex h-full flex-col overflow-hidden border border-border/80 bg-[linear-gradient(170deg,hsl(var(--card)/0.98),hsl(var(--card)/0.93))] shadow-soft ${
        isDense ? "rounded-[1.15rem]" : "rounded-2xl"
      }`}
    >
      <Link
        to={`/products/${product.handle}`}
        className={`relative block overflow-hidden bg-muted ${isDense ? "aspect-[4/4.05]" : "aspect-[4/4.3]"}`}
      >
        {image ? (
          <img
            src={image}
            alt={product.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.22),transparent_48%),radial-gradient(circle_at_78%_80%,hsl(var(--salt-blue)/0.2),transparent_45%),hsl(var(--muted))] px-6 text-center">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Image unavailable
            </p>
          </div>
        )}
        <div className={`pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/42 to-transparent ${isDense ? "h-20" : "h-24"}`} />
        <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/72 via-black/22 to-transparent ${isDense ? "h-16" : "h-20"}`} />
        {sale > 0 ? (
          <span className={`absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-primary font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--salt-paper))] shadow-[0_10px_20px_-14px_rgba(0,0,0,0.7)] ${
            isDense ? "px-2 py-0.5 text-[0.62rem]" : "px-2.5 py-1 text-[0.7rem]"
          }`}>
            <Sparkles className="h-3 w-3" />-{sale}%
          </span>
        ) : null}
        <span className="absolute right-3 top-3 rounded-full border border-white/42 bg-black/32 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100">
          View
        </span>
        <span className={`absolute bottom-3 left-3 rounded-full border border-white/40 bg-black/34 font-bold uppercase tracking-[0.09em] text-white backdrop-blur-sm ${
          isDense ? "px-2 py-0.5 text-[0.66rem]" : "px-2.5 py-1 text-[0.76rem]"
        }`}>
          {inStock ? "In stock" : "Out of stock"}
        </span>
      </Link>

      <div className={`flex flex-1 flex-col ${isDense ? "p-3.5" : "p-4"}`}>
        <div className="flex-1 space-y-2">
          <h3 className={`line-clamp-2 font-semibold ${isDense ? "min-h-[3rem] text-[1rem] leading-[1.38]" : "min-h-[3.2rem] text-sm leading-6"}`}>
            <Link to={`/products/${product.handle}`} className="hover:text-primary">
              {title}
            </Link>
          </h3>

          <div className="flex flex-wrap items-center gap-2">
            <strong className={`${isDense ? "text-[1.08rem]" : "text-base"} text-primary`}>{formatMoney(min)}</strong>
            {compare > min ? <s className={`${isDense ? "text-[0.8rem]" : "text-xs"} text-muted-foreground`}>{formatMoney(compare)}</s> : null}
          </div>
          <div className={isDense ? "min-h-[1.65rem]" : "min-h-[1.8rem]"}>
            {reviewSummary ? (
              <div className={`flex flex-wrap items-center gap-2 ${isDense ? "text-[0.82rem]" : "text-xs"}`}>
                <span className="inline-flex items-center gap-1 rounded-full border border-border/75 bg-background px-2 py-0.5 font-semibold text-foreground">
                  <Star className="h-3 w-3 fill-primary text-primary" />
                  {reviewSummary.rating.toFixed(1)}
                </span>
                <span className="text-muted-foreground">{reviewSummary.reviewCount.toLocaleString()} reviews</span>
                {reviewSignalLabel ? (
                  <span className={`rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-semibold uppercase tracking-[0.08em] text-primary ${isDense ? "hidden lg:inline-flex" : ""}`}>
                    {reviewSignalLabel}
                  </span>
                ) : null}
                {reviewSummary.purchasedLastMonth > 0 ? (
                  <span className={`rounded-full border border-border/75 bg-background px-2 py-0.5 font-semibold uppercase tracking-[0.08em] text-muted-foreground ${isDense ? "hidden sm:inline-flex" : ""}`}>
                    {reviewSummary.purchasedLastMonth.toLocaleString()} bought last month
                  </span>
                ) : null}
              </div>
            ) : (
              <span className="invisible inline-flex text-xs">No reviews yet</span>
            )}
          </div>

          <div className={isDense ? "min-h-[1.85rem]" : "min-h-[2.05rem]"}>
            {tags.length ? (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={`${product.id}-${tag}`}
                    className={`salt-outline-chip px-2.5 py-1 ${isDense ? "text-[0.66rem]" : "text-[0.82rem]"}`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <span className="invisible inline-flex text-xs">Tag</span>
            )}
          </div>

          <p className={`${isDense ? "line-clamp-1 text-[0.85rem] font-medium" : "text-[0.95rem]"} text-muted-foreground`}>
            {product.vendor || "SALT"} • {product.product_type || "Everyday Essential"}
          </p>
          {!isDense ? (
            <p className="rounded-lg border border-border/70 bg-background/72 px-2.5 py-1 text-[0.74rem] uppercase tracking-[0.08em] text-muted-foreground">
              Ready for secure checkout
            </p>
          ) : null}
        </div>

        <div className="mt-3 salt-separator" />

        <div className={`mt-3 grid gap-2 ${isDense ? "grid-cols-[1fr_auto]" : "sm:grid-cols-[1fr_auto]"}`}>
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
            className={`salt-primary-cta inline-flex items-center justify-center gap-2 rounded-xl border border-primary/40 px-4 font-bold uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-50 ${
              isDense ? "h-9 text-[0.68rem]" : "h-10 text-xs"
            }`}
          >
            <ShoppingBag className="h-4 w-4" />
            {isDense ? "Quick add" : "Add to Cart"}
          </button>

          <Link
            to={`/products/${product.handle}`}
            className={`inline-flex items-center justify-center gap-1 rounded-xl border border-border bg-background px-3 font-bold uppercase tracking-[0.1em] hover:border-primary/50 hover:text-primary ${
              isDense ? "h-9 text-[0.63rem]" : "h-10 text-[0.68rem]"
            }`}
          >
            {isDense ? "View" : "Details"} <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </article>
  );
};

export default ProductCard;
