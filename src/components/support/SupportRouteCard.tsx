import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

type SupportRouteCardProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
  to?: string;
  href?: string;
  onClick?: () => void;
  className?: string;
};

const cardBaseClass =
  "group flex h-full items-start gap-3 rounded-[1.4rem] border border-border/70 bg-[linear-gradient(180deg,hsl(var(--background)/0.98),hsl(var(--card)/0.92))] p-4 text-left shadow-[0_18px_36px_-30px_rgba(15,23,42,0.16)] transition duration-300 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-[0_22px_40px_-32px_rgba(15,23,42,0.2)]";

const SupportRouteCardContent = ({
  title,
  description,
  icon: Icon,
  badge,
}: Pick<SupportRouteCardProps, "title" | "description" | "icon" | "badge">) => (
  <>
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-background/90 text-primary shadow-[0_10px_18px_-16px_rgba(15,23,42,0.18)]">
      <Icon className="h-5 w-5" />
    </span>

    <div className="min-w-0 flex-1">
      {badge ? (
        <p className="text-[0.56rem] font-bold uppercase tracking-[0.16em] text-primary/75">{badge}</p>
      ) : null}
      <p className={cn("text-[0.98rem] font-semibold leading-6 text-foreground", badge ? "mt-0.5" : "")}>
        {title}
      </p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>

    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
  </>
);

const SupportRouteCard = ({ title, description, icon, badge, to, href, onClick, className }: SupportRouteCardProps) => {
  const mergedClassName = cn(cardBaseClass, className);

  if (href) {
    const external = /^https?:\/\//i.test(href);

    return (
      <a href={href} className={mergedClassName} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
        <SupportRouteCardContent title={title} description={description} icon={icon} badge={badge} />
      </a>
    );
  }

  if (to) {
    return (
      <Link to={to} className={mergedClassName}>
        <SupportRouteCardContent title={title} description={description} icon={icon} badge={badge} />
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={mergedClassName}>
      <SupportRouteCardContent title={title} description={description} icon={icon} badge={badge} />
    </button>
  );
};

export default SupportRouteCard;
