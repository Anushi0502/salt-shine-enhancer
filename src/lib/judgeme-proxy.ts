import { getRuntimeContext } from "@/lib/theme-assets";

const DEFAULT_JUDGEME_PROXY_BASE_URL = "https://www.saltonlinestore.com";

function normalizeOrigin(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProtocol).origin;
  } catch {
    return raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  }
}

function isMyShopifyOrigin(origin: string): boolean {
  try {
    return new URL(origin).hostname.toLowerCase().endsWith(".myshopify.com");
  } catch {
    return false;
  }
}

function getFallbackProxyOrigin(): string {
  if (typeof window !== "undefined") {
    const currentOrigin = normalizeOrigin(window.location.origin);
    if (currentOrigin && currentOrigin.includes("saltonlinestore.com")) {
      return currentOrigin;
    }
  }

  return DEFAULT_JUDGEME_PROXY_BASE_URL;
}

export function getJudgeMeProxyBaseUrl(): string {
  const runtime = getRuntimeContext();
  const configured = normalizeOrigin(
    runtime.shopAppUrl ||
      runtime.shopBaseUrl ||
      runtime.shopDomain ||
      String(import.meta.env.VITE_JUDGEME_PROXY_BASE_URL || ""),
  );

  if (configured && !isMyShopifyOrigin(configured)) {
    return configured;
  }

  return getFallbackProxyOrigin();
}

export function buildJudgeMeProxyUrl(pathname: string, searchParams?: URLSearchParams): string {
  const cleanPath = String(pathname || "").replace(/^\/+/, "");
  const baseUrl = getJudgeMeProxyBaseUrl().replace(/\/+$/, "");
  const url = new URL(`${baseUrl}/api/judgeme/${cleanPath}`);

  if (searchParams) {
    searchParams.forEach((value, key) => {
      if (key === "t") {
        return;
      }

      url.searchParams.append(key, value);
    });
  }

  return url.toString();
}
