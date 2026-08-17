import PolicyPageView from "@/components/storefront/PolicyPageView";

const RefundPolicyPage = () => {
  return (
    <PolicyPageView
      policyKey="refund"
      actions={[
        { to: "/pages/contact-us", label: "Start return request", primary: true },
        { to: "/policies/shipping-policy", label: "Shipping policy" },
        { to: "/policies/privacy-policy", label: "Privacy policy" },
      ]}
    />
  );
};

export default RefundPolicyPage;
