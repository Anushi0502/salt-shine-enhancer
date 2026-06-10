package com.saltonlinestore.saltstoreandroid.ui.home;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.PagerSnapHelper;
import androidx.recyclerview.widget.RecyclerView;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.card.MaterialCardView;
import com.saltonlinestore.saltstoreandroid.R;
import com.saltonlinestore.saltstoreandroid.model.StoreCollection;
import com.saltonlinestore.saltstoreandroid.model.StoreProduct;

import java.util.ArrayList;
import java.util.List;

public class HomeFeedAdapter extends RecyclerView.Adapter<RecyclerView.ViewHolder> {
    public interface HomeActionListener {
        void onSearch();
        void onShop();
        void onCart();
        void onWishlist();
        void onBrowse();
        void onOpenCollection(StoreCollection collection);
        void onOpenProduct(StoreProduct product);
        void onQuickAdd(StoreProduct product);
        void onOpenRecentlyViewed();
    }

    private static final int TYPE_HEADER = 0;
    private static final int TYPE_BANNER = 1;
    private static final int TYPE_RAIL = 2;
    private static final int TYPE_RECENTLY_VIEWED = 3;

    private final List<HomeFeedSection> sections = new ArrayList<>();
    private final HomeActionListener listener;
    private final RecyclerView.RecycledViewPool sharedViewPool = new RecyclerView.RecycledViewPool();

    public HomeFeedAdapter(HomeActionListener listener) {
        this.listener = listener;
        setHasStableIds(true);
    }

    public void submitSections(List<HomeFeedSection> nextSections) {
        sections.clear();
        if (nextSections != null) {
            sections.addAll(nextSections);
        }
        notifyDataSetChanged();
    }

    public List<HomeFeedSection> sections() {
        return new ArrayList<>(sections);
    }

    @Override
    public long getItemId(int position) {
        HomeFeedSection section = sections.get(position);
        String key = section.type.name() + "|" + section.title + "|" + section.subtitle;
        if (section.collection != null) {
            key += "|" + section.collection.handle;
        }
        return key.hashCode();
    }

    @Override
    public int getItemViewType(int position) {
        HomeFeedSection.Type type = sections.get(position).type;
        if (type == HomeFeedSection.Type.HEADER) {
            return TYPE_HEADER;
        }
        if (type == HomeFeedSection.Type.BANNER_CAROUSEL) {
            return TYPE_BANNER;
        }
        if (type == HomeFeedSection.Type.RECENTLY_VIEWED) {
            return TYPE_RECENTLY_VIEWED;
        }
        return TYPE_RAIL;
    }

