import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { Facebook, Instagram, Mail, Youtube } from "lucide-react";
import BrandLogo from "@/components/layout/BrandLogo";
import { buildCustomerAccessPath, useCustomerAuth } from "@/lib/customer-auth";
import {
  getRuntimeContext,
  resolveStorefrontPath,
} from "@/lib/theme-assets";

const runtimeContext = getRuntimeContext();
const privacyPolicyHref = resolveStorefrontPath(runtimeContext.privacyPolicyUrl, "/policies/privacy-policy");
const returnsPolicyHref = resolveStorefrontPath(runtimeContext.refundPolicyUrl, "/policies/refund-policy");
const shippingPolicyHref = resolveStorefrontPath(runtimeContext.shippingPolicyUrl, "/policies/shipping-policy");
const supportEmail = runtimeContext.supportEmail || "support@saltonlinestore.com";

const TikTokIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
    <path d="M15.66 3c.26 1.72 1.3 3.09 2.92 3.9V9.4a6.94 6.94 0 0 1-2.9-.73v5.47A6.14 6.14 0 1 1 9.53 8v2.66a3.56 3.56 0 1 0 2.6 3.42V3h3.53Z" />
  </svg>
);

const MainFooter = () => {
  const [subscribed, setSubscribed] = useState(false);
  const { isAuthenticated } = useCustomerAuth();
  const orderHistoryHref = isAuthenticated
    ? "/order-history"
    : buildCustomerAccessPath({ mode: "login", next: "/order-history", reason: "orders" });

  const onSubscribe = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubscribed(true);
  };

  return (
    <footer className="mt-24 border-t border-[#e5e1da] bg-[#fdfbf7] pt-24 sm:mt-32">
      <div className="mx-auto w-full max-w-[1340px] px-4">
        <div className="grid gap-16 lg:grid-cols-[1.5fr_1fr_1fr_1.5fr]">
          <div className="flex flex-col items-start">
            <BrandLogo withWordmark size="md" />
            <p className="mt-6 max-w-xs text-sm leading-relaxed text-[#4a453e]/80">
              A curated lifestyle marketplace for home, kitchen, and gifting. Every piece is selected for quality and utility.
            </p>
            <div className="mt-8 flex gap-4">
              <a href="https://instagram.com/saltonlinestore" className="text-[#1a1a1a] transition-colors hover:text-primary">
                <Instagram className="h-5 w-5" />
              </a>
              <a href="https://facebook.com/saltonlinestore" className="text-[#1a1a1a] transition-colors hover:text-primary">
                <Facebook className="h-5 w-5" />
              </a>
              <a href="https://youtube.com/@saltonlinestore" className="text-[#1a1a1a] transition-colors hover:text-primary">
                <Youtube className="h-5 w-5" />
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[#1a1a1a]">Shop</h3>
            <div className="mt-6 grid gap-3 text-[0.85rem] text-[#4a453e]/80">
              <Link to="/shop" className="transition-colors hover:text-primary">All Products</Link>
              <Link to="/collections" className="transition-colors hover:text-primary">Collections</Link>
              <Link to="/shop?sort=newest" className="transition-colors hover:text-primary">New Arrivals</Link>
              <Link to="/shop?sort=discount" className="transition-colors hover:text-primary">Sale</Link>
            </div>
          </div>

          <div>
            <h3 className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[#1a1a1a]">Support</h3>
            <div className="mt-6 grid gap-3 text-[0.85rem] text-[#4a453e]/80">
              <Link to="/contact" className="transition-colors hover:text-primary">Contact Us</Link>
              <Link to={orderHistoryHref} className="transition-colors hover:text-primary">Order Tracking</Link>
              <a href={shippingPolicyHref} className="transition-colors hover:text-primary">Shipping</a>
              <a href={returnsPolicyHref} className="transition-colors hover:text-primary">Returns</a>
            </div>
          </div>

          <div>
            <h3 className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[#1a1a1a]">The SALT List</h3>
            <p className="mt-6 text-sm text-[#4a453e]/80">
              Sign up for curated arrivals and member-only updates.
            </p>
            <form onSubmit={onSubscribe} className="mt-6">
              <div className="relative">
                <input
                  className="h-12 w-full border-b border-[#1a1a1a]/20 bg-transparent text-sm outline-none transition-colors focus:border-primary"
                  type="email"
                  required
                  placeholder="Email Address"
                />
                <button
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-[0.65rem] font-bold uppercase tracking-[0.15em] text-[#1a1a1a] transition-colors hover:text-primary"
                  type="submit"
                >
                  Join
                </button>
              </div>
              {subscribed && (
                <p className="mt-3 text-xs text-primary italic">Welcome to the SALT community.</p>
              )}
            </form>
          </div>
        </div>

        <div className="mt-24 border-t border-[#e5e1da] py-12">
          <div className="flex flex-col items-center justify-between gap-6 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-[#4a453e]/60 md:flex-row">
            <span>© {new Date().getFullYear()} SALT ONLINE STORE</span>
            <div className="flex gap-8">
              <a href={privacyPolicyHref} className="transition-colors hover:text-primary">Privacy Policy</a>
              <a href={returnsPolicyHref} className="transition-colors hover:text-primary">Refund Policy</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default MainFooter;
