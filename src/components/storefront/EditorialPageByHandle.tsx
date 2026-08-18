import { ChevronRight } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import OpenContentPageShell from "@/components/storefront/OpenContentPageShell";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import ResilientImage from "@/components/storefront/ResilientImage";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { conciseTitle, formatMoney, minPrice, productImage } from "@/lib/formatters";
import { buildResourceReason } from "@/lib/editorial-pages";
import { useCollections } from "@/lib/collections-data";
import {
  SITE_RESOURCE_GUIDES,
  buildResourceRoute,
  buildResourceTopicRoute,
  getCollectionByHandle,
  getResourceByHandle,
  getResourceTopicByHandle,
} from "@/lib/site-navigation";
import type { SiteResourceGuide, SiteResourceTopic } from "@/lib/site-navigation";
import { useEditorialPage, useProductByHandle } from "@/lib/shopify-data";
import type { ShopifyProduct } from "@/types/shopify";

type EditorialPageByHandleProps = {
  handle: string;
  loadingTitle: string;
  loadingSubtitle: string;
  errorTitle: string;
  errorSubtitle: string;
};

type ResolvedFeaturedProduct = {
  handle: string;
  product: ShopifyProduct;
  reason: string;
  collectionLabel?: string;
};

const metaDescriptionSelector = 'meta[name="description"]';

const resourceHubPathCopy: Record<string, string> = {
  "senior-living-guides": "Support an older adult, reduce friction at home, or choose a gift that will actually be used.",
  "home-living": "Make the house feel easier to live in, one room and one small win at a time.",
  "lifestyle-wellness": "Slow the day down with steadier routines, less stress, and more predictable habits.",
  "gift-guides": "Pick a gift that feels thoughtful, useful, and easy to appreciate right away.",
  "home-safety-organization": "Keep the home safer, the paperwork clearer, and the next step easier to find.",
  "family-legacy": "Preserve the stories, details, and planning information that families usually leave until later.",
  "pet-home-life": "Make pet routines calmer at home and easier to handle on the move.",
};

const resourceHubPrimaryTopicCopy: Record<string, string> = {
  "senior-living-guides": "Start with safety and support",
  "home-living": "Start with organization",
  "lifestyle-wellness": "Start with routine",
  "gift-guides": "Start with the occasion",
  "home-safety-organization": "Start with the risk",
  "family-legacy": "Start with planning",
  "pet-home-life": "Start with the pet routine",
};

type ResourceRouteVisual = {
  title: string;
  detail: string;
  to: string;
  image?: string | null;
  badge: string;
  chips: string[];
};

type ResourceHubBrowseSectionProps = {
  eyebrow: string;
  title: string;
  description: string;
  countLabel: string;
  ctaLabel: string;
  tiles: ResourceRouteVisual[];
};

type ResourceFeaturedView = ResolvedFeaturedProduct & {
  image: string | null;
  price: string;
  title: string;
};

type ResourceFeaturedShelfProps = {
  title: string;
  description?: string;
  products: ResourceFeaturedView[];
};

type ResourceRouteCardProps = ResourceRouteVisual & {
  prominent?: boolean;
  ctaLabel?: string;
};

type ResourcePageContext = {
  guide: SiteResourceGuide | null;
  topic: SiteResourceTopic | null;
};

function findResourceContext(handle: string): ResourcePageContext {
  const normalizedHandle = String(handle || "")
    .trim()
    .toLowerCase();

  if (!normalizedHandle || normalizedHandle === "resources") {
    return { guide: null, topic: null };
  }

  const [guideHandle, topicHandle] = normalizedHandle.split("/", 2);
  if (guideHandle && topicHandle) {
    const guide = getResourceByHandle(guideHandle);
    const topic = guide ? getResourceTopicByHandle(guideHandle, topicHandle) : null;
    return { guide, topic };
  }

  return { guide: getResourceByHandle(normalizedHandle), topic: null };
}

