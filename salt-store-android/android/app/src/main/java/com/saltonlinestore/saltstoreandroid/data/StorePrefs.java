package com.saltonlinestore.saltstoreandroid.data;

import android.content.Context;
import android.content.SharedPreferences;

import com.saltonlinestore.saltstoreandroid.model.StoreCartEntry;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class StorePrefs {
    private static final String PREFS_NAME = "salt_store_preferences";
    private static final String KEY_CART = "cart_entries";
    private static final String KEY_WISHLIST = "wishlist_ids";
    private static StorePrefs INSTANCE;

    private final SharedPreferences preferences;

    private StorePrefs(Context context) {
        this.preferences = context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public static synchronized StorePrefs getInstance(Context context) {
        if (INSTANCE == null) {
            INSTANCE = new StorePrefs(context);
        }
        return INSTANCE;
    }

    public synchronized List<StoreCartEntry> getCartEntries() {
        String raw = preferences.getString(KEY_CART, "[]");
        Map<Long, StoreCartEntry> entries = new LinkedHashMap<>();

        try {
            JSONArray array = new JSONArray(raw);
            for (int index = 0; index < array.length(); index++) {
                JSONObject object = array.optJSONObject(index);
                if (object == null) {
                    continue;
                }
                long productId = object.optLong("productId");
                long variantId = object.optLong("variantId");
                int quantity = Math.max(1, object.optInt("quantity", 1));
                if (productId > 0 && variantId > 0) {
                    entries.put(variantId, new StoreCartEntry(productId, variantId, quantity));
                }
            }
        } catch (Exception ignore) {
            // Reset corrupt cart data to keep the app usable.
            preferences.edit().putString(KEY_CART, "[]").apply();
        }

        return new ArrayList<>(entries.values());
    }

    public synchronized void setCartEntry(StoreCartEntry entry) {
        List<StoreCartEntry> current = getCartEntries();
        boolean replaced = false;
        for (int index = 0; index < current.size(); index++) {
            StoreCartEntry existing = current.get(index);
            if (existing.variantId == entry.variantId) {
                current.set(index, entry);
                replaced = true;
                break;
            }
        }
        if (!replaced) {
            current.add(entry);
        }
        persistCart(current);
    }

    public synchronized void incrementCartQuantity(long productId, long variantId, int delta) {
        List<StoreCartEntry> current = getCartEntries();
        boolean found = false;
        for (int index = 0; index < current.size(); index++) {
            StoreCartEntry existing = current.get(index);
            if (existing.variantId == variantId) {
                int nextQuantity = Math.max(1, existing.quantity + delta);
                current.set(index, new StoreCartEntry(productId, variantId, nextQuantity));
                found = true;
                break;
            }
        }

        if (!found) {
            current.add(new StoreCartEntry(productId, variantId, Math.max(1, delta)));
        }

        persistCart(current);
    }

    public synchronized void removeCartEntry(long productId) {
        removeCartEntryByVariantId(productId);
    }

    public synchronized void removeCartEntryByVariantId(long variantId) {
        List<StoreCartEntry> current = getCartEntries();
        current.removeIf(entry -> entry.variantId == variantId);
        persistCart(current);
    }

    public synchronized void clearCart() {
        preferences.edit().putString(KEY_CART, "[]").apply();
    }

    public synchronized int cartItemCount() {
        int total = 0;
        for (StoreCartEntry entry : getCartEntries()) {
            total += Math.max(1, entry.quantity);
        }
        return total;
    }

    public synchronized Set<Long> getWishlistIds() {
        String raw = preferences.getString(KEY_WISHLIST, "[]");
        Set<Long> ids = new LinkedHashSet<>();

        try {
            JSONArray array = new JSONArray(raw);
            for (int index = 0; index < array.length(); index++) {
                long id = array.optLong(index, 0L);
                if (id > 0) {
                    ids.add(id);
                }
            }
        } catch (Exception ignore) {
            preferences.edit().putString(KEY_WISHLIST, "[]").apply();
        }

        return ids;
    }

    public synchronized void toggleWishlist(long productId) {
        Set<Long> ids = getWishlistIds();
        if (ids.contains(productId)) {
            ids.remove(productId);
        } else if (productId > 0) {
            ids.add(productId);
        }
        persistWishlist(ids);
    }

    public synchronized boolean isWishlisted(long productId) {
        return getWishlistIds().contains(productId);
    }

    private void persistCart(List<StoreCartEntry> entries) {
        JSONArray array = new JSONArray();
        try {
            for (StoreCartEntry entry : entries) {
                JSONObject object = new JSONObject();
                object.putOpt("productId", entry.productId);
                object.putOpt("variantId", entry.variantId);
                object.putOpt("quantity", Math.max(1, entry.quantity));
                array.put(object);
            }
        } catch (Exception error) {
            throw new IllegalStateException("Unable to persist cart state", error);
        }
        preferences.edit().putString(KEY_CART, array.toString()).apply();
    }

    private void persistWishlist(Set<Long> ids) {
        JSONArray array = new JSONArray();
        for (Long id : ids) {
            array.put(id);
        }
        preferences.edit().putString(KEY_WISHLIST, array.toString()).apply();
    }
}
