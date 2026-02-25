import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type CartItem = {
  id: number;
  handle: string;
  title: string;
  image: string;
  unitPrice: number;
  quantity: number;
  shopifyVariantId?: number;
};

type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  updateQuantity: (id: number, quantity: number) => void;
  removeItem: (id: number) => void;
  replaceItems: (items: CartItem[]) => void;
  clear: () => void;
};

const CART_STORAGE_KEY = "salt-cart";
const MIN_SHOPIFY_NUMERIC_ID = 10_000_000_000_000;
const FALLBACK_SHOP_BASE = "https://0309d3-72.myshopify.com";
const SHOPIFY_ROUTE_BYPASS_QUERY = "_fd=0&pb=0";

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

function resolveShopBase(): string {
  const explicitBase =
    normalizeBaseUrl(import.meta.env.VITE_SHOPIFY_STOREFRONT_URL) ||
    normalizeBaseUrl(import.meta.env.VITE_SALT_SHOP_URL);

  if (!explicitBase) {
    return FALLBACK_SHOP_BASE;
  }

  if (typeof window !== "undefined") {
    const appOrigin = normalizeBaseUrl(window.location.origin);
    if (appOrigin && appOrigin === explicitBase) {
      return FALLBACK_SHOP_BASE;
    }
  }

  return explicitBase;
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
      quantity: Math.max(1, Math.floor(entry.quantity || 1)),
      shopifyVariantId: isValidShopifyVariantId(entry.shopifyVariantId)
        ? entry.shopifyVariantId
        : isValidShopifyVariantId(entry.id)
          ? entry.id
          : undefined,
    }));
}

function readStoredCart(): CartItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(CART_STORAGE_KEY);

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

export function buildShopifyShopPayUrl(variantId: number, quantity = 1): string {
  if (!isValidShopifyVariantId(variantId)) {
    return buildShopifyCartUrl();
  }

  const safeQuantity = Math.max(1, Math.floor(quantity || 1));
  return `${SHOPIFY_STOREFRONT_BASE}/cart/${variantId}:${safeQuantity}?payment=shop_pay&${SHOPIFY_ROUTE_BYPASS_QUERY}`;
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

  useEffect(() => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const value = useMemo<CartContextValue>(() => {
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

    return {
      items,
      itemCount,
      subtotal,
      addItem: (newItem, quantity = 1) => {
        setItems((current) => {
          const existing = current.find((entry) => entry.id === newItem.id);

          if (existing) {
            return current.map((entry) =>
              entry.id === newItem.id
                ? {
                    ...entry,
                    quantity: Math.max(1, entry.quantity + quantity),
                  }
                : entry,
            );
          }

          return [...current, { ...newItem, quantity: Math.max(1, quantity) }];
        });
      },
      updateQuantity: (id, quantity) => {
        if (quantity <= 0) {
          setItems((current) => current.filter((entry) => entry.id !== id));
          return;
        }

        setItems((current) =>
          current.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  quantity,
                }
              : entry,
          ),
        );
      },
      removeItem: (id) => setItems((current) => current.filter((entry) => entry.id !== id)),
      replaceItems: (nextItems) => setItems(sanitizeCartItems(nextItems)),
      clear: () => setItems([]),
    };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }

  return context;
}
