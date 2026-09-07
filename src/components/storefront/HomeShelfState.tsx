import { AlertTriangle, PackageOpen, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

type HomeShelfStateProps = {
  shelfTitle: string;
  state: "loading" | "empty" | "error";
  onRetry?: () => void;
  isRetrying?: boolean;
  emptyActionHref?: string;
};

const HOME_SHELF_SKELETON_COUNT = 6;

function HomeShelfSkeleton({ shelfTitle }: Pick<HomeShelfStateProps, "shelfTitle">) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={`Loading ${shelfTitle} products`}
      className="mt-5 sm:mt-6"
    >
      <span className="sr-only">Loading {shelfTitle} products.</span>
      <div
        aria-hidden="true"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5 lg:gap-5 xl:grid-cols-6 xl:gap-6"
      >
        {Array.from({ length: HOME_SHELF_SKELETON_COUNT }, (_, index) => (
          <div
            key={`${shelfTitle}-skeleton-${index}`}
            data-home-shelf-skeleton="true"
            className="w-full max-w-[11rem] justify-self-center"
          >
            <Skeleton className="aspect-square w-full rounded-[1.25rem] border border-border/45" />
            <div className="px-1 pb-1 pt-3">
              <Skeleton className="h-3.5 w-[88%] rounded-full" />
              <Skeleton className="mt-2 h-3.5 w-[64%] rounded-full" />
              <Skeleton className="mt-4 h-5 w-[46%] rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HomeShelfMessage({
  shelfTitle,
  state,
  onRetry,
  isRetrying = false,
  emptyActionHref = "/collections/all",
}: Exclude<HomeShelfStateProps, { state: "loading" }>) {
  const isError = state === "error";
  const title = isError ? `We couldn't load ${shelfTitle}` : `More ${shelfTitle} picks are coming soon`;
  const description = isError
    ? "Please try again. Your current page and any products already loaded will stay in place."
    : "This shelf is being refreshed. You can keep browsing the rest of the store in the meantime.";

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className="mt-5 rounded-[1.35rem] border border-border/65 bg-background/72 px-4 py-7 text-center shadow-[0_16px_36px_-32px_rgba(22,77,160,0.2)] sm:mt-6 sm:px-6 sm:py-9"
    >
      <span
        aria-hidden="true"
        className={`mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full border ${
          isError
            ? "border-destructive/25 bg-destructive/10 text-destructive"
            : "border-primary/20 bg-primary/8 text-primary"
        }`}
      >
        {isError ? <AlertTriangle className="h-5 w-5" /> : <PackageOpen className="h-5 w-5" />}
      </span>
      <h3 className="mt-3 text-base font-semibold tracking-[-0.02em] text-foreground sm:text-lg">{title}</h3>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{description}</p>
      <div className="mt-5 flex justify-center">
        {isError ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={!onRetry || isRetrying}
            className="salt-outline-chip h-10 gap-2 px-4 py-0 text-[0.68rem] font-bold uppercase tracking-[0.13em] disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`} aria-hidden="true" />
            {isRetrying ? "Trying again" : "Try again"}
          </button>
        ) : (
          <Link
            to={emptyActionHref}
            className="salt-outline-chip h-10 px-4 py-0 text-[0.68rem] font-bold uppercase tracking-[0.13em]"
          >
            Shop all products
          </Link>
        )}
      </div>
    </div>
  );
}

export function HomeShelfState(props: HomeShelfStateProps) {
  if (props.state === "loading") {
    return <HomeShelfSkeleton shelfTitle={props.shelfTitle} />;
  }

  return <HomeShelfMessage {...props} />;
}

