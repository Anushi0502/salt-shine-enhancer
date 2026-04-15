import type { ReactNode } from "react";

type SectionHeadingProps = {
  kicker?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

const SectionHeading = ({
  kicker,
  title,
  description,
  action,
  className = "",
}: SectionHeadingProps) => {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between ${className}`.trim()}>
      <div>
        {kicker ? (
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary">{kicker}</p>
        ) : null}
        <h2 className="mt-1 font-display text-[clamp(1.7rem,2.8vw,2.6rem)] leading-[0.95] text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="w-full sm:w-auto">{action}</div> : null}
    </div>
  );
};

export default SectionHeading;
