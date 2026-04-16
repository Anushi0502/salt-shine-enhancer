import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import type { ShopifyCollection } from "@/types/shopify";
import { normalizeShopifyAssetUrl } from "@/lib/theme-assets";

export type CollectionCardVariant = "default" | "hero";

type CollectionCardEditorialContent = {
  kicker: string;
  headline: string;
  description?: string;
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
  const collectionHref = `/shop?collection=${collection.handle}`;

  return (
    <article
      className={`salt-story-card group relative h-full overflow-hidden border border-[#d6e1f2] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] shadow-[0_24px_58px_-44px_rgba(15,23,42,0.22)] transition duration-500 hover:-translate-y-1 ${isHero ? "rounded-[1.85rem]" : "rounded-[1.5rem]"}`}
    >
      <div
        className={`relative overflow-hidden ${
          isHero
            ? "aspect-[16/9.35] min-h-[18rem] sm:min-h-[22rem]"
            : "aspect-[1/1.08] md:aspect-[1/1.02]"
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

        <div
          className={`absolute inset-0 ${
            isHero
              ? "bg-[linear-gradient(90deg,rgba(12,20,38,0.16)_0%,rgba(12,20,38,0.08)_34%,rgba(12,20,38,0.26)_100%)]"
              : "bg-[linear-gradient(180deg,rgba(12,20,38,0.02),rgba(12,20,38,0.05)_22%,rgba(12,20,38,0.22)_62%,rgba(12,20,38,0.72)_100%)]"
          }`}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white/10 to-transparent" />

        <div className={`absolute ${isHero ? "right-4 top-4" : "right-4 top-4"}`}>
          <span className="salt-media-pill px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.16em]">
          {totalProducts} items
          </span>
        </div>
      </div>

      <div className={`absolute inset-x-0 bottom-0 ${isHero ? "p-4 sm:p-5" : "p-4"}`}>
        <div
          className={`${
            hasEditorialContent
              ? "max-w-[34rem] rounded-[1.55rem] border border-[#d7e3f6] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(251,252,255,0.9))] px-4 py-4 shadow-[0_26px_58px_-40px_rgba(15,23,42,0.32)] backdrop-blur-md dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(18,24,37,0.9),rgba(15,21,34,0.84))] sm:px-5 sm:py-5"
              : "rounded-[1.2rem] bg-gradient-to-t from-[#11223d]/94 via-[#11223d]/76 to-transparent px-0 py-0 text-white"
          }`}
        >
          {hasEditorialContent && editorialContent ? (
            <div className="flex flex-col items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#4e73b2] dark:text-[#b9c8eb]">
                  {editorialContent.kicker}
                </p>
                <h3 className="mt-3 max-w-[12ch] font-display text-[clamp(2rem,6vw,4.1rem)] leading-[0.92] tracking-[-0.05em] text-[#183f84] dark:text-white">
                  {editorialContent.headline}
                </h3>
                {editorialContent.description ? (
                  <p className="mt-3 max-w-[42ch] text-sm leading-6 text-[#53698f] dark:text-white/74">
                    {editorialContent.description}
                  </p>
                ) : null}
              </div>

              <div className="flex w-full flex-col gap-2.5 sm:flex-row">
                <Link
                  to={editorialContent.primaryAction.to}
                  className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#2b67db] px-5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_18px_36px_-24px_rgba(43,103,219,0.72)] transition hover:bg-[#1e56bf] sm:w-auto"
                >
                  {editorialContent.primaryAction.label}
                </Link>
                {editorialContent.secondaryAction ? (
                  <Link
                    to={editorialContent.secondaryAction.to}
                    className="inline-flex h-11 w-full items-center justify-center rounded-full border border-[#c9daf5] bg-white/86 px-5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#335898] transition hover:border-[#9dbdf1] hover:text-[#1f4ea4] dark:border-white/12 dark:bg-white/6 dark:text-white sm:w-auto"
                  >
                    {editorialContent.secondaryAction.label}
                  </Link>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <div className="p-4 sm:p-4.5">
                <p className="text-[0.58rem] font-semibold uppercase tracking-[0.18em] text-white/68">
                  Curated edit
                </p>
                <h3
                  title={collection.title}
                  className="mt-2 line-clamp-2 font-display text-[1.5rem] leading-[0.96] tracking-[-0.04em] text-white sm:text-[1.66rem]"
                >
                  {collection.title}
                </h3>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-white/68">
                    {totalProducts} items
                  </span>
                <Link
                  to={collectionHref}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/16 bg-white/10 px-3.5 py-2 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-white transition hover:border-white/26 hover:bg-white/16"
                >
                    Open
                    <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
};

export default CollectionCard;
