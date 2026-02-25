import ShopifyPolicyPageTemplate from "@/components/storefront/ShopifyPolicyPageTemplate";

const ShippingPolicyPage = () => {
  return (
    <ShopifyPolicyPageTemplate
      policyKey="shipping"
      actions={[
        { to: "/contact", label: "Contact shipping support", primary: true },
        { to: "/refund-policy", label: "Returns policy" },
        { to: "/privacy-policy", label: "Privacy policy" },
      ]}
    />
  );
};

export default ShippingPolicyPage;
