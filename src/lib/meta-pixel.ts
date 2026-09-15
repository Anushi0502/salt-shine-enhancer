import { minPrice } from "@/lib/formatters";
import { getRuntimeContext } from "@/lib/theme-assets";
import type { ShopifyProduct, ShopifyVariant } from "@/types/shopify";

declare global {
  interface Window {
    fbq?: MetaPixelFunction;
    _fbq?: MetaPixelFunction;
    SALT_META_PIXEL_ID?: string;
    __saltMetaPixelBootstrapped?: boolean;
    __saltMetaPixelManagedExternally?: boolean;
    Shopify?: { currency?: { active?: string } };
  }
}

type MetaPixelFunction = ((...args: unknown[]) => number) & {
  callMethod?: (...args: unknown[]) => void;
  push?: (...args: unknown[]) => number;
  loaded?: boolean;
  version?: string;
  queue?: unknown[];
};

export type MetaPixelCartItem = {
  id: number;
  handle: string;
  title: string;
  unitPrice: number;
  quantity: number;
  shopifyVariantId?: number;
  productType?: string;
};

const DEFAULT_META_PIXEL_ID = "1147374030261395";
const DEFAULT_CURRENCY_CODE = "USD";

function getMetaPixelId(): string {
  const runtimeId = typeof window !== "undefined" ? String(window.SALT_META_PIXEL_ID ?? "").trim() : "";
  if (runtimeId) {
    return runtimeId;
  }

  const envId = String(import.meta.env.VITE_META_PIXEL_ID ?? "").trim();
  return envId || DEFAULT_META_PIXEL_ID;
}

export function getStoreCurrencyCode(): string {
  const runtimeContext = getRuntimeContext();
  const candidates = [
    runtimeContext.currency,
    typeof window !== "undefined" ? window.Shopify?.currency?.active : "",
    import.meta.env.VITE_CURRENCY,
    DEFAULT_CURRENCY_CODE,
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate || "").trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(normalized)) {
      return normalized;
    }
  }

  return DEFAULT_CURRENCY_CODE;
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function callMetaPixel(...args: unknown[]): void {
  const fbq = (window as unknown as { fbq?: (...values: unknown[]) => unknown }).fbq;
  if (typeof fbq === "function") {
    void fbq(...args);
  }
}

function normalizeContentId(primary: unknown, fallback: unknown): string | null {
  const first = String(primary ?? "").trim();
  if (first) {
    return first;
  }

  const second = String(fallback ?? "").trim();
  return second || null;
}

function buildCartContents(items: MetaPixelCartItem[]) {
  return items
    .map((item) => {
      const id = normalizeContentId(item.shopifyVariantId, item.handle || item.id);
      if (!id) {
        return null;
      }

      const quantity = Math.max(1, Math.floor(item.quantity || 1));
      return {
        id,
        quantity,
        item_price: asNumber(item.unitPrice),
      };
    })
    .filter((entry): entry is { id: string; quantity: number; item_price: number } => Boolean(entry));
}

export function ensureMetaPixel(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  const pixelId = getMetaPixelId();
  if (!pixelId) {
    return false;
  }

  if (typeof window.fbq === "function") {
    // Shopify's Customer Events Meta pixel already tracks the same commerce
    // lifecycle on the live store. Do not duplicate those events from React.
    if (!window.__saltMetaPixelBootstrapped) {
      window.__saltMetaPixelManagedExternally = true;
      return false;
    }

    return true;
  }

  if (window.__saltMetaPixelBootstrapped) {
    return true;
  }

  window.__saltMetaPixelBootstrapped = true;

  ((f: Window, d: Document, scriptUrl: string) => {
    const n = function (...args: unknown[]): number {
      if (n.callMethod) {
        n.callMethod(...args);
      } else {
        n.queue?.push(args);
      }
      return 0;
    } as MetaPixelFunction;

    if (f.fbq) {
      return;
    }

    if (!f._fbq) {
      f._fbq = n;
    }

    f.fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];

    const script = d.createElement("script");
    script.async = true;
    script.src = scriptUrl;
    script.id = "salt-meta-pixel-script";
    script.setAttribute("fetchpriority", "low");

    const firstScript = d.getElementsByTagName("script")[0];
    firstScript?.parentNode?.insertBefore(script, firstScript);
  })(window, document, "https://connect.facebook.net/en_US/fbevents.js");

  // Keep explicit commerce events while disabling Meta's large automatic DOM
  // scrape payload, which can overflow Safari's keepalive beacon queue.
  callMetaPixel("set", "autoConfig", false, pixelId);
  callMetaPixel("init", pixelId);
  return true;
}

export function scheduleMetaPixelTask(task: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  if (idleWindow.requestIdleCallback) {
    const idleId = idleWindow.requestIdleCallback(task, { timeout: 1_500 });
    return () => idleWindow.cancelIdleCallback?.(idleId);
  }

  const timer = window.setTimeout(task, 700);
  return () => window.clearTimeout(timer);
}

export function trackMetaPixel(eventName: string, params?: Record<string, unknown>): void {
  if (!ensureMetaPixel()) {
    return;
  }

  if (params && Object.keys(params).length > 0) {
    callMetaPixel("track", eventName, params);
    return;
  }

  callMetaPixel("track", eventName);
}

export function trackMetaPixelPageView(): void {
  trackMetaPixel("PageView");
}

export function trackMetaPixelViewContent(product: ShopifyProduct, variant?: ShopifyVariant | null): void {
  const contentId = normalizeContentId(variant?.id, product.id || product.handle);
  const value = asNumber(variant?.price) || minPrice(product);

  trackMetaPixel("ViewContent", {
    content_ids: contentId ? [contentId] : undefined,
    content_name: product.title,
    content_category: product.product_type || undefined,
    content_type: "product",
    currency: getStoreCurrencyCode(),
    value,
  });
}

export function trackMetaPixelSearch(query: string, totalResults = 0): void {
  const normalizedQuery = String(query || "").trim();
  if (!normalizedQuery) {
    return;
  }

  trackMetaPixel("Search", {
    search_string: normalizedQuery,
    num_items: Math.max(0, Math.floor(totalResults || 0)),
  });
}

export function trackMetaPixelAddToCart(item: MetaPixelCartItem): void {
  const contentId = normalizeContentId(item.shopifyVariantId, item.handle || item.id);
  const quantity = Math.max(1, Math.floor(item.quantity || 1));
  const unitPrice = asNumber(item.unitPrice);

  trackMetaPixel("AddToCart", {
    content_ids: contentId ? [contentId] : undefined,
    content_name: item.title,
    content_category: item.productType || undefined,
    content_type: "product",
    contents: contentId
      ? [
          {
            id: contentId,
            quantity,
            item_price: unitPrice,
          },
        ]
      : undefined,
    currency: getStoreCurrencyCode(),
    value: unitPrice * quantity,
  });
}

export function trackMetaPixelInitiateCheckout(items: MetaPixelCartItem[]): void {
  if (!items.length) {
    return;
  }

  const contents = buildCartContents(items);
  const contentIds = contents.map((entry) => entry.id);
  const quantity = items.reduce((sum, item) => sum + Math.max(1, Math.floor(item.quantity || 1)), 0);
  const value = items.reduce(
    (sum, item) => sum + asNumber(item.unitPrice) * Math.max(1, Math.floor(item.quantity || 1)),
    0,
  );

  trackMetaPixel("InitiateCheckout", {
    content_ids: contentIds,
    contents,
    content_type: "product",
    currency: getStoreCurrencyCode(),
    num_items: quantity,
    value,
  });
}
