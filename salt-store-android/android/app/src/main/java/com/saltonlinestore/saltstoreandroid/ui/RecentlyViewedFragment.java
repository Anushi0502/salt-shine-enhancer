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
import com.saltonlinestore.saltstoreandroid.data.StoreHistoryStore;
import com.saltonlinestore.saltstoreandroid.data.StoreRepository;
import com.saltonlinestore.saltstoreandroid.model.StoreProduct;
import com.saltonlinestore.saltstoreandroid.ui.adapter.ProductAdapter;
import com.saltonlinestore.saltstoreandroid.ui.secondary.SecondaryHostActivity;

import java.util.List;

public class RecentlyViewedFragment extends Fragment {
    private StoreHistoryStore historyStore;
    private final StoreRepository repository = StoreRepository.getInstance();
    private ProductAdapter adapter;
    private TextView countView;
    private TextView emptyState;
    private MaterialButton emptyAction;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_recently_viewed, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        historyStore = StoreHistoryStore.getInstance(requireContext());
        countView = view.findViewById(R.id.recently_viewed_count);
        emptyState = view.findViewById(R.id.recently_viewed_empty);
        emptyAction = view.findViewById(R.id.recently_viewed_empty_action);
        RecyclerView list = view.findViewById(R.id.recently_viewed_list);

        adapter = new ProductAdapter(
                product -> openProduct(product.handle),
                this::quickAddProduct
        );
        list.setLayoutManager(new GridLayoutManager(requireContext(), 2));
        list.setAdapter(adapter);
        list.setNestedScrollingEnabled(false);

        if (emptyAction != null) {
            emptyAction.setOnClickListener(v -> {
                if (requireActivity() instanceof MainActivity mainActivity) {
                    mainActivity.goToTab(R.id.nav_shop);
                }
            });
        }

        refreshData();
    }

    public void refreshData() {
        if (!isAdded()) {
            return;
        }

        com.saltonlinestore.saltstoreandroid.model.StoreCatalog cached = repository.peekCatalog();
        if (cached != null) {
            bindRecentlyViewed(cached, false);
        } else {
            emptyState.setVisibility(View.VISIBLE);
            emptyState.setText("Loading live catalog...");
            emptyAction.setVisibility(View.GONE);
        }

        repository.loadCatalog(new StoreRepository.CatalogCallback() {
            @Override
            public void onSuccess(com.saltonlinestore.saltstoreandroid.model.StoreCatalog catalog) {
                bindRecentlyViewed(catalog, true);
            }

            @Override
            public void onError(Throwable error) {
                if (cached == null) {
                    adapter.submit(java.util.Collections.emptyList());
                    if (countView != null) {
                        countView.setText("0");
                    }
                    emptyState.setVisibility(View.VISIBLE);
                    emptyState.setText("No recently viewed products yet. Open a product to see it here.");
                    emptyAction.setVisibility(View.VISIBLE);
                }
            }
        });
    }

    private void bindRecentlyViewed(com.saltonlinestore.saltstoreandroid.model.StoreCatalog catalog, boolean liveReady) {
        List<StoreProduct> products = historyStore.resolveRecentlyViewedProducts(catalog);
        adapter.submit(products);
        if (countView != null) {
            countView.setText(String.valueOf(products.size()));
        }
        emptyState.setVisibility(products.isEmpty() ? View.VISIBLE : View.GONE);
        if (products.isEmpty()) {
            emptyState.setText(liveReady
                    ? "No recently viewed products yet. Open a product to see it here."
                    : "Loading live catalog...");
        }
        emptyAction.setVisibility(products.isEmpty() && liveReady ? View.VISIBLE : View.GONE);
    }

    private void openProduct(String handle) {
        if (requireActivity() instanceof MainActivity mainActivity) {
            mainActivity.openProductByHandle(handle);
            return;
        }
        if (requireActivity() instanceof SecondaryHostActivity secondaryHostActivity) {
            secondaryHostActivity.openProductByHandle(handle);
        }
    }

    private void quickAddProduct(StoreProduct product) {
        if (requireActivity() instanceof MainActivity mainActivity) {
            mainActivity.quickAddProduct(product);
            return;
        }
        if (requireActivity() instanceof SecondaryHostActivity secondaryHostActivity) {
            secondaryHostActivity.quickAddProduct(product);
        }
    }
}
