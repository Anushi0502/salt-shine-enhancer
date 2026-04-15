import { toast } from "sonner";
import { Link } from "react-router-dom";
import { ArrowUpRight, Heart, Sparkles } from "lucide-react";
import {
  conciseTitle,
  formatMoney,
  minPrice,
  productImage,
  savingsPercent,
} from "@/lib/formatters";
import { useWishlist, wishlistItemFromProduct } from "@/lib/wishlist";
import type { ShopifyProduct } from "@/types/shopify";

export type ProductCardVariant = "default" | "dense";

type ProductCardProps = {
  product: ShopifyProduct;
  variant?: ProductCardVariant;
};

const ProductCard = ({ product, variant = "default" }: ProductCardProps) => {
  const { isWishlisted, toggleItem } = useWishlist();
  const isDense = variant === "dense";
  const sale = savingsPercent(product);
  const min = minPrice(product);
  const image = productImage(product);
  const title = conciseTitle(product.title, isDense ? 54 : 62);
  const wishlisted = isWishlisted(product.handle);
  const badgeLabel = sale > 0 ? `Save ${sale}%` : min <= 25 ? "Under $25" : "SALT pick";

  return (
    <article className="group relative overflow-hidden rounded-[1.3rem] border border-[#c7dcff] bg-[#eef5ff] p-2 shadow-[0_20px_42px_-34px_rgba(22,77,160,0.34)] transition duration-500 hover:-translate-y-0.5 hover:border-[#9bc1ff] hover:shadow-[0_28px_52px_-36px_rgba(22,77,160,0.42)] sm:p-2.5">
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
        className="absolute right-5 top-5 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-white/90 text-[#214d95] shadow-[0_10px_24px_-18px_rgba(15,23,42,0.58)] transition hover:border-[#90b8ff] hover:text-[#1f63d8]"
      >
        <Heart className={`h-4 w-4 ${wishlisted ? "fill-[#1f63d8]/20 text-[#1f63d8]" : ""}`} />
      </button>

      <Link
        to={`/products/${product.handle}`}
        className={`relative isolate block overflow-hidden rounded-[1rem] bg-muted ${isDense ? "aspect-[1.06/1]" : "aspect-square"}`}
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

        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,31,73,0.04)_34%,rgba(10,31,73,0.34)_66%,rgba(10,31,73,0.9)_100%)]" />

        <div className="absolute left-3 top-3 flex items-center gap-1 rounded-full border border-white/20 bg-[rgba(18,48,104,0.72)] px-2.5 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.11em] text-white">
          <Sparkles className="h-3 w-3 text-[#ffe27a]" />
          {badgeLabel}
        </div>

        <div className="absolute inset-x-3 bottom-3 sm:inset-x-4 sm:bottom-4">
          <p className="line-clamp-2 font-display text-[clamp(1.12rem,2.3vw,1.45rem)] leading-[1.06] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.4)]">
            {title}
          </p>
          <div className="mt-2 flex items-end gap-2">
            <p className="font-display text-[1.45rem] leading-none text-[#ffe27a] drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
              {formatMoney(min)}
            </p>
          </div>
        </div>

        <span className="absolute bottom-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/28 bg-white/14 text-white/92 opacity-0 transition duration-300 group-hover:opacity-100 sm:bottom-4 sm:right-4">
          <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </Link>
    </article>
  );
};

export default ProductCard;
