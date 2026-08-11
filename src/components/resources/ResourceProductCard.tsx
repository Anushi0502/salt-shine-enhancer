import type { JudgeMeReviewSummary } from "@/lib/judgeme";
import ProductCard from "@/components/storefront/ProductCard";
import type { ShopifyProduct } from "@/types/shopify";

type ResourceProductCardProps = {
  product: ShopifyProduct;
  reviewSummary?: JudgeMeReviewSummary | null;
  className?: string;
};

const ResourceProductCard = ({ product, reviewSummary, className }: ResourceProductCardProps) => (
  <ProductCard product={product} reviewSummary={reviewSummary} className={className} />
);

export default ResourceProductCard;
