import ShopifyPolicyPageTemplate from "@/components/storefront/ShopifyPolicyPageTemplate";

const PrivacyPolicyPage = () => {
  return (
    <ShopifyPolicyPageTemplate
      policyKey="privacy"
      actions={[
        { to: "/contact", label: "Contact support", primary: true },
        { to: "/refund-policy", label: "Returns policy" },
        { to: "/shipping-policy", label: "Shipping policy" },
      ]}
    />
  );
};

export default PrivacyPolicyPage;
