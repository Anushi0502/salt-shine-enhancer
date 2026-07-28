import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import InnerBreadcrumbs from "@/components/storefront/InnerBreadcrumbs";

type OpenPageTone = "default" | "shop";

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
  tone?: OpenPageTone;
};

const actionBaseClass =
  "inline-flex h-11 items-center justify-center rounded-full border px-5 text-[0.7rem] font-bold uppercase tracking-[0.08em] transition hover:-translate-y-[1px]";

function renderAction(action: OpenPageAction) {
  const actionClass = action.primary
    ? `${actionBaseClass} salt-primary-cta border-transparent text-white shadow-[0_18px_30px_-24px_rgba(37,99,235,0.5)]`
    : `${actionBaseClass} salt-outline-chip border-border text-foreground hover:text-primary`;

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
  tone = "default",
}: OpenContentPageShellProps) => {
  const hasAside = Boolean(aside);
  const shellClassName =
    tone === "shop"
      ? "salt-editorial-shell salt-shop-channel-shell"
      : "salt-editorial-shell";

  return (
    <section className={`mx-auto w-[min(1240px,calc(100%_-_20px))] pb-16 pt-4 sm:pb-18 sm:pt-5 ${className}`.trim()}>
      <InnerBreadcrumbs items={breadcrumbs} />

      <div className={`mt-5 grid gap-4 ${hasAside ? "lg:grid-cols-[minmax(0,1fr)_minmax(300px,320px)]" : ""}`}>
        <div className={`${shellClassName} rounded-[2rem] p-3 sm:p-4`}>
          <div className="salt-panel-shell rounded-[1.7rem] p-4 sm:p-6 lg:p-7">
            <div className="max-w-4xl">
              {kicker ? <p className="salt-kicker">{kicker}</p> : null}
              <h1 className="mt-3 font-display text-[clamp(2.5rem,6.2vw,5rem)] leading-[0.9] tracking-[-0.06em] text-foreground">
                {title}
              </h1>
              {summary ? (
                <p className="mt-4 max-w-3xl text-[0.98rem] leading-7 text-muted-foreground sm:text-base">
                  {summary}
                </p>
              ) : null}
              {meta ? <div className="mt-5">{meta}</div> : null}
              {actions?.length ? <div className="mt-6 flex flex-wrap gap-3">{actions.map(renderAction)}</div> : null}
            </div>
          </div>
        </div>

        {aside ? (
          <aside className="salt-section-shell space-y-5 rounded-[1.7rem] p-4 sm:p-5 lg:sticky lg:top-24">
            {aside}
          </aside>
        ) : null}
      </div>

      {children ? (
        <div className="salt-section-shell mt-4 rounded-[1.85rem] p-4 sm:mt-5 sm:p-5 lg:p-6">
          {children}
        </div>
      ) : null}
    </section>
  );
};

export default OpenContentPageShell;
