import { Link } from "react-router-dom";
import { ChevronRight, Clock3, PackageSearch, PhoneCall, RotateCcw, Truck } from "lucide-react";
import InnerBreadcrumbs from "@/components/storefront/InnerBreadcrumbs";
import { LoadingState, ErrorState } from "@/components/storefront/LoadState";
import Reveal from "@/components/storefront/Reveal";
import SupportRouteCard from "@/components/support/SupportRouteCard";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useDocumentMetadata } from "@/components/support/useDocumentMetadata";
import { useEditorialPage } from "@/lib/shopify-data";
import { getRuntimeContext } from "@/lib/theme-assets";
import SeoMetadata from "@/components/storefront/SeoMetadata";
import { buildFaqStructuredData } from "@/lib/structured-data";

const runtimeContext = getRuntimeContext();
const supportEmail = runtimeContext.supportEmail || "support@saltonlinestore.com";
const supportPhone = "+1 888-835-7211";

const faqRoutes = [
  {
    title: "Track an order",
    description: "Open the order portal when shipping status is the main question.",
    badge: "Orders",
    icon: PackageSearch,
    to: "/track-order",
  },
  {
    title: "Shipping policy",
    description: "Review delivery timing, fulfillment notes, and shipping terms.",
    badge: "Shipping",
    icon: Truck,
    to: "/shipping-policy",
  },
  {
    title: "Refund policy",
    description: "See how returns, exchanges, and refund requests are handled.",
    badge: "Returns",
    icon: RotateCcw,
    to: "/refund-policy",
  },
  {
    title: "Contact support",
    description: "Send a message when the answer needs a person.",
    badge: "Help",
    icon: PhoneCall,
    to: "/pages/contact-us",
  },
] as const;

const actionBaseClass =
  "inline-flex h-11 items-center justify-center rounded-full border px-5 text-[0.7rem] font-bold uppercase tracking-[0.08em] transition hover:-translate-y-[1px]";

