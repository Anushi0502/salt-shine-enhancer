import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildShopifyCheckoutUrl,
  buildShopifyDirectCheckoutUrl,
  isValidShopifyVariantId,
  type CartItem,
} from "@/lib/cart";
import { useCustomerAuth } from "@/lib/customer-auth";
import {
  clearCustomerOrderHistory,
  loadCustomerOrderHistory,
  removeCustomerOrderHistoryEntry,
  saveCustomerOrderHistoryEntries,
  saveCustomerOrderHistoryEntry,
  type CustomerOrderHistoryEntry,
  type CustomerOrderHistoryItem,
} from "@/services/customer-order-history";
import { isSupabaseConfigured } from "@/services/supabase";

export type DeviceOrderHistoryItem = CustomerOrderHistoryItem;

export type DeviceOrderHistoryEntry = CustomerOrderHistoryEntry;

const ORDER_HISTORY_STORAGE_KEY = "salt-order-history-v1";
const ORDER_HISTORY_EVENT = "salt-order-history-updated";
const ORDER_HISTORY_SYNC_USER_KEY = "salt-order-history-cloud-synced-user-v1";
const ORDER_HISTORY_LIMIT = 120;

function isValidOrderHistoryItem(input: unknown): input is DeviceOrderHistoryItem {
  if (!input || typeof input !== "object") {
    return false;
  }

  const item = input as Partial<DeviceOrderHistoryItem>;
  return (
    typeof item.id === "number" &&
    typeof item.handle === "string" &&
    typeof item.title === "string" &&
    typeof item.image === "string" &&
    typeof item.unitPrice === "number" &&
    typeof item.quantity === "number"
  );
}

function sanitizeOrderHistoryItem(item: DeviceOrderHistoryItem): DeviceOrderHistoryItem {
  return {
    ...item,
    quantity: Math.max(1, Math.floor(item.quantity || 1)),
    unitPrice: Number.isFinite(item.unitPrice) ? item.unitPrice : 0,
    handle: String(item.handle || "").trim(),
    title: String(item.title || "").trim(),
    image: String(item.image || "").trim(),
  };
}

function mergeOrderHistoryEntries(
  localEntries: DeviceOrderHistoryEntry[],
  remoteEntries: DeviceOrderHistoryEntry[],
): DeviceOrderHistoryEntry[] {
  const merged = new Map<string, DeviceOrderHistoryEntry>();

  remoteEntries.forEach((entry) => {
    merged.set(entry.id, entry);
  });

  localEntries.forEach((entry) => {
    const existing = merged.get(entry.id);
    if (!existing) {
      merged.set(entry.id, entry);
      return;
    }

    merged.set(entry.id, {
      ...existing,
      ...entry,
      items: entry.items.length ? entry.items : existing.items,
      itemCount: Math.max(existing.itemCount, entry.itemCount),
      subtotal: Math.max(existing.subtotal, entry.subtotal),
      checkoutUrl: entry.checkoutUrl || existing.checkoutUrl,
      source: entry.source || existing.source,
      createdAt:
        new Date(entry.createdAt).getTime() > new Date(existing.createdAt).getTime()
          ? entry.createdAt
          : existing.createdAt,
    });
  });

  return sanitizeOrderHistoryEntries(Array.from(merged.values()));
}

function toCartItems(items: DeviceOrderHistoryItem[]): CartItem[] {
  return items.map((item) => ({
    id: item.id,
    handle: item.handle,
    title: item.title,
    image: item.image,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    shopifyVariantId: item.shopifyVariantId,
  }));
}

function resolveEntryCheckoutUrl(
  source: DeviceOrderHistoryEntry["source"] | undefined,
  existingCheckoutUrl: string,
  items: DeviceOrderHistoryItem[],
): string {
  const normalizedExisting = String(existingCheckoutUrl || "").trim();
  const normalizedItems = toCartItems(items);
  const firstItem = normalizedItems[0];

  if (
    source === "buy-now" &&
    normalizedItems.length === 1 &&
    firstItem &&
    isValidShopifyVariantId(firstItem.shopifyVariantId)
  ) {
    return buildShopifyDirectCheckoutUrl(firstItem.shopifyVariantId, firstItem.quantity);
  }

  if (normalizedItems.length > 0) {
    return buildShopifyCheckoutUrl(normalizedItems);
  }

  return normalizedExisting;
}

function sanitizeOrderHistoryEntries(input: unknown): DeviceOrderHistoryEntry[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return (input as DeviceOrderHistoryEntry[])
    .filter((entry) => {
      if (!entry || typeof entry !== "object") {
        return false;
      }

      const candidate = entry as Partial<DeviceOrderHistoryEntry>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.createdAt === "string" &&
        typeof candidate.checkoutUrl === "string" &&
        Array.isArray(candidate.items) &&
        candidate.items.every(isValidOrderHistoryItem)
      );
    })
    .map((entry) => {
      const items = entry.items.map(sanitizeOrderHistoryItem);
      const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
      const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      const source = (entry.source === "buy-now" ? "buy-now" : "cart") as DeviceOrderHistoryEntry["source"];

      return {
        id: entry.id,
        createdAt: entry.createdAt,
        source,
        checkoutUrl: resolveEntryCheckoutUrl(source, entry.checkoutUrl, items),
        itemCount,
        subtotal,
        items,
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, ORDER_HISTORY_LIMIT);
}

function readOrderHistoryFromStorage(): DeviceOrderHistoryEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(ORDER_HISTORY_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeOrderHistoryEntries(parsed);
  } catch {
    return [];
  }
}

