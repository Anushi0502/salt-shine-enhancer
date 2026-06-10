package com.saltonlinestore.saltstoreandroid.data;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class CollectionMerchandisingMap {
    public static final class Entry {
        public final String handle;
        public final String title;
        public final List<Long> productIds;

        public Entry(String handle, String title, List<Long> productIds) {
            this.handle = handle;
            this.title = title;
            this.productIds = productIds == null ? Collections.emptyList() : Collections.unmodifiableList(new ArrayList<>(productIds));
        }
    }

    private static final CollectionMerchandisingMap EMPTY = new CollectionMerchandisingMap(Collections.emptyMap());

    private final Map<String, Entry> entries;

    private CollectionMerchandisingMap(Map<String, Entry> entries) {
        this.entries = Collections.unmodifiableMap(new LinkedHashMap<>(entries));
    }

    public static CollectionMerchandisingMap empty() {
        return EMPTY;
    }

    public static CollectionMerchandisingMap fromJson(String rawJson) {
        if (rawJson == null || rawJson.trim().isEmpty()) {
            return empty();
        }

        try {
            JSONObject root = new JSONObject(rawJson);
            JSONObject collections = root.optJSONObject("collections");
            if (collections == null) {
                return empty();
            }

            Map<String, Entry> parsed = new LinkedHashMap<>();
            Set<String> handles = new LinkedHashSet<>();
            JSONArray keys = collections.names();
            if (keys != null) {
                for (int index = 0; index < keys.length(); index++) {
                    String handle = keys.optString(index, "").trim();
                    if (handle.isEmpty() || !handles.add(handle)) {
                        continue;
                    }

                    JSONObject object = collections.optJSONObject(handle);
                    if (object == null) {
                        continue;
                    }

                    String title = object.optString("title", handle).trim();
                    List<Long> productIds = new ArrayList<>();
                    JSONArray idsArray = object.optJSONArray("productIds");
                    if (idsArray != null) {
                        for (int idIndex = 0; idIndex < idsArray.length(); idIndex++) {
                            long productId = idsArray.optLong(idIndex, 0L);
                            if (productId <= 0L) {
                                String rawId = idsArray.optString(idIndex, "").trim();
                                try {
                                    productId = Long.parseLong(rawId);
                                } catch (Exception ignore) {
                                    productId = 0L;
                                }
                            }
                            if (productId > 0L && !productIds.contains(productId)) {
                                productIds.add(productId);
                            }
                        }
                    }

                    parsed.put(handle.toLowerCase(), new Entry(handle, title.isEmpty() ? handle : title, productIds));
                }
            }

            return parsed.isEmpty() ? empty() : new CollectionMerchandisingMap(parsed);
        } catch (Exception ignore) {
            return empty();
        }
    }

    public Entry find(String handle) {
        if (handle == null) {
            return null;
        }

        return entries.get(handle.trim().toLowerCase());
    }

    public List<Entry> orderedEntries() {
        return new ArrayList<>(entries.values());
    }

    public boolean isEmpty() {
        return entries.isEmpty();
    }
}
