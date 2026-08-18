import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
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
  loading: "border-border/60 bg-[linear-gradient(180deg,hsl(var(--background)/0.98),hsl(var(--card)/0.92))]",
  error: "border-destructive/22 bg-[linear-gradient(180deg,hsl(var(--background)/0.98),hsl(var(--muted)/0.74))]",
};

const iconClassMap: Record<StateTone, string> = {
  loading: "border-primary/28 bg-primary/10 text-primary",
  error: "border-destructive/22 bg-destructive/10 text-destructive",
};

const panelToneClassMap: Record<StateTone, string> = {
  loading: "border-border/55 bg-background/82",
  error: "border-destructive/18 bg-background/82",
};

const StateShell = ({ title, subtitle, action, tone, icon, showSkeleton = false }: StateShellProps) => (
  <section
    className={`mx-auto mt-5 w-[min(1120px,calc(100%_-_20px))] rounded-[2rem] border p-3 text-center shadow-[0_26px_62px_-46px_rgba(15,23,42,0.28)] sm:mt-6 sm:p-4 ${toneClassMap[tone]}`}
  >
    <div className={`salt-editorial-shell relative overflow-hidden rounded-[1.7rem] border p-3 sm:rounded-[1.95rem] sm:p-4 ${panelToneClassMap[tone]}`}>
      <div className="pointer-events-none absolute -left-10 -top-8 h-24 w-24 rounded-full bg-primary/10 blur-3xl sm:h-28 sm:w-28" />
      <div className="pointer-events-none absolute -bottom-8 -right-10 h-24 w-24 rounded-full bg-salt-blue/10 blur-3xl sm:h-28 sm:w-28" />
      <div className="salt-surface relative overflow-hidden rounded-[1.45rem] border border-border/70 bg-background/92 p-4 sm:p-6 lg:p-8">
        <BrandLogo className="mx-auto w-fit rounded-full border border-border/70 bg-background/90 px-3 py-2 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.16)]" size="sm" />
        <div className={`mx-auto mt-4 inline-flex h-10 w-10 items-center justify-center rounded-full border sm:h-11 sm:w-11 ${iconClassMap[tone]}`}>
          {icon}
        </div>
        <h2 className="mt-3 font-display text-[clamp(1.8rem,7vw,3rem)] leading-[0.94] tracking-[-0.05em] text-foreground sm:mt-4">
          {title}
        </h2>
        {subtitle ? <p className="mx-auto mt-2.5 max-w-xl text-sm leading-6 text-muted-foreground sm:mt-3">{subtitle}</p> : null}
        {showSkeleton ? (
          <div className="mx-auto mt-4 grid max-w-xl gap-2 sm:mt-5 sm:grid-cols-3">
            <span className="h-2 rounded-full bg-muted/75" />
            <span className="h-2 rounded-full bg-muted/65" />
            <span className="h-2 rounded-full bg-muted/45" />
          </div>
        ) : null}
        {action ? <div className="mt-5 sm:mt-6">{action}</div> : null}
      </div>
    </div>
  </section>
);

export const LoadingState = ({ title, subtitle }: LoadStateProps) => (
  <section
    role="status"
    aria-live="polite"
    aria-busy="true"
    aria-label={[title, subtitle].filter(Boolean).join(". ")}
    data-loading-shell="true"
    className="mx-auto w-[min(1240px,calc(100%_-_20px))] px-0 pb-12 pt-3 sm:pb-16 sm:pt-5"
  >
    <span className="sr-only">{title}{subtitle ? `. ${subtitle}` : ""}</span>
    <div className="salt-editorial-shell overflow-hidden rounded-[2rem] p-3 sm:p-4">
      <div className="salt-panel-shell animate-pulse rounded-[1.7rem] p-4 sm:p-6 lg:p-8">
        <div className="h-3 w-24 rounded-full bg-muted/75" />
        <div className="mt-4 h-10 w-[min(30rem,78%)] rounded-xl bg-muted/70 sm:h-14" />
        <div className="mt-3 h-4 w-[min(38rem,92%)] rounded-full bg-muted/55" />
        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
          <div className="min-h-[15rem] rounded-[1.35rem] bg-muted/50 sm:min-h-[19rem] lg:min-h-[25rem]" />
          <div className="space-y-3">
            <div className="h-5 w-2/3 rounded-full bg-muted/60" />
            <div className="h-12 w-full rounded-2xl bg-muted/45" />
            <div className="h-12 w-full rounded-2xl bg-muted/45" />
            <div className="h-12 w-4/5 rounded-2xl bg-muted/45" />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-24 rounded-[1.1rem] bg-muted/42 sm:h-32" />
          ))}
        </div>
      </div>
    </div>
  </section>
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
