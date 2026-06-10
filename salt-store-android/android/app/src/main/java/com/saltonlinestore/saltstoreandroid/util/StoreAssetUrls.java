package com.saltonlinestore.saltstoreandroid.util;

public final class StoreAssetUrls {
    private static final String ASSET_BASE = "file:///android_asset/public/assets/";

    private StoreAssetUrls() {}

    public static String asset(String fileName) {
        if (fileName == null) {
            return "";
        }

        String trimmed = fileName.trim();
        if (trimmed.isEmpty()) {
            return "";
        }

        return ASSET_BASE + trimmed;
    }
}
