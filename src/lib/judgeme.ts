import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRuntimeContext, getShopBaseOrigin } from "@/lib/theme-assets";
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

type JudgeMeProductReviewResponse = {
  widget?: string;
};

const JUDGEME_STALE_TIME_MS = 0;
const JUDGEME_AUTO_REFRESH_MS = 90 * 1000;
const DEFAULT_JUDGEME_SHOP_DOMAIN = "0309d3-72.myshopify.com";
const DEFAULT_JUDGEME_PUBLIC_TOKEN = "TQ0rk940ADN89zj_f83SKuTYIfY";

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
  const baseOrigin = getShopBaseOrigin();

  const candidates = [
    normalizeDomain(runtimeContext.judgeMeShopDomain || ""),
    normalizeDomain(runtimeContext.shopDomain || ""),
    normalizeDomain(baseOrigin),
    normalizeDomain(import.meta.env.VITE_JUDGEME_SHOP_DOMAIN || ""),
    normalizeDomain(import.meta.env.VITE_SALT_SHOP_URL || ""),
    normalizeDomain(import.meta.env.VITE_SHOPIFY_STOREFRONT_URL || ""),
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

function parseJudgeMeWidgetSummary(html: string): JudgeMeRawSummary | null {
  if (!html || typeof DOMParser === "undefined") {
    return null;
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const widgetRoot = doc.querySelector(".jdgm-rev-widg");
  const rootCount = Number(widgetRoot?.getAttribute("data-number-of-reviews") || 0);
  const rootAverage = Number(widgetRoot?.getAttribute("data-average-rating") || 0);

  const reviewNodes = Array.from(doc.querySelectorAll(".jdgm-rev"));
  const reviewCountFromNodes = reviewNodes.length;
  const averageFromNodes =
    reviewCountFromNodes > 0
      ? reviewNodes.reduce((sum, node) => {
          const score = Number(node.querySelector(".jdgm-rev__rating")?.getAttribute("data-score") || 0);
          return sum + (Number.isFinite(score) ? score : 0);
        }, 0) / reviewCountFromNodes
      : 0;

  const reviewCount = Math.max(rootCount, reviewCountFromNodes);
  const rating =
    reviewCountFromNodes >= rootCount && averageFromNodes > 0
      ? averageFromNodes
      : rootAverage > 0
        ? rootAverage
        : averageFromNodes;

  if (!reviewCount && !rating) {
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

export function normalizeJudgeMeReview(review: JudgeMeTestimonial): JudgeMeTestimonial {
  return {
    ...review,
    author: polishPlainText(review.author || "Verified shopper") || "Verified shopper",
    title: polishPlainText(review.title || "Customer review") || "Customer review",
    body: polishPlainText(review.body),
  };
}

export function dedupeJudgeMeTestimonials(reviews: JudgeMeTestimonial[]): JudgeMeTestimonial[] {
  const seenReviewKeys = new Set<string>();

  return reviews.reduce<JudgeMeTestimonial[]>((uniqueReviews, review) => {
    const normalizedReview = normalizeJudgeMeReview(review);
    const reviewKey = buildJudgeMeReviewFingerprint(normalizedReview) || `${review.productId}:${review.id}`;
    if (seenReviewKeys.has(reviewKey)) {
      return uniqueReviews;
    }

    seenReviewKeys.add(reviewKey);
    uniqueReviews.push(normalizedReview);
    return uniqueReviews;
  }, []);
}

function parseJudgeMeWidgetTestimonials(productId: number, html: string): JudgeMeTestimonial[] {
  if (!html || typeof DOMParser === "undefined") {
    return [];
  }

  const reviewDoc = new DOMParser().parseFromString(html, "text/html");
  const reviewNodes = Array.from(reviewDoc.querySelectorAll(".jdgm-rev"));

  return reviewNodes
    .map((node, index) => {
      const id = node.getAttribute("data-review-id") || `review-${productId}-${index}`;
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

      return {
        id,
        productId,
        author: polishPlainText(author || "Verified shopper") || "Verified shopper",
        title: polishPlainText(title || "Customer review") || "Customer review",
        body: polishPlainText(body),
        rating: Number.isFinite(rating) ? Math.min(5, Math.max(0, rating)) : 0,
        createdAtRaw,
        createdAtMs,
        verifiedBuyer: verifiedFromAttr || verifiedFromBadge,
        source: "judgeme" as const,
      };
    })
    .filter((review) => review.body || review.title);
}

function buildSummary(productId: number, badge: JudgeMeRawSummary | null, widget: JudgeMeRawSummary | null): JudgeMeReviewSummary | null {
  if (!badge && !widget) {
    return null;
  }

  const badgeCount = badge?.reviewCount || 0;
  const widgetCount = widget?.reviewCount || 0;
  const finalReviewCount = Math.max(badgeCount, widgetCount);
  const finalRating =
    widgetCount >= badgeCount && (widget?.rating || 0) > 0
      ? Number(widget?.rating || 0)
      : (badge?.rating || 0) > 0
        ? Number(badge?.rating || 0)
        : Number(widget?.rating || 0);

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
): Promise<JudgeMeReviewSummary | null> {
  const baseParams = new URLSearchParams({
    public_token: publicToken,
    api_token: publicToken,
    shop_domain: shopDomain,
    external_id: String(productId),
    t: String(Date.now()),
  });
  const previewEndpoint = buildJudgeMeProxyUrl("widgets/preview_badge", baseParams);
  const widgetEndpoint = buildJudgeMeProxyUrl(
    "widgets/product_review",
    new URLSearchParams({
      ...Object.fromEntries(baseParams.entries()),
      page: "1",
      per_page: "100",
    }),
  );

  const [previewResponse, widgetResponse] = await Promise.all([
    fetch(previewEndpoint, { credentials: "omit" }),
    fetch(widgetEndpoint, { credentials: "omit" }),
  ]);

  if (!previewResponse.ok && !widgetResponse.ok) {
    return null;
  }

  const previewPayload = previewResponse.ok
    ? ((await previewResponse.json()) as JudgeMePreviewResponse)
    : {};
  const widgetPayload = widgetResponse.ok
    ? ((await widgetResponse.json()) as JudgeMeProductReviewResponse)
    : {};
  const externalId = Number(previewPayload.product_external_id || productId);
  if (!Number.isFinite(externalId)) {
    return null;
  }

  const badgeSummary = parseJudgeMeBadge(normalizeJudgeMeHtml(String(previewPayload.badge || "")));
  const widgetSummary = parseJudgeMeWidgetSummary(normalizeJudgeMeHtml(String(widgetPayload.widget || "")));
  return buildSummary(externalId, badgeSummary, widgetSummary);
}

async function requestJudgeMeTestimonialsForProduct(
  shopDomain: string,
  publicToken: string,
  productId: number,
): Promise<JudgeMeTestimonial[]> {
  const params = new URLSearchParams({
    public_token: publicToken,
    api_token: publicToken,
    shop_domain: shopDomain,
    external_id: String(productId),
    page: "1",
    per_page: "25",
    t: String(Date.now()),
  });
  const endpoint = buildJudgeMeProxyUrl("widgets/product_review", params);

  const response = await fetch(endpoint, { credentials: "omit" });
  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as JudgeMeProductReviewResponse;
  const widgetHtml = normalizeJudgeMeHtml(String(payload.widget || ""));
  return parseJudgeMeWidgetTestimonials(productId, widgetHtml);
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
    const unresolvedIds = normalizedIds.filter((productId) => !ratings[productId]);
    if (!unresolvedIds.length) {
      break;
    }

    const entries = await Promise.all(
      unresolvedIds.map(async (productId) => {
        try {
          const summary = await requestJudgeMeSummary(domain, publicToken, productId);
          return summary ? ([productId, summary] as const) : null;
        } catch {
          return null;
        }
      }),
    );

    entries
      .filter((entry): entry is readonly [number, JudgeMeReviewSummary] => Boolean(entry))
      .forEach(([productId, summary]) => {
        ratings[productId] = summary;
      });
  }

  return ratings;
}

export async function fetchJudgeMeTestimonials(
  productIds: number[],
  limit = 6,
): Promise<JudgeMeTestimonial[]> {
  const normalizedIds = Array.from(
    new Set(
      productIds
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  );

  if (!normalizedIds.length || limit <= 0) {
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
    for (const productId of normalizedIds) {
      if (collected.length >= limit) {
        break;
      }

      try {
        const reviews = dedupeJudgeMeTestimonials(
          await requestJudgeMeTestimonialsForProduct(domain, publicToken, productId),
        );

        reviews.forEach((review) => {
          if (collected.length >= limit) {
            return;
          }

          const reviewKey = buildJudgeMeReviewFingerprint(review) || `${review.productId}:${review.id}`;
          if (seenReviewKeys.has(reviewKey)) {
            return;
          }

          seenReviewKeys.add(reviewKey);
          collected.push(review);
        });
      } catch {
        continue;
      }
    }

    if (collected.length >= limit) {
      break;
    }
  }

  return [...collected]
    .sort((left, right) => right.createdAtMs - left.createdAtMs || right.rating - left.rating)
    .slice(0, limit);
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

export function useJudgeMeTestimonials(productIds: number[], limit = 6) {
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
    queryKey: ["judgeme-home-testimonials", normalizedIds.join(","), limit],
    queryFn: () => fetchJudgeMeTestimonials(normalizedIds, limit),
    enabled: normalizedIds.length > 0 && limit > 0,
    staleTime: JUDGEME_STALE_TIME_MS,
    refetchInterval: JUDGEME_AUTO_REFRESH_MS,
    refetchIntervalInBackground: true,
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
