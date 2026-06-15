import { Link } from "react-router-dom";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import OpenContentPageShell, { type OpenPageAction } from "@/components/storefront/OpenContentPageShell";
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

  if (isLoading) {
    return (
      <LoadingState
        title={`Loading ${policyMeta.fallbackTitle}`}
        subtitle="Fetching the latest policy details from Shopify."
      />
    );
  }

  if (error || !data?.bodyHtml) {
    return (
      <ErrorState
        title={`${policyMeta.fallbackTitle} unavailable`}
        subtitle="Live policy content could not be loaded right now. Please retry."
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

  const bodyHtml = sanitizeRichHtml(data.bodyHtml);
  const sourceLabel = formatSourceLabel(data.source);
  const updatedAtLabel = new Date(data.generatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const heroMeta = (
    <div className="flex flex-wrap gap-2">
      <span className="inline-flex items-center rounded-full border border-[#bfd4fb] bg-white px-3 py-1 text-xs font-semibold text-[#102A43]">
        {sourceLabel}
      </span>
      <span className="inline-flex items-center rounded-full border border-[#bfd4fb] bg-white px-3 py-1 text-xs font-semibold text-[#102A43]">
        Updated {updatedAtLabel}
      </span>
    </div>
  );

  const heroAside = (
    <>
      <div>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-primary">Policy guide</p>
        <p className="mt-2 text-sm leading-6 text-[#5C748F]">
          The page keeps policy language readable and easy to scan, with the Shopify source wrapped in a simpler shell.
        </p>
      </div>

      <div>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[#5C748F]">Helpful routes</p>
        <div className="mt-3 grid gap-2">
          {actions.slice(0, 3).map((action) =>
            action.to ? (
              <Link
                key={action.label}
                to={action.to}
                className="inline-flex items-center justify-between border-t border-[#d8e6f5] py-3 text-sm font-semibold text-[#102A43] transition hover:border-[#bcd4ef] hover:text-primary"
              >
                {action.label}
              </Link>
            ) : (
              <a
                key={action.label}
                href={action.href || "/"}
                className="inline-flex items-center justify-between border-t border-[#d8e6f5] py-3 text-sm font-semibold text-[#102A43] transition hover:border-[#bcd4ef] hover:text-primary"
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
        className="prose prose-sm max-w-none leading-[1.74] text-[#102A43] dark:prose-invert prose-headings:font-display prose-headings:text-[#102A43] prose-a:text-primary prose-strong:text-[#102A43] prose-li:text-[#102A43] prose-p:text-[#314861] prose-table:block prose-table:w-full prose-table:overflow-x-auto prose-table:border prose-table:border-[#d8e6f5] prose-th:border prose-th:border-[#d8e6f5] prose-th:bg-[#f5faff] prose-th:px-3 prose-th:py-2 prose-td:border prose-td:border-[#d8e6f5] prose-td:px-3 prose-td:py-2 prose-img:rounded-2xl prose-img:border prose-img:border-[#d8e6f5]"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </OpenContentPageShell>
  );
};

export default PolicyPageView;
