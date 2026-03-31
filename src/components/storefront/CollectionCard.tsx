import { Link } from "react-router-dom";
import { ArrowUpRight, Sparkles } from "lucide-react";
import type { ShopifyCollection } from "@/types/shopify";
import { normalizeShopifyAssetUrl } from "@/lib/theme-assets";

export type CollectionCardVariant = "default" | "hero";

type CollectionCardProps = {
  collection: ShopifyCollection;
  productCount?: number;
  variant?: CollectionCardVariant;
};

function collectionStory(title: string, handle: string): string {
  const source = `${title} ${handle}`.toLowerCase();

  if (/cook|kitchen|pan|pot/.test(source)) {
    return "Giftable cooking essentials and durable kitchen upgrades arranged for easy browsing.";
  }

  if (/gift|legacy|planner|book/.test(source)) {
    return "Meaningful picks designed for thoughtful gifting and practical everyday usefulness.";
  }

  if (/apparel|wear|dress|robe|fashion/.test(source)) {
    return "Easy statement pieces, soft silhouettes, and versatile wardrobe discoveries.";
  }

  if (/garden|tool|camp|outdoor/.test(source)) {
    return "Seasonal utility picks for outdoor living, maintenance, and everyday readiness.";
  }

  return "Curated products grouped into cleaner, faster paths for confident shopping.";
}

const CollectionCard = ({
  collection,
  productCount,
  variant = "default",
}: CollectionCardProps) => {
  const image = normalizeShopifyAssetUrl(collection.image?.src);
  const totalProducts = productCount ?? collection.products_count;
  const isHero = variant === "hero";
  const story = collectionStory(collection.title, collection.handle);

  return (
    <article
      className={`salt-card-hover salt-metric-card salt-collection-card group relative h-full overflow-hidden border border-border/80 shadow-soft ${
        isHero ? "rounded-[2rem]" : "rounded-[1.7rem]"
      }`}
    >
      <div className={`relative overflow-hidden ${isHero ? "aspect-[16/10] md:aspect-[16/9]" : "aspect-[4/4.2]"}`}>
        {image ? (
          <img
            src={image}
            alt={collection.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.06]"
          />
        ) : (
          <div className="salt-collection-fallback grid h-full w-full place-items-center px-6 text-center">
            <p className="text-[0.66rem] font-bold uppercase tracking-[0.08em] text-white/95 drop-shadow-[0_3px_8px_rgba(0,0,0,0.7)]">
              Collection image unavailable
            </p>
          </div>
        )}

        <div className="salt-collection-overlay absolute inset-0 opacity-95 transition-opacity duration-300" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),transparent_24%,transparent_70%,rgba(255,255,255,0.05))] opacity-85" />

        <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/34 bg-black/28 px-3 py-1.5 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-white backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Curated collection
          </span>
        </div>

        <div className="absolute right-4 top-4 rounded-full border border-white/45 bg-black/32 px-3 py-1 text-[0.64rem] font-bold uppercase tracking-[0.06em] text-white backdrop-blur-sm shadow-[0_10px_22px_-16px_rgba(0,0,0,0.7)]">
          {totalProducts} items
        </div>
      </div>

      <div className={`absolute inset-x-0 bottom-0 ${isHero ? "p-5 sm:p-6" : "p-4"}`}>
        <div className={`rounded-[1.4rem] border border-white/16 bg-black/28 backdrop-blur-md ${isHero ? "p-5 sm:p-6" : "p-4"}`}>
          <p className={`font-bold uppercase tracking-[0.14em] text-white/70 ${isHero ? "text-[0.66rem]" : "text-[0.6rem]"}`}>
            {isHero ? "Collection spotlight" : "Editorial pick"}
          </p>
          <h3 className={`salt-collection-title mt-2 font-display font-semibold text-white ${isHero ? "text-[clamp(1.8rem,3vw,2.9rem)] leading-[0.95]" : "text-[1.45rem] leading-[1.02]"}`}>
            {collection.title}
          </h3>
          <p className={`mt-2 max-w-2xl text-white/85 drop-shadow-[0_1px_6px_rgba(0,0,0,0.5)] ${isHero ? "text-sm leading-6" : "text-[0.82rem] leading-6"}`}>
            {story}
          </p>

          <div className={`mt-4 flex flex-wrap items-center gap-2 ${isHero ? "justify-between" : "justify-start"}`}>
            <span className="inline-flex rounded-full border border-white/22 bg-white/8 px-3 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.1em] text-white/92">
              {totalProducts} products available
            </span>
            <Link
              to={`/shop?collection=${collection.handle}`}
              className="inline-flex items-center gap-2 rounded-full border border-white/45 bg-white/10 px-4 py-2 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-white transition hover:border-white hover:bg-white hover:text-slate-900"
            >
              Shop collection <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
};

export default CollectionCard;
