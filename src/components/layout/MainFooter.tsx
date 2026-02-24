import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";

const MainFooter = () => {
  const [subscribed, setSubscribed] = useState(false);

  const onSubscribe = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubscribed(true);
  };

  return (
    <footer className="mt-20 border-t border-border/70 bg-card/80">
      <div className="mx-auto grid w-[min(1280px,96vw)] gap-10 py-12 md:grid-cols-4">
        <div>
          <h3 className="font-display text-2xl">SALT</h3>
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
            with a conversion-focused browsing experience.
          </p>
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
              <a className="hover:text-primary" href="https://saltonlinestore.com/policies/privacy-policy" target="_blank" rel="noreferrer">
                Privacy
              </a>
            </li>
            <li>
              <a className="hover:text-primary" href="https://saltonlinestore.com/policies/refund-policy" target="_blank" rel="noreferrer">
                Returns
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">Stay Updated</h4>
          <form className="mt-3 space-y-3" onSubmit={onSubscribe}>
            <input
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/50"
              type="email"
              required
              placeholder="email@domain.com"
            />
            <button
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground transition hover:brightness-110"
              type="submit"
            >
              Subscribe to Drops
            </button>
            {subscribed ? (
              <p className="text-xs text-emerald-700">
                Thanks. You are subscribed for product drops and launch updates.
              </p>
            ) : null}
          </form>
        </div>
      </div>

      <div className="border-t border-border/70">
        <div className="mx-auto flex w-[min(1280px,96vw)] flex-col items-center justify-between gap-2 py-4 text-xs text-muted-foreground md:flex-row">
          <span>Copyright {new Date().getFullYear()} SALT Online Store.</span>
          <span>Built for production with responsive layout, resilient data fallback, and accessible navigation.</span>
        </div>
      </div>
    </footer>
  );
};

export default MainFooter;
