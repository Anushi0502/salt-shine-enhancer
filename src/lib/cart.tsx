import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type CartItem = {
  id: number;
  handle: string;
  title: string;
  image: string;
  unitPrice: number;
  quantity: number;
};

type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  updateQuantity: (id: number, quantity: number) => void;
  removeItem: (id: number) => void;
  clear: () => void;
};

const CART_STORAGE_KEY = "salt-cart";

const CartContext = createContext<CartContextValue | null>(null);

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

    return parsed.filter((entry) =>
      typeof entry.id === "number" &&
      typeof entry.title === "string" &&
      typeof entry.handle === "string" &&
      typeof entry.image === "string" &&
      typeof entry.unitPrice === "number" &&
      typeof entry.quantity === "number",
    );
  } catch {
    return [];
  }
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
