import { FormEvent, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, CheckCircle2, MessageSquareQuote, PenSquare, Star, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { parseJudgeMeWidgetSummary, prioritizeJudgeMeShopDomains } from "@/lib/judgeme";
import { getRuntimeContext, getShopBaseOrigin } from "@/lib/theme-assets";
import { buildJudgeMeProxyUrl } from "@/lib/judgeme-proxy";

declare global {
  interface Window {
    jdgm?: { PUBLIC_TOKEN?: string };
  }
}

const DEFAULT_JUDGEME_SHOP_DOMAIN = "0309d3-72.myshopify.com";
const DEFAULT_JUDGEME_PUBLIC_TOKEN = "TQ0rk940ADN89zj_f83SKuTYIfY";
const JUDGEME_CACHE_MS = 5 * 60 * 1000;

type ShopifyProductReviewsProps = {
  productId: number;
  productHandle: string;
  productTitle?: string;
  mode?: "embedded" | "page";
  onSummaryChange?: (summary: { rating: number; reviewCount: number }) => void;
};

type JudgeMeProductReviewResponse = {
  widget?: string;
};

type JudgeMeReviewItem = {
  id: string;
  author: string;
  title: string;
  body: string;
  rating: number;
  createdAtRaw: string;
  createdAtMs: number;
  verifiedBuyer: boolean;
};

type JudgeMeSort = "newest" | "oldest" | "highest" | "lowest";
type JudgeMeRatingFilter = "all" | 5 | 4 | 3 | 2 | 1;

type JudgeMeParsedData = {
  averageRating: number;
  reviewCount: number;
  reviews: JudgeMeReviewItem[];
};

type JudgeMeSubmitReviewPayload = {
  name: string;
  email: string;
  rating: number;
  title: string;
  body: string;
};

type JudgeMeConfig = {
  shopDomain: string;
  shopDomains: string[];
  publicToken: string;
};

type JudgeMeWidgetData = {
  widgetHtml: string;
  resolvedShopDomain?: string;
};

function normalizeDomain(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProtocol).hostname.toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
  }
}

function getJudgeMeConfig(): JudgeMeConfig | null {
  const runtime = getRuntimeContext();
  const shopDomains = prioritizeJudgeMeShopDomains(
    [
      runtime.judgeMeShopDomain,
      runtime.shopDomain,
      getShopBaseOrigin(),
      import.meta.env.VITE_JUDGEME_SHOP_DOMAIN,
      import.meta.env.VITE_SALT_SHOP_URL,
      import.meta.env.VITE_SHOPIFY_STOREFRONT_URL,
      DEFAULT_JUDGEME_SHOP_DOMAIN,
    ].map((value) => normalizeDomain(String(value || ""))),
  );
  const shopDomain = shopDomains[0] || "";
  const publicToken = String(
    runtime.judgeMePublicToken ||
      import.meta.env.VITE_JUDGEME_PUBLIC_TOKEN ||
      window.jdgm?.PUBLIC_TOKEN ||
      DEFAULT_JUDGEME_PUBLIC_TOKEN,
  ).trim();

  if (!shopDomain || !shopDomains.length || !publicToken) {
    return null;
  }

  return { shopDomain, shopDomains, publicToken };
}

