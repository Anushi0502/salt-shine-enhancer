import { Building2, Mail, Phone } from "lucide-react";
import OpenContentPageShell from "@/components/storefront/OpenContentPageShell";

const contactDetails = [
  {
    label: "Trade name",
    value: "Senior and living Today (SALT)",
    icon: Building2,
  },
  {
    label: "Email",
    value: "support@saltonlinestore.com",
    href: "mailto:support@saltonlinestore.com",
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
  <OpenContentPageShell
    breadcrumbs={[
      { label: "Home", to: "/" },
      { label: "Support", to: "/contact" },
      { label: "Contact information" },
    ]}
    kicker="SALT support"
    title="Contact information"
    summary="Reach the SALT team for help with orders, products, and store support."
    actions={[
      { to: "/contact", label: "Contact form", primary: true },
      { to: "/faq", label: "Browse FAQ" },
    ]}
    aside={
      <div>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-primary">Customer care</p>
        <p className="mt-2 text-sm leading-6 text-[#5C748F]">
          Our support details are kept here in one easy-to-find place.
        </p>
      </div>
    }
  >
    <section className="overflow-hidden rounded-[1.45rem] border border-[#d8e6f5] bg-white shadow-[0_22px_44px_-34px_rgba(15,23,42,0.3)]">
      <div className="border-b border-[#d8e6f5] bg-[#f7faff] px-5 py-4 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#5C748F]">Official store details</p>
      </div>
      <dl className="divide-y divide-[#d8e6f5] px-5 sm:px-6">
        {contactDetails.map(({ label, value, href, icon: Icon }) => (
          <div key={label} className="grid gap-3 py-5 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:items-center">
            <span className="inline-flex size-10 items-center justify-center rounded-full border border-[#bfd4fb] bg-[#f5faff] text-primary">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div>
              <dt className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#5C748F]">{label}</dt>
              <dd className="mt-1 text-base font-semibold text-[#102A43] sm:text-lg">
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
);

export default ContactInformationPolicyPage;
