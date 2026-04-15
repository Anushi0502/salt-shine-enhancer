import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

type BreadcrumbItem = {
  label: string;
  to?: string;
};

type InnerBreadcrumbsProps = {
  items: BreadcrumbItem[];
  className?: string;
};

const InnerBreadcrumbs = ({ items, className = "" }: InnerBreadcrumbsProps) => {
  if (!items.length) {
    return null;
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex flex-wrap items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground ${className}`.trim()}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <div key={`${item.label}-${index}`} className="inline-flex items-center gap-1.5">
            {item.to && !isLast ? (
              <Link to={item.to} className="transition hover:text-primary">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "text-foreground" : ""}>{item.label}</span>
            )}
            {!isLast ? <ChevronRight className="h-3.5 w-3.5" /> : null}
          </div>
        );
      })}
    </nav>
  );
};

export default InnerBreadcrumbs;
