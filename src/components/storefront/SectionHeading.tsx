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
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6 ${className}`.trim()}>
      <div className="max-w-3xl">
        {kicker ? (
          <p className="salt-kicker">{kicker}</p>
        ) : null}
        <h2 className="mt-2 font-display text-[clamp(1.85rem,3vw,3rem)] leading-[0.94] tracking-[-0.05em] text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 text-sm leading-7 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="w-full sm:w-auto sm:pt-1">{action}</div> : null}
    </div>
  );
};

export default SectionHeading;
