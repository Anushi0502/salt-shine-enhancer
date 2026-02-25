import ShopifyPolicyPageTemplate from "@/components/storefront/ShopifyPolicyPageTemplate";

const ContactInformationPolicyPage = () => {
  return (
    <ShopifyPolicyPageTemplate
      policyKey="contact"
      actions={[
        { to: "/contact", label: "Contact form", primary: true },
        { to: "/privacy-policy", label: "Privacy policy" },
        { to: "/shipping-policy", label: "Shipping policy" },
      ]}
    />
  );
};

export default ContactInformationPolicyPage;
