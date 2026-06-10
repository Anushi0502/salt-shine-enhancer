package com.saltonlinestore.saltstoreandroid.ui.home;

import com.saltonlinestore.saltstoreandroid.model.StoreCollection;
import com.saltonlinestore.saltstoreandroid.model.StoreProduct;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class HomeFeedSection {
    public enum Type {
        HEADER,
        BANNER_CAROUSEL,
        COLLECTION_RAIL,
        RECENTLY_VIEWED
    }

    public static final class BannerItem {
        public final String title;
        public final String subtitle;
        public final String ctaLabel;
        public final String imageUrl;
        public final String collectionHandle;
        public final String collectionTitle;

        public BannerItem(
                String title,
                String subtitle,
                String ctaLabel,
                String imageUrl,
                String collectionHandle,
                String collectionTitle
        ) {
            this.title = title;
            this.subtitle = subtitle;
            this.ctaLabel = ctaLabel;
            this.imageUrl = imageUrl;
            this.collectionHandle = collectionHandle;
            this.collectionTitle = collectionTitle;
        }
    }

    public final Type type;
    public final String title;
    public final String subtitle;
    public final int productCount;
    public final int collectionCount;
    public final int cartCount;
    public final StoreCollection collection;
    public final List<StoreProduct> products;
    public final List<BannerItem> banners;
    public final boolean needsLiveFallback;

    private HomeFeedSection(
            Type type,
            String title,
            String subtitle,
            int productCount,
            int collectionCount,
            int cartCount,
            StoreCollection collection,
            List<StoreProduct> products,
            List<BannerItem> banners,
            boolean needsLiveFallback
    ) {
        this.type = type;
        this.title = title;
        this.subtitle = subtitle;
        this.productCount = productCount;
        this.collectionCount = collectionCount;
        this.cartCount = cartCount;
        this.collection = collection;
        this.products = products == null ? Collections.emptyList() : Collections.unmodifiableList(new ArrayList<>(products));
        this.banners = banners == null ? Collections.emptyList() : Collections.unmodifiableList(new ArrayList<>(banners));
        this.needsLiveFallback = needsLiveFallback;
    }

    public static HomeFeedSection header(String title, String subtitle, int productCount, int collectionCount, int cartCount) {
        return new HomeFeedSection(Type.HEADER, title, subtitle, productCount, collectionCount, cartCount, null, null, null, false);
    }

    public static HomeFeedSection bannerCarousel(String title, String subtitle, List<BannerItem> banners) {
        return new HomeFeedSection(Type.BANNER_CAROUSEL, title, subtitle, 0, 0, 0, null, null, banners, false);
    }

    public static HomeFeedSection collectionRail(
            StoreCollection collection,
            String title,
            String subtitle,
            List<StoreProduct> products,
            boolean needsLiveFallback
    ) {
        return new HomeFeedSection(Type.COLLECTION_RAIL, title, subtitle, 0, 0, 0, collection, products, null, needsLiveFallback);
    }

    public static HomeFeedSection recentlyViewed(String title, String subtitle, List<StoreProduct> products) {
        return new HomeFeedSection(Type.RECENTLY_VIEWED, title, subtitle, 0, 0, 0, null, products, null, false);
    }

    public HomeFeedSection withProducts(List<StoreProduct> nextProducts, boolean nextNeedsLiveFallback) {
        if (type != Type.COLLECTION_RAIL) {
            return this;
        }
        return new HomeFeedSection(type, title, subtitle, productCount, collectionCount, cartCount, collection, nextProducts, null, nextNeedsLiveFallback);
    }
}