function getCollectionTitleFromRoute(
  collectionRoute: string | null | undefined,
  adminCollectionsByHandle: Map<string, { title: string }>,
): string {
  const rawHandle = String(collectionRoute || "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/^collections\//, "");

  if (!rawHandle) {
    return "";
  }

  const staticCollection = getCollectionByHandle(rawHandle);
  const adminCollection = [rawHandle, staticCollection?.handle, staticCollection?.shopifyHandle]
    .map((handle) => String(handle || "").trim().toLowerCase())
    .map((handle) => adminCollectionsByHandle.get(handle))
    .find(Boolean);

  return adminCollection?.title || staticCollection?.title || rawHandle.replace(/-/g, " ");
}

function buildRouteCues(...values: Array<string | null | undefined>): string[] {
  return values
    .map((value) => conciseTitle(String(value || ""), 18))
    .filter((value) => Boolean(value))
    .slice(0, 3);
}

function buildResourceGuideVisual(
  guide: SiteResourceGuide,
  productsByHandle: Map<string, ShopifyProduct>,
  adminCollectionsByHandle: Map<string, { title: string }>,
): ResourceRouteVisual {
  const primaryHandle = guide.featuredProducts[0]?.handle;
  const primaryProduct = primaryHandle ? productsByHandle.get(primaryHandle) || null : null;
  const collectionTitle = conciseTitle(
    getCollectionTitleFromRoute(guide.collectionRoute, adminCollectionsByHandle) || "Collection",
    18,
  );

  return {
    title: guide.title,
    detail: guide.summary,
    to: buildResourceRoute(guide.handle),
    image: primaryProduct ? productImage(primaryProduct) : null,
    badge: "Guide",
    chips: buildRouteCues(
      collectionTitle,
      primaryProduct?.title || guide.topics[0]?.title,
      guide.topics[1]?.title,
    ),
  };
}

function buildResourceTopicVisual(
  guide: SiteResourceGuide,
  topic: SiteResourceTopic,
  productsByHandle: Map<string, ShopifyProduct>,
  adminCollectionsByHandle: Map<string, { title: string }>,
  badge = "Topic",
): ResourceRouteVisual {
  const primaryHandle = topic.featuredProducts[0]?.handle;
  const primaryProduct = primaryHandle ? productsByHandle.get(primaryHandle) || null : null;
  const collectionTitle = conciseTitle(
    getCollectionTitleFromRoute(topic.collectionRoute, adminCollectionsByHandle) || guide.title,
    18,
  );
  const supportHandle = topic.featuredProducts[1]?.handle || topic.featuredProducts[0]?.handle;
  const supportProduct = supportHandle ? productsByHandle.get(supportHandle) || null : null;

  return {
    title: topic.title,
    detail: topic.summary,
    to: buildResourceTopicRoute(guide.handle, topic.handle),
    image: primaryProduct ? productImage(primaryProduct) : null,
    badge,
    chips: buildRouteCues(collectionTitle, supportProduct?.title || "Featured pick", guide.title),
  };
}

const ResourceRouteCard = ({
  title,
  detail,
  to,
  image,
  badge,
  chips,
  prominent = false,
  ctaLabel = "Open guide",
}: ResourceRouteCardProps) => {
  const previewTitle = conciseTitle(title, prominent ? 20 : 18);
  const previewFallbackLabel = chips[0] || "Start here";

  return (
    <Link
      to={to}
      className={`salt-panel-shell group relative block h-full overflow-hidden rounded-[1.7rem] border border-border/70 bg-[linear-gradient(180deg,hsl(var(--background)/0.98),hsl(var(--card)/0.92))] shadow-[0_24px_48px_-36px_rgba(15,23,42,0.16)] transition duration-300 hover:-translate-y-1 hover:border-primary/20 ${
        prominent ? "xl:col-span-2" : ""
      }`}
    >
      <div className={`grid gap-4 p-4 sm:p-5 ${prominent ? "lg:grid-cols-[minmax(0,1.08fr)_minmax(11rem,0.92fr)] lg:p-6" : "lg:grid-cols-[minmax(0,1fr)_9.5rem]"}`}>
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-primary">{badge}</p>
            {chips.length ? (
              <span className="shrink-0 rounded-full border border-border/60 bg-background/88 px-2.5 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-primary/80">
                {chips.length} cues
              </span>
            ) : null}
          </div>

          <h3
            className={`mt-2 line-clamp-2 font-display leading-[0.97] text-foreground ${
              prominent ? "text-[clamp(1.38rem,2.4vw,2.05rem)]" : "text-[1.08rem]"
            }`}
          >
            {title}
          </h3>

          <p className={`mt-2 text-sm leading-6 text-muted-foreground ${prominent ? "max-w-2xl" : ""}`}>{detail}</p>

          {chips.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {chips.slice(0, prominent ? 4 : 3).map((chip) => (
                <span
                  key={chip}
                  className="inline-flex items-center rounded-full border border-border/60 bg-background/88 px-2.5 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.08em] text-foreground/86"
                >
                  {chip}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-4 inline-flex items-center gap-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-primary">
            {ctaLabel}
            <ChevronRight className="h-3.5 w-3.5" />
          </div>
        </div>

        <div
          className={`relative overflow-hidden rounded-[1.2rem] border border-border/65 bg-[linear-gradient(145deg,hsl(var(--background)/0.97),hsl(var(--card)/0.92))] shadow-[inset_0_1px_0_hsl(0_0%_100%/0.55)] ${
            prominent ? "min-h-[11rem] lg:min-h-[14.5rem]" : "min-h-[9.5rem]"
          }`}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.14),transparent_58%),radial-gradient(circle_at_bottom_left,hsl(var(--salt-gold)/0.1),transparent_64%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,30,73,0.03),rgba(8,30,73,0.14)_58%,rgba(8,30,73,0.34))]" />

          {image ? (
            <ResilientImage
              src={image}
              alt={title}
              loading="lazy"
              decoding="async"
              className="relative h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
              fallback={
                <div className="flex h-full w-full flex-col justify-between p-3 text-primary">
                  <div className="inline-flex w-fit rounded-full border border-border/60 bg-background/88 px-2 py-1 text-[0.56rem] font-bold uppercase tracking-[0.12em] text-primary/80">
                    {badge}
                  </div>
                  <div>
                    <p className="text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Guide route
                    </p>
                    <p className="mt-1 font-display text-[1rem] leading-[1.02] text-foreground">{previewTitle}</p>
                    <p className="mt-1 text-[0.68rem] leading-5 text-muted-foreground">{previewFallbackLabel}</p>
                  </div>
                </div>
              }
            />
          ) : (
            <div className="relative flex h-full flex-col justify-between p-3 text-primary">
              <div className="inline-flex w-fit rounded-full border border-border/60 bg-background/88 px-2 py-1 text-[0.56rem] font-bold uppercase tracking-[0.12em] text-primary/80">
                {badge}
              </div>
              <div>
                <p className="text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Guide route
                </p>
                <p className="mt-1 font-display text-[1rem] leading-[1.02] text-foreground">{previewTitle}</p>
                <p className="mt-1 text-[0.68rem] leading-5 text-muted-foreground">{previewFallbackLabel}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};

const ResourceHubBrowseSection = ({ eyebrow, title, description, countLabel, ctaLabel, tiles }: ResourceHubBrowseSectionProps) => {
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="salt-kicker">{eyebrow}</p>
          <h2 className="mt-2 font-display text-[clamp(1.55rem,3vw,2.3rem)] leading-[0.96] text-foreground">
            {title}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>

        <div className="salt-editorial-meta inline-flex h-9 items-center rounded-full px-3 text-[0.62rem] font-semibold uppercase tracking-[0.12em]">
          {countLabel}
        </div>
      </div>

      <div className="mt-5 grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile, index) => (
          <ResourceRouteCard
            key={tile.to}
            {...tile}
            prominent={index === 0}
            ctaLabel={ctaLabel}
          />
        ))}
      </div>
    </section>
  );
};

