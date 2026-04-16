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
    <footer className="mt-10 border-t border-[#cadbff] bg-[#f4f8ff] pt-10 sm:mt-14 sm:pt-12">
      <div className="mx-auto w-full max-w-[1200px] px-4">
        <div className="relative overflow-hidden rounded-[1.9rem] border border-[#c7d9fb] bg-[linear-gradient(145deg,rgba(255,255,255,0.76),rgba(238,246,255,0.92))] p-6 shadow-[0_30px_55px_-44px_rgba(26,77,154,0.55)] sm:p-8">
          <div className="pointer-events-none absolute -left-16 top-8 h-36 w-36 rounded-full bg-[#9fc0f7]/22 blur-3xl" />
          <div className="pointer-events-none absolute -right-14 -top-10 h-44 w-44 rounded-full bg-[#7aa4ef]/20 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-24 w-24 rounded-full bg-[#f2d37b]/20 blur-2xl" />

          <div className="relative grid gap-10 lg:grid-cols-[1.35fr_1fr_1fr_1.55fr]">
            <div className="flex flex-col items-start">
              <BrandLogo withWordmark size="md" />
              <p className="mt-5 max-w-sm text-[0.96rem] leading-7 text-[#2a4f90]/84">
                A curated lifestyle marketplace for home, kitchen, and gifting. Every piece is selected for quality and utility.
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                <span className="rounded-full border border-[#b8cef5] bg-white/85 px-3 py-1 text-[0.62rem] font-bold uppercase tracking-[0.11em] text-[#1a4d9a]">Curated catalog</span>
                <span className="rounded-full border border-[#b8cef5] bg-white/85 px-3 py-1 text-[0.62rem] font-bold uppercase tracking-[0.11em] text-[#1a4d9a]">Fast shipping</span>
                <span className="rounded-full border border-[#b8cef5] bg-white/85 px-3 py-1 text-[0.62rem] font-bold uppercase tracking-[0.11em] text-[#1a4d9a]">Easy returns</span>
              </div>
              <div className="mt-6 flex gap-3">
                <a href="https://instagram.com/saltonlinestore" className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#bdd2f7] bg-white/85 text-[#1a4d9a] transition hover:border-[#98b8ee] hover:text-[#f2b600]">
                  <Instagram className="h-4.5 w-4.5" />
                </a>
                <a href="https://www.facebook.com/profile.php?id=61573199456052" className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#bdd2f7] bg-white/85 text-[#1a4d9a] transition hover:border-[#98b8ee] hover:text-[#f2b600]">
                  <Facebook className="h-4.5 w-4.5" />
                </a>
                <a href="https://youtube.com/@saltonlinestore" className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#bdd2f7] bg-white/85 text-[#1a4d9a] transition hover:border-[#98b8ee] hover:text-[#f2b600]">
                  <Youtube className="h-4.5 w-4.5" />
                </a>
              </div>
            </div>

            <div>
              <h3 className="text-[0.64rem] font-bold uppercase tracking-[0.22em] text-[#1a4d9a]">Shop</h3>
              <div className="mt-5 grid gap-3 text-[0.92rem] text-[#2a4f90]/84">
                <Link to="/shop" className="transition-colors hover:text-[#f2b600]">All Products</Link>
                <Link to="/collections" className="transition-colors hover:text-[#f2b600]">Collections</Link>
                <Link to="/shop?sort=newest" className="transition-colors hover:text-[#f2b600]">New Arrivals</Link>
                <Link to="/shop?sort=discount" className="transition-colors hover:text-[#f2b600]">Sale</Link>
              </div>
            </div>

            <div>
              <h3 className="text-[0.64rem] font-bold uppercase tracking-[0.22em] text-[#1a4d9a]">Support</h3>
              <div className="mt-5 grid gap-3 text-[0.92rem] text-[#2a4f90]/84">
                <Link to="/contact" className="transition-colors hover:text-[#f2b600]">Contact Us</Link>
                <Link to={orderHistoryHref} className="transition-colors hover:text-[#f2b600]">Order Tracking</Link>
                <a href={shippingPolicyHref} className="transition-colors hover:text-[#f2b600]">Shipping</a>
                <a href={returnsPolicyHref} className="transition-colors hover:text-[#f2b600]">Returns</a>
              </div>
            </div>

            <div className="rounded-[1.15rem] border border-[#bfd3f8] bg-white/70 p-4 sm:p-5">
              <h3 className="text-[0.64rem] font-bold uppercase tracking-[0.22em] text-[#1a4d9a]">The SALT List</h3>
              <p className="mt-3 text-[0.93rem] leading-6 text-[#2a4f90]/82">
                Sign up for curated arrivals, practical edits, and member-only updates.
              </p>
              <form onSubmit={onSubscribe} className="mt-4">
                <div className="relative">
                  <input
                    className="h-11 w-full rounded-full border border-[#a7c1ef] bg-white/92 pl-4 pr-24 text-sm text-[#1a4d9a] outline-none transition-colors placeholder:text-[#6d8fcf] focus:border-[#1d60d8] focus:shadow-[0_0_0_3px_rgba(29,96,216,0.16)]"
                    type="email"
                    required
                    placeholder="Email address"
                  />
                  <button
                    className="absolute right-1 top-1 inline-flex h-9 items-center justify-center rounded-full bg-[#1f59cb] px-4 text-[0.64rem] font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[#174ba8]"
                    type="submit"
                  >
                    Join
                  </button>
                </div>
                {subscribed && (
                  <p className="mt-3 text-xs font-semibold text-[#1d60d8]">Welcome to the SALT community.</p>
                )}
              </form>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-[#cadbff] py-12 sm:mt-14 sm:py-14">
          <div className="rounded-[1.25rem] border border-[#c5d7fb] bg-[linear-gradient(140deg,rgba(255,255,255,0.72),rgba(239,246,255,0.9))] px-5 py-4 shadow-[0_24px_42px_-38px_rgba(26,77,154,0.45)] sm:px-7 sm:py-5">
            <div className="flex flex-col items-start justify-between gap-3 text-[0.7rem] font-bold uppercase tracking-[0.16em] text-[#2a4f90]/80 md:flex-row md:items-center">
              <p>SALT storefront confidence</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[#b7cdf5] bg-white/80 px-3 py-1 text-[0.62rem] tracking-[0.12em] text-[#1a4d9a]">Secure checkout</span>
                <span className="rounded-full border border-[#b7cdf5] bg-white/80 px-3 py-1 text-[0.62rem] tracking-[0.12em] text-[#1a4d9a]">Tracked shipping</span>
                <span className="rounded-full border border-[#b7cdf5] bg-white/80 px-3 py-1 text-[0.62rem] tracking-[0.12em] text-[#1a4d9a]">Easy returns</span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col items-center justify-between gap-6 text-[0.78rem] font-bold uppercase tracking-[0.16em] text-[#2a4f90]/78 md:flex-row">
            <span>&copy; {new Date().getFullYear()} SALT ONLINE STORE</span>
            <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8">
              <a href={privacyPolicyHref} className="transition-colors hover:text-[#f2b600]">Privacy Policy</a>
              <a href={returnsPolicyHref} className="transition-colors hover:text-[#f2b600]">Refund Policy</a>
              <a href={shippingPolicyHref} className="transition-colors hover:text-[#f2b600]">Shipping Policy</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default MainFooter;
