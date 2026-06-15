import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import InnerBreadcrumbs from "@/components/storefront/InnerBreadcrumbs";

export type OpenPageAction = {
  label: string;
  to?: string;
  href?: string;
  primary?: boolean;
};

type OpenContentPageShellProps = {
  breadcrumbs: Array<{ label: string; to?: string }>;
  kicker?: string;
  title: string;
  summary?: string;
  meta?: ReactNode;
  aside?: ReactNode;
  actions?: OpenPageAction[];
  children?: ReactNode;
  className?: string;
};

const actionBaseClass =
  "inline-flex h-11 items-center justify-center rounded-full border px-5 text-[0.7rem] font-bold uppercase tracking-[0.08em] transition hover:-translate-y-[1px]";

function renderAction(action: OpenPageAction) {
  const actionClass = action.primary
    ? `${actionBaseClass} border-[#0f2742] bg-[#0f2742] text-white hover:border-[#15305b] hover:bg-[#15305b]`
    : `${actionBaseClass} border-[#bfd4fb] bg-white text-[#102A43] hover:border-[#9fc0f5] hover:bg-[#f5faff]`;

  if (action.href) {
    const external = /^https?:\/\//i.test(action.href);

    return (
      <a
        key={action.label}
        href={action.href}
        className={actionClass}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
      >
        {action.label}
      </a>
    );
  }

  return (
    <Link key={action.label} to={action.to || "/"} className={actionClass}>
      {action.label}
    </Link>
  );
}

const OpenContentPageShell = ({
  breadcrumbs,
  kicker,
  title,
  summary,
  meta,
  aside,
  actions,
  children,
  className = "",
}: OpenContentPageShellProps) => {
  return (
    <section className={`mx-auto w-[min(1160px,calc(100%-20px))] pb-14 pt-4 sm:pb-16 ${className}`.trim()}>
      <InnerBreadcrumbs items={breadcrumbs} />

      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div>
          {kicker ? (
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.18em] text-primary">{kicker}</p>
          ) : null}
          <h1 className="mt-3 font-display text-[clamp(2.4rem,6vw,4.7rem)] leading-[0.92] text-foreground">
            {title}
          </h1>
          {summary ? (
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">{summary}</p>
          ) : null}
          {meta ? <div className="mt-4">{meta}</div> : null}
          {actions?.length ? <div className="mt-6 flex flex-wrap gap-3">{actions.map(renderAction)}</div> : null}
        </div>

        {aside ? <aside className="space-y-5 border-l border-[#d8e6f5] pl-5 lg:sticky lg:top-24">{aside}</aside> : null}
      </div>

      {children ? <div className="mt-10">{children}</div> : null}
    </section>
  );
};

export default OpenContentPageShell;
