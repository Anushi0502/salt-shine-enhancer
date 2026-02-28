import type { ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import BrandLogo from "@/components/layout/BrandLogo";

type LoadStateProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
};

type StateTone = "loading" | "error";

type StateShellProps = LoadStateProps & {
  tone: StateTone;
  icon: ReactNode;
  showSkeleton?: boolean;
};

const toneClassMap: Record<StateTone, string> = {
  loading: "border-border/70 bg-card/90",
  error: "border-destructive/30 bg-card",
};

const iconClassMap: Record<StateTone, string> = {
  loading: "border-primary/35 bg-primary/10 text-primary",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
};

const panelToneClassMap: Record<StateTone, string> = {
  loading: "border-border/70 bg-background/68",
  error: "border-destructive/32 bg-destructive/5",
};

const StateShell = ({ title, subtitle, action, tone, icon, showSkeleton = false }: StateShellProps) => (
  <section
    className={`mx-auto mt-10 w-[min(1100px,92vw)] rounded-3xl border p-12 text-center shadow-soft ${toneClassMap[tone]}`}
  >
    <div className={`salt-panel-shell relative overflow-hidden rounded-2xl border p-8 ${panelToneClassMap[tone]}`}>
      <div className="pointer-events-none absolute -left-10 -top-8 h-24 w-24 rounded-full bg-primary/16 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-8 -right-10 h-24 w-24 rounded-full bg-salt-olive/18 blur-2xl" />
      <BrandLogo className="mx-auto mb-3 w-fit" size="sm" />
      <div className={`inline-flex h-11 w-11 items-center justify-center rounded-full border ${iconClassMap[tone]}`}>
        {icon}
      </div>
      <h2 className="mt-4 font-display text-3xl">{title}</h2>
      {subtitle ? <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">{subtitle}</p> : null}
      {showSkeleton ? (
        <div className="mx-auto mt-5 grid max-w-xl gap-2 sm:grid-cols-3">
          <span className="h-2 rounded-full bg-muted/80" />
          <span className="h-2 rounded-full bg-muted/65" />
          <span className="h-2 rounded-full bg-muted/50" />
        </div>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  </section>
);

export const LoadingState = ({ title, subtitle, action }: LoadStateProps) => (
  <StateShell
    title={title}
    subtitle={subtitle}
    action={action}
    tone="loading"
    icon={<Loader2 className="h-5 w-5 animate-spin" />}
    showSkeleton
  />
);

export const ErrorState = ({ title, subtitle, action }: LoadStateProps) => (
  <StateShell
    title={title}
    subtitle={subtitle}
    action={action}
    tone="error"
    icon={<AlertTriangle className="h-5 w-5" />}
  />
);
