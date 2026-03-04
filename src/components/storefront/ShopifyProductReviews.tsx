import { useEffect } from "react";
import { MessageSquareQuote, Star } from "lucide-react";
import { getShopBaseOrigin } from "@/lib/theme-assets";

declare global {
  interface Window {
    SPR?: {
      initDomEls?: () => void;
      initRatingHandler?: () => void;
      initQuantityHandler?: () => void;
      registerCallbacks?: () => void;
      loadProducts?: () => void;
      loadBadges?: () => void;
    };
  }
}

const SHOPIFY_REVIEWS_SCRIPT_ID = "salt-shopify-reviews-script";
const SHOPIFY_REVIEWS_STYLE_ID = "salt-shopify-reviews-style";
const SHOPIFY_REVIEWS_SCRIPT_URL = "https://productreviews.shopifycdn.com/assets/v4/spr.js";
const SHOPIFY_REVIEWS_STYLE_URL = "https://productreviews.shopifycdn.com/assets/v4/spr.css";

type ShopifyProductReviewsProps = {
  productId: number;
  productHandle: string;
};

function initializeShopifyReviews() {
  if (typeof window === "undefined" || !window.SPR) {
    return;
  }

  window.SPR.initDomEls?.();
  window.SPR.registerCallbacks?.();
  window.SPR.initRatingHandler?.();
  window.SPR.initQuantityHandler?.();
  window.SPR.loadBadges?.();
  window.SPR.loadProducts?.();
}

function ensureReviewsStyle() {
  if (typeof document === "undefined" || document.getElementById(SHOPIFY_REVIEWS_STYLE_ID)) {
    return;
  }

  const styleTag = document.createElement("link");
  styleTag.id = SHOPIFY_REVIEWS_STYLE_ID;
  styleTag.rel = "stylesheet";
  styleTag.href = SHOPIFY_REVIEWS_STYLE_URL;
  document.head.appendChild(styleTag);
}

function ensureReviewsScript(onReady: () => void) {
  if (typeof document === "undefined") {
    return;
  }

  const existing = document.getElementById(SHOPIFY_REVIEWS_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    if ((window as Window).SPR) {
      onReady();
    } else {
      existing.addEventListener("load", onReady, { once: true });
    }
    return;
  }

  const scriptTag = document.createElement("script");
  scriptTag.id = SHOPIFY_REVIEWS_SCRIPT_ID;
  scriptTag.src = SHOPIFY_REVIEWS_SCRIPT_URL;
  scriptTag.async = true;
  scriptTag.addEventListener("load", onReady, { once: true });
  document.body.appendChild(scriptTag);
}

const ShopifyProductReviews = ({ productId, productHandle }: ShopifyProductReviewsProps) => {
  const productUrl = `${getShopBaseOrigin()}/products/${productHandle}`;

  useEffect(() => {
    ensureReviewsStyle();
    const onReady = () => {
      initializeShopifyReviews();
      window.setTimeout(() => initializeShopifyReviews(), 180);
    };

    ensureReviewsScript(onReady);
    initializeShopifyReviews();
  }, [productId, productHandle]);

  if (!productId) {
    return null;
  }

  return (
    <section className="salt-reviews-shell mt-12">
      <div className="salt-panel-shell rounded-[1.7rem] p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-primary">Verified feedback</p>
            <h2 className="mt-1 font-display text-[clamp(1.5rem,2.4vw,2.2rem)] leading-tight">
              Shopify product reviews
            </h2>
          </div>
          <a
            href={`${productUrl}#shopify-product-reviews`}
            className="salt-outline-chip h-10 px-4 py-0 text-xs"
            target="_blank"
            rel="noreferrer"
          >
            Open full review page
          </a>
        </div>

        <div className="mb-3 flex flex-wrap gap-2 text-[0.68rem] text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full border border-border/75 bg-background px-3 py-1">
            <Star className="h-3.5 w-3.5 text-primary" />
            Real shopper ratings
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-border/75 bg-background px-3 py-1">
            <MessageSquareQuote className="h-3.5 w-3.5 text-primary" />
            Synced from Shopify reviews
          </span>
        </div>

        <div
          id="shopify-product-reviews"
          data-id={productId}
          data-url={productUrl}
          className="rounded-2xl border border-border/80 bg-background/85 p-4"
        />
      </div>
    </section>
  );
};

export default ShopifyProductReviews;
