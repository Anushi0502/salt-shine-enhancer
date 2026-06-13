package com.saltonlinestore.saltstoreandroid.ui.home;

import com.saltonlinestore.saltstoreandroid.data.CollectionMerchandisingMap;
import com.saltonlinestore.saltstoreandroid.model.StoreCatalog;
import com.saltonlinestore.saltstoreandroid.model.StoreCollection;
import com.saltonlinestore.saltstoreandroid.model.StoreProduct;
import com.saltonlinestore.saltstoreandroid.util.StoreAssetUrls;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

public final class HomeFeedComposer {
    private static final int HOME_RAIL_LIMIT = 20;
    private static final List<String> PRIORITY_COLLECTION_HANDLES = Arrays.asList(
            "appplaza-best-sellers",
            "gifts",
            "books",
            "new-arrivals"
    );

    public List<HomeFeedSection> compose(
            StoreCatalog catalog,
            CollectionMerchandisingMap merchandisingMap,
            List<StoreProduct> recentlyViewedProducts
    ) {
        List<HomeFeedSection> sections = new ArrayList<>();
        if (catalog == null) {
            return sections;
        }

        Map<String, StoreCollection> collectionsByHandle = new LinkedHashMap<>();
        for (StoreCollection collection : catalog.collections) {
            if (collection == null || isAllProductsCollection(collection)) {
                continue;
            }
            collectionsByHandle.put(normalize(collection.handle), collection);
        }

        List<StoreCollection> orderedCollections = new ArrayList<>();
        Set<String> seenHandles = new LinkedHashSet<>();

        for (String handle : PRIORITY_COLLECTION_HANDLES) {
            StoreCollection collection = collectionsByHandle.remove(normalize(handle));
            if (collection != null && seenHandles.add(normalize(collection.handle))) {
                orderedCollections.add(collection);
            }
        }

        List<StoreCollection> remaining = new ArrayList<>(collectionsByHandle.values());
        remaining.sort((left, right) -> {
            if (right.productsCount != left.productsCount) {
                return Integer.compare(right.productsCount, left.productsCount);
            }
            return left.title.compareToIgnoreCase(right.title);
        });

        for (StoreCollection collection : remaining) {
            if (collection != null && seenHandles.add(normalize(collection.handle))) {
                orderedCollections.add(collection);
            }
        }

        Map<Long, StoreProduct> productsById = new LinkedHashMap<>();
        for (StoreProduct product : catalog.products) {
            productsById.put(product.id, product);
        }

        boolean insertedRecentlyViewed = false;
        int railCount = 0;

        for (StoreCollection collection : orderedCollections) {
            CollectionMerchandisingMap.Entry entry = merchandisingMap == null ? null : merchandisingMap.find(collection.handle);
            RailResolution resolution = resolveProducts(collection, entry, catalog, productsById);
            sections.add(HomeFeedSection.collectionRail(
                    collection,
                    displayCollectionTitle(collection, entry),
                    "20 picks · swipe to browse",
                    resolution.products,
                    resolution.needsLiveFallback
            ));
            railCount += 1;

            if (!insertedRecentlyViewed && recentlyViewedProducts != null && !recentlyViewedProducts.isEmpty() && railCount >= 4) {
                sections.add(HomeFeedSection.recentlyViewed(
                        "Recently viewed",
                        "Opened on this device",
                        recentlyViewedProducts
                ));
                insertedRecentlyViewed = true;
            }
        }

        if (!insertedRecentlyViewed && recentlyViewedProducts != null && !recentlyViewedProducts.isEmpty()) {
            sections.add(HomeFeedSection.recentlyViewed(
                    "Recently viewed",
                    "Opened on this device",
                    recentlyViewedProducts
            ));
        }

        return sections;
    }

    public List<HomeFeedSection.BannerItem> buildHeroBanners(StoreCatalog catalog, CollectionMerchandisingMap merchandisingMap) {
        List<HomeFeedSection.BannerItem> banners = new ArrayList<>();
        addBannerIfPresent(banners, catalog, merchandisingMap, "appplaza-best-sellers", "Best sellers", "Top live picks", "Open collection", StoreAssetUrls.asset("hero-main-cHr_mQvK.jpg"));
        addBannerIfPresent(banners, catalog, merchandisingMap, "gifts", "Gifts", "Quick picks for every occasion", "Shop gifts", StoreAssetUrls.asset("collection-decor-UEpuVY-r.jpg"));
        addBannerIfPresent(banners, catalog, merchandisingMap, "books", "Books", "Giftable reads and keepsakes", "Browse books", StoreAssetUrls.asset("product-dock-ByKVDiQU.jpg"));
        addBannerIfPresent(banners, catalog, merchandisingMap, "new-arrivals", "New arrivals", "Fresh live drops from the catalog", "See what's new", StoreAssetUrls.asset("collection-apparel-BjfxkP5S.jpg"));
        return banners;
    }

