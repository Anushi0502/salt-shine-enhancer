package com.saltonlinestore.saltstoreandroid.ui.home;

import android.graphics.Paint;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.saltonlinestore.saltstoreandroid.R;
import com.saltonlinestore.saltstoreandroid.model.StoreProduct;
import com.saltonlinestore.saltstoreandroid.model.StoreVariant;
import com.saltonlinestore.saltstoreandroid.util.StoreFormat;
import com.squareup.picasso.Picasso;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class HomeRailAdapter extends RecyclerView.Adapter<HomeRailAdapter.RailViewHolder> {
    public interface OnProductClickListener {
        void onProductClick(StoreProduct product);
    }

    public interface OnQuickAddListener {
        void onQuickAdd(StoreProduct product);
    }

    private final List<StoreProduct> items = new ArrayList<>();
    private final OnProductClickListener clickListener;
    private final OnQuickAddListener quickAddListener;

    public HomeRailAdapter(OnProductClickListener clickListener, OnQuickAddListener quickAddListener) {
        this.clickListener = clickListener;
        this.quickAddListener = quickAddListener;
    }

    public void submit(List<StoreProduct> products) {
        items.clear();
        if (products != null) {
            items.addAll(products);
        }
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public RailViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_home_rail_product, parent, false);
        return new RailViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull RailViewHolder holder, int position) {
        holder.bind(items.get(position));
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    class RailViewHolder extends RecyclerView.ViewHolder {
        private final ImageView image;
        private final TextView vendor;
        private final TextView title;
        private final TextView badge;
        private final TextView price;
        private final TextView compareAt;
        private final TextView cta;

        RailViewHolder(@NonNull View itemView) {
            super(itemView);
            image = itemView.findViewById(R.id.home_rail_product_image);
            vendor = itemView.findViewById(R.id.home_rail_product_vendor);
            title = itemView.findViewById(R.id.home_rail_product_title);
            badge = itemView.findViewById(R.id.home_rail_product_badge);
            price = itemView.findViewById(R.id.home_rail_product_price);
            compareAt = itemView.findViewById(R.id.home_rail_product_compare_at);
            cta = itemView.findViewById(R.id.home_rail_product_cta);
        }

        void bind(StoreProduct product) {
            title.setText(product.title);
            bindVendor(product);

            StoreVariant variant = product.defaultVariant();
            boolean available = variant == null || variant.available;
            cta.setText(available ? "Add" : "Sold");
            cta.setEnabled(available);
            cta.setAlpha(available ? 1f : 0.45f);
            cta.setOnClickListener(available && quickAddListener != null ? v -> quickAddListener.onQuickAdd(product) : null);

            badge.setText(resolveBadge(product, variant));
            price.setText(variant == null ? "" : StoreFormat.moneyLabel(variant.price));

            String compareAtLabel = variant == null ? "" : StoreFormat.moneyLabel(variant.compareAtPrice);
            double current = StoreFormat.parseDouble(variant == null ? null : variant.price);
            double compare = StoreFormat.parseDouble(variant == null ? null : variant.compareAtPrice);
            if (compare > current && compare > 0d) {
                compareAt.setVisibility(View.VISIBLE);
                compareAt.setText(compareAtLabel);
                compareAt.setPaintFlags(compareAt.getPaintFlags() | Paint.STRIKE_THRU_TEXT_FLAG);
            } else {
                compareAt.setVisibility(View.GONE);
                compareAt.setText("");
            }

            String imageUrl = product.primaryImageUrl();
            if (imageUrl == null || imageUrl.trim().isEmpty()) {
                image.setImageResource(R.mipmap.ic_launcher_foreground);
            } else {
                Picasso.get().load(imageUrl).fit().centerCrop().placeholder(R.mipmap.ic_launcher_foreground).into(image);
            }

            itemView.setOnClickListener(v -> {
                if (clickListener != null) {
                    clickListener.onProductClick(product);
                }
            });
        }

        private void bindVendor(StoreProduct product) {
            String displayVendor = product.vendor == null ? "" : product.vendor.trim();
            if (displayVendor.isEmpty() || "SALT".equalsIgnoreCase(displayVendor)) {
                vendor.setVisibility(View.GONE);
                vendor.setText("");
                return;
            }

            vendor.setVisibility(View.VISIBLE);
            vendor.setText(displayVendor.toUpperCase(Locale.US));
        }

        private String resolveBadge(StoreProduct product, StoreVariant variant) {
            if (variant == null || !variant.available) {
                return "Sold out";
            }

            double current = StoreFormat.parseDouble(variant.price);
            double compare = StoreFormat.parseDouble(variant.compareAtPrice);
            if (compare > current && current > 0d) {
                return "Deal";
            }

            for (String tag : product.tags) {
                String normalizedTag = tag == null ? "" : tag.trim().toLowerCase(Locale.US);
                if (normalizedTag.contains("new")) {
                    return "New";
                }
                if (normalizedTag.contains("best") || normalizedTag.contains("top")) {
                    return "Top pick";
                }
            }

            return "Live";
        }
    }
}
