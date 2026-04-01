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

const CollectionCard = ({
  collection,
  productCount,
  variant = "default",
}: CollectionCardProps) => {
  const image = normalizeShopifyAssetUrl(collection.image?.src);
  const totalProducts = productCount ?? collection.products_count;
  const isHero = variant === "hero";

  return (
    <article className={`salt-story-card group relative h-full overflow-hidden ${isHero ? "rounded-[1.9rem]" : "rounded-[1.7rem]"}`}>
      <div className={`relative overflow-hidden ${isHero ? "aspect-[16/9.8] sm:aspect-[16/8.8] lg:aspect-[16/7.2]" : "aspect-[4/4.6]"}`}>
        {image ? (
          <img
            src={image}
            alt={collection.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.05]"
          />
        ) : (
          <div className="salt-collection-fallback grid h-full w-full place-items-center px-6 text-center">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--salt-ink))]">
              Collection image unavailable
            </p>
          </div>
        )}

        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(18,28,49,0.02),rgba(18,28,49,0.05)_28%,rgba(18,28,49,0.24)_72%,rgba(18,28,49,0.56)_100%)]" />


        <div className={`absolute rounded-full border border-white/14 bg-[hsl(var(--salt-ink))]/74 font-semibold uppercase tracking-[0.14em] text-white backdrop-blur ${isHero ? "right-3 top-3 px-2.5 py-1 text-[0.58rem]" : "right-4 top-4 px-3 py-1 text-[0.64rem]"}`}>
          {totalProducts} items
        </div>
      </div>

      <div className={`absolute inset-x-0 bottom-0 ${isHero ? "p-3 sm:p-4" : "p-3.5"}`}>
        <div className={`border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(255,255,255,0.8))] shadow-[0_20px_50px_-36px_rgba(15,23,42,0.4)] backdrop-blur ${isHero ? "w-fit max-w-[min(22rem,calc(100%-0.5rem))] rounded-[1rem] p-3.5 sm:p-4" : "rounded-[1.35rem] p-3.5"}`}>
          {isHero ? (
            <p className="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Collection
            </p>
          ) : null}
          <h3 className={`font-display leading-[0.96] text-foreground ${isHero ? "mt-1 text-[clamp(1.35rem,1.7vw,1.95rem)]" : "mt-2 text-[1.55rem]"}`}>
            {collection.title}
          </h3>

          <div className={`flex flex-wrap items-center justify-between gap-3 ${isHero ? "mt-2.5" : "mt-4"}`}>
            <Link
              to={`/shop?collection=${collection.handle}`}
              className={`inline-flex items-center gap-2 rounded-full border border-border/70 bg-card font-semibold uppercase tracking-[0.14em] text-foreground transition hover:border-primary/40 hover:text-primary ${isHero ? "px-3 py-1.5 text-[0.62rem]" : "px-4 py-2 text-[0.72rem]"}`}
            >
              Shop
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
};

export default CollectionCard;
