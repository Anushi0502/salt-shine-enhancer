import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { Facebook, Instagram, Youtube } from "lucide-react";
import BrandLogo from "@/components/layout/BrandLogo";
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

  const onSubscribe = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubscribed(true);
  };

  return (
    <footer className="mt-4 border-t border-white/10 bg-[#131921] text-white sm:mt-6">
      <div className="mx-auto w-full max-w-[1360px] px-4 py-10 sm:px-6 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_1.35fr]">
          <div className="flex flex-col items-start">
            <BrandLogo withWordmark size="md" />
            <p className="mt-4 max-w-xs text-sm leading-6 text-white/70">
              Search fast. Shop clean. Get trusted checkout and delivery.
            </p>
            <div className="mt-5 flex gap-3">
              <a
                href="https://instagram.com/saltonlinestore"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 transition hover:border-[#f2b600]/40 hover:bg-white/10 hover:text-[#f2b600]"
              >
                <Instagram className="h-4.5 w-4.5" />
              </a>
              <a
                href="https://www.facebook.com/profile.php?id=61573199456052"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 transition hover:border-[#f2b600]/40 hover:bg-white/10 hover:text-[#f2b600]"
              >
                <Facebook className="h-4.5 w-4.5" />
              </a>
              <a
                href="https://youtube.com/@saltonlinestore"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 transition hover:border-[#f2b600]/40 hover:bg-white/10 hover:text-[#f2b600]"
              >
                <Youtube className="h-4.5 w-4.5" />
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-[0.64rem] font-bold uppercase tracking-[0.22em] text-[#f2b600]">Shop</h3>
            <div className="mt-4 grid gap-3 text-sm text-white/74">
              <Link to="/shop?collection=all-products" className="transition-colors hover:text-white">
                All products
              </Link>
              <Link to="/collections" className="transition-colors hover:text-white">
                Collections
              </Link>
              <Link to="/shop?sort=newest" className="transition-colors hover:text-white">
                New arrivals
              </Link>
              <Link to="/shop?sort=discount" className="transition-colors hover:text-white">
                Sale
              </Link>
            </div>
          </div>

          <div>
            <h3 className="text-[0.64rem] font-bold uppercase tracking-[0.22em] text-[#f2b600]">Support</h3>
            <div className="mt-4 grid gap-3 text-sm text-white/74">
              <Link to="/contact" className="transition-colors hover:text-white">
                Contact
              </Link>
              <Link to="/about" className="transition-colors hover:text-white">
                About
              </Link>
              <Link to="/pages/mission-vision" className="transition-colors hover:text-white">
                Mission &amp; Vision
              </Link>
              <Link to="/pages/affiliate-program" className="transition-colors hover:text-white">
                Affiliate program
              </Link>
              <Link to="/account/orders" className="transition-colors hover:text-white">
                Track order
              </Link>
              <a href={shippingPolicyHref} className="transition-colors hover:text-white">
                Shipping
              </a>
              <a href={returnsPolicyHref} className="transition-colors hover:text-white">
                Returns
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-[0.64rem] font-bold uppercase tracking-[0.22em] text-[#f2b600]">Policies</h3>
            <div className="mt-4 grid gap-3 text-sm text-white/74">
              <a href={privacyPolicyHref} className="transition-colors hover:text-white">
                Privacy
              </a>
              <a href={returnsPolicyHref} className="transition-colors hover:text-white">
                Refunds
              </a>
              <a href={shippingPolicyHref} className="transition-colors hover:text-white">
                Shipping policy
              </a>
            </div>
          </div>

          <div className="rounded-[1.25rem] border border-white/10 bg-white/6 p-4 shadow-[0_20px_34px_-28px_rgba(0,0,0,0.5)] backdrop-blur-[2px] sm:p-5">
            <h3 className="text-[0.64rem] font-bold uppercase tracking-[0.22em] text-[#f2b600]">
              Email updates
            </h3>
            <p className="mt-3 text-sm leading-6 text-white/70">
              New drops, deals, and restocks.
            </p>
            <form onSubmit={onSubscribe} className="mt-4">
              <div className="relative">
                <input
                  className="h-11 w-full rounded-full border border-white/12 bg-[#0f1722] pl-4 pr-24 text-sm text-white outline-none transition-colors placeholder:text-white/42 focus:border-[#f2b600]/70 focus:shadow-[0_0_0_3px_rgba(242,182,0,0.16)]"
                  type="email"
                  required
                  placeholder="Email address"
                />
                <button
                  className="absolute right-1 top-1 inline-flex h-9 items-center justify-center rounded-full bg-[#f2b600] px-4 text-[0.64rem] font-bold uppercase tracking-[0.12em] text-[#131921] transition hover:bg-[#ffd54a]"
                  type="submit"
                >
                  Join
                </button>
              </div>
              {subscribed && (
                <p className="mt-3 text-xs font-semibold text-[#f2b600]">
                  You’re on the list.
                </p>
              )}
            </form>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex w-full max-w-[1360px] flex-col items-start justify-between gap-4 px-4 py-5 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-white/68 sm:px-6 lg:flex-row lg:px-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.62rem] tracking-[0.12em] text-white/80">
              Secure checkout
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.62rem] tracking-[0.12em] text-white/80">
              Tracked shipping
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.62rem] tracking-[0.12em] text-white/80">
              Easy returns
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <span>&copy; {new Date().getFullYear()} SALT ONLINE STORE</span>
            <a href={privacyPolicyHref} className="transition-colors hover:text-white">
              Privacy
            </a>
            <a href={returnsPolicyHref} className="transition-colors hover:text-white">
              Refunds
            </a>
            <a href={shippingPolicyHref} className="transition-colors hover:text-white">
              Shipping
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default MainFooter;
