import Reveal from "@/components/storefront/Reveal";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { sanitizeRichHtml } from "@/lib/formatters";
import { useAboutPage } from "@/lib/shopify-data";
import { Link } from "react-router-dom";
import { BadgeCheck, ShieldCheck, Truck } from "lucide-react";

const aboutHighlights = [
  { label: "Active catalog", value: "700+ products" },
  { label: "Weekly refresh", value: "New arrivals every week" },
  { label: "Support response", value: "Within 24 business hours" },
];

const aboutPillars = [
  {
    title: "Curated with purpose",
    detail: "The assortment is shaped around products that feel useful, giftable, and easy to choose.",
    Icon: BadgeCheck,
  },
  {
    title: "Clear buying experience",
    detail: "Pricing, support, and checkout cues stay visible so the purchase path feels confident.",
    Icon: ShieldCheck,
  },
  {
    title: "Transparent delivery",
    detail: "Shipping guidance and policy access are kept close to the shopping experience.",
    Icon: Truck,
  },
];

const AboutPage = () => {
  const { data, isLoading, error, refetch } = useAboutPage();

  if (isLoading) {
    return (
      <LoadingState
        title="Loading About"
        subtitle="Fetching the latest About content from Shopify."
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        title="About page unavailable"
        subtitle="Please retry to refresh content from Shopify."
        action={
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
          >
            Retry
          </button>
        }
      />
    );
  }

  const title = data?.page.title || "About SALT";
  const bodyHtml = sanitizeRichHtml(data?.page.bodyHtml || "");

  return (
    <section className="mx-auto mt-5 w-[min(1100px,calc(100%-20px))] pb-8 sm:mt-6">
      <Reveal>
        <div className="salt-panel-shell rounded-[1.55rem] p-4 sm:rounded-[1.9rem] sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">About SALT</p>
          <h1 className="mt-1 font-display text-[clamp(2rem,4vw,3.3rem)] leading-[0.95]">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            SALT Online Store brings together home, lifestyle, gifting, and everyday products in a cleaner, more curated shopping environment.
          </p>
          <div className="mt-4 hidden gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-3">
            {aboutHighlights.map((item) => (
              <p
                key={item.label}
                className="salt-kpi-card salt-metric-card rounded-xl px-3 py-2 text-xs text-muted-foreground"
              >
                <span className="block font-semibold text-foreground">{item.label}</span>
                <span>{item.value}</span>
              </p>
            ))}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {aboutPillars.map(({ title: pillarTitle, detail, Icon }) => (
              <div key={pillarTitle} className="salt-ambient-card salt-metric-card rounded-xl p-3">
                <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.1em] text-primary">
                  <Icon className="h-3.5 w-3.5" /> {pillarTitle}
                </p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
              </div>
            ))}
          </div>

          {bodyHtml ? (
            <article
              className="prose prose-sm mt-5 max-w-none rounded-2xl border border-border/70 bg-background/78 p-5 leading-[1.72] text-foreground dark:prose-invert prose-headings:font-display prose-headings:text-foreground prose-a:text-primary prose-strong:text-foreground prose-li:text-foreground prose-p:text-foreground"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          ) : (
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              About content is currently unavailable.
            </p>
          )}

          <div className="salt-section-shell mt-6 flex flex-col gap-2 rounded-2xl border border-border/70 bg-gradient-to-r from-background/90 to-primary/10 p-3 sm:flex-row sm:flex-wrap">
            <Link
              to="/shop"
              className="salt-primary-cta h-11 w-full px-5 text-xs font-bold uppercase tracking-[0.08em] sm:w-auto"
            >
              Shop the catalog
            </Link>
            <Link
              to="/blog"
              className="salt-outline-chip h-11 w-full px-5 py-0 text-xs sm:w-auto"
            >
              Read the journal
            </Link>
            <Link
              to="/contact"
              className="salt-outline-chip h-11 w-full px-5 py-0 text-xs sm:w-auto"
            >
              Contact support
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
};

export default AboutPage;
