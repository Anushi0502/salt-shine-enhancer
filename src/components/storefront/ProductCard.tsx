import { Link } from "react-router-dom";
import { ArrowUpRight, ShoppingBag, Sparkles, Star } from "lucide-react";
import { useCart } from "@/lib/cart";
import {
  compareAt,
  conciseTitle,
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
  const image = productImage(product);
  const title = conciseTitle(product.title);
  const review = useJudgeMeProductRating(product.id).summary;
  const reviewCount = review?.reviewCount || 0;
  const availableVariantCount = product.variants.filter((entry) => entry.available).length;
  const defaultVariant = product.variants.find((entry) => entry.available) || product.variants[0] || null;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[1.65rem] border border-border/75 bg-[linear-gradient(180deg,hsl(var(--card)),hsl(var(--background)))] shadow-[0_24px_54px_-34px_rgba(15,23,42,0.18)] transition duration-500 hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_34px_80px_-42px_rgba(15,23,42,0.24)]">
      <Link
        to={`/products/${product.handle}`}
        className={`relative isolate block overflow-hidden bg-muted ${isDense ? "aspect-[4/4.8]" : "aspect-[4/5]"}`}
      >
        {image ? (
          <img
            src={image}
            alt={product.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--card)))] text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Image unavailable
          </div>
        )}

        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(18,28,49,0.02),rgba(18,28,49,0)_30%,rgba(18,28,49,0.14)_72%,rgba(18,28,49,0.34)_100%)]" />

        <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2">
          {sale > 0 ? (
            <span className="salt-media-pill gap-1 px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.12em]">
              <Sparkles className="h-3 w-3 text-primary" />
              Save {sale}%
            </span>
          ) : (
            <span className="salt-media-pill salt-media-pill--light px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.12em]">
              Curated pick
            </span>
          )}
        </div>

        <div className="absolute right-3 top-3 hidden sm:block">
          <span className="salt-media-pill salt-media-pill--light px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.12em]">
            {availableVariantCount > 1 ? `${availableVariantCount} options` : "Ready to ship"}
          </span>
        </div>

        <div className="absolute inset-x-2.5 bottom-2.5 flex items-end justify-between gap-3 sm:inset-x-3 sm:bottom-3">
          <div className="salt-media-pill px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.12em]">
            {product.product_type || "Featured"}
          </div>
          <span className="salt-media-pill salt-media-pill--light h-9 w-9 justify-center px-0 opacity-0 transition duration-300 group-hover:opacity-100">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>
      </Link>

        <div className={`flex flex-1 flex-col ${isDense ? "gap-3 p-4" : "gap-3 p-4 sm:gap-3.5 sm:p-[1.125rem]"}`}>
        <div className="space-y-2">
          <h3 className={`font-display leading-[1.02] tracking-[-0.02em] text-foreground ${isDense ? "text-[1.08rem] sm:text-[1.2rem]" : "text-[1.2rem] sm:text-[1.38rem]"}`}>
            <Link to={`/products/${product.handle}`} className="line-clamp-2 transition group-hover:text-primary">
              {title}
            </Link>
          </h3>
        </div>

        <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
          <strong className={`font-display leading-none text-foreground ${isDense ? "text-[1.45rem]" : "text-[1.7rem]"}`}>
            {formatMoney(min)}
          </strong>
          {compare > min ? (
            <s className="text-sm text-muted-foreground">{formatMoney(compare)}</s>
          ) : null}
        </div>

        <div className="flex items-center justify-between rounded-[1rem] border border-border/70 bg-card/85 px-3 py-2.5">
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-foreground">
            <Star className={`h-3.5 w-3.5 ${review ? "fill-primary text-primary" : "text-muted-foreground"}`} />
            {review ? review.rating.toFixed(1) : "New"}
          </span>

          <p className="text-right text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground">
            {reviewCount > 0 ? `${reviewCount} ${reviewCount === 1 ? "rating" : "ratings"}` : "No ratings"}
          </p>
        </div>

        <div className={`grid gap-2 ${isDense ? "grid-cols-1 sm:grid-cols-[1fr_auto]" : "grid-cols-1 sm:grid-cols-[1fr_auto]"}`}>
          <button
            type="button"
            onClick={() => {
              if (!defaultVariant) {
                return;
              }

              addItem({
                id: defaultVariant.id,
                shopifyVariantId: defaultVariant.id,
                handle: product.handle,
                title: product.title,
                image: image || "",
                unitPrice: min,
                productType: product.product_type,
              });
            }}
            disabled={!defaultVariant}
            className={`salt-primary-cta justify-center rounded-[1rem] px-4 ${isDense ? "h-10 text-[0.7rem]" : "h-11 text-[0.72rem]"} w-full font-semibold uppercase tracking-[0.12em] disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <ShoppingBag className="h-4 w-4" />
            Quick add
          </button>

          <Link
            to={`/products/${product.handle}`}
            className={`inline-flex w-full items-center justify-center gap-1.5 rounded-[1rem] border border-border/75 bg-card px-4 font-semibold uppercase tracking-[0.12em] text-foreground transition hover:border-primary/40 hover:text-primary sm:w-auto ${isDense ? "h-10 text-[0.66rem]" : "h-11 text-[0.7rem]"}`}
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
