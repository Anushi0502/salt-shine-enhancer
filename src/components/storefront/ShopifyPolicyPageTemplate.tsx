import { Link } from "react-router-dom";
import { BadgeCheck, Scale, ShieldCheck } from "lucide-react";
import InnerBreadcrumbs from "@/components/storefront/InnerBreadcrumbs";
import Reveal from "@/components/storefront/Reveal";
import SectionHeading from "@/components/storefront/SectionHeading";
import TrustStrip from "@/components/storefront/TrustStrip";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import { sanitizeRichHtml } from "@/lib/formatters";
import { usePolicyPage } from "@/lib/shopify-data";

type PolicyAction = {
  to: string;
  label: string;
  primary?: boolean;
};

type ShopifyPolicyKey = "privacy" | "refund" | "shipping" | "contact";

interface ShopifyPolicyPageTemplateProps {
  policyKey: ShopifyPolicyKey;
  actions: PolicyAction[];
}

const POLICY_META: Record<ShopifyPolicyKey, { path: string; fallbackTitle: string }> = {
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

const buttonClass =
  "inline-flex h-11 items-center rounded-full border px-5 text-xs font-bold uppercase tracking-[0.08em]";

const ShopifyPolicyPageTemplate = ({ policyKey, actions }: ShopifyPolicyPageTemplateProps) => {
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
  const isArchiveSource = String(data.source || "").startsWith("archive:");

  return (
    <section className="mx-auto mt-6 w-[min(1100px,94vw)] pb-8">
      <Reveal>
        <InnerBreadcrumbs
          items={[
            { label: "Home", to: "/" },
            { label: "Policies", to: "/policies/privacy-policy" },
            { label: data.title },
          ]}
        />
      </Reveal>

      <Reveal>
        <div className="salt-surface-strong mt-3 rounded-[1.9rem] p-5 sm:p-6">
          <SectionHeading
            kicker="Legal"
            title={data.title}
            description={
              isArchiveSource
                ? "Policy content is currently served from the verified Shopify policy baseline."
                : "Live policy content fetched directly from Shopify."
            }
          />
          <TrustStrip
            className="mt-3"
            items={[
              { icon: ShieldCheck, label: "Secure policy source" },
              { icon: Scale, label: "Compliance-first content" },
              { icon: BadgeCheck, label: "Shopify synced" },
            ]}
          />

          <article
            className="prose prose-sm mt-5 max-w-none rounded-2xl border border-border/70 bg-background/78 p-5 leading-[1.72] text-foreground dark:prose-invert prose-headings:font-display prose-headings:text-foreground prose-a:text-primary prose-strong:text-foreground prose-li:text-foreground prose-p:text-foreground prose-table:block prose-table:w-full prose-table:overflow-x-auto prose-table:border prose-table:border-border prose-th:border prose-th:border-border prose-th:bg-muted/40 prose-th:px-3 prose-th:py-2 prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />

          <div className="salt-section-shell mt-5 flex flex-wrap gap-2 rounded-2xl border border-border/70 bg-background/78 p-3">
            {actions.map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className={
                  action.primary
                    ? `salt-primary-cta ${buttonClass} border-primary text-primary-foreground`
                    : `${buttonClass} border-border bg-background hover:-translate-y-[1px] hover:border-primary/50`
                }
              >
                {action.label}
              </Link>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
};

export default ShopifyPolicyPageTemplate;
