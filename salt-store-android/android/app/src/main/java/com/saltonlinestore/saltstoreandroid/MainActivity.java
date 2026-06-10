package com.saltonlinestore.saltstoreandroid;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.ImageView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.core.splashscreen.SplashScreen;
import androidx.fragment.app.Fragment;
import androidx.fragment.app.FragmentTransaction;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.getcapacitor.BridgeActivity;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.bottomnavigation.BottomNavigationView;
import com.google.android.material.textfield.TextInputEditText;
import com.squareup.picasso.Picasso;
import com.saltonlinestore.saltstoreandroid.data.StoreHistoryStore;
import com.saltonlinestore.saltstoreandroid.data.StorePrefs;
import com.saltonlinestore.saltstoreandroid.data.StoreRepository;
import com.saltonlinestore.saltstoreandroid.model.StoreCartEntry;
import com.saltonlinestore.saltstoreandroid.model.StoreCollection;
import com.saltonlinestore.saltstoreandroid.model.StoreProduct;
import com.saltonlinestore.saltstoreandroid.model.StoreVariant;
import com.saltonlinestore.saltstoreandroid.ui.home.HomeBannerAdapter;
import com.saltonlinestore.saltstoreandroid.ui.home.HomeFeedComposer;
import com.saltonlinestore.saltstoreandroid.ui.home.HomeFeedSection;
import com.saltonlinestore.saltstoreandroid.ui.BrowseSheetFragment;
import com.saltonlinestore.saltstoreandroid.ui.CollectionsFragment;
import com.saltonlinestore.saltstoreandroid.ui.ContactSupportSheetFragment;
import com.saltonlinestore.saltstoreandroid.ui.HomeFragment;
import com.saltonlinestore.saltstoreandroid.ui.MoreFragment;
import com.saltonlinestore.saltstoreandroid.ui.ShopFragment;
import com.saltonlinestore.saltstoreandroid.ui.secondary.SecondaryHostActivity;
import com.saltonlinestore.saltstoreandroid.ui.checkout.CheckoutWebViewActivity;
import com.saltonlinestore.saltstoreandroid.ui.content.ContentWebViewActivity;
import com.saltonlinestore.saltstoreandroid.ui.policy.NativePolicyActivity;
import com.saltonlinestore.saltstoreandroid.util.StoreUrls;

