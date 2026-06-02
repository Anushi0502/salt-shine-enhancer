import { minPrice } from "@/lib/formatters";
import { getRuntimeContext } from "@/lib/theme-assets";
import type { ShopifyProduct, ShopifyVariant } from "@/types/shopify";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: (...args: unknown[]) => void;
    SALT_META_PIXEL_ID?: string;
    __saltMetaPixelBootstrapped?: boolean;
  }
}

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

function getMetaPixelId(): string {
  const runtimeId = typeof window !== "undefined" ? String(window.SALT_META_PIXEL_ID ?? "").trim() : "";
  if (runtimeId) {
    return runtimeId;
  }

  const envId = String(import.meta.env.VITE_META_PIXEL_ID ?? "").trim();
  return envId || DEFAULT_META_PIXEL_ID;
}

function getCurrencyCode(): string {
  const runtimeContext = getRuntimeContext();
  return String(runtimeContext.currency || import.meta.env.VITE_CURRENCY || "USD")
    .trim()
    .toUpperCase();
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
    return true;
  }

  if (window.__saltMetaPixelBootstrapped) {
    return true;
  }

  window.__saltMetaPixelBootstrapped = true;

  ((f: Window, d: Document, tagName: string, scriptUrl: string) => {
    const n = function (...args: unknown[]) {
      if (n.callMethod) {
        n.callMethod(...args);
      } else {
        n.queue?.push(args);
      }
    } as ((...args: unknown[]) => void) & {
      callMethod?: (...args: unknown[]) => void;
      push?: (...args: unknown[]) => number;
      loaded?: boolean;
      version?: string;
      queue?: unknown[];
    };

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

    const script = d.createElement(tagName);
    script.async = true;
    script.src = scriptUrl;
    script.id = "salt-meta-pixel-script";

    const firstScript = d.getElementsByTagName(tagName)[0];
    firstScript?.parentNode?.insertBefore(script, firstScript);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

  window.fbq?.("init", pixelId);
  return true;
}

export function trackMetaPixel(eventName: string, params?: Record<string, unknown>): void {
  if (!ensureMetaPixel()) {
    return;
  }

  if (params && Object.keys(params).length > 0) {
    window.fbq?.("track", eventName, params);
    return;
  }

  window.fbq?.("track", eventName);
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
    currency: getCurrencyCode(),
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
    currency: getCurrencyCode(),
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
    currency: getCurrencyCode(),
    num_items: quantity,
    value,
  });
}
