import PolicyPageView from "@/components/storefront/PolicyPageView";

const ShippingPolicyPage = () => {
  return (
    <PolicyPageView
      policyKey="shipping"
      actions={[
        { to: "/contact", label: "Contact shipping support", primary: true },
        { to: "/policies/refund-policy", label: "Returns policy" },
        { to: "/policies/privacy-policy", label: "Privacy policy" },
      ]}
    />
  );
};

export default ShippingPolicyPage;