import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final String TAG_HOME = "home";
    private static final String TAG_SHOP = "shop";
    private static final String TAG_COLLECTIONS = "collections";
    private static final String TAG_SUPPORT = "support";

    private ImageView shellBrand;
    private RecyclerView shellBannerList;
    private TextInputEditText headerSearchInput;
    private MaterialButton headerCartButton;
    private MaterialButton headerBrowseButton;
    private BottomNavigationView bottomNavigationView;
    private final Handler headerSearchHandler = new Handler(Looper.getMainLooper());
    private final StoreRepository repository = StoreRepository.getInstance();
    private final HomeFeedComposer homeFeedComposer = new HomeFeedComposer();
    private StoreHistoryStore historyStore;
    private StorePrefs storePrefs;
    private HomeBannerAdapter shellBannerAdapter;
    private String pendingHeaderSearchQuery = "";
    private boolean homeFeedAtTop = true;

    private HomeFragment homeFragment;
    private ShopFragment shopFragment;
    private CollectionsFragment collectionsFragment;
    private MoreFragment supportFragment;

    private int activeTab = R.id.nav_home;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        storePrefs = StorePrefs.getInstance(this);
        historyStore = StoreHistoryStore.getInstance(this);

        shellBrand = findViewById(R.id.shell_brand);
        shellBannerList = findViewById(R.id.shell_banner_list);
        headerSearchInput = findViewById(R.id.header_search_input);
        headerCartButton = findViewById(R.id.header_cart_button);
        headerBrowseButton = findViewById(R.id.header_browse_button);
        bottomNavigationView = findViewById(R.id.bottom_navigation);

        Picasso.get()
                .load("file:///android_asset/public/brand/salt-logo.png")
                .fit()
                .centerInside()
                .into(shellBrand);
        headerCartButton.setOnClickListener(v -> openSecondaryScreen(SecondaryHostActivity.SCREEN_CART));
        headerBrowseButton.setOnClickListener(v -> openBrowseSheet());
        headerSearchInput.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                pendingHeaderSearchQuery = s == null ? "" : s.toString();
                headerSearchHandler.removeCallbacksAndMessages(null);
                headerSearchHandler.postDelayed(() -> applyHeaderSearchQuery(pendingHeaderSearchQuery), 220);
            }

            @Override
            public void afterTextChanged(Editable s) {}
        });
        headerSearchInput.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                applyHeaderSearchQuery(String.valueOf(v.getText() == null ? "" : v.getText()));
                return true;
            }
            return false;
        });
        headerSearchInput.setOnFocusChangeListener((v, hasFocus) -> {
            if (hasFocus) {
                switchTab(R.id.nav_shop, true);
            }
        });

        shellBannerAdapter = new HomeBannerAdapter(item -> {
            if (item.collectionHandle != null && !item.collectionHandle.trim().isEmpty()) {
                openCollection(item.collectionHandle);
            }
        });
        shellBannerList.setLayoutManager(new LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false));
        shellBannerList.setAdapter(shellBannerAdapter);
        shellBannerList.setNestedScrollingEnabled(false);
        shellBannerList.setOverScrollMode(View.OVER_SCROLL_NEVER);

        bottomNavigationView.setItemActiveIndicatorEnabled(true);
        bottomNavigationView.setItemActiveIndicatorColor(ContextCompat.getColorStateList(this, R.color.salt_teal));
        bottomNavigationView.setOnItemSelectedListener(item -> {
            switchTab(item.getItemId(), false);
            return true;
        });

        initializeFragments();
        String restoredHeaderQuery = String.valueOf(headerSearchInput.getText() == null ? "" : headerSearchInput.getText());
        if (!restoredHeaderQuery.trim().isEmpty()) {
            applyHeaderSearchQuery(restoredHeaderQuery);
        }
        refreshShellChrome();
        switchTab(activeTab, true);
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        refreshLiveContent();
    }

    private void initializeFragments() {
        Fragment existingHome = getSupportFragmentManager().findFragmentByTag(TAG_HOME);
        if (existingHome instanceof HomeFragment) {
            homeFragment = (HomeFragment) existingHome;
            shopFragment = (ShopFragment) getSupportFragmentManager().findFragmentByTag(TAG_SHOP);
            collectionsFragment = (CollectionsFragment) getSupportFragmentManager().findFragmentByTag(TAG_COLLECTIONS);
            supportFragment = (MoreFragment) getSupportFragmentManager().findFragmentByTag(TAG_SUPPORT);
            return;
        }

        homeFragment = new HomeFragment();
        shopFragment = new ShopFragment();
        collectionsFragment = new CollectionsFragment();
        supportFragment = new MoreFragment();

        FragmentTransaction transaction = getSupportFragmentManager().beginTransaction();
        transaction.add(R.id.fragment_container, homeFragment, TAG_HOME);
        transaction.add(R.id.fragment_container, shopFragment, TAG_SHOP).hide(shopFragment);
        transaction.add(R.id.fragment_container, collectionsFragment, TAG_COLLECTIONS).hide(collectionsFragment);
        transaction.add(R.id.fragment_container, supportFragment, TAG_SUPPORT).hide(supportFragment);
        transaction.commitNow();
    }

    private void switchTab(int menuId, boolean updateSelection) {
        if (homeFragment == null || shopFragment == null || collectionsFragment == null || supportFragment == null) {
            return;
        }

        Fragment target = fragmentForMenu(menuId);
        if (target == null) {
            target = homeFragment;
            menuId = R.id.nav_home;
        }

        FragmentTransaction transaction = getSupportFragmentManager().beginTransaction();
        transaction.hide(homeFragment);
        transaction.hide(shopFragment);
        transaction.hide(collectionsFragment);
        transaction.hide(supportFragment);
        transaction.show(target);
        transaction.commit();

        activeTab = menuId;
        updateShellForTab(menuId);

        if (updateSelection && bottomNavigationView.getSelectedItemId() != menuId) {
            bottomNavigationView.setSelectedItemId(menuId);
        }

        if (menuId == R.id.nav_home) {
            refreshShellChrome();
        }
    }

    private Fragment fragmentForMenu(int menuId) {
        if (menuId == R.id.nav_shop) {
            return shopFragment;
        }
        if (menuId == R.id.nav_collections) {
            return collectionsFragment;
        }
        if (menuId == R.id.nav_support) {
            return supportFragment;
        }
        return homeFragment;
    }

    private void updateShellForTab(int menuId) {
        setShellBannerVisible(menuId == R.id.nav_home && homeFeedAtTop);
    }

    public void setHomeFeedAtTop(boolean atTop) {
        homeFeedAtTop = atTop;
        updateShellForTab(activeTab);
    }

    private void setShellBannerVisible(boolean visible) {
        if (shellBannerList == null) {
            return;
        }

        int targetVisibility = visible ? View.VISIBLE : View.GONE;
        if (shellBannerList.getVisibility() == targetVisibility) {
            return;
        }

        shellBannerList.animate().cancel();
        shellBannerList.setAlpha(visible ? 1f : 0f);
        shellBannerList.setVisibility(targetVisibility);
    }

    public void openProductByHandle(String handle) {
        Intent intent = new Intent(this, ProductDetailActivity.class);
        intent.putExtra(ProductDetailActivity.EXTRA_HANDLE, handle);
        startActivity(intent);
    }

    public void openCollection(String handle) {
        if (shopFragment == null) {
            return;
        }
        switchTab(R.id.nav_shop, true);
        shopFragment.showCollection(handle);
    }

    public void openCollection(StoreCollection collection) {
        if (shopFragment == null || collection == null) {
            return;
        }
        switchTab(R.id.nav_shop, true);
        shopFragment.showCollection(collection.handle, collection.title);
    }

    public void goToTab(int menuId) {
        switchTab(menuId, true);
    }

    public void openShopAndFocusSearch() {
        switchTab(R.id.nav_shop, true);
        focusHeaderSearch();
    }

    private void applyHeaderSearchQuery(String query) {
        String normalized = query == null ? "" : query.trim();
        if (shopFragment == null) {
            return;
        }

        switchTab(R.id.nav_shop, true);
        shopFragment.setSearchQuery(normalized);
        if (normalized.isEmpty()) {
            focusHeaderSearch();
        }
    }

    public void focusHeaderSearch() {
        if (headerSearchInput == null) {
            return;
        }

        headerSearchInput.requestFocus();
        headerSearchInput.post(() -> {
            CharSequence text = headerSearchInput.getText();
            int length = text == null ? 0 : text.length();
            headerSearchInput.setSelection(length);
        });
    }

    public void openBrowseSheet() {
        new BrowseSheetFragment().show(getSupportFragmentManager(), "browse_sheet");
    }

    public void openSupportContactSheet() {
        new ContactSupportSheetFragment().show(getSupportFragmentManager(), "contact_support_sheet");
    }

    public void openSecondaryScreen(String screen) {
        Intent intent = new Intent(this, SecondaryHostActivity.class);
        intent.putExtra(SecondaryHostActivity.EXTRA_SCREEN, screen);
        startActivity(intent);
    }

    public void addToCart(long productId, long variantId, int quantity) {
        storePrefs.setCartEntry(new StoreCartEntry(productId, variantId, Math.max(1, quantity)));
        refreshStoreViews();
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

        addToCart(product.id, variant.id, 1);
        Toast.makeText(this, product.title + " added to cart", Toast.LENGTH_SHORT).show();
    }

    public void toggleWishlist(long productId) {
        storePrefs.toggleWishlist(productId);
        refreshStoreViews();
    }

    public boolean isWishlisted(long productId) {
        return storePrefs.isWishlisted(productId);
    }

    public List<StoreCartEntry> cartEntries() {
        return storePrefs.getCartEntries();
    }

    public StoreRepository repository() {
        return repository;
    }

    public StorePrefs prefs() {
        return storePrefs;
    }

    public void checkoutNow() {
        List<StoreCartEntry> entries = storePrefs.getCartEntries();
        if (entries.isEmpty()) {
            Toast.makeText(this, "Cart is empty", Toast.LENGTH_SHORT).show();
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

    public void openInAppContent(@NonNull String title, @NonNull String subtitle, @NonNull String url) {
        ContentWebViewActivity.open(this, title, subtitle, url);
    }

    public void openExternal(String url) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        startActivity(intent);
    }

    public void refreshStoreViews() {
        if (homeFragment == null || shopFragment == null || collectionsFragment == null || supportFragment == null) {
            return;
        }

        homeFragment.refreshData();
        shopFragment.refreshData();
        collectionsFragment.refreshData();
        supportFragment.refreshData();
        updateShellForTab(activeTab);
    }

    public void refreshLiveContent() {
        refreshStoreViews();
        refreshShellChrome();
    }

    private void refreshShellChrome() {
        if (shellBannerAdapter == null) {
            return;
        }

        repository.loadCatalog(new StoreRepository.CatalogCallback() {
            @Override
            public void onSuccess(com.saltonlinestore.saltstoreandroid.model.StoreCatalog catalog) {
                List<HomeFeedSection.BannerItem> banners = homeFeedComposer.buildHeroBanners(catalog, null);
                if (banners == null || banners.isEmpty()) {
                    shellBannerAdapter.submit(java.util.Collections.emptyList());
                    return;
                }
                shellBannerAdapter.submit(banners);
            }

            @Override
            public void onError(Throwable error) {
                shellBannerAdapter.submit(java.util.Collections.emptyList());
            }
        });
    }

    private void handleIntent(Intent intent) {
        if (intent == null || intent.getData() == null) {
            return;
        }

        Uri uri = intent.getData();
        String path = uri.getPath() == null ? "" : uri.getPath();
        String host = uri.getHost() == null ? "" : uri.getHost();
        String normalizedPath = path.toLowerCase();

        if (normalizedPath.contains("/products/") || normalizedPath.contains("/product/") || host.equalsIgnoreCase("product") || host.equalsIgnoreCase("products")) {
            String[] parts = path.split("/");
            String handle = parts.length > 0 ? parts[parts.length - 1] : "";
            if (!handle.isEmpty()) {
                openProductByHandle(handle);
                return;
            }
        }

        if ((host.contains("saltonlinestore.com") && normalizedPath.startsWith("/cart")) || host.equalsIgnoreCase("cart")) {
            openSecondaryScreen(SecondaryHostActivity.SCREEN_CART);
            return;
        }

        if (normalizedPath.startsWith("/wishlist") || host.equalsIgnoreCase("wishlist")) {
            openSecondaryScreen(SecondaryHostActivity.SCREEN_WISHLIST);
            return;
        }

        if (normalizedPath.startsWith("/order-history") || normalizedPath.startsWith("/account/orders") || host.equalsIgnoreCase("order-history")) {
            openSecondaryScreen(SecondaryHostActivity.SCREEN_ORDER_HISTORY);
            return;
        }

        if (normalizedPath.startsWith("/recently-viewed") || host.equalsIgnoreCase("recently-viewed")) {
            openSecondaryScreen(SecondaryHostActivity.SCREEN_RECENTLY_VIEWED);
            return;
        }

        if (normalizedPath.startsWith("/policies/shipping-policy")) {
            NativePolicyActivity.open(this, "Shipping & delivery", "See shipping and fulfillment terms", StoreUrls.shippingPolicyUrl());
            return;
        }

        if (normalizedPath.startsWith("/policies/refund-policy")) {
            NativePolicyActivity.open(this, "Returns & refunds", "Open the refund policy page", StoreUrls.refundPolicyUrl());
            return;
        }

        if (normalizedPath.startsWith("/policies/privacy-policy")) {
            NativePolicyActivity.open(this, "Privacy policy", "View app and store privacy language", StoreUrls.privacyPolicyUrl());
            return;
        }

        if (normalizedPath.startsWith("/policies/contact-information")) {
            openSupportContactSheet();
            return;
        }

        if (normalizedPath.startsWith("/blog") || normalizedPath.startsWith("/blogs")) {
            switchTab(R.id.nav_home, true);
            return;
        }

        if (normalizedPath.startsWith("/collections")) {
            String[] parts = path.split("/");
            if (parts.length >= 3 && !parts[2].isEmpty()) {
                openCollection(parts[2]);
            } else {
                switchTab(R.id.nav_collections, true);
            }
            return;
        }

        if (normalizedPath.startsWith("/support")) {
            switchTab(R.id.nav_support, true);
            return;
        }

        if (normalizedPath.startsWith("/contact")) {
            openSupportContactSheet();
            return;
        }

        if (normalizedPath.startsWith("/shop") || host.equalsIgnoreCase("shop")) {
            switchTab(R.id.nav_shop, true);
        }
    }
}
