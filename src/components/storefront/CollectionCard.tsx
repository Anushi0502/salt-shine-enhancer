import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import type { ShopifyCollection } from "@/types/shopify";
import { normalizeShopifyAssetUrl, resolveThemeAsset } from "@/lib/theme-assets";

type CollectionCardProps = {
  collection: ShopifyCollection;
  productCount?: number;
};

const CollectionCard = ({ collection, productCount }: CollectionCardProps) => {
  const image = normalizeShopifyAssetUrl(collection.image?.src) || resolveThemeAsset("/placeholder.svg");
  const totalProducts = productCount ?? collection.products_count;

  return (
    <article className="salt-card-hover group relative overflow-hidden rounded-2xl border border-border/80 bg-card shadow-soft">
      <div className="relative aspect-[5/4] overflow-hidden">
        <img
          src={image}
          alt={collection.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/82 via-foreground/30 to-transparent transition-opacity group-hover:opacity-90" />
        <div className="absolute right-3 top-3 rounded-full border border-primary-foreground/50 bg-primary-foreground/14 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.09em] text-primary-foreground">
          {totalProducts} items
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4">
        <div className="mb-2 inline-flex rounded-full border border-primary-foreground/45 bg-primary-foreground/15 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-primary-foreground/95">
          Curated category
        </div>
        <h3 className="text-xl font-bold text-primary-foreground">{collection.title}</h3>
        <p className="mt-1 text-sm text-primary-foreground/85">{totalProducts} products available</p>
        <p className="mt-1 inline-flex rounded-full border border-primary-foreground/35 bg-primary-foreground/10 px-2 py-1 text-[0.62rem] uppercase tracking-[0.08em] text-primary-foreground/90">
          Fast browse path
        </p>

        <Link
          to={`/shop?collection=${collection.handle}`}
          className="mt-3 inline-flex items-center gap-2 rounded-full border border-primary-foreground/50 bg-primary-foreground/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-primary-foreground transition hover:bg-primary-foreground hover:text-foreground"
        >
          Explore <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
};

export default CollectionCard;
