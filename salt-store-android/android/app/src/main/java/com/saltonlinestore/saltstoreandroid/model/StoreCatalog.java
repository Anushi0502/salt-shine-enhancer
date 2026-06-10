package com.saltonlinestore.saltstoreandroid.model;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class StoreCatalog {
    public final List<StoreProduct> products;
    public final List<StoreCollection> collections;

    public StoreCatalog(List<StoreProduct> products, List<StoreCollection> collections) {
        this.products = products == null ? Collections.emptyList() : Collections.unmodifiableList(new ArrayList<>(products));
        this.collections = collections == null ? Collections.emptyList() : Collections.unmodifiableList(new ArrayList<>(collections));
    }

    public StoreProduct findProductByHandle(String handle) {
        if (handle == null) {
            return null;
        }
        String normalized = handle.trim().toLowerCase();
        for (StoreProduct product : products) {
            if (product.handle != null && product.handle.trim().toLowerCase().equals(normalized)) {
                return product;
            }
        }
        return null;
    }

    public StoreProduct findProductById(long id) {
        for (StoreProduct product : products) {
            if (product.id == id) {
                return product;
            }
        }
        return null;
    }

    public StoreCollection findCollectionByHandle(String handle) {
        if (handle == null) {
            return null;
        }
        String normalized = handle.trim().toLowerCase();
        for (StoreCollection collection : collections) {
            if (collection.handle != null && collection.handle.trim().toLowerCase().equals(normalized)) {
                return collection;
            }
        }
        return null;
    }
}
