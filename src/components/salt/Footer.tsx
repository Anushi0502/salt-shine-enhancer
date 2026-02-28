import { getRuntimeContext } from "@/lib/theme-assets";

const Footer = () => {
  const runtimeContext = getRuntimeContext();
  const privacyPolicyHref = runtimeContext.privacyPolicyUrl || "/policies/privacy-policy";
  const returnsPolicyHref = runtimeContext.refundPolicyUrl || "/policies/refund-policy";
  const shippingPolicyHref = runtimeContext.shippingPolicyUrl || "/policies/shipping-policy";

  return (
    <footer className="salt-container mt-10 mb-5 border-t border-salt-line pt-4 flex flex-wrap gap-3 justify-between text-muted-foreground text-sm">
      <span>© 2026 SALT Online Store. Enhanced UI layer with existing backend compatibility.</span>
      <div className="flex gap-4">
        <a href="/contact" className="hover:text-foreground transition-colors">Contact</a>
        <a href={privacyPolicyHref} className="hover:text-foreground transition-colors">Privacy</a>
        <a href={returnsPolicyHref} className="hover:text-foreground transition-colors">Returns</a>
        <a href={shippingPolicyHref} className="hover:text-foreground transition-colors">Shipping</a>
      </div>
    </footer>
  );
};

export default Footer;
