import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRuntimeContext } from "@/lib/theme-assets";
import { polishPlainText } from "@/lib/formatters";
import { buildJudgeMeProxyUrl } from "@/lib/judgeme-proxy";

export type JudgeMeReviewSummary = {
  productId: number;
  rating: number;
  reviewCount: number;
  purchasedLastMonth: number;
  source: "judgeme";
};

export type JudgeMeTestimonial = {
  id: string;
  productId: number;
  author: string;
  title: string;
  body: string;
  sourceLabel: string;
  rating: number;
  createdAtRaw: string;
  createdAtMs: number;
  verifiedBuyer: boolean;
  source: "judgeme";
};

type JudgeMePreviewResponse = {
  product_external_id?: number;
  badge?: string;
};

type JudgeMeAllReviewsPageResponse = {
  all_reviews?: string;
};

type JudgeMeReviewCountResponse = {
  all_reviews_count?: string;
  shop_reviews_count?: string;
};

type JudgeMeReviewType = "product-reviews" | "shop-reviews";

const JUDGEME_STALE_TIME_MS = 0;
const JUDGEME_AUTO_REFRESH_MS = 90 * 1000;
const JUDGEME_SUMMARY_CACHE_MS = 90 * 1000;
const JUDGEME_RATING_CONCURRENCY = 6;
const JUDGEME_TESTIMONIAL_PAGE_BATCH_SIZE = 6;
const JUDGEME_ALL_REVIEWS_PAGE_SIZE = 25;
const DEFAULT_JUDGEME_SHOP_DOMAIN = "0309d3-72.myshopify.com";
const DEFAULT_JUDGEME_PUBLIC_TOKEN = "TQ0rk940ADN89zj_f83SKuTYIfY";

const judgeMeSummaryCache = new Map<string, { summary: JudgeMeReviewSummary | null; expiresAt: number }>();

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

function normalizeToken(value: string): string {
  return String(value || "").trim();
}

function getJudgeMePublicToken(): string {
  const runtimeContext = getRuntimeContext();
  const fromRuntime = normalizeToken(runtimeContext.judgeMePublicToken || "");
  if (fromRuntime) {
    return fromRuntime;
  }

  if (typeof window !== "undefined") {
    const fromWindow = normalizeToken((window as unknown as { jdgm?: { PUBLIC_TOKEN?: string } }).jdgm?.PUBLIC_TOKEN || "");
    if (fromWindow) {
      return fromWindow;
    }
  }

  const fromEnv = normalizeToken(import.meta.env.VITE_JUDGEME_PUBLIC_TOKEN || "");
  if (fromEnv) {
    return fromEnv;
  }

  return DEFAULT_JUDGEME_PUBLIC_TOKEN;
}

function getJudgeMeShopDomains(): string[] {
  const runtimeContext = getRuntimeContext();

  const candidates = [
    normalizeDomain(runtimeContext.judgeMeShopDomain || ""),
    normalizeDomain(runtimeContext.shopDomain || ""),
    normalizeDomain(import.meta.env.VITE_JUDGEME_SHOP_DOMAIN || ""),
    normalizeDomain(DEFAULT_JUDGEME_SHOP_DOMAIN),
  ].filter(Boolean);

  return Array.from(new Set(candidates));
}

