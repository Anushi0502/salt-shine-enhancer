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

function collectionStory(title: string, handle: string): string {
  const source = `${title} ${handle}`.toLowerCase();

  if (/cook|kitchen|pan|pot/.test(source)) {
    return "Useful kitchen pieces with easy gifting potential.";
  }

  if (/gift|legacy|planner|book/.test(source)) {
    return "Thoughtful finds for meaningful occasions.";
  }

  if (/apparel|wear|dress|robe|fashion/.test(source)) {
    return "Easy wardrobe discoveries with a boutique feel.";
  }

  if (/garden|tool|camp|outdoor/.test(source)) {
    return "Outdoor and utility pieces gathered for the current season.";
  }

  return "A cleaner route into the products shoppers want first.";
}

const CollectionCard = ({
  collection,
  productCount,
  variant = "default",
}: CollectionCardProps) => {
  const image = normalizeShopifyAssetUrl(collection.image?.src);
  const totalProducts = productCount ?? collection.products_count;
  const isHero = variant === "hero";

  return (
    <article className={`salt-story-card group relative h-full overflow-hidden ${isHero ? "rounded-[2.1rem]" : "rounded-[1.7rem]"}`}>
      <div className={`relative overflow-hidden ${isHero ? "aspect-[16/11]" : "aspect-[4/4.6]"}`}>
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

        <div className="absolute left-4 top-4 rounded-full border border-white/14 bg-white/75 px-3 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--salt-ink))] backdrop-blur">
          {isHero ? "Collection spotlight" : "Curated collection"}
        </div>

        <div className="absolute right-4 top-4 rounded-full border border-white/14 bg-[hsl(var(--salt-ink))]/74 px-3 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur">
          {totalProducts} items
        </div>
      </div>

      <div className={`absolute inset-x-0 bottom-0 ${isHero ? "p-4 sm:p-5" : "p-3.5"}`}>
        <div className={`rounded-[1.35rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(255,255,255,0.76))] backdrop-blur ${isHero ? "p-[1.125rem] sm:p-5" : "p-3.5"}`}>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {isHero ? "Lead the browse" : "Shop by edit"}
          </p>
          <h3 className={`mt-2 font-display leading-[0.96] text-foreground ${isHero ? "text-[clamp(1.9rem,3vw,3rem)]" : "text-[1.55rem]"}`}>
            {collection.title}
          </h3>
          <p className={`mt-2.5 max-w-2xl text-muted-foreground ${isHero ? "text-sm leading-6" : "text-[0.82rem] leading-5"}`}>
            {collectionStory(collection.title, collection.handle)}
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {totalProducts} products
            </span>
            <Link
              to={`/shop?collection=${collection.handle}`}
              className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-4 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-foreground transition hover:border-primary/40 hover:text-primary"
            >
              Shop collection
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
};

export default CollectionCard;
