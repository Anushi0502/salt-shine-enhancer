import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import type { ShopifyCollection } from "@/types/shopify";
import { normalizeShopifyAssetUrl } from "@/lib/theme-assets";

export type CollectionCardVariant = "default" | "hero";

type CollectionCardProps = {
  collection: ShopifyCollection;
  productCount?: number;
  variant?: CollectionCardVariant;
};

const CollectionCard = ({ collection, productCount, variant = "default" }: CollectionCardProps) => {
  const isHero = variant === "hero";
  const image = normalizeShopifyAssetUrl(collection.image?.src);
  const totalProducts = productCount ?? collection.products_count;

  return (
    <article
      className={`salt-card-hover salt-metric-card group relative overflow-hidden border border-border/80 bg-card shadow-soft ${
        isHero ? "rounded-[1.35rem]" : "rounded-2xl"
      }`}
    >
      <div className={`relative overflow-hidden ${isHero ? "aspect-[5/3.8]" : "aspect-[5/4]"}`}>
        {image ? (
          <img
            src={image}
            alt={collection.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.22),transparent_48%),radial-gradient(circle_at_78%_80%,hsl(var(--salt-olive)/0.2),transparent_45%),linear-gradient(160deg,hsl(var(--muted)),hsl(var(--card)))] px-6 text-center">
            <p className="text-[0.66rem] font-bold uppercase tracking-[0.12em] text-foreground/82">
              Collection image unavailable
            </p>
          </div>
        )}
        <div className={`absolute inset-0 bg-gradient-to-t from-black/82 via-black/42 to-black/8 transition-opacity duration-300 group-hover:from-black/88 group-hover:via-black/46 ${
          isHero ? "opacity-95" : "opacity-90"
        }`} />
        <div className={`absolute right-3 top-3 rounded-full border border-white/45 bg-black/38 font-bold uppercase tracking-[0.09em] text-white backdrop-blur-sm shadow-[0_10px_22px_-16px_rgba(0,0,0,0.7)] ${
          isHero ? "px-3 py-1.5 text-[0.65rem]" : "px-2.5 py-1 text-[0.62rem]"
        }`}>
          {totalProducts} items
        </div>
      </div>

      <div className={`absolute inset-x-0 bottom-0 ${isHero ? "p-5" : "p-4"}`}>
        <div className={`mb-2 inline-flex rounded-full border border-white/38 bg-black/32 font-semibold uppercase tracking-[0.1em] text-white/95 backdrop-blur-sm ${
          isHero ? "px-3 py-1.5 text-[0.68rem]" : "px-2.5 py-1 text-[0.65rem]"
        }`}>
          Curated category
        </div>
        <h3 className={`${isHero ? "text-2xl" : "text-xl"} font-bold text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]`}>{collection.title}</h3>
        <p className={`mt-1 ${isHero ? "text-[0.92rem]" : "text-sm"} text-white/82 drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)]`}>
          {totalProducts} products available
        </p>
        <p
          className={`mt-1 inline-flex rounded-full border border-white/30 bg-black/26 uppercase tracking-[0.08em] text-white/88 backdrop-blur-sm ${
            isHero ? "px-2.5 py-1 text-[0.66rem]" : "px-2 py-1 text-[0.62rem]"
          }`}
        >
          Fast browse path
        </p>

        <Link
          to={`/shop?collection=${collection.handle}`}
          className={`mt-3 inline-flex items-center gap-2 rounded-full border border-white/45 bg-black/36 font-bold uppercase tracking-[0.12em] text-white backdrop-blur-sm transition hover:border-white hover:bg-white hover:text-slate-900 ${
            isHero ? "px-4 py-2 text-[0.68rem]" : "px-3 py-1.5 text-xs"
          }`}
        >
          Explore <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
};

export default CollectionCard;