const ResourceFeaturedShelf = ({ title, description, products }: ResourceFeaturedShelfProps) => {
  if (!products.length) {
    return null;
  }

  const heroProduct = products[0];
  const supportingProducts = products.slice(1, 3);

  return (
    <section className="mt-10">
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary">{title}</p>
      {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-start">
        <Link
          to={`/products/${heroProduct.handle}`}
          className="salt-panel-shell group relative overflow-hidden rounded-[1.75rem] shadow-[0_24px_48px_-36px_rgba(15,23,42,0.2)] transition hover:-translate-y-0.5 hover:border-primary/20"
        >
          <div className="relative aspect-[1.12/0.9] overflow-hidden">
            {heroProduct.image ? (
              <ResilientImage
                src={heroProduct.image}
                alt={heroProduct.title}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                fallback={
                  <div className="grid h-full w-full place-items-center bg-[linear-gradient(135deg,hsl(var(--background)/0.98),hsl(var(--card)/0.92))] text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-primary">
                    Image unavailable
                  </div>
                }
              />
            ) : (
              <div className="grid h-full w-full place-items-center bg-[linear-gradient(135deg,hsl(var(--background)/0.98),hsl(var(--card)/0.92))] text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-primary">
                Image unavailable
              </div>
            )}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,30,73,0.02),rgba(8,30,73,0.12)_58%,rgba(8,30,73,0.36))]" />
            <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-white/78">
                    {heroProduct.collectionLabel || "Featured pick"}
                  </p>
                  <h3 className="mt-1 line-clamp-2 font-display text-[clamp(1.35rem,2.8vw,2.2rem)] leading-[0.96] text-white">
                    {heroProduct.title}
                  </h3>
                </div>
                <span className="shrink-0 rounded-full border border-white/18 bg-white/14 px-2.5 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-white/82 backdrop-blur">
                  {heroProduct.price}
                </span>
              </div>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/78">{heroProduct.reason}</p>

              <div className="mt-4 inline-flex items-center gap-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-white/92">
                View product
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>
        </Link>

        <div className="grid gap-4">
          {supportingProducts.map((product) => (
            <Link
              key={product.handle}
              to={`/products/${product.handle}`}
              className="salt-panel-shell group flex items-stretch overflow-hidden rounded-[1.45rem] shadow-[0_18px_38px_-30px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5 hover:border-primary/20"
            >
              <div className="relative w-32 shrink-0 overflow-hidden sm:w-36">
                {product.image ? (
                  <ResilientImage
                    src={product.image}
                    alt={product.title}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                    fallback={
                      <div className="grid h-full w-full place-items-center bg-muted/20 text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Image unavailable
                      </div>
                    }
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-muted/20 text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Image unavailable
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="font-display text-[1.02rem] leading-[1.02] text-foreground transition group-hover:text-primary">
                      {product.title}
                    </h4>
                  </div>
                  <span className="salt-editorial-meta shrink-0 px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.1em]">
                    {product.price}
                  </span>
                </div>

                <p className="mt-2 text-sm leading-6 text-muted-foreground">{product.reason}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

const EditorialPageByHandle = ({
  handle,
  loadingTitle,
  loadingSubtitle,
  errorTitle,
  errorSubtitle,
}: EditorialPageByHandleProps) => {
  const normalizedHandle = String(handle || "").trim().toLowerCase();
  const { data, isLoading, error, refetch } = useEditorialPage(normalizedHandle);
  const { data: collectionsData } = useCollections();
  const featuredProduct0Query = useProductByHandle(data?.page?.featuredProducts?.[0]?.handle);
  const featuredProduct1Query = useProductByHandle(data?.page?.featuredProducts?.[1]?.handle);
  const featuredProduct2Query = useProductByHandle(data?.page?.featuredProducts?.[2]?.handle);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const page = data?.page;
    const nextTitle = page?.seoTitle || (page ? `${page.title} | SALT Online Store` : document.title);
    const nextDescription = page?.metaDescription || page?.summary || "";
    const previousTitle = document.title;
    const existingMeta = document.head.querySelector<HTMLMetaElement>(metaDescriptionSelector);
    const previousDescription = existingMeta?.getAttribute("content");
    let createdMeta = false;

    document.title = nextTitle;

    let metaTag = existingMeta;
    if (!metaTag) {
      metaTag = document.createElement("meta");
      metaTag.setAttribute("name", "description");
      document.head.appendChild(metaTag);
      createdMeta = true;
    }

    if (nextDescription) {
      metaTag.setAttribute("content", nextDescription);
    }

    return () => {
      document.title = previousTitle;
      const currentMeta = document.head.querySelector<HTMLMetaElement>(metaDescriptionSelector);
      if (!currentMeta) {
        return;
      }

      if (createdMeta) {
        currentMeta.remove();
        return;
      }

      if (previousDescription) {
        currentMeta.setAttribute("content", previousDescription);
      } else {
        currentMeta.removeAttribute("content");
      }
    };
  }, [data?.page]);

  const adminCollectionsByHandle = useMemo(
    () =>
      new Map(
        (collectionsData?.collections || []).map((collection) => [
          String(collection.handle || "").trim().toLowerCase(),
          { title: collection.title },
        ]),
      ),
    [collectionsData?.collections],
  );

  const productsByHandle = useMemo(
    () =>
      new Map(
        [featuredProduct0Query.data, featuredProduct1Query.data, featuredProduct2Query.data]
          .filter((product): product is ShopifyProduct => Boolean(product))
          .map((product) => [product.handle, product]),
      ),
    [featuredProduct0Query.data, featuredProduct1Query.data, featuredProduct2Query.data],
  );

  const resolvedFeaturedProducts = useMemo<ResolvedFeaturedProduct[]>(() => {
    const page = data?.page;
    if (!page?.featuredProducts?.length) {
      return [];
    }

    return page.featuredProducts.flatMap((entry) => {
      const product = productsByHandle.get(entry.handle);
      if (!product) {
        return [];
      }

      return [
        {
          handle: entry.handle,
          product,
          reason: entry.reason || buildResourceReason(product.title, page.title),
          collectionLabel: entry.collectionLabel,
        },
      ];
    });
  }, [data?.page, productsByHandle]);

  const resourceFeaturedViews = useMemo<ResourceFeaturedView[]>(() => {
    return resolvedFeaturedProducts.map((entry) => ({
      ...entry,
      image: productImage(entry.product),
      price: formatMoney(minPrice(entry.product)),
      title: conciseTitle(entry.product.title, 64),
    }));
  }, [resolvedFeaturedProducts]);
  const isResourceHubHandle = normalizedHandle === "resources";
  const isResourcePageHandle = isResourceHubHandle || normalizedHandle.includes("/");
  const resourceContext = useMemo(() => findResourceContext(normalizedHandle), [normalizedHandle]);
  const resourceRouteTiles = useMemo<ResourceRouteVisual[]>(() => {
    if (isResourceHubHandle) {
      return SITE_RESOURCE_GUIDES.map((guide) =>
        buildResourceGuideVisual(guide, productsByHandle, adminCollectionsByHandle),
      );
    }

    if (!resourceContext.guide) {
      return [];
    }

    if (resourceContext.topic) {
      return resourceContext.guide.topics
        .filter((topic) => topic.handle !== resourceContext.topic?.handle)
        .slice(0, 4)
        .map((topic) =>
          buildResourceTopicVisual(
            resourceContext.guide,
            topic,
            productsByHandle,
            adminCollectionsByHandle,
            "Sibling topic",
          ),
        );
    }

    return resourceContext.guide.topics
      .slice(0, 6)
      .map((topic) =>
        buildResourceTopicVisual(
          resourceContext.guide,
          topic,
          productsByHandle,
          adminCollectionsByHandle,
        ),
      );
  }, [adminCollectionsByHandle, isResourceHubHandle, productsByHandle, resourceContext.guide, resourceContext.topic]);
  const pageSectionClassName = "";

  if (isLoading) {
    return <LoadingState title={loadingTitle} subtitle={loadingSubtitle} />;
  }

  if (error || !data?.page) {
    return (
      <ErrorState
        title={errorTitle}
        subtitle={errorSubtitle}
        action={
        <button
          type="button"
          onClick={() => refetch()}
          className="salt-primary-cta h-11 rounded-xl px-5 text-sm font-bold"
        >
          Retry
        </button>
        }
      />
    );
  }

  const page = data.page;
  const isResourceHub = isResourceHubHandle;
  const isResourcePage = isResourcePageHandle;
  const pageSummary = page.summary || "A clear page for shoppers who want a direct route through the store.";
  const breadcrumbs = page.breadcrumbs?.length
    ? page.breadcrumbs
    : [
        { label: "Home", to: "/" },
        { label: page.kicker || "Page" },
      ];
  const heroActions = page.actions.map((action) => ({
    label: action.label,
    to: action.to,
    href: action.href,
    primary: action.primary,
  }));

  const heroMeta = page.stats.length ? (
    <div className="flex flex-wrap gap-2">
      {page.stats.map((stat) => (
        <div
          key={`${stat.label}-${stat.value}`}
          className="salt-editorial-meta inline-flex items-baseline gap-2 px-3 py-1 text-xs"
        >
          <span className="font-semibold text-muted-foreground">{stat.label}</span>
          <span className="font-semibold text-foreground">{stat.value}</span>
        </div>
      ))}
    </div>
  ) : null;

  const heroAside = (
    <>
      <div>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-primary">{page.accent.label}</p>
        <h2 className="mt-2 font-display text-[1.35rem] leading-[1.02] text-foreground">{page.accent.title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{page.accent.body}</p>
      </div>

      {!isResourcePage ? (
        <div>
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">Snapshot</p>
          <div className="mt-3 space-y-3">
            {page.stats.map((stat) => (
              <div key={stat.label} className="border-t border-border/70 pt-3">
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">{stat.label}</p>
                <p className="mt-0.5 font-display text-[1.2rem] leading-none text-foreground">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <ul className="space-y-2">
        {page.accent.bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-2 text-sm leading-6 text-foreground">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="text-muted-foreground">{bullet}</span>
          </li>
        ))}
      </ul>
    </>
  );

  return (
      <OpenContentPageShell
      breadcrumbs={breadcrumbs}
      kicker={page.kicker}
      title={page.title}
      summary={pageSummary}
      meta={heroMeta}
      aside={heroAside}
      actions={heroActions}
      className={pageSectionClassName}
      tone={isResourceHub ? "shop" : "default"}
    >
      {isResourcePage && resourceRouteTiles.length ? (
        <ResourceHubBrowseSection
          eyebrow={isResourceHub ? "Choose your path" : resourceContext.guide?.title || page.title}
          title={
            isResourceHub
              ? "What are you trying to solve?"
              : resourceContext.topic
                ? `What should the reader open next?`
                : `What lives inside ${page.title}?`
          }
          description={
            isResourceHub
              ? "Start with the reason you're here, not the category label. Each card stays tied to a real route, a real product cue, and a practical next click."
              : resourceContext.topic
                ? "These sibling pages keep the browse focused while still giving the reader a clear next step inside the same category family."
                : "Open the topic that best matches the shopper's intent, then use the route cards to move from overview to a more specific answer."
          }
          countLabel={
            isResourceHub
              ? `${resourceRouteTiles.length} starting points`
              : resourceContext.topic
                ? `${resourceRouteTiles.length} sibling routes`
                : `${resourceRouteTiles.length} topic routes`
          }
          ctaLabel={isResourceHub ? "Open guide" : resourceContext.topic ? "Open sibling" : "Open topic"}
          tiles={resourceRouteTiles}
        />
      ) : null}
      {page.introParagraphs?.length ? (
        <div className="max-w-3xl space-y-4 text-base leading-7 text-muted-foreground">
          {page.introParagraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      ) : null}

      {resourceFeaturedViews.length ? (
        <ResourceFeaturedShelf
          title={page.featuredProductsTitle || "Featured products"}
          description={page.featuredProductsDescription}
          products={resourceFeaturedViews}
        />
      ) : null}

      {!isResourcePage && page.cards?.length ? (
        <section className="mt-10">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary">
            {page.cardsTitle || "Related pages"}
          </p>
          {page.cardsDescription ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{page.cardsDescription}</p>
          ) : null}
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {page.cards.map((card) =>
              card.to ? (
                <Link
                  key={card.title}
                  to={card.to}
                  className="salt-surface group flex h-full items-center justify-between gap-4 rounded-[1.2rem] p-4 transition hover:-translate-y-0.5 hover:border-primary/20"
                >
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-foreground transition group-hover:text-primary">
                      {card.title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{card.detail}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              ) : (
                <div key={card.title} className="salt-surface rounded-[1.2rem] p-4">
                  <p className="text-base font-semibold text-foreground">{card.title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{card.detail}</p>
                </div>
              ),
            )}
          </div>
        </section>
      ) : null}

      {page.steps?.length ? (
        <section className="mt-10">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary">
            {page.stepsTitle || "How it works"}
          </p>
          {page.stepsDescription ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{page.stepsDescription}</p>
          ) : null}
          <div className="mt-4 grid gap-3">
            {page.steps.map((step) => (
              <div key={step.step} className="grid gap-2 border-t border-border/70 py-4 sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-4">
                <p className="font-display text-[1.15rem] leading-none text-primary">{step.step}</p>
                <div>
                  <p className="text-base font-semibold text-foreground">{step.title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!isResourceHub && page.chips?.length ? (
        <section className="mt-10">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary">
            {page.chipsTitle || "Browse cues"}
          </p>
          {page.chipsDescription ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{page.chipsDescription}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {page.chips.map((chip) => (
              <span
                key={chip}
                className="salt-editorial-meta inline-flex items-center px-3 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.08em]"
              >
                {chip}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {page.faqs?.length ? (
        <section className="mt-10">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary">
            {page.faqsTitle || "Frequently asked"}
          </p>
          {page.faqsDescription ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{page.faqsDescription}</p>
          ) : null}
          <Accordion type="single" collapsible className="salt-surface mt-4 rounded-[1.2rem] px-4">
            {page.faqs.map((faq, index) => (
              <AccordionItem
                key={faq.question}
                value={`faq-${index}`}
                className={index === page.faqs.length - 1 ? "border-none" : "border-b border-border/70"}
              >
                <AccordionTrigger className="py-4 text-left text-base font-semibold text-foreground hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="pb-4 text-sm leading-6 text-muted-foreground">{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      ) : null}
    </OpenContentPageShell>
  );
};

export default EditorialPageByHandle;
