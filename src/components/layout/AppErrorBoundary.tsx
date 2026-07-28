import { Component, type ErrorInfo, type ReactNode } from "react";
import BrandLogo from "@/components/layout/BrandLogo";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

function formatErrorDetails(error: Error | null): string {
  if (!error) {
    return "An unexpected error occurred while loading the storefront.";
  }

  return error.stack || error.message || "An unexpected error occurred while loading the storefront.";
}

export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[SALT] App shell crashed", error, info);
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const details = formatErrorDetails(this.state.error);

    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.14),transparent_30%),radial-gradient(circle_at_80%_20%,hsl(var(--salt-gold)/0.1),transparent_28%),linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--background)/0.92)_56%,hsl(var(--muted)/0.78)_100%)] px-4 py-8 text-foreground sm:px-6 sm:py-10">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-3xl flex-col justify-center">
          <div className="salt-panel-shell rounded-[2rem] p-6 shadow-[0_28px_80px_-56px_rgba(15,23,42,0.22)] backdrop-blur sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <BrandLogo className="h-14 w-14 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[0.72rem] font-bold uppercase tracking-[0.3em] text-primary">
                  Storefront error
                </p>
                <h1 className="mt-3 font-display text-3xl leading-tight text-foreground sm:text-4xl">
                  The storefront hit an unexpected error.
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[0.95rem]">
                  Reloading should recover the page. If this keeps happening, the stack below will help
                  pinpoint the failed module.
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={this.handleRetry}
                    className="salt-primary-cta inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold text-white"
                  >
                    Reload storefront
                  </button>
                </div>

                <div className="salt-section-shell mt-6 rounded-[1.25rem] p-4">
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-primary">
                    Error details
                  </p>
                  <pre className="mt-3 max-h-[20rem] overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-foreground">
                    {details}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
