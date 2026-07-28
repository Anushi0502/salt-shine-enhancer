import type { LucideIcon } from "lucide-react";

type TrustStripItem = {
  icon: LucideIcon;
  label: string;
};

type TrustStripProps = {
  items: TrustStripItem[];
  className?: string;
};

const TrustStrip = ({ items, className = "" }: TrustStripProps) => {
  if (!items.length) {
    return null;
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`.trim()}>
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <span
            key={item.label}
            className="salt-editorial-meta inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.1em]"
          >
            <Icon className="h-3.5 w-3.5 text-primary" />
            {item.label}
          </span>
        );
      })}
    </div>
  );
};

export default TrustStrip;
