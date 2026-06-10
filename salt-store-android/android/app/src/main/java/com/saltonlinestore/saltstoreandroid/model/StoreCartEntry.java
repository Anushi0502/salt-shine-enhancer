package com.saltonlinestore.saltstoreandroid.model;

public class StoreCartEntry {
    public final long productId;
    public final long variantId;
    public final int quantity;

    public StoreCartEntry(long productId, long variantId, int quantity) {
        this.productId = productId;
        this.variantId = variantId;
        this.quantity = quantity;
    }

    public StoreCartEntry withQuantity(int quantity) {
        return new StoreCartEntry(productId, variantId, quantity);
    }
}