    @NonNull
    @Override
    public RecyclerView.ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        LayoutInflater inflater = LayoutInflater.from(parent.getContext());
        if (viewType == TYPE_HEADER) {
            return new HeaderViewHolder(inflater.inflate(R.layout.item_home_header, parent, false));
        }
        if (viewType == TYPE_BANNER) {
            return new BannerSectionViewHolder(inflater.inflate(R.layout.item_home_banner_section, parent, false));
        }
        return new RailSectionViewHolder(inflater.inflate(R.layout.item_home_rail_section, parent, false));
    }

    @Override
    public void onBindViewHolder(@NonNull RecyclerView.ViewHolder holder, int position) {
        HomeFeedSection section = sections.get(position);
        if (holder instanceof HeaderViewHolder headerViewHolder) {
            headerViewHolder.bind(section);
        } else if (holder instanceof BannerSectionViewHolder bannerSectionViewHolder) {
            bannerSectionViewHolder.bind(section);
        } else if (holder instanceof RailSectionViewHolder railSectionViewHolder) {
            railSectionViewHolder.bind(section);
        }
    }

    @Override
    public int getItemCount() {
        return sections.size();
    }

    class HeaderViewHolder extends RecyclerView.ViewHolder {
        private final TextView title;
        private final TextView subtitle;
        private final TextView counts;
        private final MaterialCardView searchCard;
        private final MaterialButton shopButton;
        private final MaterialButton cartButton;
        private final MaterialButton wishlistButton;
        private final MaterialButton browseButton;

        HeaderViewHolder(@NonNull View itemView) {
            super(itemView);
            title = itemView.findViewById(R.id.home_header_title);
            subtitle = itemView.findViewById(R.id.home_header_subtitle);
            counts = itemView.findViewById(R.id.home_header_counts);
            searchCard = itemView.findViewById(R.id.home_header_search_card);
            shopButton = itemView.findViewById(R.id.home_header_shop);
            cartButton = itemView.findViewById(R.id.home_header_cart);
            wishlistButton = itemView.findViewById(R.id.home_header_wishlist);
            browseButton = itemView.findViewById(R.id.home_header_browse);
        }

        void bind(HomeFeedSection section) {
            title.setText(section.title);
            subtitle.setText(section.subtitle);
            counts.setText(section.productCount + " products · " + section.collectionCount + " collections · " + section.cartCount + " in cart");

            searchCard.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onSearch();
                }
            });
            shopButton.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onShop();
                }
            });
            cartButton.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onCart();
                }
            });
            wishlistButton.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onWishlist();
                }
            });
            browseButton.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onBrowse();
                }
            });
        }
    }

    class BannerSectionViewHolder extends RecyclerView.ViewHolder {
        private final TextView title;
        private final TextView subtitle;
        private final RecyclerView bannerList;
        private final HomeBannerAdapter bannerAdapter;

        BannerSectionViewHolder(@NonNull View itemView) {
            super(itemView);
            title = itemView.findViewById(R.id.home_banner_section_title);
            subtitle = itemView.findViewById(R.id.home_banner_section_subtitle);
            bannerList = itemView.findViewById(R.id.home_banner_list);
            bannerAdapter = new HomeBannerAdapter(item -> {
                if (listener != null && item.collectionHandle != null && !item.collectionHandle.trim().isEmpty()) {
                    listener.onOpenCollection(new StoreCollection(0L, item.collectionTitle, item.collectionHandle, "", item.imageUrl, 0));
                }
            });

            LinearLayoutManager layoutManager = new LinearLayoutManager(itemView.getContext(), LinearLayoutManager.HORIZONTAL, false);
            bannerList.setLayoutManager(layoutManager);
            bannerList.setAdapter(bannerAdapter);
            bannerList.setRecycledViewPool(sharedViewPool);
            bannerList.setNestedScrollingEnabled(false);
            bannerList.setOverScrollMode(View.OVER_SCROLL_NEVER);
            new PagerSnapHelper().attachToRecyclerView(bannerList);
        }

        void bind(HomeFeedSection section) {
            title.setText(section.title);
            subtitle.setText(section.subtitle);
            bannerAdapter.submit(section.banners);
        }
    }

    class RailSectionViewHolder extends RecyclerView.ViewHolder {
        private final TextView title;
        private final TextView subtitle;
        private final TextView action;
        private final RecyclerView productList;
        private final HomeRailAdapter railAdapter;

        RailSectionViewHolder(@NonNull View itemView) {
            super(itemView);
            title = itemView.findViewById(R.id.home_rail_section_title);
            subtitle = itemView.findViewById(R.id.home_rail_section_subtitle);
            action = itemView.findViewById(R.id.home_rail_section_action);
            productList = itemView.findViewById(R.id.home_rail_list);
            railAdapter = new HomeRailAdapter(product -> {
                if (listener != null) {
                    listener.onOpenProduct(product);
                }
            }, product -> {
                if (listener != null) {
                    listener.onQuickAdd(product);
                }
            });

            LinearLayoutManager layoutManager = new LinearLayoutManager(itemView.getContext(), LinearLayoutManager.HORIZONTAL, false);
            productList.setLayoutManager(layoutManager);
            productList.setAdapter(railAdapter);
            productList.setRecycledViewPool(sharedViewPool);
            productList.setNestedScrollingEnabled(false);
            productList.setOverScrollMode(View.OVER_SCROLL_NEVER);
        }

        void bind(HomeFeedSection section) {
            title.setText(section.title);
            subtitle.setText(section.subtitle);
            railAdapter.submit(section.products);

            if (section.type == HomeFeedSection.Type.RECENTLY_VIEWED) {
                action.setText("Open list");
                action.setOnClickListener(v -> {
                    if (listener != null) {
                        listener.onOpenRecentlyViewed();
                    }
                });
            } else if (section.collection != null) {
                action.setText("See all");
                action.setOnClickListener(v -> {
                    if (listener != null) {
                        listener.onOpenCollection(section.collection);
                    }
                });
            } else {
                action.setText("");
                action.setOnClickListener(null);
            }
        }
    }
}
