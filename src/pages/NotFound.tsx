import { Link } from "react-router-dom";
import { Compass, Home, ShoppingBag } from "lucide-react";
import BrandLogo from "@/components/layout/BrandLogo";

const NotFound = () => {
  return (
    <div className="mx-auto my-16 flex min-h-[55vh] w-[min(780px,92vw)] items-center justify-center rounded-[2rem] border border-border/80 bg-card p-10 text-center shadow-soft">
      <div className="salt-panel-shell relative w-full rounded-[1.5rem] px-6 py-10">
        <div className="pointer-events-none absolute -left-10 -top-8 h-28 w-28 rounded-full bg-primary/16 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-10 -right-12 h-28 w-28 rounded-full bg-salt-olive/18 blur-2xl" />
        <BrandLogo className="mx-auto w-fit" withWordmark size="sm" />
        <h1 className="mt-3 font-display text-6xl leading-none">404</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This page does not exist. Continue shopping from the main storefront.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            to="/"
            className="salt-primary-cta inline-flex h-11 items-center gap-2 px-5 text-sm font-bold"
          >
            <Home className="h-4 w-4" /> Return home
          </Link>
          <Link
            to="/shop"
            className="salt-outline-chip inline-flex h-11 items-center gap-2 px-5 py-0 text-sm"
          >
            <ShoppingBag className="h-4 w-4" /> Browse products
          </Link>
          <Link
            to="/collections"
            className="salt-outline-chip inline-flex h-11 items-center gap-2 px-5 py-0 text-sm"
          >
            <Compass className="h-4 w-4" /> View collections
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
