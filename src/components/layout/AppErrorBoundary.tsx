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
      <div className="min-h-screen bg-[linear-gradient(180deg,#f7fbff_0%,#eef5ff_54%,#f7f3ea_100%)] px-4 py-8 text-[#17336b] sm:px-6 sm:py-10">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-3xl flex-col justify-center">
          <div className="rounded-[2rem] border border-[#c9dcff] bg-white/92 p-6 shadow-[0_28px_80px_-56px_rgba(22,77,160,0.35)] backdrop-blur sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <BrandLogo className="h-14 w-14 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[0.72rem] font-bold uppercase tracking-[0.3em] text-[#2f5bc7]">
                  Storefront error
                </p>
                <h1 className="mt-3 font-display text-3xl leading-tight text-[#15316a] sm:text-4xl">
                  The storefront hit an unexpected error.
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-[0.95rem]">
                  Reloading should recover the page. If this keeps happening, the stack below will help
                  pinpoint the failed module.
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={this.handleRetry}
                    className="inline-flex h-11 items-center justify-center rounded-full bg-[#305fd2] px-5 text-sm font-semibold text-white shadow-[0_16px_28px_-20px_rgba(48,95,210,0.7)] transition hover:bg-[#274fb3]"
                  >
                    Reload storefront
                  </button>
                </div>

                <div className="mt-6 rounded-[1.25rem] border border-[#d7e6ff] bg-[#f8fbff] p-4">
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-[#4c6fb8]">
                    Error details
                  </p>
                  <pre className="mt-3 max-h-[20rem] overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-slate-700">
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
