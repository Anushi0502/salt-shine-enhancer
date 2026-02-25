import { Link } from "react-router-dom";
import Reveal from "@/components/storefront/Reveal";
import { sanitizeRichHtml } from "@/lib/formatters";
import { SHOPIFY_POLICY_ARCHIVE, type ShopifyPolicyKey } from "@/lib/shopify-policy-archive";

type PolicyAction = {
  to: string;
  label: string;
  primary?: boolean;
};

interface ShopifyPolicyPageTemplateProps {
  policyKey: ShopifyPolicyKey;
  actions: PolicyAction[];
}

const buttonClass =
  "inline-flex h-11 items-center rounded-full border px-5 text-xs font-bold uppercase tracking-[0.08em]";

const ShopifyPolicyPageTemplate = ({ policyKey, actions }: ShopifyPolicyPageTemplateProps) => {
  const policy = SHOPIFY_POLICY_ARCHIVE[policyKey];
  const bodyHtml = sanitizeRichHtml(policy.bodyHtml);

  return (
    <section className="mx-auto mt-8 w-[min(1100px,94vw)] pb-8">
      <Reveal>
        <div className="rounded-[2rem] border border-border/80 bg-card p-6 shadow-soft sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Legal</p>
          <h1 className="mt-1 font-display text-[clamp(2rem,4vw,3.3rem)] leading-[0.95]">{policy.title}</h1>

          <article
            className="prose prose-sm mt-6 max-w-none leading-7 text-foreground prose-headings:font-display prose-headings:text-foreground prose-a:text-primary prose-strong:text-foreground prose-li:text-foreground prose-p:text-foreground prose-table:block prose-table:w-full prose-table:overflow-x-auto prose-table:border prose-table:border-border prose-th:border prose-th:border-border prose-th:bg-muted/40 prose-th:px-3 prose-th:py-2 prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />

          <div className="mt-6 flex flex-wrap gap-2">
            {actions.map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className={
                  action.primary
                    ? `${buttonClass} border-primary bg-primary text-primary-foreground hover:brightness-110`
                    : `${buttonClass} border-border bg-background hover:border-primary/50`
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
