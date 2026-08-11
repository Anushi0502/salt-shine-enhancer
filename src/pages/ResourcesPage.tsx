import { useMemo } from "react";
import { ChevronRight, Clock3 } from "lucide-react";
import { Link } from "react-router-dom";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import InnerBreadcrumbs from "@/components/storefront/InnerBreadcrumbs";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import Reveal from "@/components/storefront/Reveal";
import ResourceGuideCard from "@/components/resources/ResourceGuideCard";
import ResourceProductCard from "@/components/resources/ResourceProductCard";
import { useDocumentMetadata } from "@/components/support/useDocumentMetadata";
import { buildResourceReason } from "@/lib/editorial-pages";
import { RESOURCE_HUB_HUB_FEATURED_PRODUCTS } from "@/lib/resource-hub-data";
import { conciseTitle, formatMoney, minPrice, productImage } from "@/lib/formatters";
import { useEditorialPage, useProductSearchIndex } from "@/lib/shopify-data";
import { useJudgeMeRatings } from "@/lib/judgeme";
import { buildResourceRoute, SITE_RESOURCE_GUIDES, getCollectionByHandle } from "@/lib/site-navigation";
import type { ShopifyProduct } from "@/types/shopify";

type ResourceAction = {
  label: string;
  to?: string;
  href?: string;
  primary?: boolean;
};

type ResourceProductView = {
  product: ShopifyProduct;
  productId: number;
  handle: string;
  title: string;
  reason: string;
  image: string | null;
  price: string;
  label: string;
  to: string;
};

const actionBaseClass =
  "inline-flex h-11 items-center justify-center rounded-full border px-5 text-[0.7rem] font-bold uppercase tracking-[0.08em] transition hover:-translate-y-[1px]";

function renderAction(action: ResourceAction) {
  const actionClass = action.primary
    ? `${actionBaseClass} salt-primary-cta border-transparent text-white shadow-[0_18px_30px_-24px_rgba(37,99,235,0.5)]`
    : `${actionBaseClass} salt-outline-chip border-border text-foreground hover:text-primary`;

  if (action.href) {
    const external = /^https?:\/\//i.test(action.href);

    return (
      <a
        key={action.label}
        href={action.href}
        className={actionClass}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
      >
        {action.label}
      </a>
    );
  }

  return (
    <Link key={action.label} to={action.to || "/"} className={actionClass}>
      {action.label}
    </Link>
  );
}

