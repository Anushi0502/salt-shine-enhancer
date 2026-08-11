import { Star } from "lucide-react";
import type { JudgeMeReviewSummary } from "@/lib/judgeme";
import { cn } from "@/lib/utils";

type ProductRatingProps = {
  summary?: Pick<JudgeMeReviewSummary, "rating" | "reviewCount"> | null;
  className?: string;
  compact?: boolean;
};

const ProductRating = ({ summary, className, compact = false }: ProductRatingProps) => {
  const rating = Number(summary?.rating || 0);
  const reviewCount = Number(summary?.reviewCount || 0);
  const hasReviews = rating > 0 && reviewCount > 0;
  const roundedRating = hasReviews ? Math.round(rating * 2) / 2 : 0;

  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-[0.62rem] font-semibold text-foreground",
        compact && "gap-1 text-[0.58rem]",
        className,
      )}
      aria-label={hasReviews ? `${rating.toFixed(1)} out of 5 stars from ${reviewCount.toLocaleString()} reviews` : "No reviews yet"}
    >
      <span className="inline-flex items-center gap-0.5 text-amber-500" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <Star
            key={index}
            className={cn(
              compact ? "h-3 w-3" : "h-3.5 w-3.5",
              index + 1 <= roundedRating ? "fill-current" : "text-amber-300",
            )}
          />
        ))}
      </span>
      <span className="whitespace-nowrap text-foreground">
        {hasReviews ? rating.toFixed(1) : "New"}
      </span>
      {hasReviews ? <span className="whitespace-nowrap text-muted-foreground">({reviewCount.toLocaleString()})</span> : null}
    </div>
  );
};

export default ProductRating;
