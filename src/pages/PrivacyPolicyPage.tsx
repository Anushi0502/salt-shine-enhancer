import PolicyPageView from "@/components/storefront/PolicyPageView";

const PrivacyPolicyPage = () => {
  return (
    <PolicyPageView
      policyKey="privacy"
      actions={[
        { to: "/pages/contact-us", label: "Contact support", primary: true },
        { to: "/policies/refund-policy", label: "Returns policy" },
        { to: "/policies/shipping-policy", label: "Shipping policy" },
      ]}
    />
  );
};

export default PrivacyPolicyPage;
