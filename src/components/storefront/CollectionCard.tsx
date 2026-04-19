import { Link } from "react-router-dom";
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
  imageSrc?: string | null;
};

const CollectionCard = ({
  collection,
  productCount,
  variant = "default",
  editorialContent,
  imageSrc,
}: CollectionCardProps) => {
  const image = normalizeShopifyAssetUrl(imageSrc) || normalizeShopifyAssetUrl(collection.image?.src);
  const totalProducts = productCount ?? collection.products_count;
  const isHero = variant === "hero";
  const hasEditorialContent = isHero && Boolean(editorialContent);
  const collectionHref = `/shop?collection=${collection.handle}`;

  if (!isHero) {
    return (
      <article className="h-full">
        <Link
          to={collectionHref}
          className="group relative block h-full overflow-hidden border border-[#d2e4ff] bg-[#eef5ff] shadow-[0_14px_30px_-24px_rgba(14,48,109,0.35)]"
        >
          <div className="relative overflow-hidden">
            {image ? (
              <div className="aspect-[1.04/0.93] overflow-hidden sm:aspect-[1/0.9]">
                <img
                  src={image}
                  alt={collection.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                />
              </div>
            ) : (
              <div className="grid aspect-[1.04/0.93] w-full place-items-center bg-[linear-gradient(180deg,#dce8fb_0%,#c6dafd_100%)] text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#31538c] sm:aspect-[1/0.9]">
                Image unavailable
              </div>
            )}

            <div className="absolute right-3 top-3">
              <span className="salt-media-pill px-2.5 py-0.5 text-[0.56rem] font-semibold uppercase tracking-[0.16em]">
                {totalProducts} items
              </span>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(8,30,73,0.12),rgba(8,30,73,0.9)_40%,rgba(8,30,73,0.98))] px-3 py-2.5 text-center text-white sm:px-3.5 sm:py-3">
            <p className="line-clamp-2 font-display text-[0.96rem] font-semibold leading-[1.15] drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)] sm:text-[1.08rem]">
              {collection.title}
            </p>
          </div>
        </Link>
      </article>
    );
  }

  if (hasEditorialContent && editorialContent) {
    return (
      <article className="salt-story-card group relative h-full overflow-hidden rounded-[1.3rem] border border-[#d6e1f2] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] shadow-[0_18px_42px_-34px_rgba(15,23,42,0.2)] transition duration-500 hover:-translate-y-1">
        <div className="relative h-full min-h-[10.75rem] overflow-hidden sm:min-h-[11.75rem]">
          {image ? (
            <img
              src={image}
              alt={collection.title}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover object-center transition duration-700 group-hover:scale-[1.03]"
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

          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,22,48,0.56)_0%,rgba(10,22,48,0.24)_36%,rgba(10,22,48,0.08)_58%,rgba(10,22,48,0.28)_100%)]" />
          <div className="pointer-events-none absolute inset-y-0 left-0 w-[46%] bg-[linear-gradient(90deg,rgba(10,22,48,0.24),transparent)]" />

          <div className="absolute right-3 top-3">
            <span className="salt-media-pill px-2 py-[0.35rem] text-[0.52rem] font-semibold uppercase tracking-[0.16em]">
              {totalProducts} items
            </span>
          </div>

          <div className="absolute bottom-2 left-2 right-2 z-10 sm:bottom-3 sm:left-3 sm:right-3">
            <div className="max-w-[18.5rem] rounded-[1rem] border border-white/16 bg-[linear-gradient(180deg,rgba(15,24,42,0.6),rgba(10,18,34,0.68))] px-3 py-2.5 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.24)] backdrop-blur-md">
              <span className="block h-[2px] w-10 rounded-full bg-[linear-gradient(90deg,#f0c24c_0%,#2b67db_100%)]" />
              <p className="mt-2 text-[0.5rem] font-semibold uppercase tracking-[0.14em] text-[#c3d5fb]">
                {editorialContent.kicker}
              </p>
              <h3 className="mt-1 line-clamp-2 max-w-[14ch] font-display text-[clamp(1.18rem,2.4vw,1.95rem)] leading-[0.94] tracking-[-0.04em] text-white">
                {editorialContent.headline}
              </h3>
              {editorialContent.description ? (
                <p className="mt-1.5 line-clamp-2 max-w-[30ch] text-[0.68rem] leading-[1.05rem] text-white/76">
                  {editorialContent.description}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Link
                  to={editorialContent.primaryAction.to}
                  className="inline-flex h-7 items-center justify-center rounded-full bg-[#2b67db] px-3 text-[0.5rem] font-semibold uppercase tracking-[0.09em] text-white shadow-[0_10px_20px_-18px_rgba(43,103,219,0.72)] transition hover:bg-[#1e56bf]"
                >
                  {editorialContent.primaryAction.label}
                </Link>
                {editorialContent.secondaryAction ? (
                  <Link
                    to={editorialContent.secondaryAction.to}
                    className="inline-flex h-7 items-center justify-center rounded-full border border-white/28 bg-white/12 px-3 text-[0.5rem] font-semibold uppercase tracking-[0.09em] text-white transition hover:border-white/44 hover:bg-white/18"
                  >
                    {editorialContent.secondaryAction.label}
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className={`salt-story-card group relative h-full overflow-hidden border border-[#d6e1f2] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] shadow-[0_20px_46px_-38px_rgba(15,23,42,0.2)] transition duration-500 hover:-translate-y-1 ${isHero ? "rounded-[1.4rem]" : "rounded-[1.5rem]"}`}
    >
      <div
        className={`relative overflow-hidden ${
          isHero
            ? hasEditorialContent
              ? "aspect-[16/6.3] min-h-[10.75rem] sm:min-h-[12rem] lg:min-h-[12.75rem]"
              : "aspect-[16/8.2] min-h-[13.5rem] sm:min-h-[15.5rem]"
            : "aspect-[1/1.08] md:aspect-[1/1.02]"
        }`}
      >
        {image ? (
          <img
            src={image}
            alt={collection.title}
            loading="lazy"
            className={`h-full w-full object-cover transition duration-700 group-hover:scale-[1.05] ${hasEditorialContent ? "object-[72%_center] sm:object-[68%_center]" : ""}`}
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
              ? hasEditorialContent
                ? "bg-[linear-gradient(90deg,rgba(9,20,44,0.3)_0%,rgba(9,20,44,0.14)_38%,rgba(9,20,44,0.34)_100%)]"
                : "bg-[linear-gradient(90deg,rgba(12,20,38,0.16)_0%,rgba(12,20,38,0.08)_34%,rgba(12,20,38,0.26)_100%)]"
              : "bg-[linear-gradient(180deg,rgba(12,20,38,0.02),rgba(12,20,38,0.05)_22%,rgba(12,20,38,0.22)_62%,rgba(12,20,38,0.72)_100%)]"
          }`}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white/10 to-transparent" />

        <div className={`absolute ${isHero ? "right-3 top-3" : "right-4 top-4"}`}>
          <span className={`salt-media-pill font-semibold uppercase tracking-[0.16em] ${isHero ? "px-2 py-[0.35rem] text-[0.52rem]" : "px-3 py-1 text-[0.62rem]"}`}>
          {totalProducts} items
          </span>
        </div>
      </div>

      <div className={`absolute ${isHero ? "bottom-2 left-2 right-2 z-10 sm:bottom-3 sm:left-3 sm:right-3" : "inset-x-0 bottom-0 p-4"}`}>
        <div
          className={`${
            hasEditorialContent
              ? "relative w-full max-w-[26rem] overflow-hidden rounded-[1rem] border border-[#d7e3f6] bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(251,252,255,0.9))] px-3 py-2.5 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.24)] backdrop-blur-md dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(18,24,37,0.9),rgba(15,21,34,0.84))] sm:max-w-[32rem] sm:px-3.5 sm:py-3"
              : "rounded-[1.2rem] bg-gradient-to-t from-[#11223d]/94 via-[#11223d]/76 to-transparent px-0 py-0 text-white"
          }`}
        >
          {hasEditorialContent && editorialContent ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
              <div className="min-w-0 flex-1">
                <span className="block h-[2px] w-10 rounded-full bg-[linear-gradient(90deg,#f0c24c_0%,#2b67db_100%)]" />
                <p className="mt-2 text-[0.5rem] font-semibold uppercase tracking-[0.14em] text-[#4e73b2] dark:text-[#b9c8eb]">
                  {editorialContent.kicker}
                </p>
                <h3 className="mt-1 line-clamp-2 max-w-[16ch] font-display text-[clamp(1.1rem,2.3vw,1.9rem)] leading-[0.96] tracking-[-0.04em] text-[#183f84] dark:text-white">
                  {editorialContent.headline}
                </h3>
                {editorialContent.description ? (
                  <p className="mt-1 max-w-[34ch] text-[0.68rem] leading-[1.1rem] text-[#53698f] dark:text-white/74">
                    {editorialContent.description}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
                <Link
                  to={editorialContent.primaryAction.to}
                  className="inline-flex h-7 items-center justify-center rounded-full bg-[#2b67db] px-3 text-[0.5rem] font-semibold uppercase tracking-[0.09em] text-white shadow-[0_10px_20px_-18px_rgba(43,103,219,0.72)] transition hover:bg-[#1e56bf]"
                >
                  {editorialContent.primaryAction.label}
                </Link>
                {editorialContent.secondaryAction ? (
                  <Link
                    to={editorialContent.secondaryAction.to}
                    className="inline-flex h-7 items-center justify-center rounded-full border border-[#c9daf5] bg-white/86 px-3 text-[0.5rem] font-semibold uppercase tracking-[0.09em] text-[#335898] transition hover:border-[#9dbdf1] hover:text-[#1f4ea4] dark:border-white/12 dark:bg-white/6 dark:text-white"
                  >
                    {editorialContent.secondaryAction.label}
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
};

export default CollectionCard;
