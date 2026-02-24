import { Link } from "react-router-dom";
import { ShoppingBag, Sparkles } from "lucide-react";
import { useCart } from "@/lib/cart";
import {
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

  return (
    <article className="group overflow-hidden rounded-2xl border border-border/80 bg-card shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-primary/50">
      <Link to={`/product/${product.handle}`} className="relative block aspect-[4/4.4] overflow-hidden bg-muted">
        <img
          src={productImage(product)}
          alt={product.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {sale > 0 ? (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[0.7rem] font-extrabold uppercase tracking-[0.08em] text-primary-foreground">
            <Sparkles className="h-3 w-3" />-{sale}%
          </span>
        ) : null}
      </Link>

      <div className="space-y-3 p-4">
        <div className="space-y-2">
          <h3 className="line-clamp-2 min-h-[3.2rem] text-sm font-semibold leading-6">
            <Link to={`/product/${product.handle}`} className="hover:text-primary">
              {product.title}
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
                  className="rounded-full border border-border bg-background px-2 py-1 text-[0.62rem] uppercase tracking-[0.1em] text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() =>
            addItem({
              id: product.id,
              handle: product.handle,
              title: product.title,
              image: productImage(product),
              unitPrice: min,
            })
          }
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 text-xs font-bold uppercase tracking-[0.08em] text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          <ShoppingBag className="h-4 w-4" />
          Add to Cart
        </button>
      </div>
    </article>
  );
};

export default ProductCard;
