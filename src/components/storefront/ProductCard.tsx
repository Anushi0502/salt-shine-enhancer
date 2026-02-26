import { Link } from "react-router-dom";
import { ArrowUpRight, ShoppingBag, Sparkles } from "lucide-react";
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
import type { ShopifyProduct } from "@/types/shopify";

type ProductCardProps = {
  product: ShopifyProduct;
};

const ProductCard = ({ product }: ProductCardProps) => {
  const { addItem } = useCart();
  const sale = savingsPercent(product);
  const min = minPrice(product);
  const compare = compareAt(product);
  const tags = productTagList(product).slice(0, 2);
  const inStock = product.variants.some((variant) => variant.available);
  const defaultVariant = product.variants.find((variant) => variant.available) || null;
  const title = conciseTitle(product.title);

  return (
    <article className="salt-card-hover group overflow-hidden rounded-2xl border border-border/80 bg-[linear-gradient(170deg,hsl(var(--card)/0.98),hsl(var(--card)/0.93))] shadow-soft">
      <Link to={`/product/${product.handle}`} className="relative block aspect-[4/4.3] overflow-hidden bg-muted">
        <img
          src={productImage(product)}
          alt={product.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-foreground/35 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-foreground/65 via-foreground/15 to-transparent" />
        {sale > 0 ? (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[0.7rem] font-extrabold uppercase tracking-[0.08em] text-primary-foreground">
            <Sparkles className="h-3 w-3" />-{sale}%
          </span>
        ) : null}
        <span className="absolute right-3 top-3 rounded-full border border-primary-foreground/45 bg-primary-foreground/12 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-primary-foreground opacity-0 transition group-hover:opacity-100">
          View
        </span>
        <span className="absolute bottom-3 left-3 rounded-full border border-primary-foreground/45 bg-primary-foreground/15 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.09em] text-primary-foreground">
          {inStock ? "In stock" : "Out of stock"}
        </span>
      </Link>

      <div className="space-y-3 p-4">
        <div className="space-y-2">
          <h3 className="line-clamp-2 min-h-[3.2rem] text-sm font-semibold leading-6">
            <Link to={`/product/${product.handle}`} className="hover:text-primary">
              {title}
            </Link>
          </h3>

          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-base text-primary">{formatMoney(min)}</strong>
            {compare > min ? <s className="text-xs text-muted-foreground">{formatMoney(compare)}</s> : null}
          </div>

          {tags.length ? (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={`${product.id}-${tag}`}
                  className="salt-outline-chip px-2 py-1 text-[0.62rem]"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            {product.vendor || "SALT"} • {product.product_type || "Everyday Essential"}
          </p>
          <p className="rounded-lg border border-border/70 bg-background/72 px-2.5 py-1 text-[0.64rem] uppercase tracking-[0.08em] text-muted-foreground">
            Ready for secure checkout
          </p>
        </div>

        <div className="salt-separator" />

        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <button
            type="button"
            onClick={() =>
              defaultVariant
                ? addItem({
                    id: defaultVariant.id,
                    shopifyVariantId: defaultVariant.id,
                    handle: product.handle,
                    title: product.title,
                    image: productImage(product),
                    unitPrice: min,
                  })
                : undefined
            }
            disabled={!defaultVariant}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 text-xs font-bold uppercase tracking-[0.08em] text-primary transition hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ShoppingBag className="h-4 w-4" />
            Add to Cart
          </button>

          <Link
            to={`/product/${product.handle}`}
            className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-border bg-background px-3 text-[0.68rem] font-bold uppercase tracking-[0.1em] hover:border-primary/50 hover:text-primary"
          >
            Details <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </article>
  );
};

export default ProductCard;
