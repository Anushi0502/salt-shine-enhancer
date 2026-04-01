import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, BadgeCheck, Facebook, Instagram, Mail, Youtube } from "lucide-react";
import BrandLogo from "@/components/layout/BrandLogo";
import {
  getRuntimeContext,
  getShopAppUrl,
  resolveStorefrontPath,
} from "@/lib/theme-assets";

const runtimeContext = getRuntimeContext();
const shopAppUrl = getShopAppUrl();
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

  const onSubscribe = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubscribed(true);
  };

  return (
    <footer className="mt-16 border-t border-border/70 bg-[linear-gradient(180deg,hsl(var(--card)/0.38),hsl(var(--card)/0.92))]">
      <div className="mx-auto w-[min(1340px,94vw)] py-8">
        <div className="rounded-[2rem] border border-border/70 bg-[hsl(var(--salt-ink))] px-6 py-6 text-[hsl(var(--salt-paper))] shadow-[0_36px_90px_-56px_rgba(15,23,42,0.44)] sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <BrandLogo withWordmark size="md" />
            <div className="flex flex-wrap gap-3">
              <a
                href={`mailto:${supportEmail}`}
                className="salt-primary-cta h-11 justify-center px-5 text-[0.72rem] font-semibold uppercase tracking-[0.12em]"
              >
                Support
              </a>
              <Link
                to="/contact"
                className="inline-flex h-11 items-center justify-center rounded-full border border-white/16 bg-white/8 px-5 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-white hover:text-[hsl(var(--salt-ink))]"
              >
                Contact
              </Link>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 text-[0.7rem] font-medium uppercase tracking-[0.14em] text-white/72">
            <span className="rounded-full border border-white/14 bg-white/8 px-4 py-2">US shipping clarity</span>
            <span className="rounded-full border border-white/14 bg-white/8 px-4 py-2">Secure Shopify checkout</span>
            <span className="rounded-full border border-white/14 bg-white/8 px-4 py-2">30-day returns</span>
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-[min(1340px,94vw)] gap-10 pb-12 pt-4 lg:grid-cols-[1.2fr_0.8fr_0.8fr_1fr]">
        <div>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href="https://www.instagram.com/saltonlinestore?igsh=MXV0amdybnp6bW1hYg=="
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-card/82 text-muted-foreground transition hover:border-primary/40 hover:text-primary"
              aria-label="SALT on Instagram"
            >
              <Instagram className="h-5 w-5" />
            </a>
            <a
              href="https://www.facebook.com/people/SALT-online-store/61573199456052/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-card/82 text-muted-foreground transition hover:border-primary/40 hover:text-primary"
              aria-label="SALT on Facebook"
            >
              <Facebook className="h-5 w-5" />
            </a>
            <a
              href="https://www.youtube.com/@SALTONLINESTORE"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-card/82 text-muted-foreground transition hover:border-primary/40 hover:text-primary"
              aria-label="SALT on YouTube"
            >
              <Youtube className="h-5 w-5" />
            </a>
            <a
              href="https://www.tiktok.com/@saltonlinestore"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-card/82 text-muted-foreground transition hover:border-primary/40 hover:text-primary"
              aria-label="SALT on TikTok"
            >
              <TikTokIcon className="h-5 w-5" />
            </a>
          </div>

          <div className="mt-5 grid gap-2">
            <a
              href={`mailto:${supportEmail}`}
              className="inline-flex items-center gap-2 text-sm text-foreground transition hover:text-primary"
            >
              <Mail className="h-4 w-4" />
              {supportEmail}
            </a>
            <a
              href={shopAppUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm text-foreground transition hover:text-primary"
            >
              <BadgeCheck className="h-4 w-4" />
              Shop App
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        <div>
          <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Shop
          </h3>
          <div className="mt-4 grid gap-2 text-sm">
            <Link to="/shop" className="transition hover:text-primary">All products</Link>
            <Link to="/collections" className="transition hover:text-primary">Collections</Link>
            <Link to="/shop?sort=newest" className="transition hover:text-primary">New arrivals</Link>
            <Link to="/shop?sort=discount" className="transition hover:text-primary">Best savings</Link>
            <Link to="/blog" className="transition hover:text-primary">Journal</Link>
          </div>
        </div>

        <div>
          <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Support
          </h3>
          <div className="mt-4 grid gap-2 text-sm">
            <Link to="/contact" className="transition hover:text-primary">Contact</Link>
            <Link to="/order-history" className="transition hover:text-primary">Order history</Link>
            <a href={shippingPolicyHref} className="transition hover:text-primary">Shipping policy</a>
            <a href={returnsPolicyHref} className="transition hover:text-primary">Return policy</a>
            <a href={privacyPolicyHref} className="transition hover:text-primary">Privacy policy</a>
          </div>
        </div>

        <div>
          <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Join the SALT list
          </h3>
          <form onSubmit={onSubscribe} className="mt-4 space-y-3">
            <input
              className="salt-form-control h-12 w-full rounded-full px-4"
              type="email"
              required
              placeholder="email@domain.com"
            />
            <button
              className="salt-primary-cta h-12 w-full justify-center px-5 text-[0.76rem] font-semibold uppercase tracking-[0.12em]"
              type="submit"
            >
              Join newsletter
            </button>
            {subscribed ? (
              <p className="text-sm text-emerald-700">You’re subscribed for updates from SALT.</p>
            ) : null}
          </form>
        </div>
      </div>

      <div className="border-t border-border/70 bg-background/40">
        <div className="mx-auto flex w-[min(1340px,94vw)] flex-col gap-2 py-5 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <span>Copyright {new Date().getFullYear()} SALT Online Store.</span>
          <span>Curated home, gifts, lifestyle, and everyday essentials.</span>
        </div>
      </div>
    </footer>
  );
};

export default MainFooter;
