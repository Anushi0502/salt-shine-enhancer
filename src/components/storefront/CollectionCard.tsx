import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import type { ShopifyCollection } from "@/types/shopify";
import { normalizeShopifyAssetUrl } from "@/lib/theme-assets";

export type CollectionCardVariant = "default" | "hero";

type CollectionCardEditorialContent = {
  kicker: string;
  headline: string;
  primaryAction: {
    to: string;
    label: string;
  };
  secondaryAction?: {
    to: string;
    label: string;
  };
};

type CollectionCardProps = {
  collection: ShopifyCollection;
  productCount?: number;
  variant?: CollectionCardVariant;
  editorialContent?: CollectionCardEditorialContent;
};

const CollectionCard = ({
  collection,
  productCount,
  variant = "default",
  editorialContent,
}: CollectionCardProps) => {
  const image = normalizeShopifyAssetUrl(collection.image?.src);
  const totalProducts = productCount ?? collection.products_count;
  const isHero = variant === "hero";
  const hasEditorialContent = isHero && Boolean(editorialContent);

  return (
    <article
      className={`salt-story-card group relative h-full overflow-hidden border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.42))] shadow-[0_26px_80px_-52px_rgba(15,23,42,0.28)] transition duration-500 hover:-translate-y-1 hover:shadow-[0_36px_100px_-56px_rgba(15,23,42,0.38)] ${isHero ? "rounded-[1.95rem]" : "rounded-[1.8rem]"}`}
    >
      <div
        className={`relative overflow-hidden ${
          isHero
            ? "aspect-[16/9.25]"
            : "aspect-[4/4.75] md:aspect-[4/4.2] lg:aspect-[4/3.55] xl:aspect-[4/3.1]"
        }`}
      >
        {image ? (
          <img
            src={image}
            alt={collection.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.06]"
          />
        ) : (
          <div className="salt-collection-fallback grid h-full w-full place-items-center bg-[linear-gradient(135deg,rgba(247,244,236,0.98),rgba(239,234,224,0.98))] px-6 text-center">
            <div>
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-[hsl(var(--salt-ink))/0.5]">
                SALT collection
              </p>
              <p className="mt-3 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--salt-ink))/0.84]">
                Collection image unavailable
              </p>
            </div>
          </div>
        )}

        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,20,38,0.02),rgba(12,20,38,0.05)_20%,rgba(12,20,38,0.18)_58%,rgba(12,20,38,0.52)_100%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white/8 to-transparent" />

        <div
          className={`absolute rounded-full border border-white/18 bg-[linear-gradient(180deg,rgba(28,39,67,0.82),rgba(18,27,47,0.72))] font-semibold uppercase tracking-[0.16em] text-white shadow-[0_16px_36px_-24px_rgba(15,23,42,0.72)] backdrop-blur-md ${isHero ? "right-3 top-3 px-2.5 py-1 text-[0.56rem]" : "right-4 top-4 px-3 py-1 text-[0.62rem]"}`}
        >
          {totalProducts} items
        </div>
      </div>

      <div className={`absolute inset-x-0 bottom-0 ${isHero ? "p-4 sm:p-5" : "p-3.5 sm:p-4"}`}>
        <div
          className={`border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,247,243,0.88))] shadow-[0_26px_60px_-38px_rgba(15,23,42,0.46)] backdrop-blur-md ${
            hasEditorialContent
              ? "rounded-[1.6rem] border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,247,243,0.94))] px-4 py-4 dark:bg-[linear-gradient(180deg,rgba(26,33,49,0.96),rgba(16,22,35,0.92))] sm:rounded-[2rem] sm:px-6 sm:py-5 lg:px-7 lg:py-6"
              : isHero
                ? "w-full max-w-[min(25.5rem,100%)] rounded-[1.18rem] p-4 dark:bg-[linear-gradient(180deg,rgba(26,33,49,0.96),rgba(16,22,35,0.92))] sm:w-fit sm:max-w-[min(25.5rem,calc(100%-0.5rem))] sm:p-[1.125rem]"
                : "rounded-[1.45rem] p-4 dark:bg-[linear-gradient(180deg,rgba(26,33,49,0.96),rgba(16,22,35,0.92))]"
          }`}
        >
          {hasEditorialContent && editorialContent ? (
            <div className="flex flex-col items-start gap-4 lg:flex-row lg:flex-nowrap lg:justify-between lg:gap-8">
              <div className="min-w-0 flex-1">
                <p className="salt-kicker">{editorialContent.kicker}</p>
                <h3 className="mt-4 max-w-5xl font-display text-[clamp(1.9rem,8vw,4.8rem)] leading-[0.92] tracking-[-0.05em] text-foreground">
                  {editorialContent.headline}
                </h3>
              </div>

              <div className="flex w-full shrink-0 flex-col gap-2.5 sm:flex-row lg:w-auto lg:justify-end">
                <Link
                  to={editorialContent.primaryAction.to}
                  className="salt-primary-cta h-12 w-full px-6 text-sm font-bold sm:h-14 sm:w-auto sm:px-8 sm:text-[1.05rem]"
                >
                  {editorialContent.primaryAction.label}
                </Link>
                {editorialContent.secondaryAction ? (
                  <Link
                    to={editorialContent.secondaryAction.to}
                    className="salt-outline-chip h-12 w-full px-6 py-0 text-sm sm:h-14 sm:w-auto sm:px-8 sm:text-[1.05rem]"
                  >
                    {editorialContent.secondaryAction.label}
                  </Link>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              {isHero ? (
                <p className="text-[0.98rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Collection
                </p>
              ) : (
                <p className="text-[0.58rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Curated edit
                </p>
              )}
              <h3
                className={`font-display leading-[0.94] tracking-[-0.035em] text-foreground ${isHero ? "mt-1 text-[clamp(1.48rem,2vw,2.2rem)]" : "mt-2 text-[1.58rem] sm:text-[1.66rem]"}`}
              >
                {collection.title}
              </h3>

              <div className={`flex flex-wrap items-center justify-between gap-3 ${isHero ? "mt-3" : "mt-4"}`}>
                <Link
                  to={`/shop?collection=${collection.handle}`}
                  className={`salt-showcase-pill hover:border-primary/40 hover:bg-primary hover:text-primary-foreground ${isHero ? "px-3.5 py-2 text-[0.64rem]" : "px-4 py-2 text-[0.7rem]"}`}
                >
                  Shop
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
                {!isHero ? (
                  <span className="text-[0.6rem] font-bold uppercase tracking-[0.16em] text-muted-foreground/80">
                    Explore now
                  </span>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
};

export default CollectionCard;
