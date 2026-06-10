package com.saltonlinestore.saltstoreandroid.ui;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import com.google.android.material.button.MaterialButton;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.saltonlinestore.saltstoreandroid.MainActivity;
import com.saltonlinestore.saltstoreandroid.R;
import com.saltonlinestore.saltstoreandroid.data.StorePrefs;
import com.saltonlinestore.saltstoreandroid.data.StoreRepository;
import com.saltonlinestore.saltstoreandroid.model.StoreProduct;
import com.saltonlinestore.saltstoreandroid.ui.adapter.WishlistAdapter;
import com.saltonlinestore.saltstoreandroid.ui.secondary.SecondaryHostActivity;

import java.util.ArrayList;
import java.util.List;

public class WishlistFragment extends Fragment {
    private final StoreRepository repository = StoreRepository.getInstance();
    private StorePrefs prefs;
    private WishlistAdapter adapter;
    private RecyclerView list;
    private TextView emptyState;
    private MaterialButton emptyAction;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_wishlist, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        prefs = StorePrefs.getInstance(requireContext());
        emptyState = view.findViewById(R.id.wishlist_empty);
        emptyAction = view.findViewById(R.id.wishlist_empty_action);
        list = view.findViewById(R.id.wishlist_list);

        adapter = new WishlistAdapter(new WishlistAdapter.OnWishlistActionListener() {
            @Override
            public void onOpen(WishlistAdapter.WishlistRow row) {
                openProduct(row.product.handle);
            }

            @Override
            public void onRemove(WishlistAdapter.WishlistRow row) {
                prefs.toggleWishlist(row.product.id);
                refreshHost();
            }
        });

        list.setLayoutManager(new LinearLayoutManager(requireContext()));
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

        repository.loadCatalog(new StoreRepository.CatalogCallback() {
            @Override
            public void onSuccess(com.saltonlinestore.saltstoreandroid.model.StoreCatalog catalog) {
                List<WishlistAdapter.WishlistRow> rows = new ArrayList<>();
                for (Long id : prefs.getWishlistIds()) {
                    StoreProduct product = catalog.findProductById(id);
                    if (product != null) {
                        rows.add(new WishlistAdapter.WishlistRow(product));
                    }
                }
                adapter.submit(rows);
                emptyState.setVisibility(rows.isEmpty() ? View.VISIBLE : View.GONE);
                emptyAction.setVisibility(rows.isEmpty() ? View.VISIBLE : View.GONE);
                list.setVisibility(rows.isEmpty() ? View.GONE : View.VISIBLE);
            }

            @Override
            public void onError(Throwable error) {
                adapter.submit(new ArrayList<>());
                emptyState.setVisibility(View.VISIBLE);
                emptyAction.setVisibility(View.VISIBLE);
                list.setVisibility(View.GONE);
            }
        });
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

    private void refreshHost() {
        if (requireActivity() instanceof MainActivity mainActivity) {
            mainActivity.refreshStoreViews();
            return;
        }
        if (requireActivity() instanceof SecondaryHostActivity secondaryHostActivity) {
            secondaryHostActivity.refreshStoreViews();
        }
    }
}
