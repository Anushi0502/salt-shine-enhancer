import { Building2, Mail, Phone } from "lucide-react";
import OpenContentPageShell from "@/components/storefront/OpenContentPageShell";
import SeoMetadata from "@/components/storefront/SeoMetadata";

const contactDetails = [
  {
    label: "Trade name",
    value: "Senior and living Today (SALT)",
    icon: Building2,
  },
  {
    label: "Email",
    value: "help@saltonlinestore.com",
    href: "mailto:help@saltonlinestore.com",
    icon: Mail,
  },
  {
    label: "Phone",
    value: "+1 888-835-7211",
    href: "tel:+18888357211",
    icon: Phone,
  },
] as const;

const ContactInformationPolicyPage = () => (
  <>
    <SeoMetadata
      title="Contact Information | SALT Online Store"
      description="Reach the SALT team for help with orders, products, and store support."
      canonicalPath="/policies/contact-information"
      ogType="article"
    />
    <OpenContentPageShell
      breadcrumbs={[
        { label: "Home", to: "/" },
        { label: "Support", to: "/pages/contact-us" },
        { label: "Contact information" },
      ]}
      kicker="SALT support"
      title="Contact information"
      summary="Reach the SALT team for help with orders, products, and store support."
      actions={[
        { to: "/pages/contact-us", label: "Contact form", primary: true },
        { to: "/pages/faq", label: "Browse FAQ" },
      ]}
      aside={
        <div>
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-primary">Customer care</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Our support details are kept here in one easy-to-find place.
          </p>
        </div>
      }
    >
      <section className="salt-surface overflow-hidden rounded-[1.65rem] shadow-[0_22px_44px_-34px_rgba(15,23,42,0.3)]">
        <div className="border-b border-border/70 bg-background/90 px-5 py-4 sm:px-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Official store details</p>
        </div>
        <dl className="divide-y divide-border/70 px-5 sm:px-6">
          {contactDetails.map(({ label, value, href, icon: Icon }) => (
            <div key={label} className="grid gap-3 py-5 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:items-center">
              <span className="inline-flex size-10 items-center justify-center rounded-full border border-primary/15 bg-primary/10 text-primary">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div>
                <dt className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-base font-semibold text-foreground sm:text-lg">
                  {href ? (
                    <a className="text-primary underline-offset-4 hover:underline" href={href}>
                      {value}
                    </a>
                  ) : (
                    value
                  )}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </section>
    </OpenContentPageShell>
  </>
);

export default ContactInformationPolicyPage;
