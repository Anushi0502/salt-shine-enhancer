package com.saltonlinestore.saltstoreandroid.ui;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
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
import com.saltonlinestore.saltstoreandroid.model.StoreCartEntry;
import com.saltonlinestore.saltstoreandroid.model.StoreProduct;
import com.saltonlinestore.saltstoreandroid.model.StoreVariant;
import com.saltonlinestore.saltstoreandroid.ui.adapter.CartAdapter;
import com.saltonlinestore.saltstoreandroid.ui.secondary.SecondaryHostActivity;
import com.saltonlinestore.saltstoreandroid.util.StoreFormat;

import java.util.ArrayList;
import java.util.List;

public class CartFragment extends Fragment {
    private final StoreRepository repository = StoreRepository.getInstance();
    private StorePrefs prefs;
    private CartAdapter adapter;
    private RecyclerView list;
    private View emptyCard;
    private TextView emptyState;
    private Button emptyAction;
    private TextView subtotalLabel;
    private TextView subtitle;
    private Button checkoutButton;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_cart, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        prefs = StorePrefs.getInstance(requireContext());
        emptyCard = view.findViewById(R.id.cart_empty_card);
        emptyState = view.findViewById(R.id.cart_empty);
        emptyAction = view.findViewById(R.id.cart_empty_action);
        subtotalLabel = view.findViewById(R.id.cart_subtotal);
        subtitle = view.findViewById(R.id.cart_subtitle);
        checkoutButton = view.findViewById(R.id.cart_checkout);
        list = view.findViewById(R.id.cart_list);

        adapter = new CartAdapter(new CartAdapter.OnCartActionListener() {
            @Override
            public void onIncrease(CartAdapter.CartRow row) {
                prefs.incrementCartQuantity(row.product.id, row.entry.variantId, 1);
                refreshHost();
            }

            @Override
            public void onDecrease(CartAdapter.CartRow row) {
                if (row.entry.quantity <= 1) {
                    prefs.removeCartEntryByVariantId(row.entry.variantId);
                } else {
                    prefs.incrementCartQuantity(row.product.id, row.entry.variantId, -1);
                }
                refreshHost();
            }

            @Override
            public void onRemove(CartAdapter.CartRow row) {
                prefs.removeCartEntryByVariantId(row.entry.variantId);
                refreshHost();
            }

            @Override
            public void onOpen(CartAdapter.CartRow row) {
                openProduct(row.product.handle);
            }
        });

        list.setLayoutManager(new LinearLayoutManager(requireContext()));
        list.setAdapter(adapter);
        list.setNestedScrollingEnabled(false);

        checkoutButton.setOnClickListener(v -> checkoutNow());
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
            bindCartRows(cached, false);
        } else {
            subtitle.setText("Refreshing live prices...");
        }

        repository.loadCatalog(new StoreRepository.CatalogCallback() {
            @Override
            public void onSuccess(com.saltonlinestore.saltstoreandroid.model.StoreCatalog catalog) {
                bindCartRows(catalog, true);
            }

            @Override
            public void onError(Throwable error) {
                if (cached == null) {
                    adapter.submit(new ArrayList<>());
                    subtotalLabel.setText(StoreFormat.moneyLabel(0d));
                    subtitle.setText("0 item(s) staged for checkout");
                    if (emptyCard != null) {
                        emptyCard.setVisibility(View.VISIBLE);
                    }
                    emptyState.setVisibility(View.VISIBLE);
                    emptyAction.setVisibility(View.VISIBLE);
                    list.setVisibility(View.GONE);
                    checkoutButton.setEnabled(false);
                }
            }
        });
    }

    private void bindCartRows(com.saltonlinestore.saltstoreandroid.model.StoreCatalog catalog, boolean liveReady) {
        List<CartAdapter.CartRow> rows = new ArrayList<>();
        double subtotal = 0d;

        for (StoreCartEntry entry : prefs.getCartEntries()) {
            StoreProduct product = catalog.findProductById(entry.productId);
            if (product == null) {
                continue;
            }

            StoreVariant variant = null;
            for (StoreVariant candidate : product.variants) {
                if (candidate.id == entry.variantId) {
                    variant = candidate;
                    break;
                }
            }

            if (variant == null) {
                variant = product.defaultVariant();
            }

            if (variant == null) {
                continue;
            }

            rows.add(new CartAdapter.CartRow(product, entry));
            subtotal += StoreFormat.parseDouble(variant.price) * Math.max(1, entry.quantity);
        }

        adapter.submit(rows);
        subtotalLabel.setText(StoreFormat.moneyLabel(subtotal));
        subtitle.setText(liveReady ? prefs.cartItemCount() + " item(s) staged for checkout" : "Refreshing live prices...");
        boolean isEmpty = rows.isEmpty();
        if (emptyCard != null) {
            emptyCard.setVisibility(isEmpty ? View.VISIBLE : View.GONE);
        }
        emptyState.setVisibility(isEmpty ? View.VISIBLE : View.GONE);
        emptyAction.setVisibility(isEmpty ? View.VISIBLE : View.GONE);
        list.setVisibility(rows.isEmpty() ? View.GONE : View.VISIBLE);
        checkoutButton.setEnabled(!rows.isEmpty());
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

    private void checkoutNow() {
        if (requireActivity() instanceof MainActivity mainActivity) {
            mainActivity.checkoutNow();
            return;
        }
        if (requireActivity() instanceof SecondaryHostActivity secondaryHostActivity) {
            secondaryHostActivity.checkoutNow();
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
