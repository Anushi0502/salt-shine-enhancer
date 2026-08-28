import { useId, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, SearchX } from "lucide-react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

const GRID_CLASS_NAME =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-5 xl:grid-cols-6 xl:gap-6";

const DEFAULT_SKELETON_COUNT = 12;

type CollectionGridStateProps =
  | {
      state: "loading";
      itemCount?: number;
    }
  | {
      state: "error";
      onRetry: () => void | Promise<unknown>;
      retrying?: boolean;
    }
  | {
      state: "empty";
      hasSearchQuery: boolean;
      query?: string;
      onReset: () => void;
      children?: ReactNode;
    };

function ProductCardSkeleton({ index }: { index: number }) {
  return (
    <div
      aria-hidden="true"
      data-testid="collection-product-skeleton"
      className="min-w-0"
      style={{ animationDelay: `${Math.min(index * 45, 360)}ms` }}
    >
      <div className="relative aspect-square overflow-hidden rounded-[1.65rem] border border-border/70 bg-muted/65 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.32)]">
        <Skeleton className="h-full w-full rounded-none bg-muted/80" />
        <Skeleton className="absolute left-4 top-4 h-7 w-16 rounded-full bg-background/72" />
        <Skeleton className="absolute bottom-3 right-3 h-9 w-9 rounded-full bg-background/78 sm:bottom-4 sm:right-4 sm:h-10 sm:w-10" />
      </div>
      <div className="px-1 pt-4 sm:pt-5">
        <Skeleton className="h-4 w-[88%] rounded-full" />
        <Skeleton className="mt-2 h-4 w-[62%] rounded-full bg-muted/70" />
        <div className="mt-3 flex items-end gap-2">
          <Skeleton className="h-6 w-20 rounded-lg bg-muted/85" />
          <Skeleton className="h-3 w-12 rounded-full bg-muted/60" />
        </div>
      </div>
    </div>
  );
}

export default function CollectionGridState(props: CollectionGridStateProps) {
  const titleId = useId();
  const descriptionId = useId();

  if (props.state === "loading") {
    const itemCount = Math.max(1, props.itemCount ?? DEFAULT_SKELETON_COUNT);

    return (
      <section
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Loading products and current prices"
        className="salt-section-shell mt-5 rounded-[1.45rem] p-3 sm:mt-6 sm:rounded-[1.7rem] sm:p-4 lg:p-5"
      >
        <span className="sr-only">Loading products and current prices.</span>
        <div className={GRID_CLASS_NAME}>
          {Array.from({ length: itemCount }, (_, index) => (
            <ProductCardSkeleton key={index} index={index} />
          ))}
        </div>
      </section>
    );
  }

  if (props.state === "error") {
    return (
      <section
        role="alert"
        aria-live="assertive"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="salt-editorial-shell mt-5 rounded-[1.45rem] border border-destructive/20 p-6 text-center shadow-[0_22px_48px_-38px_rgba(127,29,29,0.34)] sm:mt-6 sm:rounded-[1.7rem] sm:p-8"
      >
        <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full border border-destructive/20 bg-destructive/10 text-destructive">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="mt-4 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-destructive">
          Products unavailable
        </p>
        <h2 id={titleId} className="mt-2 font-display text-[clamp(1.75rem,3vw,2.45rem)] leading-none text-foreground">
          We couldn't load this collection
        </h2>
        <p id={descriptionId} className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Live products and prices did not arrive. Try the request again or browse another collection.
        </p>
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              void props.onRetry();
            }}
            disabled={props.retrying}
            className="salt-primary-cta h-11 w-full justify-center gap-2 px-5 text-xs font-bold uppercase tracking-[0.08em] disabled:cursor-wait disabled:opacity-65 sm:w-auto"
          >
            <RefreshCw className={`h-4 w-4 ${props.retrying ? "animate-spin" : ""}`} aria-hidden="true" />
            {props.retrying ? "Retrying" : "Try again"}
          </button>
          <Link to="/collections" className="salt-outline-chip h-11 w-full justify-center px-5 py-0 text-xs sm:w-auto">
            Browse collections
          </Link>
        </div>
      </section>
    );
  }

  const normalizedQuery = props.query?.trim() || "";

  return (
    <section
      role="status"
      aria-live="polite"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="salt-editorial-shell mt-5 rounded-[1.45rem] p-6 text-center sm:mt-6 sm:rounded-[1.7rem] sm:p-8"
    >
      <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full border border-primary/18 bg-primary/[0.07] text-primary">
        <SearchX className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="mt-4 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-primary">
        {props.hasSearchQuery ? "No search matches" : "Collection is empty"}
      </p>
      <h2 id={titleId} className="mt-2 font-display text-[clamp(1.75rem,3vw,2.45rem)] leading-none text-foreground">
        {props.hasSearchQuery && normalizedQuery
          ? `No products found for “${normalizedQuery}”`
          : "No products match these filters"}
      </h2>
      <p id={descriptionId} className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
        {props.hasSearchQuery
          ? "Try a broader search, clear a filter, or use one of the suggested routes below."
          : "Reset the active filters or browse another curated collection to keep exploring."}
      </p>
      <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
        <button
          type="button"
          onClick={props.onReset}
          className="salt-primary-cta h-11 w-full justify-center px-5 text-xs font-bold uppercase tracking-[0.08em] sm:w-auto"
        >
          {props.hasSearchQuery ? "Clear search and filters" : "Reset filters"}
        </button>
        <Link to="/collections" className="salt-outline-chip h-11 w-full justify-center px-5 py-0 text-xs sm:w-auto">
          Browse collections
        </Link>
      </div>
      {props.children ? <div className="mt-5 flex flex-wrap justify-center gap-2">{props.children}</div> : null}
    </section>
  );
}