function writeOrderHistoryToStorage(entries: DeviceOrderHistoryEntry[]): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = sanitizeOrderHistoryEntries(entries);
  window.localStorage.setItem(ORDER_HISTORY_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(ORDER_HISTORY_EVENT));
}

function readSyncedOrderHistoryUserId(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return String(window.localStorage.getItem(ORDER_HISTORY_SYNC_USER_KEY) || "").trim();
}

function writeSyncedOrderHistoryUserId(userId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  if (!userId) {
    window.localStorage.removeItem(ORDER_HISTORY_SYNC_USER_KEY);
    return;
  }

  window.localStorage.setItem(ORDER_HISTORY_SYNC_USER_KEY, userId);
}

export function readDeviceOrderHistory(): DeviceOrderHistoryEntry[] {
  return readOrderHistoryFromStorage();
}

export function recordDeviceOrderHistory(input: {
  source: "cart" | "buy-now";
  checkoutUrl: string;
  items: CartItem[];
  userId?: string | null;
}): DeviceOrderHistoryEntry {
  const items = input.items.map((item) =>
    sanitizeOrderHistoryItem({
      id: item.id,
      handle: item.handle,
      title: item.title,
      image: item.image,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      shopifyVariantId: item.shopifyVariantId,
    }),
  );

  const now = new Date().toISOString();
  const nextEntry: DeviceOrderHistoryEntry = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: now,
    source: input.source,
    checkoutUrl: String(input.checkoutUrl || "").trim(),
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    items,
  };

  const current = readOrderHistoryFromStorage();
  writeOrderHistoryToStorage([nextEntry, ...current]);
  if (input.userId && isSupabaseConfigured()) {
    void saveCustomerOrderHistoryEntry(input.userId, nextEntry);
  }

  return nextEntry;
}

export function removeDeviceOrderHistoryEntry(entryId: string, userId?: string | null): void {
  const targetId = String(entryId || "").trim();
  if (!targetId) {
    return;
  }

  const current = readOrderHistoryFromStorage();
  writeOrderHistoryToStorage(current.filter((entry) => entry.id !== targetId));
  if (userId && isSupabaseConfigured()) {
    void removeCustomerOrderHistoryEntry(userId, targetId);
  }
}

export function clearDeviceOrderHistory(userId?: string | null): void {
  writeOrderHistoryToStorage([]);
  if (userId && isSupabaseConfigured()) {
    void clearCustomerOrderHistory(userId);
  }
}

export function getDevicePurchasesLast30Days(entries: DeviceOrderHistoryEntry[]): number {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

  return entries
    .filter((entry) => new Date(entry.createdAt).getTime() >= cutoff)
    .reduce((sum, entry) => sum + entry.itemCount, 0);
}

export function getProductPurchasesLast30Days(
  entries: DeviceOrderHistoryEntry[],
  productHandle: string,
): number {
  const target = String(productHandle || "").trim().toLowerCase();
  if (!target) {
    return 0;
  }

  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let total = 0;

  entries.forEach((entry) => {
    if (new Date(entry.createdAt).getTime() < cutoff) {
      return;
    }

    entry.items.forEach((item) => {
      if (String(item.handle || "").trim().toLowerCase() === target) {
        total += item.quantity;
      }
    });
  });

  return total;
}

export function useDeviceOrderHistory() {
  const { isAuthenticated, session } = useCustomerAuth();
  const userId = session?.user?.id || "";
  const [entries, setEntries] = useState<DeviceOrderHistoryEntry[]>(() => readOrderHistoryFromStorage());

  const refresh = useCallback(async () => {
    const localEntries = readOrderHistoryFromStorage();

    if (!isAuthenticated || !userId || !isSupabaseConfigured()) {
      setEntries(localEntries);
      return;
    }

    const remoteEntries = await loadCustomerOrderHistory(userId);
    if (!remoteEntries) {
      setEntries(localEntries);
      return;
    }

    const hasMergedGuestHistory = readSyncedOrderHistoryUserId() === userId;
    if (!hasMergedGuestHistory && localEntries.length > 0) {
      const mergedEntries = mergeOrderHistoryEntries(localEntries, remoteEntries);

      if (JSON.stringify(mergedEntries) !== JSON.stringify(localEntries)) {
        writeOrderHistoryToStorage(mergedEntries);
      }
      setEntries(mergedEntries);
      writeSyncedOrderHistoryUserId(userId);

      if (JSON.stringify(mergedEntries) !== JSON.stringify(remoteEntries)) {
        void saveCustomerOrderHistoryEntries(userId, mergedEntries);
      }
      return;
    }

    if (JSON.stringify(remoteEntries) !== JSON.stringify(localEntries)) {
      writeOrderHistoryToStorage(remoteEntries);
    }
    setEntries(remoteEntries);
    writeSyncedOrderHistoryUserId(userId);
  }, [isAuthenticated, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === ORDER_HISTORY_STORAGE_KEY) {
        setEntries(readOrderHistoryFromStorage());
      }
    };

    const onCustomEvent = () => {
      setEntries(readOrderHistoryFromStorage());
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(ORDER_HISTORY_EVENT, onCustomEvent);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ORDER_HISTORY_EVENT, onCustomEvent);
    };
  }, []);

  return useMemo(
    () => ({
      entries,
      purchasesLast30Days: getDevicePurchasesLast30Days(entries),
      refresh,
      remove: (entryId: string) => removeDeviceOrderHistoryEntry(entryId, userId),
      clear: () => clearDeviceOrderHistory(userId),
    }),
    [entries, refresh, userId],
  );
}
