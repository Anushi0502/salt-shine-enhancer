import ShopifyPolicyPageTemplate from "@/components/storefront/ShopifyPolicyPageTemplate";

const RefundPolicyPage = () => {
  return (
    <ShopifyPolicyPageTemplate
      policyKey="refund"
      actions={[
        { to: "/contact", label: "Start return request", primary: true },
        { to: "/policies/shipping-policy", label: "Shipping policy" },
        { to: "/policies/privacy-policy", label: "Privacy policy" },
      ]}
    />
  );
};

export default RefundPolicyPage;
