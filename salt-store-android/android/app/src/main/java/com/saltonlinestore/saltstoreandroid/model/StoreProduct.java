package com.saltonlinestore.saltstoreandroid.model;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class StoreProduct {
    public final long id;
    public final String title;
    public final String handle;
    public final String bodyHtml;
    public final String vendor;
    public final String productType;
    public final List<String> tags;
    public final List<String> imageUrls;
    public final List<StoreVariant> variants;

    public StoreProduct(
            long id,
            String title,
            String handle,
            String bodyHtml,
            String vendor,
            String productType,
            List<String> tags,
            List<String> imageUrls,
            List<StoreVariant> variants
    ) {
        this.id = id;
        this.title = title;
        this.handle = handle;
        this.bodyHtml = bodyHtml;
        this.vendor = vendor;
        this.productType = productType;
        this.tags = tags == null ? Collections.emptyList() : Collections.unmodifiableList(new ArrayList<>(tags));
        this.imageUrls = imageUrls == null ? Collections.emptyList() : Collections.unmodifiableList(new ArrayList<>(imageUrls));
        this.variants = variants == null ? Collections.emptyList() : Collections.unmodifiableList(new ArrayList<>(variants));
    }

    public String primaryImageUrl() {
        return imageUrls.isEmpty() ? null : imageUrls.get(0);
    }

    public StoreVariant defaultVariant() {
        for (StoreVariant variant : variants) {
            if (variant.available) {
                return variant;
            }
        }
        return variants.isEmpty() ? null : variants.get(0);
    }

    public String priceLabel() {
        StoreVariant variant = defaultVariant();
        return variant == null ? null : variant.price;
    }

    public String compareAtLabel() {
        StoreVariant variant = defaultVariant();
        return variant == null ? null : variant.compareAtPrice;
    }
}
