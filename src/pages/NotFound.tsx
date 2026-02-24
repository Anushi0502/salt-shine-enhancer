import { Link } from "react-router-dom";

const NotFound = () => {
  return (
    <div className="mx-auto my-16 flex min-h-[55vh] w-[min(760px,92vw)] items-center justify-center rounded-[2rem] border border-border/80 bg-card p-10 text-center shadow-soft">
      <div className="text-center">
        <h1 className="font-display text-5xl">404</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This page does not exist. Continue shopping from the main storefront.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            to="/"
            className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground"
          >
            Return home
          </Link>
          <Link
            to="/shop"
            className="inline-flex h-11 items-center rounded-full border border-border bg-background px-5 text-sm font-bold"
          >
            Browse products
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
