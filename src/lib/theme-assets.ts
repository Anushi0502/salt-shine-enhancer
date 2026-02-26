declare global {
  interface Window {
    SALT_THEME_ASSETS?: Record<string, string>;
  }
}

const DEFAULT_SHOP_BASE = "https://0309d3-72.myshopify.com";
const SHOP_BASE =
  import.meta.env.VITE_SALT_SHOP_URL ||
  import.meta.env.VITE_SHOPIFY_STOREFRONT_URL ||
  DEFAULT_SHOP_BASE;
const LOCAL_ASSET_PREFIXES = ["/placeholder", "/data/", "/assets/", "/favicon", "/vite.svg"];

function normalizeBaseUrl(input: string | undefined): string {
  const raw = String(input || "").trim();
  if (!raw) {
    return DEFAULT_SHOP_BASE;
  }

  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProtocol);
    return `${url.protocol}//${url.host}`;
  } catch {
    return DEFAULT_SHOP_BASE;
  }
}

const SHOP_BASE_ORIGIN = normalizeBaseUrl(SHOP_BASE);

export function resolveThemeAsset(path: string): string {
  if (typeof window === "undefined") {
    return path;
  }

  return window.SALT_THEME_ASSETS?.[path] || path;
}

export function normalizeShopifyAssetUrl(input: string | null | undefined): string | null {
  const raw = String(input || "").trim();
  if (!raw) {
    return null;
  }

  const resolved = resolveThemeAsset(raw);

  if (/^(data:|blob:|mailto:|tel:|javascript:)/i.test(resolved)) {
    return resolved;
  }

  if (/^https?:\/\//i.test(resolved)) {
    return resolved;
  }

  if (resolved.startsWith("//")) {
    return `https:${resolved}`;
  }

  if (resolved.startsWith("/")) {
    if (LOCAL_ASSET_PREFIXES.some((prefix) => resolved.startsWith(prefix))) {
      return resolved;
    }

    return `${SHOP_BASE_ORIGIN}${resolved}`;
  }

  return resolved;
}
