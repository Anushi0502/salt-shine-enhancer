import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getBrowserStorage } from "@/lib/browser-storage";
import { trackMetaPixelAddToCart } from "@/lib/meta-pixel";
import { getMinimumProductQuantity } from "@/lib/minimum-quantity-rules";
import { getRuntimeContext } from "@/lib/theme-assets";

export type CartItem = {
  id: number;
  handle: string;
  title: string;
  image: string;
  unitPrice: number;
  quantity: number;
  shopifyVariantId?: number;
  productType?: string;
  minimumQuantity?: number;
};

type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  isDrawerOpen: boolean;
  addItem: (
    item: Omit<CartItem, "quantity">,
    quantity?: number,
    options?: { openDrawer?: boolean },
  ) => void;
  updateQuantity: (id: number, quantity: number) => void;
  removeItem: (id: number) => void;
  replaceItems: (items: CartItem[]) => void;
  clear: () => void;
  openCartDrawer: () => void;
  closeCartDrawer: () => void;
  toggleCartDrawer: () => void;
};

const CART_STORAGE_KEY = "salt-cart";
const MIN_SHOPIFY_NUMERIC_ID = 10_000_000_000_000;
const SHOPIFY_ROUTE_BYPASS_QUERY = "_fd=0&pb=0";
const DEFAULT_CANONICAL_SHOP_BASE = "https://0309d3-72.myshopify.com";

function normalizeBaseUrl(input: string | undefined): string | null {
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

function isLocalOrigin(input: string | null): boolean {
  if (!input) {
    return false;
  }

  try {
    const { hostname } = new URL(input);
    const normalized = hostname.toLowerCase();
    if (
      normalized === "localhost" ||
      normalized === "127.0.0.1" ||
      normalized === "::1" ||
      normalized === "[::1]" ||
      normalized.endsWith(".local") ||
      normalized.endsWith(".lan")
    ) {
      return true;
    }

    if (normalized.startsWith("10.") || normalized.startsWith("192.168.")) {
      return true;
    }

    const match172 = normalized.match(/^172\.(\d{1,3})\./);
    if (match172) {
      const secondOctet = Number(match172[1]);
      return secondOctet >= 16 && secondOctet <= 31;
    }

    return false;
  } catch {
    return false;
  }
}

function resolveShopBase(): string {
  const runtimeContext = getRuntimeContext();
  const runtimeBase =
    normalizeBaseUrl(runtimeContext.shopBaseUrl) ||
    normalizeBaseUrl(runtimeContext.shopDomain);
  if (runtimeBase) {
    return runtimeBase;
  }

  const explicitBase =
    normalizeBaseUrl(import.meta.env.VITE_SHOPIFY_STOREFRONT_URL) ||
    normalizeBaseUrl(import.meta.env.VITE_SALT_SHOP_URL);
  if (explicitBase) {
    return explicitBase;
  }

  const fallbackCanonical = normalizeBaseUrl(DEFAULT_CANONICAL_SHOP_BASE);
  if (fallbackCanonical) {
    return fallbackCanonical;
  }

  if (typeof window !== "undefined") {
    const localProxyTarget = normalizeBaseUrl(import.meta.env.VITE_LOCAL_SHOPIFY_PROXY_TARGET);
    if (localProxyTarget) {
      return localProxyTarget;
    }

    const appOrigin = normalizeBaseUrl(window.location.origin);
    if (appOrigin && !isLocalOrigin(appOrigin)) {
      return appOrigin;
    }
  }

  return "";
}

export const SHOPIFY_STOREFRONT_BASE = resolveShopBase();

export function buildShopifyCartUrl(): string {
  return `${SHOPIFY_STOREFRONT_BASE}/cart?${SHOPIFY_ROUTE_BYPASS_QUERY}`;
}

const CartContext = createContext<CartContextValue | null>(null);

export function isValidShopifyVariantId(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_SHOPIFY_NUMERIC_ID
  );
}

