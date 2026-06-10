package com.saltonlinestore.saltstoreandroid.ui;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.saltonlinestore.saltstoreandroid.MainActivity;
import com.saltonlinestore.saltstoreandroid.R;
import com.saltonlinestore.saltstoreandroid.data.StoreHistoryStore;
import com.saltonlinestore.saltstoreandroid.data.StorePrefs;
import com.saltonlinestore.saltstoreandroid.model.StoreCartEntry;
import com.saltonlinestore.saltstoreandroid.ui.adapter.OrderHistoryAdapter;
import com.saltonlinestore.saltstoreandroid.ui.secondary.SecondaryHostActivity;
import com.saltonlinestore.saltstoreandroid.util.StoreFormat;

import java.util.List;

public class OrderHistoryFragment extends Fragment {
    private StoreHistoryStore historyStore;
    private StorePrefs prefs;
    private OrderHistoryAdapter adapter;
    private TextView countView;
    private TextView subtotalView;
    private TextView emptyState;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_order_history, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        historyStore = StoreHistoryStore.getInstance(requireContext());
        prefs = StorePrefs.getInstance(requireContext());
        countView = view.findViewById(R.id.order_history_count);
        subtotalView = view.findViewById(R.id.order_history_subtotal_summary);
        emptyState = view.findViewById(R.id.order_history_empty);
        RecyclerView list = view.findViewById(R.id.order_history_list);

        adapter = new OrderHistoryAdapter(new OrderHistoryAdapter.OnOrderHistoryActionListener() {
            @Override
            public void onOpen(StoreHistoryStore.OrderHistoryEntry entry) {
                if (entry.checkoutUrl == null || entry.checkoutUrl.trim().isEmpty()) {
                    return;
                }
                openCheckoutInApp(entry.checkoutUrl);
            }

            @Override
            public void onRestore(StoreHistoryStore.OrderHistoryEntry entry) {
                restoreCart(entry);
            }

            @Override
            public void onRemove(StoreHistoryStore.OrderHistoryEntry entry) {
                historyStore.removeOrderHistoryEntry(entry.id);
                refreshData();
            }
        });

        list.setLayoutManager(new LinearLayoutManager(requireContext()));
        list.setAdapter(adapter);
        list.setNestedScrollingEnabled(false);

        refreshData();
    }

    public void refreshData() {
        if (!isAdded()) {
            return;
        }
        loadHistory();
    }

    private void loadHistory() {
        List<StoreHistoryStore.OrderHistoryEntry> entries = historyStore.readOrderHistory();
        adapter.submit(entries);
        if (countView != null) {
            countView.setText(String.valueOf(entries.size()));
        }
        if (subtotalView != null) {
            double subtotal = 0d;
            for (StoreHistoryStore.OrderHistoryEntry entry : entries) {
                subtotal += entry.subtotal;
            }
            subtotalView.setText(StoreFormat.moneyLabel(subtotal));
        }
        if (emptyState != null) {
            emptyState.setVisibility(entries.isEmpty() ? View.VISIBLE : View.GONE);
        }
    }

    private void openCheckoutInApp(String url) {
        if (requireActivity() instanceof MainActivity mainActivity) {
            mainActivity.openCheckoutInApp(url);
            return;
        }
        if (requireActivity() instanceof SecondaryHostActivity secondaryHostActivity) {
            secondaryHostActivity.openCheckoutInApp(url);
        }
    }

    private void restoreCart(@NonNull StoreHistoryStore.OrderHistoryEntry entry) {
        if (entry.items.isEmpty()) {
            Toast.makeText(requireContext(), "No cart items to restore", Toast.LENGTH_SHORT).show();
            return;
        }

        for (StoreHistoryStore.OrderHistoryItem item : entry.items) {
            prefs.setCartEntry(new StoreCartEntry(item.id, item.shopifyVariantId, Math.max(1, item.quantity)));
        }

        Toast.makeText(requireContext(), "Cart restored", Toast.LENGTH_SHORT).show();
        refreshHost();
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
