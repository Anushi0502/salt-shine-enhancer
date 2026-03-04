import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import type { ShopifyCollection } from "@/types/shopify";
import { normalizeShopifyAssetUrl } from "@/lib/theme-assets";

type CollectionCardProps = {
  collection: ShopifyCollection;
  productCount?: number;
};

const CollectionCard = ({ collection, productCount }: CollectionCardProps) => {
  const image = normalizeShopifyAssetUrl(collection.image?.src);
  const totalProducts = productCount ?? collection.products_count;

  return (
    <article
      className="salt-card-hover salt-metric-card salt-collection-card group relative h-full overflow-hidden rounded-2xl border border-border/80 bg-card shadow-soft"
    >
      <div className="relative overflow-hidden aspect-[4/3]">
        {image ? (
          <img
            src={image}
            alt={collection.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="salt-collection-fallback grid h-full w-full place-items-center px-6 text-center">
            <p className="text-[0.66rem] font-bold uppercase tracking-[0.08em] text-white/95 drop-shadow-[0_3px_8px_rgba(0,0,0,0.7)]">
              Collection image unavailable
            </p>
          </div>
        )}
        <div
          className="salt-collection-overlay absolute inset-0 opacity-95 transition-opacity duration-300"
        />
        <div className="absolute right-3 top-3 rounded-full border border-white/45 bg-black/38 px-3 py-1 text-[0.64rem] font-bold uppercase tracking-[0.06em] text-white backdrop-blur-sm shadow-[0_10px_22px_-16px_rgba(0,0,0,0.7)]">
          {totalProducts} items
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4">
        <div className="mb-2 inline-flex rounded-full border border-white/38 bg-black/32 px-2.5 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.06em] text-white/95 backdrop-blur-sm">
          Curated category
        </div>
        <h3 className="salt-collection-title text-2xl font-bold text-white">
          {collection.title}
        </h3>
        <p className="mt-1 text-sm text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)]">
          {totalProducts} products available
        </p>

        <Link
          to={`/shop?collection=${collection.handle}`}
          className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/45 bg-black/36 px-4 py-2 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-white backdrop-blur-sm transition hover:border-white hover:bg-white hover:text-slate-900"
        >
          Explore <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
};

export default CollectionCard;