function parseBadgeNumber(html: string, pattern: RegExp): number {
  const match = html.match(pattern);
  if (!match?.[1]) {
    return 0;
  }

  const normalized = match[1].replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
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

type JudgeMeRawSummary = {
  rating: number;
  reviewCount: number;
};

function parseJudgeMeBadge(html: string): JudgeMeRawSummary | null {
  const rating =
    parseBadgeNumber(html, /data-average-rating=["']([0-5](?:\.\d+)?)["']/i) ||
    parseBadgeNumber(html, /data-score=["']([0-5](?:\.\d+)?)["']/i) ||
    parseBadgeNumber(html, /\b([0-5](?:\.\d+)?)\s*(?:out of 5|stars?)/i);

  const reviewCount =
    parseBadgeNumber(html, /data-number-of-reviews=["']([0-9,]+)["']/i) ||
    parseBadgeNumber(html, /data-number-of-ratings=["']([0-9,]+)["']/i) ||
    parseBadgeNumber(html, /\b([0-9][0-9,]*)\s+(?:reviews?|ratings?)\b/i);

  if (!rating && !reviewCount) {
    return null;
  }

  return {
    rating: Math.min(5, Math.max(0, rating || 0)),
    reviewCount: Math.max(0, reviewCount || 0),
  };
}

function parseText(element: Element | null): string {
  return polishPlainText(element?.textContent || "");
}

export function buildJudgeMeReviewFingerprint(
  review: Pick<JudgeMeTestimonial, "author" | "title" | "body">,
): string {
  const author = polishPlainText(review.author || "").toLowerCase();
  const title = polishPlainText(review.title || "").toLowerCase();
  const body = polishPlainText(review.body || "").toLowerCase();

  return [author, title, body].filter(Boolean).join("|");
}

function buildJudgeMeReviewDedupKey(
  review: Pick<JudgeMeTestimonial, "id" | "author" | "title" | "body">,
): string {
  const reviewId = String(review.id || "").trim();
  if (reviewId) {
    return `id:${reviewId}`;
  }

  const fingerprint = buildJudgeMeReviewFingerprint(review);
  return fingerprint ? `fp:${fingerprint}` : "";
}

export function normalizeJudgeMeReview(review: JudgeMeTestimonial): JudgeMeTestimonial {
  return {
    ...review,
    author: polishPlainText(review.author || "Verified shopper") || "Verified shopper",
    title: polishPlainText(review.title || "Customer review") || "Customer review",
    body: polishPlainText(review.body),
    sourceLabel: polishPlainText(review.sourceLabel || "Judge.me review") || "Judge.me review",
  };
}

export function dedupeJudgeMeTestimonials(reviews: JudgeMeTestimonial[]): JudgeMeTestimonial[] {
  const seenReviewKeys = new Set<string>();

  return reviews.reduce<JudgeMeTestimonial[]>((uniqueReviews, review) => {
    const normalizedReview = normalizeJudgeMeReview(review);
    const reviewKey = buildJudgeMeReviewDedupKey(normalizedReview) || `${review.productId}:${review.id}`;
    if (seenReviewKeys.has(reviewKey)) {
      return uniqueReviews;
    }

    seenReviewKeys.add(reviewKey);
    uniqueReviews.push(normalizedReview);
    return uniqueReviews;
  }, []);
}

function parseJudgeMeAllReviewsTestimonials(reviewType: JudgeMeReviewType, html: string): JudgeMeTestimonial[] {
  if (!html || typeof DOMParser === "undefined") {
    return [];
  }

  const reviewDoc = new DOMParser().parseFromString(html, "text/html");
  const reviewNodes = Array.from(reviewDoc.querySelectorAll(".jdgm-rev"));

  return reviewNodes
    .map((node, index) => {
      const id = node.getAttribute("data-review-id") || `review-${reviewType}-${index}`;
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
      const sourceLabel =
        parseText(node.querySelector(".jdgm-rev__prod-link")) ||
        parseText(node.querySelector(".jdgm-rev__prod-link-prefix")) ||
        (reviewType === "shop-reviews" ? "Shop review" : "Product review");

      return {
        id,
        productId: 0,
        author: polishPlainText(author || "Verified shopper") || "Verified shopper",
        title: polishPlainText(title || "Customer review") || "Customer review",
        body: polishPlainText(body),
        sourceLabel: polishPlainText(sourceLabel || "Judge.me review") || "Judge.me review",
        rating: Number.isFinite(rating) ? Math.min(5, Math.max(0, rating)) : 0,
        createdAtRaw,
        createdAtMs,
        verifiedBuyer: verifiedFromAttr || verifiedFromBadge,
        source: "judgeme" as const,
      };
    })
    .filter((review) => review.body || review.title);
}

function buildSummary(productId: number, badge: JudgeMeRawSummary | null): JudgeMeReviewSummary | null {
  if (!badge) {
    return null;
  }

  const badgeCount = badge?.reviewCount || 0;
  const finalReviewCount = badgeCount;
  const finalRating = Number(badge.rating || 0);

  return {
    productId,
    rating: Math.min(5, Math.max(0, finalRating || 0)),
    reviewCount: Math.max(0, finalReviewCount || 0),
    purchasedLastMonth: Math.max(0, Math.round((finalReviewCount || 0) * 0.28)),
    source: "judgeme",
  };
}

async function requestJudgeMeSummary(
  shopDomain: string,
  publicToken: string,
  productId: number,
): Promise<{ summary: JudgeMeReviewSummary | null; authFailed: boolean }> {
  const baseParams = new URLSearchParams({
    api_token: publicToken,
    shop_domain: shopDomain,
    external_id: String(productId),
    t: String(Date.now()),
  });
  const previewEndpoint = buildJudgeMeProxyUrl("widgets/preview_badge", baseParams);
  const previewResponse = await fetch(previewEndpoint, { credentials: "omit" });

  if (previewResponse.status === 401 || previewResponse.status === 403) {
    return { summary: null, authFailed: true };
  }

  if (!previewResponse.ok) {
    return { summary: null, authFailed: false };
  }

  const previewPayload = (await previewResponse.json()) as JudgeMePreviewResponse;
  const externalId = Number(previewPayload.product_external_id || productId);
  if (!Number.isFinite(externalId)) {
    return { summary: null, authFailed: false };
  }

  const badgeSummary = parseJudgeMeBadge(normalizeJudgeMeHtml(String(previewPayload.badge || "")));
  return { summary: buildSummary(externalId, badgeSummary), authFailed: false };
}

async function requestJudgeMeReviewCount(
  shopDomain: string,
  publicToken: string,
  endpoint: "all_reviews_count" | "shop_reviews_count",
): Promise<number | null> {
  const params = new URLSearchParams({
    api_token: publicToken,
    shop_domain: shopDomain,
    t: String(Date.now()),
  });
  const response = await fetch(buildJudgeMeProxyUrl(`widgets/${endpoint}`, params), { credentials: "omit" });
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as JudgeMeReviewCountResponse;
  const value = Number(payload[endpoint] || 0);
  return Number.isFinite(value) ? value : null;
}

async function requestJudgeMeAllReviewsPage(
  shopDomain: string,
  publicToken: string,
  reviewType: JudgeMeReviewType,
  page: number,
): Promise<JudgeMeTestimonial[]> {
  const params = new URLSearchParams({
    api_token: publicToken,
    shop_domain: shopDomain,
    page: String(page),
    review_type: reviewType,
    t: String(Date.now()),
  });
  const response = await fetch(buildJudgeMeProxyUrl("widgets/all_reviews_page", params), { credentials: "omit" });
  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as JudgeMeAllReviewsPageResponse;
  const widgetHtml = normalizeJudgeMeHtml(String(payload.all_reviews || ""));
  return parseJudgeMeAllReviewsTestimonials(reviewType, widgetHtml);
}

export async function fetchJudgeMeRatings(productIds: number[]): Promise<Record<number, JudgeMeReviewSummary>> {
  const normalizedIds = Array.from(
    new Set(
      productIds
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  );

  if (!normalizedIds.length) {
    return {};
  }

  const publicToken = getJudgeMePublicToken();
  if (!publicToken) {
    return {};
  }

  const domains = getJudgeMeShopDomains();
  const ratings: Record<number, JudgeMeReviewSummary> = {};

  for (const domain of domains) {
    const unresolvedIds = normalizedIds.filter((productId) => {
      if (ratings[productId]) {
        return false;
      }

      const cached = judgeMeSummaryCache.get(`${domain}:${productId}`);
      if (!cached || cached.expiresAt <= Date.now()) {
        return true;
      }

      if (cached.summary) {
        ratings[productId] = cached.summary;
      }
      return false;
    });
    if (!unresolvedIds.length) {
      break;
    }

    let authFailed = false;
    for (let index = 0; index < unresolvedIds.length; index += JUDGEME_RATING_CONCURRENCY) {
      const batch = unresolvedIds.slice(index, index + JUDGEME_RATING_CONCURRENCY);
      const entries = await Promise.all(
        batch.map(async (productId) => {
          try {
            const result = await requestJudgeMeSummary(domain, publicToken, productId);
            if (!result.authFailed) {
              judgeMeSummaryCache.set(`${domain}:${productId}`, {
                summary: result.summary,
                expiresAt: Date.now() + JUDGEME_SUMMARY_CACHE_MS,
              });
            }
            return { productId, ...result };
          } catch {
            return { productId, summary: null, authFailed: false };
          }
        }),
      );

      entries
        .filter((entry): entry is typeof entry & { summary: JudgeMeReviewSummary } => Boolean(entry.summary))
        .forEach(({ productId, summary }) => {
          ratings[productId] = summary;
        });

      authFailed = entries.some((entry) => entry.authFailed);

      if (authFailed) {
        break;
      }
    }
  }

  return ratings;
}

export async function fetchJudgeMeTestimonials(
  limit = Number.POSITIVE_INFINITY,
): Promise<JudgeMeTestimonial[]> {
  const maxReviews = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : Number.POSITIVE_INFINITY;

  if (maxReviews <= 0) {
    return [];
  }

  const publicToken = getJudgeMePublicToken();
  if (!publicToken) {
    return [];
  }

  const domains = getJudgeMeShopDomains();
  const seenReviewKeys = new Set<string>();
  const collected: JudgeMeTestimonial[] = [];

  for (const domain of domains) {
    try {
      const [allReviewsCount, shopReviewsCount] = await Promise.all([
        requestJudgeMeReviewCount(domain, publicToken, "all_reviews_count"),
        requestJudgeMeReviewCount(domain, publicToken, "shop_reviews_count"),
      ]);

      if (!Number.isFinite(allReviewsCount)) {
        continue;
      }

      const shopCount = Number.isFinite(shopReviewsCount) ? Math.max(0, shopReviewsCount) : 0;
      const productCount = Math.max(0, allReviewsCount - shopCount);
      const reviewPlans: Array<{ reviewType: JudgeMeReviewType; total: number }> = [
        { reviewType: "product-reviews", total: productCount },
        { reviewType: "shop-reviews", total: shopCount },
      ];

      for (const plan of reviewPlans) {
        if (plan.total <= 0 || collected.length >= maxReviews) {
          continue;
        }

        const pageCount = Math.max(1, Math.ceil(plan.total / JUDGEME_ALL_REVIEWS_PAGE_SIZE));

        for (let page = 1; page <= pageCount && collected.length < maxReviews; page += JUDGEME_TESTIMONIAL_PAGE_BATCH_SIZE) {
          const batchPages = Array.from(
            { length: Math.min(JUDGEME_TESTIMONIAL_PAGE_BATCH_SIZE, pageCount - page + 1) },
            (_, index) => page + index,
          );

          const batchResults = await Promise.all(
            batchPages.map(async (currentPage) => {
              try {
                return dedupeJudgeMeTestimonials(
                  await requestJudgeMeAllReviewsPage(domain, publicToken, plan.reviewType, currentPage),
                );
              } catch {
                return [];
              }
            }),
          );

          for (const pageReviews of batchResults) {
            if (collected.length >= maxReviews) {
              break;
            }

            for (const review of pageReviews) {
              if (collected.length >= maxReviews) {
                break;
              }

              const reviewKey = buildJudgeMeReviewDedupKey(review) || `${review.productId}:${review.id}`;
              if (seenReviewKeys.has(reviewKey)) {
                continue;
              }

              seenReviewKeys.add(reviewKey);
              collected.push(review);
            }
          }
        }
      }

      if (collected.length >= maxReviews) {
        break;
      }
    } catch {
      continue;
    }
  }

  const sortedReviews = [...collected]
    .sort((left, right) => right.createdAtMs - left.createdAtMs || right.rating - left.rating)
    .filter((review) => Boolean(review.sourceLabel));

  return Number.isFinite(maxReviews) ? sortedReviews.slice(0, maxReviews) : sortedReviews;
}

export function useJudgeMeRatings(productIds: number[], enabled = true) {
  const normalizedIds = useMemo(
    () =>
      Array.from(
        new Set(
          productIds
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value) && value > 0),
        ),
      ).sort((a, b) => a - b),
    [productIds],
  );

  return useQuery({
    queryKey: ["judgeme-preview-badges", normalizedIds.join(",")],
    queryFn: () => fetchJudgeMeRatings(normalizedIds),
    enabled: enabled && normalizedIds.length > 0,
    staleTime: JUDGEME_STALE_TIME_MS,
    refetchInterval: JUDGEME_AUTO_REFRESH_MS,
    refetchIntervalInBackground: true,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    retry: false,
  });
}

export function useJudgeMeTestimonials(limit = Number.POSITIVE_INFINITY) {
  const normalizedLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : Number.POSITIVE_INFINITY;
  const limitKey = Number.isFinite(normalizedLimit) ? normalizedLimit : "all";

  return useQuery({
    queryKey: ["judgeme-home-testimonials", limitKey],
    queryFn: () => fetchJudgeMeTestimonials(normalizedLimit),
    enabled: normalizedLimit > 0,
    staleTime: JUDGEME_STALE_TIME_MS,
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    retry: false,
  });
}

export function useJudgeMeProductRating(productId: number | undefined) {
  const numericProductId = Number(productId);
  const query = useJudgeMeRatings(
    Number.isFinite(numericProductId) && numericProductId > 0 ? [numericProductId] : [],
  );

  return {
    ...query,
    summary:
      Number.isFinite(numericProductId) && numericProductId > 0
        ? query.data?.[numericProductId]
        : undefined,
  };
}
