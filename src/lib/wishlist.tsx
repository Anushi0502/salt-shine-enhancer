import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { minPrice, productImage } from "@/lib/formatters";
import type { ShopifyProduct } from "@/types/shopify";

export type WishlistItem = {
  id: number;
  handle: string;
  title: string;
  image: string;
  unitPrice: number;
  productType?: string;
};

type WishlistContextValue = {
  items: WishlistItem[];
  itemCount: number;
  isWishlisted: (handle: string | null | undefined) => boolean;
  addItem: (item: WishlistItem) => void;
  removeItem: (handleOrId: string | number) => void;
  toggleItem: (item: WishlistItem) => void;
  clear: () => void;
};

const WISHLIST_STORAGE_KEY = "salt-wishlist";

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

function sanitizeWishlistItems(items: WishlistItem[]): WishlistItem[] {
  return items
    .filter((entry) =>
      typeof entry.id === "number" &&
      Number.isFinite(entry.id) &&
      typeof entry.title === "string" &&
      typeof entry.handle === "string" &&
      typeof entry.image === "string" &&
      typeof entry.unitPrice === "number" &&
      Number.isFinite(entry.unitPrice),
    )
    .map((entry) => ({
      ...entry,
      handle: normalizeHandle(entry.handle),
      title: entry.title.trim(),
      image: String(entry.image || ""),
      productType: entry.productType ? String(entry.productType) : undefined,
    }))
    .filter((entry) => Boolean(entry.handle || entry.id));
}

function readStoredWishlist(): WishlistItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(WISHLIST_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as WishlistItem[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return sanitizeWishlistItems(parsed);
  } catch {
    return [];
  }
}

export function wishlistItemFromProduct(product: ShopifyProduct): WishlistItem {
  return {
    id: product.id,
    handle: normalizeHandle(product.handle),
    title: product.title,
    image: productImage(product) || "",
    unitPrice: minPrice(product),
    productType: product.product_type,
  };
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: PropsWithChildren) {
  const [items, setItems] = useState<WishlistItem[]>(readStoredWishlist);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const value = useMemo<WishlistContextValue>(() => ({
    items,
    itemCount: items.length,
    isWishlisted: (handle) => {
      const normalized = normalizeHandle(handle);
      if (!normalized) {
        return false;
      }

      return items.some((entry) => normalizeHandle(entry.handle) === normalized);
    },
    addItem: (item) => {
      const sanitized = sanitizeWishlistItems([item])[0];
      if (!sanitized) {
        return;
      }

      setItems((current) => {
        const exists = current.some((entry) => normalizeHandle(entry.handle) === sanitized.handle);
        if (exists) {
          return current;
        }

        return [...current, sanitized];
      });
    },
    removeItem: (handleOrId) => {
      setItems((current) =>
        current.filter((entry) => {
          if (typeof handleOrId === "number") {
            return entry.id !== handleOrId;
          }

          return normalizeHandle(entry.handle) !== normalizeHandle(handleOrId);
        }),
      );
    },
    toggleItem: (item) => {
      const sanitized = sanitizeWishlistItems([item])[0];
      if (!sanitized) {
        return;
      }

      setItems((current) => {
        const exists = current.some((entry) => normalizeHandle(entry.handle) === sanitized.handle);
        if (exists) {
          return current.filter((entry) => normalizeHandle(entry.handle) !== sanitized.handle);
        }

        return [...current, sanitized];
      });
    },
    clear: () => setItems([]),
  }), [items]);

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const context = useContext(WishlistContext);

  if (!context) {
    throw new Error("useWishlist must be used within WishlistProvider");
  }

  return context;
}