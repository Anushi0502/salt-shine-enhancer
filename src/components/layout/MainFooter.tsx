import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { Facebook, Instagram, Youtube } from "lucide-react";
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
    <footer className="mt-24 border-t border-[#cadbff] bg-[#f4f8ff] pt-24 sm:mt-32">
      <div className="mx-auto w-full max-w-[1200px] px-4">
        <div className="grid gap-16 lg:grid-cols-[1.5fr_1fr_1fr_1.5fr]">
          <div className="flex flex-col items-start">
            <BrandLogo withWordmark size="md" />
            <p className="mt-6 max-w-xs text-sm leading-relaxed text-[#2a4f90]/82">
              A curated lifestyle marketplace for home, kitchen, and gifting. Every piece is selected for quality and utility.
            </p>
            <div className="mt-8 flex gap-4">
              <a href="https://instagram.com/saltonlinestore" className="text-[#1a4d9a] transition-colors hover:text-[#f2b600]">
                <Instagram className="h-5 w-5" />
              </a>
              <a href="https://facebook.com/saltonlinestore" className="text-[#1a4d9a] transition-colors hover:text-[#f2b600]">
                <Facebook className="h-5 w-5" />
              </a>
              <a href="https://youtube.com/@saltonlinestore" className="text-[#1a4d9a] transition-colors hover:text-[#f2b600]">
                <Youtube className="h-5 w-5" />
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[#1a4d9a]">Shop</h3>
            <div className="mt-6 grid gap-3 text-[0.85rem] text-[#2a4f90]/82">
              <Link to="/shop" className="transition-colors hover:text-[#f2b600]">All Products</Link>
              <Link to="/collections" className="transition-colors hover:text-[#f2b600]">Collections</Link>
              <Link to="/shop?sort=newest" className="transition-colors hover:text-[#f2b600]">New Arrivals</Link>
              <Link to="/shop?sort=discount" className="transition-colors hover:text-[#f2b600]">Sale</Link>
            </div>
          </div>

          <div>
            <h3 className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[#1a4d9a]">Support</h3>
            <div className="mt-6 grid gap-3 text-[0.85rem] text-[#2a4f90]/82">
              <Link to="/contact" className="transition-colors hover:text-[#f2b600]">Contact Us</Link>
              <Link to={orderHistoryHref} className="transition-colors hover:text-[#f2b600]">Order Tracking</Link>
              <a href={shippingPolicyHref} className="transition-colors hover:text-[#f2b600]">Shipping</a>
              <a href={returnsPolicyHref} className="transition-colors hover:text-[#f2b600]">Returns</a>
            </div>
          </div>

          <div>
            <h3 className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[#1a4d9a]">The SALT List</h3>
            <p className="mt-6 text-sm text-[#2a4f90]/82">
              Sign up for curated arrivals and member-only updates.
            </p>
            <form onSubmit={onSubscribe} className="mt-6">
              <div className="relative">
                <input
                  className="h-12 w-full border-b border-[#89abee]/45 bg-transparent text-sm text-[#1a4d9a] outline-none transition-colors placeholder:text-[#6d8fcf] focus:border-[#1d60d8]"
                  type="email"
                  required
                  placeholder="Email Address"
                />
                <button
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-[0.65rem] font-bold uppercase tracking-[0.15em] text-[#1a4d9a] transition-colors hover:text-[#f2b600]"
                  type="submit"
                >
                  Join
                </button>
              </div>
              {subscribed && (
                <p className="mt-3 text-xs text-[#1d60d8] italic">Welcome to the SALT community.</p>
              )}
            </form>
          </div>
        </div>

        <div className="mt-24 border-t border-[#cadbff] py-12">
          <div className="flex flex-col items-center justify-between gap-6 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-[#2a4f90]/68 md:flex-row">
            <span>&copy; {new Date().getFullYear()} SALT ONLINE STORE</span>
            <div className="flex gap-8">
              <a href={privacyPolicyHref} className="transition-colors hover:text-[#f2b600]">Privacy Policy</a>
              <a href={returnsPolicyHref} className="transition-colors hover:text-[#f2b600]">Refund Policy</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default MainFooter;
