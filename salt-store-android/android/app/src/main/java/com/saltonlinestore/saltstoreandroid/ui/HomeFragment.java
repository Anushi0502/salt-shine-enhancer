package com.saltonlinestore.saltstoreandroid.ui;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.saltonlinestore.saltstoreandroid.MainActivity;
import com.saltonlinestore.saltstoreandroid.R;
import com.saltonlinestore.saltstoreandroid.data.StoreHistoryStore;
import com.saltonlinestore.saltstoreandroid.data.StorePrefs;
import com.saltonlinestore.saltstoreandroid.data.StoreRepository;
import com.saltonlinestore.saltstoreandroid.model.StoreCatalog;
import com.saltonlinestore.saltstoreandroid.model.StoreCollection;
import com.saltonlinestore.saltstoreandroid.model.StoreProduct;
import com.saltonlinestore.saltstoreandroid.ui.home.HomeFeedAdapter;
import com.saltonlinestore.saltstoreandroid.ui.home.HomeFeedComposer;
import com.saltonlinestore.saltstoreandroid.ui.home.HomeFeedSection;
import com.saltonlinestore.saltstoreandroid.ui.secondary.SecondaryHostActivity;

import java.util.ArrayList;
import java.util.List;

public class HomeFragment extends Fragment {
    private final StoreRepository repository = StoreRepository.getInstance();
    private final HomeFeedComposer composer = new HomeFeedComposer();

    private RecyclerView homeFeed;
    private HomeFeedAdapter feedAdapter;
    private StorePrefs prefs;
    private StoreHistoryStore historyStore;
    private List<HomeFeedSection> currentSections = new ArrayList<>();
    private int refreshGeneration = 0;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_home, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        prefs = StorePrefs.getInstance(requireContext());
        historyStore = StoreHistoryStore.getInstance(requireContext());

        homeFeed = view.findViewById(R.id.home_feed);
        feedAdapter = new HomeFeedAdapter(new HomeFeedAdapter.HomeActionListener() {
            @Override
            public void onSearch() {
                ((MainActivity) requireActivity()).openShopAndFocusSearch();
            }

            @Override
            public void onShop() {
                ((MainActivity) requireActivity()).goToTab(R.id.nav_shop);
            }

            @Override
            public void onCart() {
                ((MainActivity) requireActivity()).openSecondaryScreen(SecondaryHostActivity.SCREEN_CART);
            }

            @Override
            public void onWishlist() {
                ((MainActivity) requireActivity()).openSecondaryScreen(SecondaryHostActivity.SCREEN_WISHLIST);
            }

            @Override
            public void onBrowse() {
                ((MainActivity) requireActivity()).openBrowseSheet();
            }

            @Override
            public void onOpenCollection(StoreCollection collection) {
                ((MainActivity) requireActivity()).openCollection(collection);
            }

            @Override
            public void onOpenProduct(StoreProduct product) {
                ((MainActivity) requireActivity()).openProductByHandle(product.handle);
            }

            @Override
            public void onQuickAdd(StoreProduct product) {
                ((MainActivity) requireActivity()).quickAddProduct(product);
            }

            @Override
            public void onOpenRecentlyViewed() {
                ((MainActivity) requireActivity()).openSecondaryScreen(SecondaryHostActivity.SCREEN_RECENTLY_VIEWED);
            }
        });

        homeFeed.setLayoutManager(new LinearLayoutManager(requireContext(), LinearLayoutManager.VERTICAL, false));
        homeFeed.setAdapter(feedAdapter);
        homeFeed.setNestedScrollingEnabled(false);
        homeFeed.setItemAnimator(null);
        homeFeed.addOnScrollListener(new RecyclerView.OnScrollListener() {
            @Override
            public void onScrolled(@NonNull RecyclerView recyclerView, int dx, int dy) {
                publishHomeScrollState();
            }
        });

        refreshData();
        homeFeed.post(this::publishHomeScrollState);
    }

    public void refreshData() {
        if (!isAdded()) {
            return;
        }

        final int generation = ++refreshGeneration;
        repository.loadCatalog(new StoreRepository.CatalogCallback() {
            @Override
            public void onSuccess(StoreCatalog catalog) {
                if (!isAdded() || generation != refreshGeneration) {
                    return;
                }

                List<StoreProduct> recentlyViewed = historyStore.resolveRecentlyViewedProducts(catalog);

                List<HomeFeedSection> sections = new ArrayList<>(composer.compose(catalog, null, recentlyViewed));
                currentSections = sections;
                feedAdapter.submitSections(sections);
                resolveSparseRails(catalog, sections, generation);
                if (homeFeed != null) {
                    homeFeed.post(() -> publishHomeScrollState());
                }
            }

            @Override
            public void onError(Throwable error) {
                if (!isAdded() || generation != refreshGeneration) {
                    return;
                }

                currentSections = new ArrayList<>();
                feedAdapter.submitSections(currentSections);
                if (homeFeed != null) {
                    homeFeed.post(() -> publishHomeScrollState());
                }
            }
        });
    }

    private void publishHomeScrollState() {
        if (!isAdded() || homeFeed == null) {
            return;
        }

        ((MainActivity) requireActivity()).setHomeFeedAtTop(!homeFeed.canScrollVertically(-1));
    }

    private void resolveSparseRails(StoreCatalog catalog, List<HomeFeedSection> sections, int generation) {
        for (int index = 0; index < sections.size(); index++) {
            HomeFeedSection section = sections.get(index);
            if (section.type != HomeFeedSection.Type.COLLECTION_RAIL || !section.needsLiveFallback || section.collection == null) {
                continue;
            }

            final int sectionIndex = index;
            repository.loadCollectionProducts(section.collection.handle, new StoreRepository.ProductsCallback() {
                @Override
                public void onSuccess(List<StoreProduct> products) {
                    if (!isAdded() || generation != refreshGeneration) {
                        return;
                    }

                    List<StoreProduct> topProducts = new ArrayList<>();
                    if (products != null) {
                        topProducts.addAll(products.subList(0, Math.min(20, products.size())));
                    }

                    List<HomeFeedSection> nextSections = new ArrayList<>(currentSections);
                    if (sectionIndex < nextSections.size()) {
                        nextSections.set(sectionIndex, section.withProducts(topProducts, false));
                        currentSections = nextSections;
                        feedAdapter.submitSections(nextSections);
                    }
                }

                @Override
                public void onError(Throwable error) {
                    // Leave the live rail as composed from the current Shopify catalog.
                }
            });
        }
    }
}