function getCollectionLabel(collectionRoute?: string | null) {
  const rawHandle = String(collectionRoute || "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/^collections\//, "");

  if (!rawHandle) {
    return "";
  }

  return getCollectionByHandle(rawHandle)?.title || rawHandle.replace(/-/g, " ");
}

function buildGuideViews() {
  return SITE_RESOURCE_GUIDES.map((guide, index) => {
    return {
      title: guide.title,
      summary: guide.summary,
      to: buildResourceRoute(guide.handle),
      collectionLabel: getCollectionLabel(guide.collectionRoute) || "Collection route",
      topicCount: guide.topics.length,
      topicPreview: guide.topics.slice(0, 3).map((topic) => topic.title),
      featured: index === 0,
    };
  });
}

function buildFeaturedProductViews(pageTitle: string, productsByHandle: Map<string, ShopifyProduct>) {
  return RESOURCE_HUB_HUB_FEATURED_PRODUCTS.flatMap((entry) => {
    const product = productsByHandle.get(entry.handle);
    if (!product) {
      return [];
    }

    return [
      {
        product,
        productId: product.id,
        handle: entry.handle,
        title: conciseTitle(product.title, 56),
        reason: buildResourceReason(product.title, pageTitle),
        image: productImage(product),
        price: formatMoney(minPrice(product)),
        label: conciseTitle(product.product_type || "Catalog pick", 28),
        to: `/products/${product.handle}`,
      } satisfies ResourceProductView,
    ];
  });
}

const ResourcesPage = () => {
  const { data, isLoading, error, refetch } = useEditorialPage("resources");
  const { data: productsData } = useProductSearchIndex();
  const page = data?.page;

  useDocumentMetadata(
    page?.seoTitle || "Resource Hub | SALT Online Store",
    page?.metaDescription || page?.summary || "A calm resource hub that points shoppers to the right guide, topic, and product.",
  );

  const productsByHandle = useMemo(() => {
    return new Map((productsData?.products || []).map((product) => [product.handle, product]));
  }, [productsData?.products]);

  const guideViews = useMemo(() => buildGuideViews(), []);
  const featuredProducts = useMemo(
    () => buildFeaturedProductViews(page?.title || "Resource Hub", productsByHandle).slice(0, 3),
    [page?.title, productsByHandle],
  );
  const featuredRatingsQuery = useJudgeMeRatings(featuredProducts.map((product) => product.productId));
  const featuredRatingsById = featuredRatingsQuery.data || {};

  if (isLoading) {
    return <LoadingState title="Loading Resource Hub" subtitle="Building the AEO/GEO resource hub." />;
  }

  if (error || !page) {
    return (
      <ErrorState
        title="Resource Hub unavailable"
        subtitle="Please retry to refresh the resources page."
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

  const breadcrumbs = page.breadcrumbs?.length
    ? page.breadcrumbs
    : [
        { label: "Home", to: "/" },
        { label: page.title || "Resource Hub" },
      ];

  const heroActions: ResourceAction[] = (page.actions?.length
    ? page.actions.map((action) =>
        action.label === "Browse the guides"
          ? { ...action, href: "#resource-guides", to: undefined }
          : action,
      )
    : [
        { label: "Browse the guides", href: "#resource-guides", primary: true },
        { label: "Shop the catalog", to: "/shop" },
        { label: "Contact us", to: "/contact" },
      ]) as ResourceAction[];

  return (
    <section className="mx-auto w-[min(1240px,calc(100%_-_20px))] pb-16 pt-4 sm:pb-18 sm:pt-5">
      <InnerBreadcrumbs items={breadcrumbs} />

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.12fr)_minmax(19rem,0.88fr)]">
        <Reveal>
          <div className="salt-editorial-shell rounded-[2rem] p-3 sm:p-4">
            <div className="salt-panel-shell rounded-[1.7rem] p-4 sm:p-6 lg:p-7">
              <div className="max-w-4xl">
                <p className="salt-kicker">{page.kicker || "Resource Hub"}</p>
                <h1 className="mt-3 font-display text-[clamp(2.45rem,5.8vw,4.9rem)] leading-[0.9] tracking-[-0.06em] text-foreground">
                  {page.title}
                </h1>
                <p className="mt-4 max-w-3xl text-[0.98rem] leading-7 text-muted-foreground sm:text-base">
                  {page.summary}
                </p>

                {page.stats?.length ? (
                  <div className="mt-5 flex flex-wrap gap-2">
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
                ) : null}

                {heroActions.length ? <div className="mt-6 flex flex-wrap gap-3">{heroActions.map(renderAction)}</div> : null}

                {page.chips?.length ? (
                  <div className="mt-5">
                    <p className="text-[0.58rem] font-bold uppercase tracking-[0.16em] text-primary/80">
                      {page.chipsTitle || "Search cues"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {page.chipsDescription || "The topics behind the hub pages."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {page.chips.slice(0, 6).map((chip) => (
                        <span
                          key={chip}
                          className="salt-outline-chip h-9 px-3 py-0 text-[0.68rem] font-semibold uppercase tracking-[0.08em]"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delayMs={80}>
          <aside className="salt-section-shell rounded-[1.7rem] p-4 sm:p-5 lg:sticky lg:top-24">
            <div className="rounded-[1.2rem] border border-border/65 bg-background/92 p-4">
              <p className="text-[0.58rem] font-bold uppercase tracking-[0.16em] text-primary/80">
                {page.accent?.label || "Why this exists"}
              </p>
              <h2 className="mt-2 font-display text-[clamp(1.55rem,2.6vw,2.15rem)] leading-[1.02] text-foreground">
                {page.accent?.title || "Built for people who need a clear next step"}
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {page.accent?.body || "The Resource Hub gives shoppers and answer engines one calm place to start."}
              </p>

              {page.accent?.bullets?.length ? (
                <div className="mt-4 space-y-2">
                  {page.accent.bullets.map((bullet) => (
                    <div
                      key={bullet}
                      className="flex items-start gap-2 rounded-[1rem] border border-border/65 bg-background px-3 py-2.5"
                    >
                      <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
                      <span className="text-sm leading-6 text-foreground/90">{bullet}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="mt-4 rounded-[1.2rem] border border-border/65 bg-background/92 p-4">
              <p className="text-[0.58rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">How it works</p>
              <div className="mt-2 space-y-2 text-sm leading-6 text-muted-foreground">
                {(page.introParagraphs || []).slice(0, 2).map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </div>

          </aside>
        </Reveal>
      </div>

      <div className="salt-editorial-shell mt-4 rounded-[1.6rem] p-4 sm:p-5 lg:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3">
              <p className="text-[0.58rem] font-bold uppercase tracking-[0.16em] text-primary/80">Need a quicker answer?</p>
              <Clock3 className="h-4.5 w-4.5 shrink-0 text-primary" />
            </div>
            <h2 className="mt-2 font-display text-[clamp(1.55rem,2.5vw,2.1rem)] leading-[1.02] text-foreground">
              Use a direct support route when the guide needs a human handoff.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Jump to the fastest next step instead of pushing a guide past its natural finish point.
            </p>
          </div>

          <div className="grid w-full gap-3 sm:grid-cols-3 xl:max-w-3xl xl:flex-1">
            {[
              { label: "Browse FAQ", to: "/faq" },
              { label: "Contact support", to: "/contact" },
              { label: "Track order", to: "/track-order" },
            ].map((action) => (
              <Link
                key={action.label}
                to={action.to}
                className="flex h-12 w-full items-center justify-between rounded-[0.95rem] border border-border/65 bg-background px-4 text-sm font-semibold text-foreground transition hover:border-primary/20 hover:text-primary"
              >
                <span className="min-w-0 truncate">{action.label}</span>
                <ChevronRight className="h-4 w-4 shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      </div>

      <section id="resource-guides" className="mt-4 scroll-mt-24">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="salt-kicker">Browse by guide</p>
            <h2 className="mt-2 font-display text-[clamp(1.5rem,3vw,2.2rem)] leading-[0.96] text-foreground">
              {page.cardsTitle || "Choose your path"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {page.cardsDescription || "Start from the task, not the category label."}
            </p>
          </div>

          <div className="salt-editorial-meta inline-flex h-9 items-center rounded-full px-3 text-[0.62rem] font-semibold uppercase tracking-[0.12em]">
            {guideViews.length} guides
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {guideViews.map((guide) => (
            <ResourceGuideCard
              key={guide.title}
              title={guide.title}
              summary={guide.summary}
              to={guide.to}
              collectionLabel={guide.collectionLabel}
              topicCount={guide.topicCount}
              topicPreview={guide.topicPreview}
              featured={guide.featured}
              className={guide.featured ? "xl:col-span-2" : undefined}
            />
          ))}
        </div>
      </section>

      {featuredProducts.length ? (
        <section className="mt-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="salt-kicker">Real catalog anchors</p>
              <h2 className="mt-2 font-display text-[clamp(1.5rem,3vw,2.15rem)] leading-[0.96] text-foreground">
                {page.featuredProductsTitle || "Useful starting products"}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {page.featuredProductsDescription || "A calm cross-category set that represents the hub's most useful routes."}
              </p>
            </div>

            <div className="salt-editorial-meta inline-flex h-9 items-center rounded-full px-3 text-[0.62rem] font-semibold uppercase tracking-[0.12em]">
              {featuredProducts.length} picks
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featuredProducts.map((product) => (
              <ResourceProductCard
                key={product.handle}
                product={product.product}
                reviewSummary={featuredRatingsById[product.productId] ?? null}
              />
            ))}
          </div>
        </section>
      ) : null}

      {page.faqs?.length ? (
        <section className="mt-4">
          <div className="salt-section-shell rounded-[1.85rem] p-4 sm:p-5 lg:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="salt-kicker">Common questions</p>
                <h2 className="mt-2 font-display text-[clamp(1.45rem,2.7vw,2.1rem)] leading-[0.96] text-foreground">
                  {page.faqsTitle || "Common questions"}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {page.faqsDescription || "Short answers that help shoppers and answer engines move faster."}
                </p>
              </div>
              <div className="salt-editorial-meta inline-flex h-9 items-center rounded-full px-3 text-[0.62rem] font-semibold uppercase tracking-[0.12em]">
                {page.faqs.length} answers
              </div>
            </div>

            <Accordion type="single" collapsible defaultValue="resource-faq-0" className="mt-4">
              {page.faqs.map((faq, index) => (
                <AccordionItem
                  key={faq.question}
                  value={`resource-faq-${index}`}
                  className="mb-3 overflow-hidden rounded-[1.25rem] border border-border/65 border-b-0 bg-background/92 px-4 data-[state=open]:border-primary/20 data-[state=open]:shadow-[0_16px_28px_-24px_rgba(15,23,42,0.18)] last:mb-0"
                >
                  <AccordionTrigger className="py-4 text-left text-[0.98rem] font-semibold leading-6 text-foreground no-underline hover:no-underline [&>svg]:text-primary">
                    <span className="flex min-w-0 items-start gap-3">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/90 text-[0.58rem] font-bold uppercase tracking-[0.12em] text-primary">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0">{faq.question}</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 pl-9 text-sm leading-7 text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      ) : null}
    </section>
  );
};

export default ResourcesPage;
