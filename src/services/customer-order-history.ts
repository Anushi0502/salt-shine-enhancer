import { getSupabaseClient, isSupabaseConfigured } from "@/services/supabase";

export type CustomerOrderHistoryItem = {
  id: number;
  handle: string;
  title: string;
  image: string;
  unitPrice: number;
  quantity: number;
  shopifyVariantId?: number;
};

export type CustomerOrderHistoryEntry = {
  id: string;
  createdAt: string;
  source: "cart" | "buy-now";
  checkoutUrl: string;
  itemCount: number;
  subtotal: number;
  items: CustomerOrderHistoryItem[];
};

type CustomerOrderHistoryRow = {
  id: string;
  user_id: string;
  source: "cart" | "buy-now";
  checkout_url: string;
  item_count: number;
  subtotal: number;
  items: unknown;
  created_at: string;
};

function isHistoryItem(input: unknown): input is CustomerOrderHistoryItem {
  if (!input || typeof input !== "object") {
    return false;
  }

  const item = input as Partial<CustomerOrderHistoryItem>;
  return (
    typeof item.id === "number" &&
    typeof item.handle === "string" &&
    typeof item.title === "string" &&
    typeof item.image === "string" &&
    typeof item.unitPrice === "number" &&
    typeof item.quantity === "number"
  );
}

function sanitizeHistoryItem(item: CustomerOrderHistoryItem): CustomerOrderHistoryItem {
  return {
    ...item,
    handle: String(item.handle || "").trim(),
    title: String(item.title || "").trim(),
    image: String(item.image || "").trim(),
    unitPrice: Number.isFinite(item.unitPrice) ? item.unitPrice : 0,
    quantity: Math.max(1, Math.floor(item.quantity || 1)),
    shopifyVariantId:
      typeof item.shopifyVariantId === "number" && Number.isFinite(item.shopifyVariantId)
        ? item.shopifyVariantId
        : undefined,
  };
}

function sanitizeHistoryItems(items: unknown): CustomerOrderHistoryItem[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.filter(isHistoryItem).map(sanitizeHistoryItem);
}

function sanitizeHistoryEntry(row: CustomerOrderHistoryRow): CustomerOrderHistoryEntry {
  const items = sanitizeHistoryItems(row.items);

  return {
    id: String(row.id || "").trim(),
    createdAt: String(row.created_at || new Date().toISOString()),
    source: row.source === "buy-now" ? "buy-now" : "cart",
    checkoutUrl: String(row.checkout_url || "").trim(),
    itemCount: Math.max(
      0,
      Number.isFinite(row.item_count)
        ? Number(row.item_count)
        : items.reduce((sum, item) => sum + item.quantity, 0),
    ),
    subtotal: Number.isFinite(row.subtotal)
      ? Number(row.subtotal)
      : items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    items,
  };
}

function toDatabaseRow(userId: string, entry: CustomerOrderHistoryEntry) {
  return {
    id: entry.id,
    user_id: userId,
    source: entry.source,
    checkout_url: String(entry.checkoutUrl || "").trim(),
    item_count: Math.max(0, Math.floor(entry.itemCount || 0)),
    subtotal: Number(entry.subtotal || 0),
    items: entry.items.map(sanitizeHistoryItem),
    created_at: entry.createdAt || new Date().toISOString(),
  };
}

function logOrderHistoryError(context: string, error: unknown): void {
  if (!error) {
    return;
  }

  const maybeError = error as { code?: string; message?: string };
  if (maybeError.code === "42P01" || maybeError.code === "PGRST205") {
    console.warn(`[order-history] Missing customer_order_history table during ${context}.`);
    return;
  }

  console.warn(`[order-history] ${context} failed.`, error);
}

export async function loadCustomerOrderHistory(userId: string): Promise<CustomerOrderHistoryEntry[] | null> {
  if (!isSupabaseConfigured() || !userId) {
    return null;
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("customer_order_history")
      .select("id,user_id,source,checkout_url,item_count,subtotal,items,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      logOrderHistoryError("load", error);
      return null;
    }

    return (data || []).map((row) => sanitizeHistoryEntry(row as CustomerOrderHistoryRow));
  } catch (error) {
    logOrderHistoryError("load", error);
    return null;
  }
}

export async function saveCustomerOrderHistoryEntry(
  userId: string,
  entry: CustomerOrderHistoryEntry,
): Promise<void> {
  if (!isSupabaseConfigured() || !userId) {
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("customer_order_history")
      .upsert(toDatabaseRow(userId, entry), { onConflict: "id" });

    if (error) {
      logOrderHistoryError("save", error);
    }
  } catch (error) {
    logOrderHistoryError("save", error);
  }
}

export async function saveCustomerOrderHistoryEntries(
  userId: string,
  entries: CustomerOrderHistoryEntry[],
): Promise<void> {
  if (!isSupabaseConfigured() || !userId) {
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const payload = entries.map((entry) => toDatabaseRow(userId, entry));
    const { error } = await supabase
      .from("customer_order_history")
      .upsert(payload, { onConflict: "id" });

    if (error) {
      logOrderHistoryError("bulk-save", error);
    }
  } catch (error) {
    logOrderHistoryError("bulk-save", error);
  }
}

export async function removeCustomerOrderHistoryEntry(userId: string, entryId: string): Promise<void> {
  if (!isSupabaseConfigured() || !userId || !entryId) {
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("customer_order_history")
      .delete()
      .eq("user_id", userId)
      .eq("id", entryId);

    if (error) {
      logOrderHistoryError("remove", error);
    }
  } catch (error) {
    logOrderHistoryError("remove", error);
  }
}

export async function clearCustomerOrderHistory(userId: string): Promise<void> {
  if (!isSupabaseConfigured() || !userId) {
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("customer_order_history")
      .delete()
      .eq("user_id", userId);

    if (error) {
      logOrderHistoryError("clear", error);
    }
  } catch (error) {
    logOrderHistoryError("clear", error);
  }
}
