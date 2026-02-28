import ShopifyPolicyPageTemplate from "@/components/storefront/ShopifyPolicyPageTemplate";

const ContactInformationPolicyPage = () => {
  return (
    <ShopifyPolicyPageTemplate
      policyKey="contact"
      actions={[
        { to: "/contact", label: "Contact form", primary: true },
        { to: "/policies/privacy-policy", label: "Privacy policy" },
        { to: "/policies/shipping-policy", label: "Shipping policy" },
      ]}
    />
  );
};

export default ContactInformationPolicyPage;
