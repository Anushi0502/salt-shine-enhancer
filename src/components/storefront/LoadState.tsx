import type { ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import BrandLogo from "@/components/layout/BrandLogo";

type LoadStateProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
};

export const LoadingState = ({ title, subtitle }: LoadStateProps) => (
  <section className="mx-auto mt-10 w-[min(1100px,92vw)] rounded-3xl border border-border/70 bg-card/90 p-12 text-center shadow-soft">
    <div className="relative overflow-hidden rounded-2xl border border-border/65 bg-background/70 p-8">
      <div className="pointer-events-none absolute -left-10 -top-8 h-24 w-24 rounded-full bg-primary/16 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-8 -right-10 h-24 w-24 rounded-full bg-salt-olive/18 blur-2xl" />
      <BrandLogo className="mx-auto mb-3 w-fit" size="sm" />
      <div className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-primary/35 bg-primary/10 text-primary">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
      <h2 className="mt-4 font-display text-3xl">{title}</h2>
      {subtitle ? <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">{subtitle}</p> : null}
      <div className="mx-auto mt-5 grid max-w-xl gap-2 sm:grid-cols-3">
        <span className="h-2 rounded-full bg-muted/80" />
        <span className="h-2 rounded-full bg-muted/65" />
        <span className="h-2 rounded-full bg-muted/50" />
      </div>
    </div>
  </section>
);

export const ErrorState = ({ title, subtitle, action }: LoadStateProps) => (
  <section className="mx-auto mt-10 w-[min(1100px,92vw)] rounded-3xl border border-destructive/30 bg-card p-12 text-center shadow-soft">
    <div className="salt-panel-shell rounded-2xl border border-destructive/30 bg-destructive/5 p-8">
      <BrandLogo className="mx-auto mb-4 w-fit" size="sm" />
      <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h2 className="mt-4 font-display text-3xl">{title}</h2>
      {subtitle ? <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">{subtitle}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  </section>
);