function normalizeJudgeMeHtml(raw: string): string {
  if (!raw) {
    return "";
  }

  return raw
    .replace(/<style[^>]*jdgm-temp-hiding-style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(
      /(<div[^>]*class=['"][^'"]*jdgm-(?:rev-widg|prev-badge)[^'"]*['"][^>]*?)\sstyle=['"]display:\s*none;?['"]/gi,
      "$1",
    );
}

async function fetchJudgeMeWidgetHtml(
  productId: number,
  config: JudgeMeConfig,
): Promise<JudgeMeWidgetData> {
  for (const candidateDomain of config.shopDomains) {
    try {
      const baseParams = new URLSearchParams({
        api_token: config.publicToken,
        shop_domain: candidateDomain,
        external_id: String(productId),
        t: String(Date.now()),
      });

      const reviewUrl = buildJudgeMeProxyUrl(
        "widgets/product_review",
        new URLSearchParams({
          ...Object.fromEntries(baseParams.entries()),
          page: "1",
          per_page: "100",
        }),
      );

      const reviewRes = await fetch(reviewUrl, { credentials: "omit" });
      const reviewPayload = reviewRes.ok ? ((await reviewRes.json()) as JudgeMeProductReviewResponse) : {};

      const widgetHtml = normalizeJudgeMeHtml(String(reviewPayload.widget || ""));
      if (widgetHtml) {
        return {
          widgetHtml,
          resolvedShopDomain: candidateDomain,
        };
      }
    } catch {
      continue;
    }
  }

  return {
    widgetHtml: "",
  };
}

async function submitJudgeMeReview(
  productId: number,
  productHandle: string,
  config: JudgeMeConfig,
  preferredShopDomain: string | undefined,
  payload: JudgeMeSubmitReviewPayload,
): Promise<void> {
  const endpoint = buildJudgeMeProxyUrl("reviews");
  const normalizedHandle = String(productHandle || "").trim();
  const productUrl = `${getShopBaseOrigin()}/products/${normalizedHandle}`;
  const candidateDomains = Array.from(new Set([preferredShopDomain, ...config.shopDomains, config.shopDomain].filter(Boolean)));

  for (const candidateDomain of candidateDomains) {
    const normalizedPayload = {
      api_token: config.publicToken,
      shop_domain: candidateDomain,
      platform: "shopify",
      id: String(productId),
      external_id: String(productId),
      handle: normalizedHandle,
      product_handle: normalizedHandle,
      url: productUrl,
      name: payload.name.trim(),
      email: payload.email.trim(),
      rating: Math.max(1, Math.min(5, Math.floor(payload.rating))),
      title: payload.title.trim() || "Customer review",
      body: payload.body.trim(),
    };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "omit",
        body: JSON.stringify(normalizedPayload),
      });

      if (response.ok) {
        return;
      }
    } catch (error) {
      // Local/dev origins can fail CORS on JSON requests; this still posts to Judge.me.
      if (!(error instanceof TypeError)) {
        continue;
      }

      await fetch(endpoint, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({
          api_token: normalizedPayload.api_token,
          shop_domain: normalizedPayload.shop_domain,
          platform: normalizedPayload.platform,
          id: normalizedPayload.id,
          external_id: normalizedPayload.external_id,
          handle: normalizedPayload.handle,
          product_handle: normalizedPayload.product_handle,
          url: normalizedPayload.url,
          name: normalizedPayload.name,
          email: normalizedPayload.email,
          rating: String(normalizedPayload.rating),
          title: normalizedPayload.title,
          body: normalizedPayload.body,
        }).toString(),
      });
      return;
    }
  }

  throw new Error("Unable to submit review.");
}

function parseText(element: Element | null): string {
  return (element?.textContent || "").replace(/\s+/g, " ").trim();
}

function parseJudgeMeData(data: Pick<JudgeMeWidgetData, "widgetHtml"> | undefined): JudgeMeParsedData {
  if (!data || typeof DOMParser === "undefined") {
    return { averageRating: 0, reviewCount: 0, reviews: [] };
  }

  const widgetSummary = parseJudgeMeWidgetSummary(data.widgetHtml);
  const averageRating = widgetSummary?.rating || 0;
  const reviewCount = widgetSummary?.reviewCount || 0;

  const reviewDoc = new DOMParser().parseFromString(data.widgetHtml || "", "text/html");
  const reviewNodes = Array.from(reviewDoc.querySelectorAll(".jdgm-rev"));
  const reviews: JudgeMeReviewItem[] = reviewNodes
    .map((node, index) => {
      const id = node.getAttribute("data-review-id") || `review-${index}`;
      const author = parseText(node.querySelector(".jdgm-rev__author")) || "Verified shopper";
      const title = parseText(node.querySelector(".jdgm-rev__title")) || "Customer review";
      const body = parseText(node.querySelector(".jdgm-rev__body p, .jdgm-rev__body"));
      const rating = Number(node.querySelector(".jdgm-rev__rating")?.getAttribute("data-score") || 0);
      const createdAtRaw =
        String(node.querySelector(".jdgm-rev__timestamp")?.getAttribute("data-content") || "").trim() ||
        parseText(node.querySelector(".jdgm-rev__timestamp"));
      const parsedDate = new Date(createdAtRaw);
      const createdAtMs = Number.isNaN(parsedDate.getTime()) ? 0 : parsedDate.getTime();
      const verifiedFromAttr = String(node.getAttribute("data-verified-buyer") || "").toLowerCase() === "true";
      const verifiedFromBadge = /verified/i.test(
        parseText(node.querySelector(".jdgm-rev__buyer-badge, .jdgm-rev__buyer-badge-wrapper")),
      );
      const verifiedBuyer = verifiedFromAttr || verifiedFromBadge;

      return {
        id,
        author,
        title,
        body,
        rating: Number.isFinite(rating) ? rating : 0,
        createdAtRaw,
        createdAtMs,
        verifiedBuyer,
      };
    })
    .filter((review) => review.body || review.title);

  const fallbackReviewCount = reviews.length;
  const fallbackAverageRating =
    fallbackReviewCount > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / fallbackReviewCount
      : 0;
  const finalReviewCount = Math.max(reviewCount, fallbackReviewCount);
  const finalAverageRating =
    fallbackReviewCount > reviewCount
      ? fallbackAverageRating
      : averageRating > 0
        ? averageRating
        : fallbackAverageRating;

  return {
    averageRating: finalAverageRating,
    reviewCount: finalReviewCount,
    reviews,
  };
}

