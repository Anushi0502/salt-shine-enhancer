import { Link } from "react-router-dom";
import OpenContentPageShell from "@/components/storefront/OpenContentPageShell";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { sanitizeRichHtml } from "@/lib/formatters";
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

  const heroMeta = (
    <div className="flex flex-wrap gap-2">
      <span className="inline-flex items-center rounded-full border border-[#bfd4fb] bg-white px-3 py-1 text-xs font-semibold text-[#102A43]">
        Founded 2024
      </span>
      <span className="inline-flex items-center rounded-full border border-[#bfd4fb] bg-white px-3 py-1 text-xs font-semibold text-[#102A43]">
        Courtney R. Jones
      </span>
      <span className="inline-flex items-center rounded-full border border-[#bfd4fb] bg-white px-3 py-1 text-xs font-semibold text-[#102A43]">
        Mission-led retail
      </span>
    </div>
  );

  const heroAside = (
    <>
      <div>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-primary">Story note</p>
        <p className="mt-2 text-sm leading-6 text-[#5C748F]">
          The Shopify page title is kept as supporting copy, not the main headline, so the page feels like SALT.
        </p>
        <p className="mt-3 font-display text-[1.15rem] leading-[1.05] text-[#102A43]">{data.page.title}</p>
      </div>

      <div>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[#5C748F]">Quick links</p>
        <div className="mt-3 grid gap-2">
          <Link
            to="/collections"
            className="inline-flex items-center justify-between border-t border-[#d8e6f5] py-3 text-sm font-semibold text-[#102A43] transition hover:border-[#bcd4ef] hover:text-primary"
          >
            Browse collections
          </Link>
          <Link
            to="/resources"
            className="inline-flex items-center justify-between border-t border-[#d8e6f5] py-3 text-sm font-semibold text-[#102A43] transition hover:border-[#bcd4ef] hover:text-primary"
          >
            Resource hub
          </Link>
          <Link
            to="/contact"
            className="inline-flex items-center justify-between border-t border-[#d8e6f5] py-3 text-sm font-semibold text-[#102A43] transition hover:border-[#bcd4ef] hover:text-primary"
          >
            Contact us
          </Link>
        </div>
      </div>

      <div>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[#5C748F]">Last refreshed</p>
        <p className="mt-2 text-sm leading-6 text-[#102A43]">{updatedLabel}</p>
      </div>
    </>
  );

  return (
    <OpenContentPageShell
      breadcrumbs={[
        { label: "Home", to: "/" },
        { label: "About SALT" },
      ]}
      kicker="About SALT"
      title="A calmer way to shop for practical products"
      summary="SALT started as a mission-led extension of Senior and Living Today Services, LLC. The goal stays simple: keep useful products easy to find, easy to trust, and easy to buy."
      meta={heroMeta}
      aside={heroAside}
      actions={[
        { label: "Shop the catalog", to: "/shop", primary: true },
        { label: "Resource hub", to: "/resources" },
        { label: "Contact us", to: "/contact" },
      ]}
    >
      <article
        className="prose prose-sm max-w-none leading-[1.74] text-[#102A43] dark:prose-invert prose-headings:font-display prose-headings:text-[#102A43] prose-a:text-primary prose-strong:text-[#102A43] prose-li:text-[#102A43] prose-p:text-[#314861] prose-img:rounded-2xl prose-img:border prose-img:border-[#d8e6f5]"
        dangerouslySetInnerHTML={{ __html: cleanedBodyHtml }}
      />
    </OpenContentPageShell>
  );
};

export default AboutPage;
