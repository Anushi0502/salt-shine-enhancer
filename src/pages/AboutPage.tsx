import { Link } from "react-router-dom";
import OpenContentPageShell from "@/components/storefront/OpenContentPageShell";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import SeoMetadata from "@/components/storefront/SeoMetadata";
import { sanitizeRichHtml } from "@/lib/formatters";
import { SALT_BRAND_DESCRIPTION } from "@/lib/salt-brand";
import { useAboutPage } from "@/lib/shopify-data";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently updated";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const AboutPage = () => {
  const { data, isLoading, error, refetch } = useAboutPage();

  if (isLoading) {
    return (
      <LoadingState
        title="Loading About"
        subtitle="Fetching the about page content."
      />
    );
  }

  if (error || !data?.page) {
    return (
      <ErrorState
        title="About page unavailable"
        subtitle="Please retry to refresh the page content."
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

  const cleanedBodyHtml = sanitizeRichHtml(data.page.bodyHtml);
  const updatedLabel = formatDate(data.page.updatedAt);
  const seoMetadata = (
    <SeoMetadata
      title="About SALT Online Store"
      description={SALT_BRAND_DESCRIPTION}
      canonicalPath="/pages/about-us"
    />
  );

  const heroMeta = (
    <div className="flex flex-wrap gap-2">
      <span className="salt-editorial-meta">
        Browse
      </span>
      <span className="salt-editorial-meta">
        Save
      </span>
      <span className="salt-editorial-meta">
        Checkout
      </span>
    </div>
  );

  const heroAside = (
    <>
      <div>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-primary">Story note</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The Shopify page title stays as supporting copy while the headline follows the cart-to-heart shopping flow.
        </p>
        <p className="mt-3 font-display text-[1.15rem] leading-[1.05] text-foreground">{data.page.title}</p>
      </div>

      <div>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">Quick links</p>
        <div className="mt-3 grid gap-2">
          <Link
            to="/collections"
            className="inline-flex items-center justify-between border-t border-border/70 py-3 text-sm font-semibold text-foreground transition hover:border-primary/30 hover:text-primary"
          >
            Browse collections
          </Link>
          <Link
            to="/wishlist"
            className="inline-flex items-center justify-between border-t border-border/70 py-3 text-sm font-semibold text-foreground transition hover:border-primary/30 hover:text-primary"
          >
            Open wishlist
          </Link>
          <Link
            to="/cart"
            className="inline-flex items-center justify-between border-t border-border/70 py-3 text-sm font-semibold text-foreground transition hover:border-primary/30 hover:text-primary"
          >
            View cart
          </Link>
        </div>
      </div>

      <div>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">Last refreshed</p>
        <p className="mt-2 text-sm leading-6 text-foreground">{updatedLabel}</p>
      </div>
    </>
  );

  return (
    <>
      {seoMetadata}
      <OpenContentPageShell
      breadcrumbs={[
        { label: "Home", to: "/" },
        { label: "About SALT" },
      ]}
      kicker="About SALT"
      title="From cart to heart, practical products stay easy to choose"
      summary="SALT keeps useful products easy to find, easy to save, and easy to buy so the shopping path feels calm from start to finish."
      meta={heroMeta}
      aside={heroAside}
      actions={[
        { label: "Shop the catalog", to: "/shop", primary: true },
        { label: "Open wishlist", to: "/wishlist" },
        { label: "View cart", to: "/cart" },
      ]}
    >
      <article className="prose prose-sm max-w-none leading-[1.74] text-foreground dark:prose-invert prose-headings:font-display prose-headings:text-foreground prose-a:text-primary prose-strong:text-foreground prose-li:text-foreground prose-p:text-muted-foreground prose-img:rounded-2xl prose-img:border prose-img:border-border/70">
        <section className="not-prose mb-6 rounded-[1.25rem] border border-primary/15 bg-primary/[0.035] p-4 sm:p-5">
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-primary">What SALT is</p>
          <p className="mt-2 text-sm leading-7 text-foreground">{SALT_BRAND_DESCRIPTION}</p>
        </section>
        <div dangerouslySetInnerHTML={{ __html: cleanedBodyHtml }} />
      </article>
      </OpenContentPageShell>
    </>
  );
};

export default AboutPage;
