import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRuntimeContext, getShopBaseOrigin } from "@/lib/theme-assets";

export type JudgeMeReviewSummary = {
  productId: number;
  rating: number;
  reviewCount: number;
  purchasedLastMonth: number;
  source: "judgeme";
};

type JudgeMePreviewResponse = {
  product_external_id?: number;
  badge?: string;
};

const JUDGEME_STALE_TIME_MS = 0;
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

function parseJudgeMeBadge(productId: number, html: string): JudgeMeReviewSummary | null {
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
    productId,
    rating: Math.min(5, Math.max(0, rating || 0)),
    reviewCount: Math.max(0, reviewCount || 0),
    purchasedLastMonth: Math.max(0, Math.round((reviewCount || 0) * 0.28)),
    source: "judgeme",
  };
}

async function requestJudgeMePreviewBadge(
  shopDomain: string,
  publicToken: string,
  productId: number,
): Promise<JudgeMeReviewSummary | null> {
  const endpoint = new URL("https://api.judge.me/api/v1/widgets/preview_badge");
  endpoint.searchParams.set("public_token", publicToken);
  endpoint.searchParams.set("api_token", publicToken);
  endpoint.searchParams.set("shop_domain", shopDomain);
  endpoint.searchParams.set("external_id", String(productId));

  const response = await fetch(endpoint.toString(), { credentials: "omit" });
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as JudgeMePreviewResponse;
  const externalId = Number(payload.product_external_id || productId);
  const badgeHtml = payload.badge || "";
  if (!Number.isFinite(externalId) || !badgeHtml) {
    return null;
  }

  return parseJudgeMeBadge(externalId, String(badgeHtml));
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
          const summary = await requestJudgeMePreviewBadge(domain, publicToken, productId);
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

export function useJudgeMeRatings(productIds: number[]) {
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
    enabled: normalizedIds.length > 0,
    staleTime: JUDGEME_STALE_TIME_MS,
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
