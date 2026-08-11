import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import ProductRating from "@/components/storefront/ProductRating";
import type { JudgeMeReviewSummary } from "@/lib/judgeme";
import { cn } from "@/lib/utils";

type ResourceProductCardProps = {
  title: string;
  reason: string;
  image: string | null;
  price: string;
  label: string;
  to: string;
  reviewSummary?: JudgeMeReviewSummary | null;
  className?: string;
};

const baseClass =
  "group flex h-full flex-col overflow-hidden rounded-[1.55rem] border border-border/70 bg-[linear-gradient(180deg,hsl(var(--background)/0.98),hsl(var(--card)/0.92))] shadow-[0_18px_38px_-30px_rgba(15,23,42,0.18)] transition duration-300 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-[0_22px_42px_-32px_rgba(15,23,42,0.2)]";

const ResourceProductCard = ({ title, reason, image, price, label, to, reviewSummary, className }: ResourceProductCardProps) => {
  return (
    <Link to={to} className={cn(baseClass, className)}>
      <div className="relative overflow-hidden bg-muted/10">
        <div className="aspect-[1.08/0.92]">
          {image ? (
            <img
              src={image}
              alt={title}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="grid h-full w-full place-items-center bg-[linear-gradient(135deg,hsl(var(--background)/0.98),hsl(var(--card)/0.92))] px-4 text-center text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Resource pick
            </div>
          )}
        </div>

        <div className="absolute left-3 top-3 max-w-[calc(100%-6rem)]">
          <span className="salt-editorial-meta inline-flex max-w-full truncate rounded-full px-2.5 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-primary/80">
            {label}
          </span>
        </div>

      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <p className="text-[0.58rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">Featured product</p>
        <h3 className="mt-2 line-clamp-2 font-display text-[1.02rem] leading-[1.06] text-foreground">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{reason}</p>

        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div className="min-w-0">
            <p className="font-display text-[1.25rem] leading-none text-foreground">{price}</p>
            <span className="mt-2 inline-flex items-center gap-1 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              View product
              <ArrowRight className="h-3.5 w-3.5 shrink-0 transition group-hover:translate-x-0.5 group-hover:text-primary" />
            </span>
          </div>
          <ProductRating summary={reviewSummary} compact />
        </div>
      </div>
    </Link>
  );
};

export default ResourceProductCard;
