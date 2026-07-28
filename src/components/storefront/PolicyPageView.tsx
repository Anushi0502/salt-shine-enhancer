import { Link } from "react-router-dom";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import OpenContentPageShell, { type OpenPageAction } from "@/components/storefront/OpenContentPageShell";
import SeoMetadata from "@/components/storefront/SeoMetadata";
import { sanitizeRichHtml } from "@/lib/formatters";
import { usePolicyPage } from "@/lib/shopify-data";

type PolicyPageKey = "privacy" | "refund" | "shipping" | "contact";

type PolicyPageViewProps = {
  policyKey: PolicyPageKey;
  actions: OpenPageAction[];
};

const POLICY_META: Record<PolicyPageKey, { path: string; fallbackTitle: string }> = {
  privacy: {
    path: "/policies/privacy-policy",
    fallbackTitle: "Privacy policy",
  },
  refund: {
    path: "/policies/refund-policy",
    fallbackTitle: "Refund policy",
  },
  shipping: {
    path: "/policies/shipping-policy",
    fallbackTitle: "Shipping policy",
  },
  contact: {
    path: "/policies/contact-information",
    fallbackTitle: "Contact information",
  },
};

function formatSourceLabel(source: string): string {
  if (String(source || "").startsWith("archive:")) {
    return "Archived Shopify baseline";
  }

  return "Live Shopify policy";
}

const PolicyPageView = ({ policyKey, actions }: PolicyPageViewProps) => {
  const policyMeta = POLICY_META[policyKey];
  const { data, isLoading, error, refetch } = usePolicyPage(policyMeta.path, policyMeta.fallbackTitle);
  const seoTitle = `${policyMeta.fallbackTitle.replace(/\b\w/g, (char) => char.toUpperCase())} | SALT Online Store`;
  const seoDescription =
    "Clear, readable policy details for shipping, returns, privacy, and customer support.";
  const seoMetadata = (
    <SeoMetadata
      title={seoTitle}
      description={seoDescription}
      canonicalPath={policyMeta.path}
      ogType="article"
    />
  );

  if (isLoading) {
    return (
      <>
        {seoMetadata}
        <LoadingState
          title={`Loading ${policyMeta.fallbackTitle}`}
          subtitle="Fetching the latest policy details from Shopify."
        />
      </>
    );
  }

  if (error || !data?.bodyHtml) {
    return (
      <>
        {seoMetadata}
        <ErrorState
          title={`${policyMeta.fallbackTitle} unavailable`}
          subtitle="Live policy content could not be loaded right now. Please retry."
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
      </>
    );
  }

  const bodyHtml = sanitizeRichHtml(data.bodyHtml);
  const sourceLabel = formatSourceLabel(data.source);
  const updatedAtLabel = new Date(data.generatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const heroMeta = (
    <div className="flex flex-wrap gap-2">
      <span className="salt-editorial-meta">
        {sourceLabel}
      </span>
      <span className="salt-editorial-meta">
        Updated {updatedAtLabel}
      </span>
    </div>
  );

  const heroAside = (
    <>
      <div>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-primary">Policy guide</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The page keeps policy language readable and easy to scan, with the Shopify source wrapped in a simpler shell.
        </p>
      </div>

      <div>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">Helpful routes</p>
        <div className="mt-3 grid gap-2">
          {actions.slice(0, 3).map((action) =>
            action.to ? (
              <Link
                key={action.label}
                to={action.to}
                className="inline-flex items-center justify-between border-t border-border/70 py-3 text-sm font-semibold text-foreground transition hover:border-primary/30 hover:text-primary"
              >
                {action.label}
              </Link>
            ) : (
              <a
                key={action.label}
                href={action.href || "/"}
                className="inline-flex items-center justify-between border-t border-border/70 py-3 text-sm font-semibold text-foreground transition hover:border-primary/30 hover:text-primary"
              >
                {action.label}
              </a>
            ),
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
      {seoMetadata}
      <OpenContentPageShell
        breadcrumbs={[
          { label: "Home", to: "/" },
          { label: "Policies" },
          { label: policyMeta.fallbackTitle },
        ]}
        kicker="Legal"
        title={data.title}
        summary="Clear, readable policy details for shipping, returns, privacy, and customer support."
        meta={heroMeta}
        aside={heroAside}
        actions={actions}
      >
        <article
          className="prose prose-sm max-w-none leading-[1.74] text-foreground dark:prose-invert prose-headings:font-display prose-headings:text-foreground prose-a:text-primary prose-strong:text-foreground prose-li:text-foreground prose-p:text-muted-foreground prose-table:block prose-table:w-full prose-table:overflow-x-auto prose-table:border prose-table:border-border/70 prose-th:border prose-th:border-border/70 prose-th:bg-background/90 prose-th:px-3 prose-th:py-2 prose-td:border prose-td:border-border/70 prose-td:px-3 prose-td:py-2 prose-img:rounded-2xl prose-img:border prose-img:border-border/70"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      </OpenContentPageShell>
    </>
  );
};

export default PolicyPageView;
