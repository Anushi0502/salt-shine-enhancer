package com.saltonlinestore.saltstoreandroid.data;

import android.os.Handler;
import android.os.Looper;

import com.saltonlinestore.saltstoreandroid.BuildConfig;
import com.saltonlinestore.saltstoreandroid.model.StoreCatalog;
import com.saltonlinestore.saltstoreandroid.model.StoreCollection;
import com.saltonlinestore.saltstoreandroid.model.StoreProduct;
import com.saltonlinestore.saltstoreandroid.model.StoreVariant;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class StoreRepository {
    public interface CatalogCallback {
        void onSuccess(StoreCatalog catalog);
        void onError(Throwable error);
    }

    public interface ProductCallback {
        void onSuccess(StoreProduct product);
        void onError(Throwable error);
    }

    public interface ProductsCallback {
        void onSuccess(List<StoreProduct> products);
        void onError(Throwable error);
    }

    private static final int PAGE_LIMIT = 250;
    private static final StoreRepository INSTANCE = new StoreRepository();

    private final ExecutorService executor = Executors.newFixedThreadPool(3);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Object lock = new Object();
    private final List<CatalogCallback> pendingCatalogCallbacks = new ArrayList<>();
    private volatile boolean loadingCatalog;

    private StoreRepository() {}

    public static StoreRepository getInstance() {
        return INSTANCE;
    }

    public String getShopBaseUrl() {
        return BuildConfig.SHOP_BASE_URL;
    }

    public String getBrandedBaseUrl() {
        return BuildConfig.SHOP_BRANDED_URL;
    }

    public void clearCache() {
        // Intentionally empty: live data is fetched on demand and not retained
        // as a session snapshot.
    }

    public void loadCatalog(CatalogCallback callback) {
        synchronized (lock) {
            pendingCatalogCallbacks.add(callback);
            if (loadingCatalog) {
                return;
            }
            loadingCatalog = true;
        }

        executor.execute(() -> {
            try {
                StoreCatalog catalog = fetchCatalog();
                flushCatalogCallbacks(catalog, null);
            } catch (Throwable error) {
                flushCatalogCallbacks(null, error);
            } finally {
                synchronized (lock) {
                    loadingCatalog = false;
                }
            }
        });
    }

    public void refreshCatalog(CatalogCallback callback) {
        loadCatalog(callback);
    }

    public void loadProduct(String handle, ProductCallback callback) {
        loadCatalog(new CatalogCallback() {
            @Override
            public void onSuccess(StoreCatalog catalog) {
                StoreProduct product = catalog.findProductByHandle(handle);
                if (product != null) {
                    postSuccess(callback, product);
                } else {
                    postError(callback, new IllegalStateException("Product not found: " + handle));
                }
            }

            @Override
            public void onError(Throwable error) {
                postError(callback, error);
            }
        });
    }

    public void loadCollectionProducts(String handle, ProductsCallback callback) {
        executor.execute(() -> {
            try {
                List<StoreProduct> products = fetchCollectionProducts(handle);
                mainHandler.post(() -> callback.onSuccess(products));
            } catch (Throwable error) {
                mainHandler.post(() -> callback.onError(error));
            }
        });
    }

    private void flushCatalogCallbacks(StoreCatalog catalog, Throwable error) {
        List<CatalogCallback> callbacks;
        synchronized (lock) {
            callbacks = new ArrayList<>(pendingCatalogCallbacks);
            pendingCatalogCallbacks.clear();
        }

        for (CatalogCallback callback : callbacks) {
            if (error != null) {
                postError(callback, error);
            } else {
                postSuccess(callback, catalog);
            }
        }
    }

    private void postSuccess(CatalogCallback callback, StoreCatalog catalog) {
        mainHandler.post(() -> callback.onSuccess(catalog));
    }

    private void postError(CatalogCallback callback, Throwable error) {
        mainHandler.post(() -> callback.onError(error));
    }

    private void postSuccess(ProductCallback callback, StoreProduct product) {
        mainHandler.post(() -> callback.onSuccess(product));
    }

    private void postError(ProductCallback callback, Throwable error) {
        mainHandler.post(() -> callback.onError(error));
    }

    private StoreCatalog fetchCatalog() throws Exception {
        List<StoreProduct> products = fetchAllProducts();
        List<StoreCollection> collections = fetchAllCollections();
        return new StoreCatalog(products, collections);
    }

    private List<StoreProduct> fetchAllProducts() throws Exception {
        List<StoreProduct> products = new ArrayList<>();
        int page = 1;

        while (true) {
            JSONArray items = fetchArray(buildEndpoint("/products.json?limit=" + PAGE_LIMIT + "&page=" + page), "products");
            if (items == null || items.length() == 0) {
                break;
            }

            for (int index = 0; index < items.length(); index++) {
                JSONObject item = items.getJSONObject(index);
                products.add(parseProduct(item));
            }

            if (items.length() < PAGE_LIMIT) {
                break;
            }
            page += 1;
        }

        return products;
    }

    private List<StoreCollection> fetchAllCollections() throws Exception {
        List<StoreCollection> collections = new ArrayList<>();
        int page = 1;

        while (true) {
            JSONArray items = fetchArray(buildEndpoint("/collections.json?limit=" + PAGE_LIMIT + "&page=" + page), "collections");
            if (items == null || items.length() == 0) {
                break;
            }

            for (int index = 0; index < items.length(); index++) {
                JSONObject item = items.getJSONObject(index);
                collections.add(parseCollection(item));
            }

            if (items.length() < PAGE_LIMIT) {
                break;
            }
            page += 1;
        }

        return collections;
    }

    private List<StoreProduct> fetchCollectionProducts(String handle) throws Exception {
        List<StoreProduct> products = new ArrayList<>();
        int page = 1;

        while (true) {
            JSONArray items = fetchArray(buildEndpoint("/collections/" + handle + "/products.json?limit=" + PAGE_LIMIT + "&page=" + page), "products");
            if (items == null || items.length() == 0) {
                break;
            }

            for (int index = 0; index < items.length(); index++) {
                JSONObject item = items.getJSONObject(index);
                products.add(parseProduct(item));
            }

            if (items.length() < PAGE_LIMIT) {
                break;
            }
            page += 1;
        }

        return products;
    }

    private JSONArray fetchArray(String endpoint, String key) throws Exception {
        JSONObject payload = fetchObject(endpoint);
        return payload.optJSONArray(key);
    }

    private JSONObject fetchObject(String endpoint) throws Exception {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(endpoint);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(20_000);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("User-Agent", "SALT Store Android");

            int status = connection.getResponseCode();
            InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
            String body = readStream(stream);

            if (status < 200 || status >= 300) {
                throw new IllegalStateException("Request failed " + status + " for " + endpoint + ": " + body);
            }

            return new JSONObject(body);
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private String readStream(InputStream stream) throws Exception {
        if (stream == null) {
            return "";
        }

        try (BufferedInputStream input = new BufferedInputStream(stream); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private StoreProduct parseProduct(JSONObject item) {
        long id = item.optLong("id");
        String title = item.optString("title", "");
        String handle = item.optString("handle", "");
        String bodyHtml = item.optString("body_html", "");
        String vendor = item.optString("vendor", "");
        String productType = item.optString("product_type", "");

        List<String> tags = new ArrayList<>();
        Object tagsValue = item.opt("tags");
        if (tagsValue instanceof JSONArray tagsArray) {
            for (int index = 0; index < tagsArray.length(); index++) {
                String tag = tagsArray.optString(index, "").trim();
                if (!tag.isEmpty()) {
                    tags.add(tag);
                }
            }
        } else if (tagsValue instanceof String tagsString) {
            for (String tag : tagsString.split(",")) {
                String trimmed = tag.trim();
                if (!trimmed.isEmpty()) {
                    tags.add(trimmed);
                }
            }
        }

        List<String> imageUrls = new ArrayList<>();
        JSONArray images = item.optJSONArray("images");
        if (images != null) {
            for (int index = 0; index < images.length(); index++) {
                JSONObject image = images.optJSONObject(index);
                if (image == null) {
                    continue;
                }
                String src = image.optString("src", "").trim();
                if (!src.isEmpty()) {
                    imageUrls.add(src);
                }
            }
        }
        String primaryImage = item.optJSONObject("image") != null ? item.optJSONObject("image").optString("src", "").trim() : "";
        if (!primaryImage.isEmpty() && !imageUrls.contains(primaryImage)) {
            imageUrls.add(0, primaryImage);
        }

        List<StoreVariant> variants = new ArrayList<>();
        JSONArray variantArray = item.optJSONArray("variants");
        if (variantArray != null) {
            for (int index = 0; index < variantArray.length(); index++) {
                JSONObject variant = variantArray.optJSONObject(index);
                if (variant == null) {
                    continue;
                }
                variants.add(new StoreVariant(
                        variant.optLong("id"),
                        variant.optString("title", ""),
                        variant.optString("price", ""),
                        variant.optString("compare_at_price", ""),
                        variant.optBoolean("available", false),
                        variant.optString("sku", "")
                ));
            }
        }

        return new StoreProduct(id, title, handle, bodyHtml, vendor, productType, tags, imageUrls, variants);
    }

    private StoreCollection parseCollection(JSONObject item) {
        long id = item.optLong("id");
        String title = item.optString("title", "");
        String handle = item.optString("handle", "");
        String description = item.optString("description", "");
        String imageUrl = "";
        JSONObject image = item.optJSONObject("image");
        if (image != null) {
            imageUrl = image.optString("src", "");
        }
        int productsCount = item.optInt("products_count", 0);
        return new StoreCollection(id, title, handle, description, imageUrl, productsCount);
    }

    private String buildEndpoint(String path) {
        String base = BuildConfig.SHOP_BASE_URL;
        if (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        return base + path;
    }

    private String normalize(String input) {
        return input == null ? "" : input.trim().toLowerCase(Locale.US);
    }
}