function sortReviews(reviews: JudgeMeReviewItem[], sort: JudgeMeSort): JudgeMeReviewItem[] {
  const copy = [...reviews];

  switch (sort) {
    case "oldest":
      return copy.sort((a, b) => a.createdAtMs - b.createdAtMs || a.rating - b.rating);
    case "highest":
      return copy.sort((a, b) => b.rating - a.rating || b.createdAtMs - a.createdAtMs);
    case "lowest":
      return copy.sort((a, b) => a.rating - b.rating || b.createdAtMs - a.createdAtMs);
    case "newest":
    default:
      return copy.sort((a, b) => b.createdAtMs - a.createdAtMs || b.rating - a.rating);
  }
}

function formatReviewDate(raw: string, timestamp: number): string {
  if (timestamp > 0) {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return raw || "Recent";
}

function ratingLabel(rating: number): string {
  const fixed = rating.toFixed(1);
  if (rating >= 4.5) {
    return `${fixed} • Excellent`;
  }

  if (rating >= 4) {
    return `${fixed} • Great`;
  }

  if (rating >= 3) {
    return `${fixed} • Good`;
  }

  return `${fixed} • Needs improvement`;
}

function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(input || "").trim());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

const ShopifyProductReviews = ({
  productId,
  productHandle,
  productTitle,
  mode = "embedded",
  onSummaryChange,
}: ShopifyProductReviewsProps) => {
  const reviewPagePath = `/products/${productHandle}/reviews`;
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sortBy, setSortBy] = useState<JudgeMeSort>("newest");
  const [ratingFilter, setRatingFilter] = useState<JudgeMeRatingFilter>("all");
  const [visibleCount, setVisibleCount] = useState(6);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewForm, setReviewForm] = useState<JudgeMeSubmitReviewPayload>({
    name: "",
    email: "",
    rating: 5,
    title: "",
    body: "",
  });
  const judgeMeConfig = useMemo(() => getJudgeMeConfig(), []);
  const widgetQuery = useQuery({
    queryKey: ["judgeme-product-widget", productId, judgeMeConfig?.shopDomain || "", judgeMeConfig?.publicToken || ""],
    enabled: Boolean(productId && judgeMeConfig),
    staleTime: JUDGEME_CACHE_MS,
    queryFn: async () => {
      if (!judgeMeConfig) {
        return { widgetHtml: "" };
      }
      return fetchJudgeMeWidgetHtml(productId, judgeMeConfig);
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  const parsed = useMemo(() => parseJudgeMeData(widgetQuery.data), [widgetQuery.data]);
  const sortedReviews = useMemo(() => sortReviews(parsed.reviews, sortBy), [parsed.reviews, sortBy]);
  const filteredReviews = useMemo(() => {
    if (ratingFilter === "all") {
      return sortedReviews;
    }

    return sortedReviews.filter((review) => Math.round(review.rating) === ratingFilter);
  }, [ratingFilter, sortedReviews]);

  const visibleReviews = filteredReviews.slice(0, visibleCount);
  const canLoadMore = filteredReviews.length > visibleCount;

  useEffect(() => {
    setVisibleCount(6);
  }, [sortBy, ratingFilter, productId]);

  useEffect(() => {
    if (parsed.averageRating <= 0 || parsed.reviewCount <= 0) {
      return;
    }

    onSummaryChange?.({
      rating: parsed.averageRating,
      reviewCount: parsed.reviewCount,
    });
  }, [onSummaryChange, parsed.averageRating, parsed.reviewCount]);

  useEffect(() => {
    if (mode !== "page") {
      return;
    }

    if (searchParams.get("write") === "1") {
      setIsComposerOpen(true);
    }
  }, [mode, searchParams]);

  const clearWriteFlag = () => {
    if (mode !== "page" || searchParams.get("write") !== "1") {
      return;
    }

    const next = new URLSearchParams(searchParams);
    next.delete("write");
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  };

  const closeComposer = () => {
    setIsComposerOpen(false);
    clearWriteFlag();
  };

  const refetchLiveReviewData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["judgeme-product-widget", productId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["judgeme-preview-badges"],
      }),
    ]);
    await widgetQuery.refetch();
  };

  const submitReviewForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!judgeMeConfig) {
      toast.error("Review backend is not configured.");
      return;
    }

    if (!reviewForm.name.trim()) {
      toast.error("Please enter your name.");
      return;
    }

    if (!isValidEmail(reviewForm.email)) {
      toast.error("Please enter a valid email.");
      return;
    }

    if (!reviewForm.body.trim() || reviewForm.body.trim().length < 12) {
      toast.error("Please write a fuller review before submitting.");
      return;
    }

    try {
      setIsSubmittingReview(true);
      await submitJudgeMeReview(
        productId,
        productHandle,
        judgeMeConfig,
        widgetQuery.data?.resolvedShopDomain,
        reviewForm,
      );
      toast.success("Review submitted", {
        description: "Thanks for your feedback. It will appear after moderation.",
      });
      setReviewForm({
        name: "",
        email: "",
        rating: 5,
        title: "",
        body: "",
      });
      closeComposer();
      await refetchLiveReviewData();
      void (async () => {
        for (const delayMs of [1500, 4500]) {
          await sleep(delayMs);
          await refetchLiveReviewData();
        }
      })();
    } catch {
      toast.error("Could not submit your review right now. Please try again.");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const ratingBuckets = useMemo(() => {
    const total = parsed.reviews.length || 1;
    return [5, 4, 3, 2, 1].map((value) => {
      const count = parsed.reviews.filter((review) => Math.round(review.rating) === value).length;
      return {
        value,
        count,
        percent: Math.round((count / total) * 100),
      };
    });
  }, [parsed.reviews]);

  if (!productId) {
    return null;
  }

  return (
    <section className={`salt-reviews-shell ${mode === "page" ? "mt-4" : "mt-10"}`}>
      <div className="salt-panel-shell rounded-[1.7rem] p-5 sm:p-6">
        {mode !== "page" ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-primary">Customer feedback</p>
              <h2 className="mt-1 font-display text-[clamp(1.5rem,2.4vw,2.2rem)] leading-tight">
                Product Reviews
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link to={reviewPagePath} className="salt-amazon-review-cta">
                See all customer reviews
              </Link>
              <Link
                to={`${reviewPagePath}?write=1`}
                className="salt-outline-chip h-10 gap-2 px-4 py-0 text-xs font-bold uppercase tracking-[0.08em]"
              >
                <PenSquare className="h-3.5 w-3.5" />
                Post a review
              </Link>
            </div>
          </div>
        ) : null}

        {mode === "page" ? (
          <div className="mb-4 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="rounded-2xl border border-border/80 bg-background/90 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Overall rating</p>
              <p className="mt-2 text-4xl font-black tracking-tight text-foreground">
                {parsed.averageRating > 0 ? parsed.averageRating.toFixed(1) : "0.0"}
              </p>
              <div className="mt-2 flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Star
                    key={`overall-star-${index}`}
                    className={`h-4 w-4 ${index < Math.round(parsed.averageRating) ? "fill-primary text-primary" : "text-muted-foreground/35"}`}
                  />
                ))}
                <span className="ml-1 text-xs text-muted-foreground">{parsed.reviewCount.toLocaleString()} global ratings</span>
              </div>

              <div className="mt-4 space-y-2">
                {ratingBuckets.map((bucket) => (
                  <button
                    key={`bucket-${bucket.value}`}
                    type="button"
                    onClick={() => setRatingFilter((current) => (current === bucket.value ? "all" : bucket.value) as JudgeMeRatingFilter)}
                    className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition ${
                      ratingFilter === bucket.value
                        ? "border-primary/60 bg-primary/10"
                        : "border-border/70 bg-background/70 hover:border-primary/35"
                    }`}
                  >
                    <span className="min-w-[52px] text-xs font-semibold text-foreground">{bucket.value} star</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${bucket.percent}%` }} />
                    </span>
                    <span className="w-9 text-right text-[0.7rem] text-muted-foreground">{bucket.count}</span>
                  </button>
                ))}
              </div>

              {ratingFilter !== "all" ? (
                <button
                  type="button"
                  onClick={() => setRatingFilter("all")}
                  className="mt-3 text-xs font-semibold text-primary hover:underline"
                >
                  Show all ratings
                </button>
              ) : null}
            </aside>

            <div className="rounded-2xl border border-border/80 bg-background/88 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[0.68rem] text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full border border-border/75 bg-background px-3 py-1">
                  <Star className="h-3.5 w-3.5 text-primary" />
                  {parsed.averageRating > 0 ? `${parsed.averageRating.toFixed(2)} average rating` : "Real shopper ratings"}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-border/75 bg-background px-3 py-1">
                  <MessageSquareQuote className="h-3.5 w-3.5 text-primary" />
                  {parsed.reviewCount.toLocaleString()} total reviews
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-border/75 bg-background px-3 py-1">
                  <BarChart3 className="h-3.5 w-3.5 text-primary" />
                  {filteredReviews.length.toLocaleString()} matching your filters
                </span>
                <button
                  type="button"
                  onClick={() => setIsComposerOpen(true)}
                  className="salt-primary-cta ml-auto h-9 gap-2 px-3.5 py-0 text-[0.68rem] font-bold uppercase tracking-[0.08em]"
                >
                  <PenSquare className="h-3.5 w-3.5" />
                  Post a review
                </button>
              </div>
              <p className="text-sm text-muted-foreground">
                Use sort and rating filters to quickly find the feedback that matters most.
              </p>
            </div>
          </div>
        ) : (
          <div className="mb-3 flex flex-wrap gap-2 text-[0.68rem] text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full border border-border/75 bg-background px-3 py-1">
              <Star className="h-3.5 w-3.5 text-primary" />
              {parsed.averageRating > 0 ? `${parsed.averageRating.toFixed(2)} average rating` : "Real shopper ratings"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border/75 bg-background px-3 py-1">
              <MessageSquareQuote className="h-3.5 w-3.5 text-primary" />
              {parsed.reviewCount.toLocaleString()} total reviews
            </span>
          </div>
        )}

        {judgeMeConfig ? (
          <div className="space-y-3 rounded-2xl border border-border/80 bg-background/85 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">{filteredReviews.length.toLocaleString()} reviews</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Sort
                  <select
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value as JudgeMeSort)}
                    className="salt-form-control h-9 min-w-[150px] rounded-full border-border/85 bg-background px-3 text-xs"
                  >
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="highest">Highest rating</option>
                    <option value="lowest">Lowest rating</option>
                  </select>
                </label>
                {mode === "page" ? (
                  <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Filter
                    <select
                      value={String(ratingFilter)}
                      onChange={(event) => {
                        const next = event.target.value;
                        setRatingFilter(next === "all" ? "all" : (Number(next) as JudgeMeRatingFilter));
                      }}
                      className="salt-form-control h-9 min-w-[150px] rounded-full border-border/85 bg-background px-3 text-xs"
                    >
                      <option value="all">All ratings</option>
                      <option value="5">5 star only</option>
                      <option value="4">4 star only</option>
                      <option value="3">3 star only</option>
                      <option value="2">2 star only</option>
                      <option value="1">1 star only</option>
                    </select>
                  </label>
                ) : null}
              </div>
            </div>

            {widgetQuery.isLoading ? <p className="text-xs text-muted-foreground">Loading live Judge.me reviews...</p> : null}

            {!widgetQuery.isLoading && visibleReviews.length > 0 ? (
              <div id="judgeme_product_reviews" className="grid gap-3 md:grid-cols-2">
                {visibleReviews.map((review) => (
                  <article
                    key={review.id}
                    className="rounded-2xl border border-border/80 bg-[linear-gradient(165deg,hsl(var(--card)/0.98),hsl(var(--card)/0.92))] p-4 shadow-[0_18px_36px_-30px_rgba(0,0,0,0.6)]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-sm font-semibold text-foreground">{review.author}</p>
                          {review.verifiedBuyer ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/12 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300">
                              <CheckCircle2 className="h-3 w-3" />
                              Verified
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[0.68rem] uppercase tracking-[0.08em] text-muted-foreground">
                          {formatReviewDate(review.createdAtRaw, review.createdAtMs)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center gap-1.5">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Star
                          key={`${review.id}-star-${index}`}
                          className={`h-3.5 w-3.5 ${index < Math.round(review.rating) ? "fill-primary text-primary" : "text-muted-foreground/40"}`}
                        />
                      ))}
                      <span className="text-[0.68rem] font-semibold text-muted-foreground">{ratingLabel(review.rating)}</span>
                    </div>

                    <h3 className="mt-2 text-sm font-semibold text-foreground">{review.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{review.body}</p>
                  </article>
                ))}
              </div>
            ) : null}

            {!widgetQuery.isLoading && !visibleReviews.length ? (
              <p className="text-xs text-muted-foreground">No published reviews matched the current filters.</p>
            ) : null}

            {canLoadMore ? (
              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((count) => count + 6)}
                  className="salt-outline-chip h-10 px-4 py-0 text-xs"
                >
                  Load more reviews
                </button>
              </div>
            ) : null}

            {widgetQuery.isError ? (
              <p className="text-xs text-muted-foreground">
                Reviews are temporarily unavailable for this product. Open the full review page to view them on Shopify.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-border/80 bg-background/85 p-4 text-sm text-muted-foreground">
            Judge.me rating feed is not configured in runtime yet. Add
            <code className="mx-1 rounded bg-muted px-1 py-0.5">data-judgeme-public-token</code>
            or
            <code className="mx-1 rounded bg-muted px-1 py-0.5">VITE_JUDGEME_PUBLIC_TOKEN</code>
            to enable live star ratings and review widgets.
          </div>
        )}
      </div>

      {isComposerOpen ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-[rgba(9,12,18,0.58)] px-4 backdrop-blur-sm">
          <div className="salt-panel-shell w-full max-w-xl rounded-[1.4rem] border border-border/85 p-5 shadow-[0_38px_72px_-38px_rgba(0,0,0,0.72)]">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-primary">Write a review</p>
                <h3 className="font-display text-2xl leading-tight">Share your experience</h3>
              </div>
              <button
                type="button"
                onClick={closeComposer}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/80 bg-background/85 text-muted-foreground transition hover:text-foreground"
                aria-label="Close review popup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form className="grid gap-3" onSubmit={submitReviewForm}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Name
                  <input
                    required
                    value={reviewForm.name}
                    onChange={(event) => setReviewForm((prev) => ({ ...prev, name: event.target.value }))}
                    className="salt-form-control h-10 rounded-xl"
                    placeholder="Your name"
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Email
                  <input
                    required
                    type="email"
                    value={reviewForm.email}
                    onChange={(event) => setReviewForm((prev) => ({ ...prev, email: event.target.value }))}
                    className="salt-form-control h-10 rounded-xl"
                    placeholder="you@email.com"
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-[170px_minmax(0,1fr)]">
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Rating
                  <select
                    value={reviewForm.rating}
                    onChange={(event) => setReviewForm((prev) => ({ ...prev, rating: Number(event.target.value) || 5 }))}
                    className="salt-form-control h-10 rounded-xl"
                  >
                    <option value={5}>5 - Excellent</option>
                    <option value={4}>4 - Great</option>
                    <option value={3}>3 - Good</option>
                    <option value={2}>2 - Fair</option>
                    <option value={1}>1 - Poor</option>
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Title
                  <input
                    value={reviewForm.title}
                    onChange={(event) => setReviewForm((prev) => ({ ...prev, title: event.target.value }))}
                    className="salt-form-control h-10 rounded-xl"
                    placeholder="Short review title"
                  />
                </label>
              </div>

              <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Review
                <textarea
                  required
                  minLength={12}
                  value={reviewForm.body}
                  onChange={(event) => setReviewForm((prev) => ({ ...prev, body: event.target.value }))}
                  className="salt-form-control min-h-[130px] rounded-xl py-2"
                  placeholder="Tell other shoppers what you liked or disliked."
                />
              </label>

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeComposer}
                  className="salt-outline-chip h-10 px-4 py-0 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReview}
                  className="salt-primary-cta h-10 px-4 py-0 text-xs font-bold uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmittingReview ? "Submitting..." : "Post review"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default ShopifyProductReviews;
