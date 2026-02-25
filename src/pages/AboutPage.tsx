import Reveal from "@/components/storefront/Reveal";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { sanitizeRichHtml } from "@/lib/formatters";
import { useAboutPage } from "@/lib/shopify-data";
import { Link } from "react-router-dom";

const aboutHighlights = [
  { label: "Active catalog", value: "700+ products" },
  { label: "Weekly refresh", value: "New arrivals every week" },
  { label: "Support response", value: "Within 24 business hours" },
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
    <section className="mx-auto mt-8 w-[min(1100px,94vw)] pb-8">
      <Reveal>
        <div className="rounded-[2rem] border border-border/80 bg-card p-6 shadow-soft sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">About SALT</p>
          <h1 className="mt-1 font-display text-[clamp(2rem,4vw,3.3rem)] leading-[0.95]">{title}</h1>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {aboutHighlights.map((item) => (
              <p
                key={item.label}
                className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground"
              >
                <span className="block font-semibold text-foreground">{item.label}</span>
                <span>{item.value}</span>
              </p>
            ))}
          </div>

          {bodyHtml ? (
            <article
              className="prose prose-sm mt-5 max-w-none leading-7 text-foreground prose-headings:font-display prose-headings:text-foreground prose-a:text-primary prose-strong:text-foreground prose-li:text-foreground prose-p:text-foreground"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          ) : (
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
              About content is currently unavailable.
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              to="/shop"
              className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-xs font-bold uppercase tracking-[0.08em] text-primary-foreground hover:brightness-110"
            >
              Explore products
            </Link>
            <Link
              to="/blog"
              className="inline-flex h-11 items-center rounded-full border border-border bg-background px-5 text-xs font-bold uppercase tracking-[0.08em] hover:border-primary/50"
            >
              Read our blog
            </Link>
            <Link
              to="/contact"
              className="inline-flex h-11 items-center rounded-full border border-border bg-background px-5 text-xs font-bold uppercase tracking-[0.08em] hover:border-primary/50"
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
