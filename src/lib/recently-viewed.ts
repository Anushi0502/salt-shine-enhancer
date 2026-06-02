import type { ShopifyProduct } from "@/types/shopify";

export const RECENTLY_VIEWED_STORAGE_KEY = "salt-recently-viewed-handles";
export const RECENTLY_VIEWED_UPDATED_EVENT = "salt:recently-viewed-updated";
export const RECENTLY_VIEWED_LIMIT = 12;

function normalizeHandle(input: string | null | undefined): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/+/, "")
    .replace(/^products\//i, "")
    .split(/[?#]/)[0]
    .replace(/\/+$/, "");
}

function sanitizeHandles(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => normalizeHandle(entry))
    .filter(Boolean);
}

export function readRecentlyViewedHandles(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    return sanitizeHandles(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function rememberRecentlyViewedHandle(handle: string, limit = RECENTLY_VIEWED_LIMIT): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  const normalized = normalizeHandle(handle);
  if (!normalized) {
    return readRecentlyViewedHandles();
  }

  const existing = readRecentlyViewedHandles().filter((entry) => entry !== normalized);
  const next = [normalized, ...existing].slice(0, Math.max(1, Math.floor(limit || RECENTLY_VIEWED_LIMIT)));

  window.localStorage.setItem(RECENTLY_VIEWED_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(RECENTLY_VIEWED_UPDATED_EVENT));
  return next;
}

export function readRecentlyViewedProducts(
  products: ShopifyProduct[],
  handles: string[] = readRecentlyViewedHandles(),
): ShopifyProduct[] {
  const byHandle = new Map(products.map((product) => [normalizeHandle(product.handle), product]));

  return handles
    .map((handle) => byHandle.get(normalizeHandle(handle)))
    .filter((product): product is ShopifyProduct => Boolean(product));
}