    private void addBannerIfPresent(
            List<HomeFeedSection.BannerItem> banners,
            StoreCatalog catalog,
            CollectionMerchandisingMap merchandisingMap,
            String handle,
            String fallbackTitle,
            String subtitle,
            String ctaLabel,
            String imageUrl
    ) {
        StoreCollection collection = catalog.findCollectionByHandle(handle);
        if (collection == null) {
            return;
        }

        CollectionMerchandisingMap.Entry entry = merchandisingMap == null ? null : merchandisingMap.find(handle);
        String title = displayCollectionTitle(collection, entry);
        banners.add(new HomeFeedSection.BannerItem(title, subtitle, ctaLabel, imageUrl, collection.handle, title));
    }

    private RailResolution resolveProducts(
            StoreCollection collection,
            CollectionMerchandisingMap.Entry entry,
            StoreCatalog catalog,
            Map<Long, StoreProduct> productsById
    ) {
        List<StoreProduct> resolved = new ArrayList<>();
        Set<Long> seenIds = new LinkedHashSet<>();
        boolean needsLiveFallback = entry == null || entry.productIds.size() < HOME_RAIL_LIMIT;

        if (entry != null) {
            for (Long productId : entry.productIds) {
                if (productId == null || productId <= 0L || seenIds.contains(productId)) {
                    continue;
                }
                StoreProduct product = productsById.get(productId);
                if (product != null) {
                    resolved.add(product);
                    seenIds.add(productId);
                }
                if (resolved.size() >= HOME_RAIL_LIMIT) {
                    break;
                }
            }
        }

        if (resolved.size() < HOME_RAIL_LIMIT) {
            String normalizedCollection = normalize(collection.title + " " + collection.handle + " " + collection.description);
            List<StoreProduct> matched = new ArrayList<>();
            for (StoreProduct product : catalog.products) {
                if (product == null || seenIds.contains(product.id)) {
                    continue;
                }

                String haystack = normalize(product.title + " " + product.vendor + " " + product.productType + " " + String.join(" ", product.tags));
                if (!normalizedCollection.isEmpty() && matchesAnyToken(normalizedCollection, haystack)) {
                    matched.add(product);
                }
            }

            for (StoreProduct product : matched) {
                if (resolved.size() >= HOME_RAIL_LIMIT) {
                    break;
                }
                resolved.add(product);
                seenIds.add(product.id);
            }
        }

        if (resolved.size() < HOME_RAIL_LIMIT) {
            for (StoreProduct product : catalog.products) {
                if (product == null || seenIds.contains(product.id)) {
                    continue;
                }
                resolved.add(product);
                seenIds.add(product.id);
                if (resolved.size() >= HOME_RAIL_LIMIT) {
                    break;
                }
            }
        }

        return new RailResolution(resolved, needsLiveFallback || resolved.size() < HOME_RAIL_LIMIT);
    }

    private boolean matchesAnyToken(String normalizedCollection, String normalizedProduct) {
        String[] tokens = normalizedCollection.split(" ");
        for (String token : tokens) {
            if (token.trim().isEmpty()) {
                continue;
            }
            if (normalizedProduct.contains(token.trim())) {
                return true;
            }
        }
        return false;
    }

    private String displayCollectionTitle(StoreCollection collection, CollectionMerchandisingMap.Entry entry) {
        if (collection != null && collection.title != null && !collection.title.trim().isEmpty()) {
            return collection.title.trim();
        }
        if (entry != null && entry.title != null && !entry.title.trim().isEmpty()) {
            return entry.title.trim();
        }
        return "Collection";
    }

    private boolean isAllProductsCollection(StoreCollection collection) {
        String handle = normalize(collection.handle).replace(' ', '-');
        String title = normalize(collection.title);
        return "all-products".equals(handle) || "all products".equals(title);
    }

    private String normalize(String value) {
        return String.valueOf(value == null ? "" : value).trim().toLowerCase(Locale.US);
    }

    private static final class RailResolution {
        private final List<StoreProduct> products;
        private final boolean needsLiveFallback;

        private RailResolution(List<StoreProduct> products, boolean needsLiveFallback) {
            this.products = products;
            this.needsLiveFallback = needsLiveFallback;
        }
    }
}
