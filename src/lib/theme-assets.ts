declare global {
  interface Window {
    SALT_THEME_ASSETS?: Record<string, string>;
    SALT_RUNTIME_CONTEXT?: Partial<SaltRuntimeContext>;
  }
}

export type SaltRuntimeContext = {
  shopBaseUrl?: string;
  shopDomain?: string;
  shopName?: string;
  currency?: string;
  template?: string;
  templateSuffix?: string;
  aboutHandle?: string;
  blogHandle?: string;
  supportEmail?: string;
};

const LOCAL_ASSET_PREFIXES = ["/assets/", "/favicon", "/vite.svg"];

function normalizeBaseUrl(input: string | undefined | null): string | null {
  const raw = String(input || "").trim();
  if (!raw) {
    return null;
  }

  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProtocol);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function readRuntimeContextFromRootElement(): Partial<SaltRuntimeContext> {
  if (typeof window === "undefined") {
    return {};
  }

  const root = document.getElementById("salt-app-root");
  if (!root) {
    return {};
  }

  return {
    shopBaseUrl: root.getAttribute("data-shop-base-url") || undefined,
    shopDomain: root.getAttribute("data-shop-domain") || undefined,
    shopName: root.getAttribute("data-shop-name") || undefined,
    currency: root.getAttribute("data-currency") || undefined,
    template: root.getAttribute("data-template") || undefined,
    templateSuffix: root.getAttribute("data-template-suffix") || undefined,
    aboutHandle: root.getAttribute("data-about-handle") || undefined,
    blogHandle: root.getAttribute("data-blog-handle") || undefined,
    supportEmail: root.getAttribute("data-support-email") || undefined,
  };
}

function readRuntimeContextFromJsonScript(): Partial<SaltRuntimeContext> {
  if (typeof window === "undefined") {
    return {};
  }

  const node = document.getElementById("salt-runtime-context");
  if (!node?.textContent) {
    return {};
  }

  try {
    const parsed = JSON.parse(node.textContent) as Partial<SaltRuntimeContext>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readRuntimeContext(): SaltRuntimeContext {
  const fromWindow = typeof window !== "undefined" ? window.SALT_RUNTIME_CONTEXT || {} : {};
  const fromScript = readRuntimeContextFromJsonScript();
  const fromRoot = readRuntimeContextFromRootElement();

  return {
    ...fromScript,
    ...fromRoot,
    ...fromWindow,
  };
}

const RUNTIME_CONTEXT = readRuntimeContext();
const SHOP_BASE_ORIGIN = (() => {
  const fromContext =
    normalizeBaseUrl(RUNTIME_CONTEXT.shopBaseUrl) ||
    normalizeBaseUrl(RUNTIME_CONTEXT.shopDomain);
  if (fromContext) {
    return fromContext;
  }

  const fromEnv =
    normalizeBaseUrl(import.meta.env.VITE_SALT_SHOP_URL) ||
    normalizeBaseUrl(import.meta.env.VITE_SHOPIFY_STOREFRONT_URL);
  if (fromEnv) {
    return fromEnv;
  }

  if (typeof window !== "undefined") {
    const fromOrigin = normalizeBaseUrl(window.location.origin);
    if (fromOrigin) {
      return fromOrigin;
    }
  }

  return "";
})();

export function getRuntimeContext(): SaltRuntimeContext {
  return RUNTIME_CONTEXT;
}

export function getShopBaseOrigin(): string {
  return SHOP_BASE_ORIGIN;
}

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
    if (!SHOP_BASE_ORIGIN || LOCAL_ASSET_PREFIXES.some((prefix) => resolved.startsWith(prefix))) {
      return resolved;
    }

    return `${SHOP_BASE_ORIGIN}${resolved}`;
  }

  return resolved;
}
