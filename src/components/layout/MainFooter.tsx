import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, Clock3, Facebook, Headset, Youtube } from "lucide-react";
import BrandLogo from "@/components/layout/BrandLogo";
import {
  getRuntimeContext,
  getShopAppUrl,
  getShopifyAccountRoutes,
  openShopLogin,
  resolveStorefrontPath,
} from "@/lib/theme-assets";

const runtimeContext = getRuntimeContext();
const shopAppUrl = getShopAppUrl();
const privacyPolicyHref = resolveStorefrontPath(runtimeContext.privacyPolicyUrl, "/policies/privacy-policy");
const returnsPolicyHref = resolveStorefrontPath(runtimeContext.refundPolicyUrl, "/policies/refund-policy");
const shippingPolicyHref = resolveStorefrontPath(runtimeContext.shippingPolicyUrl, "/policies/shipping-policy");

const TikTokIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
    <path d="M15.66 3c.26 1.72 1.3 3.09 2.92 3.9V9.4a6.94 6.94 0 0 1-2.9-.73v5.47A6.14 6.14 0 1 1 9.53 8v2.66a3.56 3.56 0 1 0 2.6 3.42V3h3.53Z" />
  </svg>
);

const MainFooter = () => {
  const [subscribed, setSubscribed] = useState(false);
  const accountRoutes = getShopifyAccountRoutes();

  const onSubscribe = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubscribed(true);
  };

  return (
    <footer className="mt-20 border-t border-border/70 bg-[linear-gradient(180deg,hsl(var(--card)/0.86),hsl(var(--card)/0.98))]">
      <div className="mx-auto w-[min(1280px,96vw)] pt-10">
        <div className="salt-panel-shell rounded-[1.7rem] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Support Promise</p>
              <h3 className="font-display text-[clamp(1.3rem,2.2vw,1.9rem)] leading-tight">
                Need help before checkout?
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Reach support quickly for product questions, order tracking, and return guidance.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/contact" className="salt-primary-cta h-10 px-4 text-xs font-bold uppercase tracking-[0.08em]">
                Contact support
              </Link>
              <a href={shippingPolicyHref} className="salt-outline-chip h-10 px-4 py-0 text-xs">
                Shipping policy
              </a>
              <a href={returnsPolicyHref} className="salt-outline-chip h-10 px-4 py-0 text-xs">
                Return policy
              </a>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[0.68rem] uppercase tracking-[0.09em] text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card/90 px-3 py-1">
              <Clock3 className="h-3.5 w-3.5 text-primary" /> 24h average response
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card/90 px-3 py-1">
              <Headset className="h-3.5 w-3.5 text-primary" /> Human support team
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card/90 px-3 py-1">
              <BadgeCheck className="h-3.5 w-3.5 text-primary" /> Buyer-protection policies
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto w-[min(1280px,96vw)] pt-6">
        <div className="salt-separator" />
      </div>

      <div className="mx-auto grid w-[min(1280px,96vw)] gap-10 py-12 md:grid-cols-4">
        <div>
          <BrandLogo
            withWordmark
            size="md"
            className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1.5"
          />
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            Curated everyday essentials from
            <a
              href="https://saltonlinestore.com"
              target="_blank"
              rel="noreferrer"
              className="mx-1 font-semibold text-primary underline-offset-2 hover:underline"
            >
              saltonlinestore.com
            </a>
            with premium-quality picks across home, lifestyle, and gifting.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <a
              href="https://www.facebook.com/people/SALT-online-store/61573199456052/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/75 bg-background/85 text-muted-foreground transition hover:border-primary/45 hover:text-primary"
              aria-label="SALT on Facebook"
            >
              <Facebook className="h-6 w-6" />
            </a>
            <a
              href="https://www.youtube.com/@SALTONLINESTORE"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/75 bg-background/85 text-muted-foreground transition hover:border-primary/45 hover:text-primary"
              aria-label="SALT on YouTube"
            >
              <Youtube className="h-6 w-6" />
            </a>
            <a
              href="https://www.tiktok.com/@saltonlinestore"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/75 bg-background/85 text-muted-foreground transition hover:border-primary/45 hover:text-primary"
              aria-label="SALT on TikTok"
            >
              <TikTokIcon className="h-6 w-6" />
            </a>
          </div>
          <div className="mt-4 flex w-full flex-nowrap items-center gap-2 overflow-x-auto pb-1">
            <span className="salt-outline-chip shrink-0">
              Fast Dispatch
            </span>
            <span className="salt-outline-chip shrink-0">
              Secure Checkout
            </span>
            <span className="salt-outline-chip shrink-0">
              30-day Returns
            </span>
            <a
              href={shopAppUrl}
              target="_blank"
              rel="noreferrer"
              className="salt-outline-chip shrink-0"
              aria-label="Open Shop app"
            >
              Shop App
            </a>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">Explore</h4>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link className="hover:text-primary" to="/shop">
                All Products
              </Link>
            </li>
            <li>
              <Link className="hover:text-primary" to="/collections">
                Collections
              </Link>
            </li>
            <li>
              <Link className="hover:text-primary" to="/about">
                About
              </Link>
            </li>
            <li>
              <Link className="hover:text-primary" to="/blog">
                Blog
              </Link>
            </li>
            <li>
              <Link className="hover:text-primary" to="/shop?collection=new-arrivals">
                New Arrivals
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">Support</h4>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link className="hover:text-primary" to="/contact">
                Contact
              </Link>
            </li>
            <li>
              <Link className="hover:text-primary" to="/about">
                About us
              </Link>
            </li>
            {accountRoutes.isLoggedIn ? (
              <>
                <li>
                  <a className="hover:text-primary" href={accountRoutes.account}>
                    My account
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary" href={accountRoutes.orderHistory}>
                    Order history
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary" href={accountRoutes.addresses}>
                    Saved addresses
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary" href={accountRoutes.logout}>
                    Logout
                  </a>
                </li>
              </>
            ) : (
              <>
                {accountRoutes.loginEnabled ? (
                  <li>
                    <a
                      className="hover:text-primary"
                      href={accountRoutes.shopLogin}
                      onClick={(event) => {
                        event.preventDefault();
                        openShopLogin(accountRoutes.shopLogin);
                      }}
                    >
                      Login with Shop
                    </a>
                  </li>
                ) : null}
                <li>
                  <a
                    className="hover:text-primary"
                    href={accountRoutes.orderHistory}
                    onClick={(event) => {
                      if (accountRoutes.loginEnabled) {
                        event.preventDefault();
                        openShopLogin(accountRoutes.orderHistory);
                      }
                    }}
                  >
                    Order history
                  </a>
                </li>
              </>
            )}
            <li>
              <a className="hover:text-primary" href={privacyPolicyHref}>
                Privacy
              </a>
            </li>
            <li>
              <a className="hover:text-primary" href={returnsPolicyHref}>
                Returns
              </a>
            </li>
            <li>
              <a className="hover:text-primary" href={shippingPolicyHref}>
                Shipping
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">Stay Updated</h4>
          <form className="mt-3 space-y-3" onSubmit={onSubscribe}>
            <input
              className="salt-form-control w-full"
              type="email"
              required
              placeholder="email@domain.com"
            />
            <button
              className="salt-primary-cta h-11 w-full text-sm font-bold"
              type="submit"
            >
              Join the SALT List
            </button>
            {subscribed ? (
              <p className="text-xs text-emerald-700">
                Thanks. You are subscribed for product drops and launch updates.
              </p>
            ) : null}
          </form>
        </div>
      </div>

      <div className="border-t border-border/70 bg-background/35">
        <div className="mx-auto flex w-[min(1280px,96vw)] flex-col items-center justify-between gap-2 py-4 text-xs text-muted-foreground md:flex-row">
          <span>Copyright {new Date().getFullYear()} SALT Online Store.</span>
          <span>Mobile-optimized storefront with resilient catalog sync and accessible navigation.</span>
        </div>
      </div>
    </footer>
  );
};

export default MainFooter;
