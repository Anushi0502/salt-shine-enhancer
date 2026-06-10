package com.saltonlinestore.saltstoreandroid.ui.secondary;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.fragment.app.Fragment;

import com.google.android.material.appbar.MaterialToolbar;
import com.saltonlinestore.saltstoreandroid.R;
import com.saltonlinestore.saltstoreandroid.data.StoreHistoryStore;
import com.saltonlinestore.saltstoreandroid.data.StorePrefs;
import com.saltonlinestore.saltstoreandroid.data.StoreRepository;
import com.saltonlinestore.saltstoreandroid.model.StoreCartEntry;
import com.saltonlinestore.saltstoreandroid.model.StoreProduct;
import com.saltonlinestore.saltstoreandroid.model.StoreVariant;
import com.saltonlinestore.saltstoreandroid.util.StoreUrls;
import com.saltonlinestore.saltstoreandroid.ui.CartFragment;
import com.saltonlinestore.saltstoreandroid.ui.OrderHistoryFragment;
import com.saltonlinestore.saltstoreandroid.ui.RecentlyViewedFragment;
import com.saltonlinestore.saltstoreandroid.ui.WishlistFragment;
import com.saltonlinestore.saltstoreandroid.ui.checkout.CheckoutWebViewActivity;

import java.util.List;

public class SecondaryHostActivity extends AppCompatActivity {
    public static final String EXTRA_SCREEN = "extra_screen";
    public static final String SCREEN_WISHLIST = "wishlist";
    public static final String SCREEN_CART = "cart";
    public static final String SCREEN_ORDER_HISTORY = "order_history";
    public static final String SCREEN_RECENTLY_VIEWED = "recently_viewed";

    private final StoreRepository repository = StoreRepository.getInstance();
    private StorePrefs storePrefs;
    private StoreHistoryStore historyStore;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_secondary_host);

        storePrefs = StorePrefs.getInstance(this);
        historyStore = StoreHistoryStore.getInstance(this);

        MaterialToolbar toolbar = findViewById(R.id.secondary_toolbar);
        setSupportActionBar(toolbar);
        if (getSupportActionBar() != null) {
            getSupportActionBar().setDisplayHomeAsUpEnabled(true);
            getSupportActionBar().setDisplayShowHomeEnabled(true);
        }
        toolbar.setNavigationOnClickListener(v -> finish());

        if (savedInstanceState == null) {
            String screen = getIntent().getStringExtra(EXTRA_SCREEN);
            showScreen(screen);
        }
    }

    private void showScreen(String screen) {
        Fragment fragment;
        String title;
        String subtitle;

        if (SCREEN_CART.equals(screen)) {
            fragment = new CartFragment();
            title = "Cart";
            subtitle = "Items staged for live checkout";
        } else if (SCREEN_ORDER_HISTORY.equals(screen)) {
            fragment = new OrderHistoryFragment();
            title = "Recent checkouts";
            subtitle = "Checkout handoffs tracked locally";
        } else if (SCREEN_RECENTLY_VIEWED.equals(screen)) {
            fragment = new RecentlyViewedFragment();
            title = "Recently viewed";
            subtitle = "Products opened on this device";
        } else {
            fragment = new WishlistFragment();
            title = "Wishlist";
            subtitle = "Saved items to revisit later";
        }

        if (getSupportActionBar() != null) {
            getSupportActionBar().setTitle(title);
            getSupportActionBar().setSubtitle(subtitle);
        }

        getSupportFragmentManager()
                .beginTransaction()
                .replace(R.id.secondary_fragment_container, fragment)
                .commitNow();
    }

    public void openProductByHandle(String handle) {
        Intent intent = new Intent(this, com.saltonlinestore.saltstoreandroid.ProductDetailActivity.class);
        intent.putExtra(com.saltonlinestore.saltstoreandroid.ProductDetailActivity.EXTRA_HANDLE, handle);
        startActivity(intent);
    }

    public void openExternal(String url) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        startActivity(intent);
    }

    public StorePrefs prefs() {
        return storePrefs;
    }

    public void checkoutNow() {
        List<StoreCartEntry> entries = storePrefs.getCartEntries();
        if (entries.isEmpty()) {
            return;
        }

        String checkoutUrl = StoreUrls.checkoutUrl(entries);
        repository.loadCatalog(new StoreRepository.CatalogCallback() {
            @Override
            public void onSuccess(com.saltonlinestore.saltstoreandroid.model.StoreCatalog catalog) {
                historyStore.recordCheckout("cart", checkoutUrl, entries, catalog);
                openCheckoutInApp(checkoutUrl);
            }

            @Override
            public void onError(Throwable error) {
                openCheckoutInApp(checkoutUrl);
            }
        });
    }

    public void openCheckoutInApp(String url) {
        CheckoutWebViewActivity.open(this, url);
    }

    public void quickAddProduct(StoreProduct product) {
        if (product == null) {
            return;
        }

        StoreVariant variant = product.defaultVariant();
        if (variant == null || !variant.available) {
            Toast.makeText(this, "Sold out", Toast.LENGTH_SHORT).show();
            return;
        }

        storePrefs.setCartEntry(new StoreCartEntry(product.id, variant.id, 1));
        refreshStoreViews();
        Toast.makeText(this, product.title + " added to cart", Toast.LENGTH_SHORT).show();
    }

    public void refreshStoreViews() {
        Fragment fragment = getSupportFragmentManager().findFragmentById(R.id.secondary_fragment_container);
        if (fragment instanceof WishlistFragment wishlistFragment) {
            wishlistFragment.refreshData();
        } else if (fragment instanceof CartFragment cartFragment) {
            cartFragment.refreshData();
        } else if (fragment instanceof OrderHistoryFragment orderHistoryFragment) {
            orderHistoryFragment.refreshData();
        } else if (fragment instanceof RecentlyViewedFragment recentlyViewedFragment) {
            recentlyViewedFragment.refreshData();
        }
    }
}
