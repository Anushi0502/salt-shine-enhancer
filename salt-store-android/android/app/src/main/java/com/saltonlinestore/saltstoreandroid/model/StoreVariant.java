package com.saltonlinestore.saltstoreandroid.model;

public class StoreVariant {
    public final long id;
    public final String title;
    public final String price;
    public final String compareAtPrice;
    public final boolean available;
    public final String sku;

    public StoreVariant(long id, String title, String price, String compareAtPrice, boolean available, String sku) {
        this.id = id;
        this.title = title;
        this.price = price;
        this.compareAtPrice = compareAtPrice;
        this.available = available;
        this.sku = sku;
    }
}
