package com.saltonlinestore.saltstoreandroid.model;

public class StoreCollection {
    public final long id;
    public final String title;
    public final String handle;
    public final String description;
    public final String imageUrl;
    public final int productsCount;

    public StoreCollection(long id, String title, String handle, String description, String imageUrl, int productsCount) {
        this.id = id;
        this.title = title;
        this.handle = handle;
        this.description = description;
        this.imageUrl = imageUrl;
        this.productsCount = productsCount;
    }
}
