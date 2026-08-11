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
  "group flex h-full flex-col overflow-hidden rounded-[1.55rem] border border-border/80 bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--card)/0.94))] shadow-[0_18px_38px_-30px_rgba(15,23,42,0.16)] transition duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_22px_42px_-32px_rgba(15,23,42,0.18)]";

const ResourceProductCard = ({ title, reason, image, price, label, to, reviewSummary, className }: ResourceProductCardProps) => {
  return (
    <Link to={to} className={cn(baseClass, className)}>
      <div className="relative overflow-hidden bg-muted/10">
        <div className="aspect-square border-b border-border/70">
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

        <div className="absolute right-3 top-3 max-w-[calc(100%-6rem)]">
          <span className="inline-flex max-w-full truncate rounded-full border border-white/70 bg-[#314979] px-4 py-2 text-[0.62rem] font-semibold tracking-[0.14em] text-white shadow-[0_8px_18px_-12px_rgba(15,23,42,0.6)]">
            {label}
          </span>
        </div>

      </div>

      <div className="flex min-h-[10.25rem] flex-1 flex-col p-4 sm:p-5">
        <h3 className="line-clamp-2 font-display text-[1.08rem] leading-[1.08] text-foreground">{title}</h3>
        <p className="sr-only">{reason}</p>

        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <div className="min-w-0">
            <p className="font-display text-[1.25rem] leading-none tracking-[0.12em] text-primary">{price}</p>
            <span className="sr-only">
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
