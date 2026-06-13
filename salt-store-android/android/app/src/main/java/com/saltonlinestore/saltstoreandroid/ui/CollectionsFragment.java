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

import com.saltonlinestore.saltstoreandroid.MainActivity;
import com.saltonlinestore.saltstoreandroid.R;
import com.saltonlinestore.saltstoreandroid.data.StoreRepository;
import com.saltonlinestore.saltstoreandroid.model.StoreCatalog;
import com.saltonlinestore.saltstoreandroid.model.StoreCollection;
import com.saltonlinestore.saltstoreandroid.ui.adapter.CollectionTileAdapter;

import java.util.List;
import java.util.ArrayList;

public class CollectionsFragment extends Fragment {
    private final StoreRepository repository = StoreRepository.getInstance();
    private CollectionTileAdapter adapter;
    private TextView emptyState;
    private boolean loadingCollections;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_collections, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        emptyState = view.findViewById(R.id.collections_empty);
        RecyclerView list = view.findViewById(R.id.collections_list);

        adapter = new CollectionTileAdapter(collection -> ((MainActivity) requireActivity()).openCollection(collection));
        list.setLayoutManager(new GridLayoutManager(requireContext(), 2));
        list.setAdapter(adapter);
        list.setNestedScrollingEnabled(false);

        refreshData();
    }

    public void refreshData() {
        if (!isAdded()) {
            return;
        }

        loadingCollections = true;
        StoreCatalog cached = repository.peekCatalog();
        if (cached != null) {
            bindCollections(cached);
        } else if (emptyState != null) {
            emptyState.setVisibility(View.VISIBLE);
            emptyState.setText("Loading live collections...");
        }

        repository.loadCatalog(new StoreRepository.CatalogCallback() {
            @Override
            public void onSuccess(StoreCatalog catalog) {
                loadingCollections = false;
                bindCollections(catalog);
            }

            @Override
            public void onError(Throwable error) {
                loadingCollections = false;
                if (cached == null) {
                    adapter.submit(java.util.Collections.emptyList());
                    emptyState.setVisibility(View.VISIBLE);
                    emptyState.setText("No collections are available right now.");
                }
            }
        });
    }

    private void bindCollections(StoreCatalog catalog) {
        List<StoreCollection> collections = new ArrayList<>();
        for (StoreCollection collection : catalog.collections) {
            if (collection == null) {
                continue;
            }
            String handle = collection.handle == null ? "" : collection.handle.trim().toLowerCase();
            String title = collection.title == null ? "" : collection.title.trim().toLowerCase();
            if ("all-products".equals(handle) || "all products".equals(title)) {
                continue;
            }
            collections.add(collection);
        }
        collections.sort((left, right) -> {
            if (right.productsCount != left.productsCount) {
                return Integer.compare(right.productsCount, left.productsCount);
            }
            return left.title.compareToIgnoreCase(right.title);
        });
        int limit = Math.min(16, collections.size());
        adapter.submit(limit == collections.size() ? collections : collections.subList(0, limit));
        boolean empty = collections.isEmpty();
        emptyState.setVisibility(empty ? View.VISIBLE : View.GONE);
        if (empty) {
            emptyState.setText(loadingCollections ? "Loading live collections..." : "No collections are available right now.");
        }
    }
}
