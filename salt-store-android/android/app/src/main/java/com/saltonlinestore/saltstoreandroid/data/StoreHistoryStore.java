package com.saltonlinestore.saltstoreandroid.data;

import android.content.Context;
import android.content.SharedPreferences;

import com.saltonlinestore.saltstoreandroid.model.StoreCartEntry;
import com.saltonlinestore.saltstoreandroid.model.StoreCatalog;
import com.saltonlinestore.saltstoreandroid.model.StoreProduct;
import com.saltonlinestore.saltstoreandroid.model.StoreVariant;
import com.saltonlinestore.saltstoreandroid.util.StoreFormat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class StoreHistoryStore {
    public static final class OrderHistoryItem {
        public final long id;
        public final String handle;
        public final String title;
        public final String image;
        public final double unitPrice;
        public final int quantity;
        public final long shopifyVariantId;
        public final String variantTitle;

        public OrderHistoryItem(
                long id,
                String handle,
                String title,
                String image,
                double unitPrice,
                int quantity,
                long shopifyVariantId,
                String variantTitle
        ) {
            this.id = id;
            this.handle = handle;
            this.title = title;
            this.image = image;
            this.unitPrice = unitPrice;
            this.quantity = quantity;
            this.shopifyVariantId = shopifyVariantId;
            this.variantTitle = variantTitle;
        }
    }

    public static final class OrderHistoryEntry {
        public final String id;
        public final String createdAt;
        public final String source;
        public final String checkoutUrl;
        public final int itemCount;
        public final double subtotal;
        public final List<OrderHistoryItem> items;

        public OrderHistoryEntry(
                String id,
                String createdAt,
                String source,
                String checkoutUrl,
                int itemCount,
                double subtotal,
                List<OrderHistoryItem> items
        ) {
            this.id = id;
            this.createdAt = createdAt;
            this.source = source;
            this.checkoutUrl = checkoutUrl;
            this.itemCount = itemCount;
            this.subtotal = subtotal;
            this.items = items;
        }
    }

    private static final String PREFS_NAME = "salt_store_history";
    private static final String KEY_RECENTLY_VIEWED = "salt-recently-viewed-handles";
    private static final String KEY_ORDER_HISTORY = "salt-order-history-v1";
    private static final int RECENTLY_VIEWED_LIMIT = 12;
    private static final int ORDER_HISTORY_LIMIT = 120;
    private static StoreHistoryStore INSTANCE;

    private final SharedPreferences preferences;

    private StoreHistoryStore(Context context) {
        this.preferences = context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public static synchronized StoreHistoryStore getInstance(Context context) {
        if (INSTANCE == null) {
            INSTANCE = new StoreHistoryStore(context);
        }
        return INSTANCE;
    }

    public synchronized List<String> readRecentlyViewedHandles() {
        String raw = preferences.getString(KEY_RECENTLY_VIEWED, "[]");
        Set<String> handles = new LinkedHashSet<>();

        try {
            JSONArray array = new JSONArray(raw);
            for (int index = 0; index < array.length(); index++) {
                String handle = normalizeHandle(array.optString(index, ""));
                if (!handle.isEmpty()) {
                    handles.add(handle);
                }
            }
        } catch (Exception ignore) {
            preferences.edit().putString(KEY_RECENTLY_VIEWED, "[]").apply();
        }

        return new ArrayList<>(handles);
    }

    public synchronized void rememberRecentlyViewed(String handle) {
        String normalized = normalizeHandle(handle);
        if (normalized.isEmpty()) {
            return;
        }

        List<String> current = readRecentlyViewedHandles();
        current.remove(normalized);
        current.add(0, normalized);
        if (current.size() > RECENTLY_VIEWED_LIMIT) {
            current = current.subList(0, RECENTLY_VIEWED_LIMIT);
        }
        persistRecentlyViewed(current);
    }

    public synchronized void clearRecentlyViewed() {
        preferences.edit().putString(KEY_RECENTLY_VIEWED, "[]").apply();
    }

    public synchronized List<OrderHistoryEntry> readOrderHistory() {
        String raw = preferences.getString(KEY_ORDER_HISTORY, "[]");
        List<OrderHistoryEntry> entries = new ArrayList<>();

        try {
            JSONArray array = new JSONArray(raw);
            for (int index = 0; index < array.length(); index++) {
                JSONObject object = array.optJSONObject(index);
                if (object == null) {
                    continue;
                }

                String id = object.optString("id", "");
                String createdAt = object.optString("createdAt", "");
                String source = object.optString("source", "cart");
                String checkoutUrl = object.optString("checkoutUrl", "");
                JSONArray itemsArray = object.optJSONArray("items");
                List<OrderHistoryItem> items = new ArrayList<>();
                if (itemsArray != null) {
                    for (int itemIndex = 0; itemIndex < itemsArray.length(); itemIndex++) {
                        JSONObject itemObject = itemsArray.optJSONObject(itemIndex);
                        if (itemObject == null) {
                            continue;
                        }
                        items.add(new OrderHistoryItem(
                                itemObject.optLong("id"),
                                itemObject.optString("handle", ""),
                                itemObject.optString("title", ""),
                                itemObject.optString("image", ""),
                                itemObject.optDouble("unitPrice", 0d),
                                Math.max(1, itemObject.optInt("quantity", 1)),
                                itemObject.optLong("shopifyVariantId"),
                                itemObject.optString("variantTitle", "")
                        ));
                    }
                }

                int itemCount = object.optInt("itemCount", 0);
                if (itemCount <= 0) {
                    for (OrderHistoryItem item : items) {
                        itemCount += item.quantity;
                    }
                }

                double subtotal = object.optDouble("subtotal", 0d);
                if (subtotal <= 0d) {
                    for (OrderHistoryItem item : items) {
                        subtotal += item.unitPrice * item.quantity;
                    }
                }

                entries.add(new OrderHistoryEntry(
                        id,
                        createdAt,
                        source,
                        checkoutUrl,
                        itemCount,
                        subtotal,
                        items
                ));
            }
        } catch (Exception ignore) {
            preferences.edit().putString(KEY_ORDER_HISTORY, "[]").apply();
        }

        entries.sort((left, right) -> right.createdAt.compareTo(left.createdAt));
        if (entries.size() > ORDER_HISTORY_LIMIT) {
            return new ArrayList<>(entries.subList(0, ORDER_HISTORY_LIMIT));
        }
        return entries;
    }

    public synchronized OrderHistoryEntry recordCheckout(
            String source,
            String checkoutUrl,
            List<StoreCartEntry> cartEntries,
            StoreCatalog catalog
    ) {
        List<OrderHistoryItem> items = new ArrayList<>();
        if (cartEntries != null && catalog != null) {
            for (StoreCartEntry entry : cartEntries) {
                StoreProduct product = catalog.findProductById(entry.productId);
                if (product == null) {
                    continue;
                }

                StoreVariant variant = null;
                for (StoreVariant candidate : product.variants) {
                    if (candidate.id == entry.variantId) {
                        variant = candidate;
                        break;
                    }
                }
                if (variant == null) {
                    variant = product.defaultVariant();
                }
                if (variant == null) {
                    continue;
                }

                items.add(new OrderHistoryItem(
                        product.id,
                        product.handle,
                        product.title,
                        product.primaryImageUrl() == null ? "" : product.primaryImageUrl(),
                        StoreFormat.parseDouble(variant.price),
                        Math.max(1, entry.quantity),
                        variant.id,
                        variant.title
                ));
            }
        }

        if (items.isEmpty()) {
            return null;
        }

        String now = String.valueOf(System.currentTimeMillis());
        double subtotal = 0d;
        int itemCount = 0;
        for (OrderHistoryItem item : items) {
            subtotal += item.unitPrice * item.quantity;
            itemCount += item.quantity;
        }

        OrderHistoryEntry next = new OrderHistoryEntry(
                now + "-" + Long.toHexString(System.nanoTime()),
                now,
                String.valueOf(source == null || source.trim().isEmpty() ? "cart" : source.trim()),
                String.valueOf(checkoutUrl == null ? "" : checkoutUrl).trim(),
                itemCount,
                subtotal,
                items
        );

        List<OrderHistoryEntry> current = readOrderHistory();
        current.add(0, next);
        persistOrderHistory(current);
        return next;
    }

    public synchronized void clearOrderHistory() {
        preferences.edit().putString(KEY_ORDER_HISTORY, "[]").apply();
    }

    public synchronized void removeOrderHistoryEntry(String entryId) {
        String targetId = String.valueOf(entryId == null ? "" : entryId).trim();
        if (targetId.isEmpty()) {
            return;
        }

        List<OrderHistoryEntry> current = readOrderHistory();
        List<OrderHistoryEntry> filtered = new ArrayList<>();
        for (OrderHistoryEntry entry : current) {
            if (!targetId.equals(entry.id)) {
                filtered.add(entry);
            }
        }
        persistOrderHistory(filtered);
    }

    public synchronized List<StoreProduct> resolveRecentlyViewedProducts(StoreCatalog catalog) {
        if (catalog == null) {
            return new ArrayList<>();
        }

        Map<String, StoreProduct> byHandle = new LinkedHashMap<>();
        for (StoreProduct product : catalog.products) {
            byHandle.put(normalizeHandle(product.handle), product);
        }

        List<StoreProduct> items = new ArrayList<>();
        for (String handle : readRecentlyViewedHandles()) {
            StoreProduct product = byHandle.get(normalizeHandle(handle));
            if (product != null && !items.contains(product)) {
                items.add(product);
            }
        }
        return items;
    }

    private void persistRecentlyViewed(List<String> handles) {
        JSONArray array = new JSONArray();
        for (String handle : handles) {
            array.put(handle);
        }
        preferences.edit().putString(KEY_RECENTLY_VIEWED, array.toString()).apply();
    }

    private void persistOrderHistory(List<OrderHistoryEntry> entries) {
        JSONArray array = new JSONArray();
        List<OrderHistoryEntry> normalized = entries == null ? new ArrayList<>() : entries;
        if (normalized.size() > ORDER_HISTORY_LIMIT) {
            normalized = new ArrayList<>(normalized.subList(0, ORDER_HISTORY_LIMIT));
        }

        for (OrderHistoryEntry entry : normalized) {
            JSONObject object = new JSONObject();
            JSONArray items = new JSONArray();
            try {
                object.put("id", entry.id);
                object.put("createdAt", entry.createdAt);
                object.put("source", entry.source);
                object.put("checkoutUrl", entry.checkoutUrl);
                object.put("itemCount", entry.itemCount);
                object.put("subtotal", entry.subtotal);

                for (OrderHistoryItem item : entry.items) {
                    JSONObject itemObject = new JSONObject();
                    itemObject.put("id", item.id);
                    itemObject.put("handle", item.handle);
                    itemObject.put("title", item.title);
                    itemObject.put("image", item.image);
                    itemObject.put("unitPrice", item.unitPrice);
                    itemObject.put("quantity", item.quantity);
                    itemObject.put("shopifyVariantId", item.shopifyVariantId);
                    itemObject.put("variantTitle", item.variantTitle);
                    items.put(itemObject);
                }
                object.put("items", items);
                array.put(object);
            } catch (Exception error) {
                throw new IllegalStateException("Unable to persist order history", error);
            }
        }

        preferences.edit().putString(KEY_ORDER_HISTORY, array.toString()).apply();
    }

    private String normalizeHandle(String handle) {
        return String.valueOf(handle == null ? "" : handle).trim().toLowerCase();
    }
}