function renderAction(action: { label: string; to?: string; href?: string; primary?: boolean }) {
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

const FaqPage = () => {
  const { data, isLoading, error, refetch } = useEditorialPage("faq");
  const page = data?.page;

  useDocumentMetadata(
    page?.seoTitle || "FAQ | SALT Online Store",
    page?.metaDescription || page?.summary || "Quick answers to the most common store and shipping questions.",
    { canonicalPath: "/pages/faq" },
  );

  if (isLoading) {
    return <LoadingState title="Loading FAQ" subtitle="Fetching the support answers." />;
  }

  if (error || !page) {
    return (
      <ErrorState
        title="FAQ unavailable"
        subtitle="Please retry to refresh the FAQ page."
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

  const breadcrumbs = [
    { label: "Home", to: "/" },
    { label: "FAQ" },
  ];

  const stats = page.stats || [];
  const chips = page.chips || [];
  const faqCountLabel = `${page.faqs?.length || 0} answers`;
  const faqStructuredData = buildFaqStructuredData(
    page.faqs,
    typeof window === "undefined" ? "" : window.location.origin,
  );

  return (
    <section className="mx-auto w-[min(1240px,calc(100%_-_20px))] pb-16 pt-4 sm:pb-18 sm:pt-5">
      <SeoMetadata structuredData={[faqStructuredData]} scope="faq-page" />
      <InnerBreadcrumbs items={breadcrumbs} />

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.12fr)_minmax(19rem,0.88fr)]">
        <Reveal>
          <div className="salt-editorial-shell rounded-[2rem] p-3 sm:p-4">
            <div className="salt-panel-shell rounded-[1.7rem] p-4 sm:p-6 lg:p-7">
              <div className="max-w-4xl">
                <p className="salt-kicker">{page.kicker || "Support"}</p>
                <h1 className="mt-3 font-display text-[clamp(2.5rem,6vw,4.8rem)] leading-[0.9] tracking-[-0.06em] text-foreground">
                  {page.title}
                </h1>
                <p className="mt-4 max-w-3xl text-[0.98rem] leading-7 text-muted-foreground sm:text-base">
                  {page.summary}
                </p>

                {stats.length ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {stats.map((stat) => (
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

                {page.actions?.length ? <div className="mt-6 flex flex-wrap gap-3">{page.actions.map(renderAction)}</div> : null}

                {chips.length ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {chips.slice(0, 5).map((chip) => (
                      <span
                        key={chip}
                        className="salt-outline-chip h-9 px-3 py-0 text-[0.68rem] font-semibold uppercase tracking-[0.08em]"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delayMs={80}>
          <aside className="salt-section-shell rounded-[1.7rem] p-4 sm:p-5 lg:sticky lg:top-24">
            <p className="salt-kicker">{page.accent?.label || "Need to know"}</p>
            <h2 className="mt-2 font-display text-[clamp(1.5rem,2.7vw,2.15rem)] leading-[1.02] text-foreground">
              {page.accent?.title || "Short answers for faster decisions"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {page.accent?.body || "Use this page when a shopper needs clarification before moving to the next step."}
            </p>

            <div className="mt-4 space-y-3">
              {(page.accent?.bullets || []).map((bullet) => (
                <div
                  key={bullet}
                  className="flex items-start gap-2 rounded-[1.05rem] border border-border/65 bg-background/86 px-3 py-2.5"
                >
                  <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
                  <span className="text-sm leading-6 text-foreground/90">{bullet}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-[1.2rem] border border-border/65 bg-[linear-gradient(180deg,hsl(var(--background)/0.98),hsl(var(--card)/0.92))] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.58rem] font-bold uppercase tracking-[0.16em] text-primary/80">Need a quicker answer?</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Use email or order tracking when you do not need the full message form.
                  </p>
                </div>
                <Clock3 className="h-4.5 w-4.5 shrink-0 text-primary" />
              </div>

              <div className="mt-4 space-y-2">
                <a
                  href={`mailto:${supportEmail}`}
                  className="flex items-center justify-between rounded-[0.95rem] border border-border/65 bg-background px-3 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/20 hover:text-primary"
                >
                  <span className="min-w-0 truncate">Email support</span>
                  <ChevronRight className="h-4 w-4 shrink-0" />
                </a>
                <Link
                  to="/track-order"
                  className="flex items-center justify-between rounded-[0.95rem] border border-border/65 bg-background px-3 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/20 hover:text-primary"
                >
                  <span className="min-w-0 truncate">Track order</span>
                  <ChevronRight className="h-4 w-4 shrink-0" />
                </Link>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <div className="rounded-[0.95rem] border border-border/65 bg-background/90 px-3 py-2.5">
                  <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Response target</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">Within 24 business hours</p>
                </div>
                <div className="rounded-[0.95rem] border border-border/65 bg-background/90 px-3 py-2.5">
                  <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Direct line</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{supportPhone}</p>
                </div>
              </div>
            </div>
          </aside>
        </Reveal>
      </div>

      <section className="mt-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="salt-kicker">Start here</p>
            <h2 className="mt-2 font-display text-[clamp(1.5rem,3vw,2.2rem)] leading-[0.96] text-foreground">
              What are you trying to solve?
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Choose the route that matches the task before you read the answer.
            </p>
          </div>

          <div className="salt-editorial-meta inline-flex h-9 items-center rounded-full px-3 text-[0.62rem] font-semibold uppercase tracking-[0.12em]">
            {faqRoutes.length} quick routes
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {faqRoutes.map((route) => (
            <SupportRouteCard
              key={route.title}
              title={route.title}
              description={route.description}
              badge={route.badge}
              icon={route.icon}
              to={route.to}
            />
          ))}
        </div>
      </section>

      <section className="mt-4">
        <div className="salt-section-shell rounded-[1.85rem] p-4 sm:p-5 lg:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary">
                {page.faqsTitle || "Common questions"}
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {page.faqsDescription || "Short answers people usually need before they order."}
              </p>
            </div>
            <div className="salt-editorial-meta inline-flex h-9 items-center rounded-full px-3 text-[0.62rem] font-semibold uppercase tracking-[0.12em]">
              {faqCountLabel}
            </div>
          </div>

          <Accordion type="single" collapsible defaultValue="faq-0" className="mt-4">
            {page.faqs.map((faq, index) => (
              <AccordionItem
                key={faq.question}
                value={`faq-${index}`}
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

      <div className="salt-editorial-shell mt-4 rounded-[1.5rem] p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="salt-kicker">Still need help?</p>
            <h3 className="mt-2 font-display text-[clamp(1.4rem,2.2vw,1.85rem)] leading-[1.02] text-foreground">
              Move to the fastest next step instead of guessing.
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The FAQ handles the common case. When the answer needs a person or a live lookup, these routes keep the flow simple.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {[
              { label: "Contact us", to: "/pages/contact-us", primary: true },
              { label: "Track order", to: "/track-order" },
              { label: "Resource Hub", to: "/shop?resource=hub" },
            ].map(renderAction)}
          </div>
        </div>
      </div>
    </section>
  );
};

export default FaqPage;
