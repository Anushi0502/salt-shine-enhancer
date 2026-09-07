import { Link, useParams } from "react-router-dom";
import { ArrowLeft, MessageSquareQuote } from "lucide-react";
import ShopifyProductReviews from "@/components/storefront/ShopifyProductReviews";
import { ErrorState, LoadingState } from "@/components/storefront/LoadState";
import SeoMetadata from "@/components/storefront/SeoMetadata";
import { useProductByHandle } from "@/lib/shopify-data";
import { productImage } from "@/lib/formatters";

const ProductReviewsPage = () => {
  const { handle } = useParams();
  const { data: product, isLoading, error, refetch } = useProductByHandle(handle);

  if (isLoading) {
    return <LoadingState title="Loading reviews" subtitle="Preparing live feedback and rating breakdown." />;
  }

  if (error) {
    return (
      <ErrorState
        title="We could not load reviews"
        subtitle="Please retry to pull the latest review data."
        action={
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
          >
            Retry
          </button>
        }
      />
    );
  }

  if (!product) {
    return (
      <ErrorState
        title="Product not found"
        subtitle="This product is unavailable in the current live catalog."
        action={
          <Link
            to="/shop"
            className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
          >
            Browse products
          </Link>
        }
      />
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <SeoMetadata
        title={`${product.title} Reviews | SALT Online Store`}
        description={`Read customer reviews for ${product.title}.`}
        canonicalPath={`/products/${product.handle}/reviews`}
        image={productImage(product) || undefined}
        ogType="product"
      />
      <div className="salt-panel-shell rounded-[1.6rem] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <img
              src={productImage(product) || "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?w=320&h=320&fit=crop&auto=format"}
              alt={product.title}
              className="h-16 w-16 rounded-xl border border-border/80 object-cover"
            />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.09em] text-primary">Review center</p>
              <h1 className="mt-1 font-display text-[clamp(1.4rem,2.4vw,2rem)] leading-tight text-foreground">
                {product.title}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Read customer feedback before you place your order.
              </p>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            <Link to={`/products/${product.handle}`} className="salt-outline-chip h-10 w-full gap-1 px-4 py-0 text-xs sm:w-auto">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to product
            </Link>
            <Link to="/shop" className="salt-outline-chip h-10 w-full gap-1 px-4 py-0 text-xs sm:w-auto">
              <MessageSquareQuote className="h-3.5 w-3.5" /> Browse catalog
            </Link>
          </div>
        </div>
      </div>

      <ShopifyProductReviews
        productId={product.id}
        productHandle={product.handle}
        productTitle={product.title}
        mode="page"
      />
    </section>
  );
};

export default ProductReviewsPage;
