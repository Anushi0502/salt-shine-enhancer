package com.saltonlinestore.saltstoreandroid.ui.adapter;

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

public class ProductAdapter extends RecyclerView.Adapter<ProductAdapter.ProductViewHolder> {
    public interface OnProductClickListener {
        void onProductClick(StoreProduct product);
    }

    public interface OnQuickAddListener {
        void onQuickAdd(StoreProduct product);
    }

    private final List<StoreProduct> items = new ArrayList<>();
    private final OnProductClickListener listener;
    private final OnQuickAddListener quickAddListener;

    public ProductAdapter(OnProductClickListener listener) {
        this(listener, null);
    }

    public ProductAdapter(OnProductClickListener listener, OnQuickAddListener quickAddListener) {
        this.listener = listener;
        this.quickAddListener = quickAddListener;
    }

    public void submit(List<StoreProduct> products) {
        items.clear();
        if (products != null) {
            items.addAll(products);
        }
        notifyDataSetChanged();
    }

    public List<StoreProduct> items() {
        return new ArrayList<>(items);
    }

    @NonNull
    @Override
    public ProductViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_product_card, parent, false);
        return new ProductViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull ProductViewHolder holder, int position) {
        StoreProduct product = items.get(position);
        holder.bind(product);
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    class ProductViewHolder extends RecyclerView.ViewHolder {
        private final ImageView image;
        private final TextView vendor;
        private final TextView title;
        private final TextView meta;
        private final TextView price;
        private final TextView compareAt;
        private final TextView badge;
        private final TextView cta;

        ProductViewHolder(@NonNull View itemView) {
            super(itemView);
            image = itemView.findViewById(R.id.product_image);
            badge = itemView.findViewById(R.id.product_badge);
            vendor = itemView.findViewById(R.id.product_vendor);
            title = itemView.findViewById(R.id.product_title);
            meta = itemView.findViewById(R.id.product_meta);
            price = itemView.findViewById(R.id.product_price);
            compareAt = itemView.findViewById(R.id.product_compare_at);
            cta = itemView.findViewById(R.id.product_cta);
        }

        void bind(StoreProduct product) {
            bindVendor(product);
            title.setText(product.title);

            StoreVariant variant = product.defaultVariant();
            String priceLabel = variant == null ? "" : StoreFormat.moneyLabel(variant.price);
            price.setText(priceLabel);
            boolean available = variant == null || variant.available;
            cta.setText(available ? "Add" : "Sold");
            cta.setEnabled(available);
            cta.setAlpha(available ? 1f : 0.45f);
            cta.setOnClickListener(available && quickAddListener != null ? v -> quickAddListener.onQuickAdd(product) : null);
            badge.setText(resolveBadge(product, variant));
            String metaLabel = resolveMeta(product, variant);
            if (metaLabel.isEmpty()) {
                meta.setVisibility(View.GONE);
                meta.setText("");
            } else {
                meta.setVisibility(View.VISIBLE);
                meta.setText(metaLabel);
            }

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
            if (imageUrl == null || imageUrl.isEmpty()) {
                image.setImageResource(R.mipmap.ic_launcher_foreground);
            } else {
                Picasso.get().load(imageUrl).fit().centerCrop().placeholder(R.mipmap.ic_launcher_foreground).into(image);
            }

            itemView.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onProductClick(product);
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
                return "SOLD OUT";
            }

            double current = StoreFormat.parseDouble(variant.price);
            double compare = StoreFormat.parseDouble(variant.compareAtPrice);
            if (compare > current && current > 0d) {
                return "DEAL";
            }

            for (String tag : product.tags) {
                String normalizedTag = tag == null ? "" : tag.trim().toLowerCase(Locale.US);
                if (normalizedTag.contains("new")) {
                    return "NEW";
                }
                if (normalizedTag.contains("best") || normalizedTag.contains("top")) {
                    return "TOP PICK";
                }
                if (normalizedTag.contains("sale") || normalizedTag.contains("deal") || normalizedTag.contains("offer")) {
                    return "DEAL";
                }
            }

            return "LIVE";
        }

        private String resolveMeta(StoreProduct product, StoreVariant variant) {
            double current = StoreFormat.parseDouble(variant == null ? null : variant.price);
            double compare = StoreFormat.parseDouble(variant == null ? null : variant.compareAtPrice);
            if (compare > current && current > 0d) {
                double discount = 100d - ((current / compare) * 100d);
                if (discount > 0d) {
                    return "Save " + Math.round(discount) + "%";
                }
            }

            if (product.productType != null && !product.productType.trim().isEmpty()) {
                return product.productType.trim();
            }

            String summary = StoreFormat.stripHtml(product.bodyHtml);
            if (summary.isEmpty()) {
                return "";
            }
            return StoreFormat.ellipsize(summary, 56);
        }
    }
}