function normalizeShopifyHandle(input: string | null | undefined): string {
  const raw = String(input || "").trim();
  if (!raw) {
    return "";
  }

  const withoutDomain = raw.replace(/^https?:\/\/[^/]+/i, "");
  const cleanPath = withoutDomain.replace(/^\/+/, "");
  const withoutProductsPrefix = cleanPath.replace(/^products\//i, "");
  const singleSegment = withoutProductsPrefix.split(/[/?#]/)[0] || "";

  return singleSegment.trim().toLowerCase();
}

function sanitizeCartItems(items: CartItem[]): CartItem[] {
  return items
    .filter((entry) =>
      typeof entry.id === "number" &&
      typeof entry.title === "string" &&
      typeof entry.handle === "string" &&
      typeof entry.image === "string" &&
      typeof entry.unitPrice === "number" &&
      typeof entry.quantity === "number",
    )
    .map((entry) => ({
      ...entry,
      minimumQuantity: typeof entry.minimumQuantity === "number" && Number.isFinite(entry.minimumQuantity) && entry.minimumQuantity > 0
        ? Math.max(1, Math.floor(entry.minimumQuantity))
        : undefined,
      quantity: Math.max(
        getMinimumProductQuantity(entry.handle, entry.unitPrice, entry.minimumQuantity),
        Math.floor(entry.quantity || 1),
      ),
      shopifyVariantId: isValidShopifyVariantId(entry.shopifyVariantId)
        ? entry.shopifyVariantId
        : isValidShopifyVariantId(entry.id)
          ? entry.id
          : undefined,
    }));
}

function readStoredCart(): CartItem[] {
  const storage = getBrowserStorage();
  const raw = storage?.getItem(CART_STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as CartItem[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return sanitizeCartItems(parsed);
  } catch {
    return [];
  }
}

export function buildShopifyCheckoutUrl(items: CartItem[]): string {
  const lineItems = items
    .map((item) => {
      const variantId = item.shopifyVariantId;
      const quantity = Math.max(1, Math.floor(item.quantity || 1));

      if (!isValidShopifyVariantId(variantId)) {
        return null;
      }

      return `${variantId}:${quantity}`;
    })
    .filter((entry): entry is string => Boolean(entry));

  if (!lineItems.length) {
    return buildShopifyCartUrl();
  }

  return `${SHOPIFY_STOREFRONT_BASE}/cart/${lineItems.join(",")}?checkout&${SHOPIFY_ROUTE_BYPASS_QUERY}`;
}

export function buildShopifyDirectCheckoutUrl(variantId: number, quantity = 1): string {
  if (!isValidShopifyVariantId(variantId)) {
    return buildShopifyCartUrl();
  }

  const safeQuantity = Math.max(1, Math.floor(quantity || 1));
  return `${SHOPIFY_STOREFRONT_BASE}/cart/${variantId}:${safeQuantity}?checkout&${SHOPIFY_ROUTE_BYPASS_QUERY}`;
}

export function buildShopifyProductUrl(handle: string | null | undefined): string | null {
  const normalized = normalizeShopifyHandle(handle);
  if (!normalized) {
    return null;
  }

  return `${SHOPIFY_STOREFRONT_BASE}/products/${encodeURIComponent(normalized)}`;
}

export function buildShopifySearchUrl(query: string | null | undefined): string | null {
  const normalized = String(query || "").trim();
  if (!normalized) {
    return null;
  }

  return `${SHOPIFY_STOREFRONT_BASE}/search?q=${encodeURIComponent(normalized)}&type=product`;
}

export function CartProvider({ children }: PropsWithChildren) {
  const [items, setItems] = useState<CartItem[]>(readStoredCart);
  const [isDrawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    getBrowserStorage()?.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const value = useMemo<CartContextValue>(() => {
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

    return {
      items,
      itemCount,
      subtotal,
      isDrawerOpen,
      addItem: (newItem, quantity = 1, options) => {
        const safeQuantity = Math.max(
          getMinimumProductQuantity(newItem.handle, newItem.unitPrice, newItem.minimumQuantity),
          Math.floor(quantity || 1),
        );
        const normalizedMinimumQuantity =
          typeof newItem.minimumQuantity === "number" && Number.isFinite(newItem.minimumQuantity) && newItem.minimumQuantity > 0
            ? Math.max(1, Math.floor(newItem.minimumQuantity))
            : undefined;

        setItems((current) => {
          const existing = current.find((entry) => entry.id === newItem.id);

          if (existing) {
            return current.map((entry) =>
              entry.id === newItem.id
                ? {
                    ...entry,
                    minimumQuantity: normalizedMinimumQuantity ?? entry.minimumQuantity,
                    quantity: Math.max(1, entry.quantity + safeQuantity),
                  }
                : entry,
            );
          }

          return [
            ...current,
            {
              ...newItem,
              minimumQuantity: normalizedMinimumQuantity,
              quantity: safeQuantity,
            },
          ];
        });

        trackMetaPixelAddToCart({
          ...newItem,
          quantity: safeQuantity,
        });

        if (options?.openDrawer !== false) {
          setDrawerOpen(true);
        }
      },
      updateQuantity: (id, quantity) => {
        setItems((current) =>
          current.flatMap((entry) => {
            if (entry.id !== id) {
              return [entry];
            }

            const minimumQuantity = getMinimumProductQuantity(entry.handle, entry.unitPrice, entry.minimumQuantity);
            const nextQuantity = Math.floor(quantity || 0);

            if (nextQuantity <= 0 && minimumQuantity === 1) {
              return [];
            }

            return [
              {
                ...entry,
                quantity: Math.max(minimumQuantity, nextQuantity),
              },
            ];
          }),
        );
      },
      removeItem: (id) => setItems((current) => current.filter((entry) => entry.id !== id)),
      replaceItems: (nextItems) => setItems(sanitizeCartItems(nextItems)),
      clear: () => setItems([]),
      openCartDrawer: () => setDrawerOpen(true),
      closeCartDrawer: () => setDrawerOpen(false),
      toggleCartDrawer: () => setDrawerOpen((current) => !current),
    };
  }, [isDrawerOpen, items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }

  return context;
}
