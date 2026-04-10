import type { CartItem } from "@/lib/cart";
import { getSupabaseClient, isSupabaseConfigured } from "@/services/supabase";

type CustomerCartRow = {
  user_id: string;
  items: unknown;
  updated_at?: string | null;
};

function isCartItem(input: unknown): input is CartItem {
  if (!input || typeof input !== "object") {
    return false;
  }

  const item = input as Partial<CartItem>;
  return (
    typeof item.id === "number" &&
    typeof item.handle === "string" &&
    typeof item.title === "string" &&
    typeof item.image === "string" &&
    typeof item.unitPrice === "number" &&
    typeof item.quantity === "number"
  );
}

function sanitizeCartItems(items: unknown): CartItem[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter(isCartItem)
    .map((item) => ({
      ...item,
      quantity: Math.max(1, Math.floor(item.quantity || 1)),
      handle: String(item.handle || "").trim(),
      title: String(item.title || "").trim(),
      image: String(item.image || "").trim(),
      unitPrice: Number.isFinite(item.unitPrice) ? item.unitPrice : 0,
      productType: item.productType ? String(item.productType) : undefined,
      shopifyVariantId:
        typeof item.shopifyVariantId === "number" && Number.isFinite(item.shopifyVariantId)
          ? item.shopifyVariantId
          : undefined,
    }));
}

function logCartSyncError(context: string, error: unknown): void {
  if (!error) {
    return;
  }

  const maybeError = error as { code?: string; message?: string };
  if (maybeError.code === "42P01" || maybeError.code === "PGRST205") {
    console.warn(`[cart-sync] Missing customer_carts table during ${context}.`);
    return;
  }

  console.warn(`[cart-sync] ${context} failed.`, error);
}

export function mergeCartSnapshots(localItems: CartItem[], remoteItems: CartItem[]): CartItem[] {
  const merged = new Map<string, CartItem>();

  const upsert = (item: CartItem) => {
    const key = String(item.shopifyVariantId || item.handle || item.id);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, item);
      return;
    }

    merged.set(key, {
      ...existing,
      ...item,
      quantity: Math.max(existing.quantity, item.quantity),
      image: item.image || existing.image,
      title: item.title || existing.title,
      handle: item.handle || existing.handle,
    });
  };

  remoteItems.forEach(upsert);
  localItems.forEach(upsert);

  return Array.from(merged.values());
}

export async function loadCustomerCart(userId: string): Promise<CartItem[] | null> {
  if (!isSupabaseConfigured() || !userId) {
    return null;
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("customer_carts")
      .select("items")
      .eq("user_id", userId)
      .maybeSingle<CustomerCartRow>();

    if (error) {
      logCartSyncError("load", error);
      return null;
    }

    return sanitizeCartItems(data?.items);
  } catch (error) {
    logCartSyncError("load", error);
    return null;
  }
}

export async function saveCustomerCart(userId: string, items: CartItem[]): Promise<void> {
  if (!isSupabaseConfigured() || !userId) {
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const payload = {
      user_id: userId,
      items: sanitizeCartItems(items),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("customer_carts").upsert(payload, {
      onConflict: "user_id",
    });

    if (error) {
      logCartSyncError("save", error);
    }
  } catch (error) {
    logCartSyncError("save", error);
  }
}
