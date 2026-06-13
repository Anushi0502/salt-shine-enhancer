package com.saltonlinestore.saltstoreandroid.ui.home;

import com.saltonlinestore.saltstoreandroid.data.CollectionMerchandisingMap;
import com.saltonlinestore.saltstoreandroid.model.StoreCatalog;
import com.saltonlinestore.saltstoreandroid.model.StoreCollection;
import com.saltonlinestore.saltstoreandroid.model.StoreProduct;
import com.saltonlinestore.saltstoreandroid.model.StoreVariant;

import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class HomeFeedComposerTest {
    @Test
    public void compose_ordersPriorityRailsAndCapsEachRailAtTwentyProducts() {
        StoreCatalog catalog = new StoreCatalog(sampleProducts(), sampleCollections());
        CollectionMerchandisingMap merchMap = CollectionMerchandisingMap.fromJson(sampleMerchandisingJson());

        HomeFeedComposer composer = new HomeFeedComposer();
        List<HomeFeedSection> sections = composer.compose(catalog, merchMap, sampleRecentlyViewed());

        assertEquals("appplaza-best-sellers", sections.get(0).collection.handle);
        assertEquals("gifts", sections.get(1).collection.handle);
        assertEquals("books", sections.get(2).collection.handle);
        assertEquals("new-arrivals", sections.get(3).collection.handle);
        assertEquals(HomeFeedSection.Type.RECENTLY_VIEWED, sections.get(4).type);
        assertEquals("home-decor", sections.get(5).collection.handle);
        assertEquals("seasonal-picks", sections.get(6).collection.handle);

        for (HomeFeedSection section : sections) {
            if (section.type != HomeFeedSection.Type.COLLECTION_RAIL && section.type != HomeFeedSection.Type.RECENTLY_VIEWED) {
                continue;
            }
            assertTrue(section.products.size() <= 20);
        }
    }

    @Test
    public void compose_marksSparseAndMissingRailsForFallback() {
        StoreCatalog catalog = new StoreCatalog(sampleProducts(), sampleCollections());
        CollectionMerchandisingMap merchMap = CollectionMerchandisingMap.fromJson(sampleMerchandisingJson());

        HomeFeedComposer composer = new HomeFeedComposer();
        List<HomeFeedSection> sections = composer.compose(catalog, merchMap, new ArrayList<>());

        HomeFeedSection sparseRail = findRail(sections, "gifts");
        assertTrue(sparseRail.needsLiveFallback);
        assertEquals(16, sparseRail.products.size());

        HomeFeedSection missingRail = findRail(sections, "home-decor");
        assertTrue(missingRail.needsLiveFallback);
        assertEquals(16, missingRail.products.size());
    }

    private HomeFeedSection findRail(List<HomeFeedSection> sections, String handle) {
        for (HomeFeedSection section : sections) {
            if (section.type == HomeFeedSection.Type.COLLECTION_RAIL && section.collection != null && handle.equals(section.collection.handle)) {
                return section;
            }
        }
        throw new AssertionError("Missing rail: " + handle);
    }

    private List<StoreProduct> sampleProducts() {
        List<StoreProduct> products = new ArrayList<>();
        for (long id = 101; id <= 116; id++) {
            products.add(new StoreProduct(
                    id,
                    "Product " + id,
                    "product-" + id,
                    "<p>Product " + id + "</p>",
                    id % 2 == 0 ? "SALT" : "Vendor " + id,
                    id % 3 == 0 ? "Books" : "Gifts",
                    Arrays.asList("live", "featured"),
                    new ArrayList<>(),
                    Arrays.asList(new StoreVariant(id * 10, "Default", String.valueOf(10 + (id - 100)), "", true, "sku-" + id))
            ));
        }
        return products;
    }

    private List<StoreCollection> sampleCollections() {
        return Arrays.asList(
                new StoreCollection(1L, "Best Sellers", "appplaza-best-sellers", "", "", 12),
                new StoreCollection(2L, "Gifts", "gifts", "", "", 2),
                new StoreCollection(3L, "Books", "books", "", "", 5),
                new StoreCollection(4L, "New Arrivals", "new-arrivals", "", "", 6),
                new StoreCollection(5L, "Home Decor", "home-decor", "", "", 11),
                new StoreCollection(6L, "Seasonal Picks", "seasonal-picks", "", "", 9)
        );
    }

    private List<StoreProduct> sampleRecentlyViewed() {
        return Arrays.asList(
                sampleProducts().get(0),
                sampleProducts().get(1),
                sampleProducts().get(2)
        );
    }

    private String sampleMerchandisingJson() {
        return "{\n" +
                "  \"collections\": {\n" +
                "    \"appplaza-best-sellers\": {\"title\": \"Best Sellers\", \"productIds\": [101, 102, 103, 104, 105]},\n" +
                "    \"gifts\": {\"title\": \"Gifts\", \"productIds\": [106, 107]},\n" +
                "    \"books\": {\"title\": \"Books\", \"productIds\": [108, 109, 110, 111, 112]},\n" +
                "    \"new-arrivals\": {\"title\": \"New Arrivals\", \"productIds\": [113, 114, 115, 116]},\n" +
                "    \"seasonal-picks\": {\"title\": \"Seasonal Picks\", \"productIds\": [101, 106]}\n" +
                "  }\n" +
                "}";
    }
}
