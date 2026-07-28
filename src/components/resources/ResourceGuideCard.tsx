import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

type ResourceGuideCardProps = {
  title: string;
  summary: string;
  to: string;
  collectionLabel: string;
  topicCount: number;
  topicPreview: string[];
  featured?: boolean;
  className?: string;
};

const baseClass =
  "group block h-full rounded-[1.55rem] border border-border/70 bg-[linear-gradient(180deg,hsl(var(--background)/0.98),hsl(var(--card)/0.92))] p-4 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.16)] transition duration-300 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-[0_22px_40px_-32px_rgba(15,23,42,0.2)]";

const ResourceGuideCard = ({
  title,
  summary,
  to,
  collectionLabel,
  topicCount,
  topicPreview,
  featured = false,
  className,
}: ResourceGuideCardProps) => {
  return (
    <Link to={to} className={cn(baseClass, featured ? "p-5 sm:p-6" : "", className)}>
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[0.58rem] font-bold uppercase tracking-[0.16em] text-primary/80">Guide</p>
          <span className="salt-editorial-meta inline-flex items-center rounded-full px-2.5 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-primary/80">
            {topicCount} topics
          </span>
        </div>

        <div className="mt-2 min-w-0">
          <h3
            className={cn(
              "font-display leading-[0.96] text-foreground",
              featured ? "text-[clamp(1.45rem,2.2vw,2.05rem)]" : "text-[1.06rem]",
            )}
          >
            {title}
          </h3>
          <p className={cn("mt-2 text-sm leading-6 text-muted-foreground", featured ? "sm:text-[0.95rem]" : "")}>
            {summary}
          </p>
        </div>

        {topicPreview.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {topicPreview.slice(0, 3).map((topic) => (
              <span
                key={topic}
                className="salt-outline-chip h-8 px-2.5 py-0 text-[0.62rem] font-semibold uppercase tracking-[0.08em]"
              >
                {topic}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/60 pt-4">
          <div className="min-w-0">
            <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Collection route</p>
            <p className="mt-1 truncate text-sm font-semibold text-foreground">{collectionLabel}</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-2 text-[0.66rem] font-bold uppercase tracking-[0.1em] text-foreground transition group-hover:border-primary/20 group-hover:text-primary">
            Open guide
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
};

export default ResourceGuideCard;
