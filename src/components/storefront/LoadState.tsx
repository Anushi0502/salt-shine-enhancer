import type { ReactNode } from "react";

type LoadStateProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
};

export const LoadingState = ({ title, subtitle }: LoadStateProps) => (
  <section className="mx-auto mt-10 w-[min(1100px,92vw)] rounded-3xl border border-border/70 bg-card p-12 text-center shadow-soft">
    <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
    <h2 className="font-display text-3xl">{title}</h2>
    {subtitle ? <p className="mt-3 text-sm text-muted-foreground">{subtitle}</p> : null}
  </section>
);

export const ErrorState = ({ title, subtitle, action }: LoadStateProps) => (
  <section className="mx-auto mt-10 w-[min(1100px,92vw)] rounded-3xl border border-destructive/30 bg-card p-12 text-center shadow-soft">
    <h2 className="font-display text-3xl">{title}</h2>
    {subtitle ? <p className="mt-3 text-sm text-muted-foreground">{subtitle}</p> : null}
    {action ? <div className="mt-6">{action}</div> : null}
  </section>
);
