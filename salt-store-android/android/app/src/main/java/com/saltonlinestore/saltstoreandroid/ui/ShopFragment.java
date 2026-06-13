package com.saltonlinestore.saltstoreandroid.ui;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.google.android.material.button.MaterialButton;
import com.saltonlinestore.saltstoreandroid.MainActivity;
import com.saltonlinestore.saltstoreandroid.R;
import com.saltonlinestore.saltstoreandroid.data.StoreRepository;
import com.saltonlinestore.saltstoreandroid.model.StoreCatalog;
import com.saltonlinestore.saltstoreandroid.model.StoreProduct;
import com.saltonlinestore.saltstoreandroid.ui.adapter.ProductAdapter;
import com.saltonlinestore.saltstoreandroid.util.StoreFormat;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class ShopFragment extends Fragment {
    private final StoreRepository repository = StoreRepository.getInstance();

    private TextView resultsLabel;
    private TextView emptyState;
    private MaterialButton emptyAction;
    private ProductAdapter productAdapter;

    private String currentCollectionHandle = null;
    private String currentCollectionTitle = "Catalog";
    private String currentQuery = "";
    private List<StoreProduct> currentSourceProducts = new ArrayList<>();
    private boolean pendingLoad;
    private boolean loadingScope;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_shop, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        resultsLabel = view.findViewById(R.id.shop_results_label);
        emptyState = view.findViewById(R.id.shop_empty);
        emptyAction = view.findViewById(R.id.shop_empty_action);
        RecyclerView productsList = view.findViewById(R.id.shop_products);

        productAdapter = new ProductAdapter(
                product -> ((MainActivity) requireActivity()).openProductByHandle(product.handle),
                product -> ((MainActivity) requireActivity()).quickAddProduct(product)
        );

        productsList.setLayoutManager(new GridLayoutManager(requireContext(), 2));
        productsList.setAdapter(productAdapter);
        productsList.setNestedScrollingEnabled(false);

        if (emptyAction != null) {
            emptyAction.setOnClickListener(v -> {
                if (currentQuery != null && !currentQuery.trim().isEmpty()) {
                    setSearchQuery("");
                    if (requireActivity() instanceof MainActivity mainActivity) {
                        mainActivity.focusHeaderSearch();
                    }
                } else {
                    ((MainActivity) requireActivity()).goToTab(R.id.nav_collections);
                }
            });
        }

        refreshData();
        if (currentCollectionHandle != null) {
            resultsLabel.setText(currentCollectionTitle);
        }
        if (pendingLoad) {
            loadCurrentScope();
        }
    }

    public void focusSearch() {
        if (isAdded() && requireActivity() instanceof MainActivity mainActivity) {
            mainActivity.focusHeaderSearch();
        }
    }

    public void setSearchQuery(@Nullable String query) {
        String normalized = query == null ? "" : query;
        currentQuery = normalized;
        applyFilter();
    }

    public void showCollection(String handle) {
        showCollection(handle, null);
    }

    public void showCollection(String handle, @Nullable String title) {
        currentCollectionHandle = handle == null || handle.trim().isEmpty() ? null : handle.trim();
        currentCollectionTitle = title == null || title.trim().isEmpty() ? "Catalog" : title.trim();
        if (currentCollectionHandle == null || "all-products".equalsIgnoreCase(currentCollectionHandle)) {
            resultsLabel.setText("Catalog");
        } else {
            resultsLabel.setText(currentCollectionTitle);
        }
        loadCurrentScope();
    }

    public void refreshData() {
        loadCurrentScope();
    }

    private void loadCurrentScope() {
        if (!isAdded()) {
            pendingLoad = true;
            return;
        }

        pendingLoad = false;
        loadingScope = true;
        if (currentCollectionHandle == null || "all-products".equalsIgnoreCase(currentCollectionHandle)) {
            StoreCatalog cached = repository.peekCatalog();
            if (cached != null) {
                currentSourceProducts = new ArrayList<>(cached.products);
                currentCollectionTitle = "Catalog";
                if (resultsLabel != null) {
                    resultsLabel.setText(currentCollectionTitle);
                }
                applyFilter();
            } else {
                showLoadingState("Loading live catalog...", "Fresh products are loading from Shopify.");
            }

            repository.loadCatalog(new StoreRepository.CatalogCallback() {
                @Override
                public void onSuccess(com.saltonlinestore.saltstoreandroid.model.StoreCatalog catalog) {
                    currentSourceProducts = new ArrayList<>(catalog.products);
                    currentCollectionTitle = "Catalog";
                    if (resultsLabel != null) {
                        resultsLabel.setText(currentCollectionTitle);
                    }
                    loadingScope = false;
                    applyFilter();
                }

                @Override
                public void onError(Throwable error) {
                    loadingScope = false;
                    applyFilter();
                }
            });
            return;
        }

        List<StoreProduct> cached = repository.peekCollectionProducts(currentCollectionHandle);
        if (!cached.isEmpty()) {
            currentSourceProducts = new ArrayList<>(cached);
            if (resultsLabel != null) {
                resultsLabel.setText(currentCollectionTitle);
            }
            applyFilter();
        } else {
            showLoadingState("Loading collection...", "Fresh collection products are loading.");
        }

        repository.loadCollectionProducts(currentCollectionHandle, new StoreRepository.ProductsCallback() {
            @Override
            public void onSuccess(List<StoreProduct> products) {
                currentSourceProducts = new ArrayList<>(products);
                if (resultsLabel != null) {
                    resultsLabel.setText(currentCollectionTitle);
                }
                loadingScope = false;
                applyFilter();
            }

            @Override
            public void onError(Throwable error) {
                loadingScope = false;
                applyFilter();
            }
        });
    }

    private void applyFilter() {
        if (!isAdded()) {
            return;
        }

        String query = normalize(currentQuery);
        List<StoreProduct> filtered = new ArrayList<>();
        List<RankedProduct> ranked = new ArrayList<>();
        for (StoreProduct product : currentSourceProducts) {
            if (query.isEmpty()) {
                filtered.add(product);
                continue;
            }

            int score = relevanceScore(product, query);
            if (score > 0) {
                ranked.add(new RankedProduct(product, score));
            }
        }

        if (!query.isEmpty()) {
            ranked.sort((left, right) -> {
                int compareScore = Integer.compare(right.score, left.score);
                if (compareScore != 0) {
                    return compareScore;
                }
                return left.product.title.compareToIgnoreCase(right.product.title);
            });
            for (RankedProduct item : ranked) {
                filtered.add(item.product);
            }
        }

        productAdapter.submit(filtered);
        boolean isEmpty = filtered.isEmpty();
        if (emptyState != null) {
            emptyState.setVisibility(isEmpty ? View.VISIBLE : View.GONE);
            if (loadingScope && currentSourceProducts.isEmpty()) {
                emptyState.setText("Loading live catalog...");
            } else {
                emptyState.setText(query.isEmpty()
                        ? "No products are available in this collection right now."
                        : "No products match \"" + currentQuery.trim() + "\".");
            }
        }
        if (emptyAction != null) {
            if (loadingScope && currentSourceProducts.isEmpty()) {
                emptyAction.setVisibility(View.GONE);
            } else {
                emptyAction.setVisibility(isEmpty ? View.VISIBLE : View.GONE);
                if (query.isEmpty()) {
                    emptyAction.setText("Browse collections");
                } else {
                    emptyAction.setText("Clear search");
                }
            }
        }
    }

    private void showLoadingState(@NonNull String title, @NonNull String subtitle) {
        if (emptyState != null) {
            emptyState.setVisibility(View.VISIBLE);
            emptyState.setText(title + "\n" + subtitle);
        }
        if (emptyAction != null) {
            emptyAction.setVisibility(View.GONE);
        }
    }

    private String normalize(String input) {
        return input == null ? "" : input.trim().toLowerCase(Locale.US);
    }

    private int relevanceScore(StoreProduct product, String query) {
        String title = normalize(product.title);
        String vendor = normalize(product.vendor);
        String type = normalize(product.productType);
        String handle = normalize(product.handle);
        String tags = normalize(String.join(" ", product.tags));
        String body = normalize(StoreFormat.stripHtml(product.bodyHtml));
        int score = 0;

        if (title.equals(query)) {
            score += 120;
        } else if (title.startsWith(query)) {
            score += 100;
        } else if (title.contains(query)) {
            score += 80;
        }

        if (handle.startsWith(query)) {
            score += 60;
        } else if (handle.contains(query)) {
            score += 45;
        }

        if (vendor.contains(query)) {
            score += 30;
        }
        if (type.contains(query)) {
            score += 25;
        }
        if (tags.contains(query)) {
            score += 20;
        }
        if (body.contains(query)) {
            score += 10;
        }

        return score;
    }

    private static final class RankedProduct {
        final StoreProduct product;
        final int score;

        RankedProduct(StoreProduct product, int score) {
            this.product = product;
            this.score = score;
        }
    }
}
