import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, Clock3, Headset } from "lucide-react";
import BrandLogo from "@/components/layout/BrandLogo";

const MainFooter = () => {
  const [subscribed, setSubscribed] = useState(false);

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
              <Link to="/shipping-policy" className="salt-outline-chip h-10 px-4 py-0 text-xs">
                Shipping policy
              </Link>
              <Link to="/refund-policy" className="salt-outline-chip h-10 px-4 py-0 text-xs">
                Return policy
              </Link>
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
              className="salt-outline-chip"
            >
              Facebook
            </a>
            <a
              href="https://www.youtube.com/@SALTONLINESTORE"
              target="_blank"
              rel="noreferrer"
              className="salt-outline-chip"
            >
              YouTube
            </a>
            <a
              href="https://www.tiktok.com/@saltonlinestore"
              target="_blank"
              rel="noreferrer"
              className="salt-outline-chip"
            >
              TikTok
            </a>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="salt-outline-chip">
              Fast Dispatch
            </span>
            <span className="salt-outline-chip">
              Secure Checkout
            </span>
            <span className="salt-outline-chip">
              30-day Returns
            </span>
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
            <li>
              <Link className="hover:text-primary" to="/privacy-policy">
                Privacy
              </Link>
            </li>
            <li>
              <Link className="hover:text-primary" to="/refund-policy">
                Returns
              </Link>
            </li>
            <li>
              <Link className="hover:text-primary" to="/shipping-policy">
                Shipping
              </Link>
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
