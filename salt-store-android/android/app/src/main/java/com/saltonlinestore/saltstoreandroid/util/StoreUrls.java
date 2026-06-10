package com.saltonlinestore.saltstoreandroid.util;

import com.saltonlinestore.saltstoreandroid.BuildConfig;
import com.saltonlinestore.saltstoreandroid.model.StoreCartEntry;

import java.util.List;

public final class StoreUrls {
    private static final String SHOPIFY_CHECKOUT_QUERY = "checkout&_fd=0&pb=0";

    private StoreUrls() {}

    public static String brandedBase() {
        return BuildConfig.SHOP_BRANDED_URL;
    }

    public static String shopBase() {
        return BuildConfig.SHOP_BASE_URL;
    }

    public static String productUrl(String handle) {
        return ensureBase(brandedBase()) + "/products/" + handle;
    }

    public static String collectionUrl(String handle) {
        return ensureBase(brandedBase()) + "/collections/" + handle;
    }

    public static String cartUrl(List<StoreCartEntry> entries) {
        StringBuilder builder = new StringBuilder();
        builder.append(ensureBase(shopBase())).append("/cart");
        if (entries != null && !entries.isEmpty()) {
            builder.append("/");
            for (int index = 0; index < entries.size(); index++) {
                StoreCartEntry entry = entries.get(index);
                if (index > 0) {
                    builder.append(",");
                }
                builder.append(entry.variantId).append(":").append(Math.max(1, entry.quantity));
            }
        }
        return builder.toString();
    }

    public static String cartUrl(StoreCartEntry entry) {
        return cartUrl(java.util.Collections.singletonList(entry));
    }

    public static String checkoutUrl(List<StoreCartEntry> entries) {
        StringBuilder builder = new StringBuilder();
        builder.append(ensureBase(shopBase())).append("/cart");
        if (entries != null && !entries.isEmpty()) {
            builder.append("/");
            for (int index = 0; index < entries.size(); index++) {
                StoreCartEntry entry = entries.get(index);
                if (index > 0) {
                    builder.append(",");
                }
                builder.append(entry.variantId).append(":").append(Math.max(1, entry.quantity));
            }
        }
        builder.append("?").append(SHOPIFY_CHECKOUT_QUERY);
        return builder.toString();
    }

    public static String checkoutUrl(StoreCartEntry entry) {
        return checkoutUrl(java.util.Collections.singletonList(entry));
    }

    public static String homeUrl() {
        return ensureBase(brandedBase());
    }

    public static String shippingPolicyUrl() {
        return homeUrl() + "/policies/shipping-policy";
    }

    public static String refundPolicyUrl() {
        return homeUrl() + "/policies/refund-policy";
    }

    public static String privacyPolicyUrl() {
        return homeUrl() + "/policies/privacy-policy";
    }

    public static String contactInformationUrl() {
        return homeUrl() + "/policies/contact-information";
    }

    public static String faqUrl() {
        return homeUrl() + "/pages/faqs";
    }

    private static String ensureBase(String base) {
        if (base == null || base.trim().isEmpty()) {
            return "https://www.saltonlinestore.com";
        }
        return base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
    }
}
