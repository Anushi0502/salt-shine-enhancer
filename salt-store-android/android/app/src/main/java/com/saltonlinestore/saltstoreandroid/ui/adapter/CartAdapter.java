package com.saltonlinestore.saltstoreandroid.ui.adapter;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.saltonlinestore.saltstoreandroid.R;
import com.saltonlinestore.saltstoreandroid.data.StorePrefs;
import com.saltonlinestore.saltstoreandroid.model.StoreCartEntry;
import com.saltonlinestore.saltstoreandroid.model.StoreProduct;
import com.saltonlinestore.saltstoreandroid.model.StoreVariant;
import com.saltonlinestore.saltstoreandroid.util.StoreFormat;
import com.squareup.picasso.Picasso;

import java.util.ArrayList;
import java.util.List;

public class CartAdapter extends RecyclerView.Adapter<CartAdapter.CartViewHolder> {
    public static class CartRow {
        public final StoreProduct product;
        public final StoreCartEntry entry;

        public CartRow(StoreProduct product, StoreCartEntry entry) {
            this.product = product;
            this.entry = entry;
        }
    }

    public interface OnCartActionListener {
        void onIncrease(CartRow row);
        void onDecrease(CartRow row);
        void onRemove(CartRow row);
        void onOpen(CartRow row);
    }

    private final List<CartRow> items = new ArrayList<>();
    private final OnCartActionListener listener;

    public CartAdapter(OnCartActionListener listener) {
        this.listener = listener;
    }

    public void submit(List<CartRow> rows) {
        items.clear();
        if (rows != null) {
            items.addAll(rows);
        }
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public CartViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_cart_entry, parent, false);
        return new CartViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull CartViewHolder holder, int position) {
        holder.bind(items.get(position));
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    class CartViewHolder extends RecyclerView.ViewHolder {
        private final ImageView image;
        private final TextView title;
        private final TextView variant;
        private final TextView price;
        private final TextView quantity;
        private final ImageButton increase;
        private final ImageButton decrease;
        private final ImageButton remove;

        CartViewHolder(@NonNull View itemView) {
            super(itemView);
            image = itemView.findViewById(R.id.cart_image);
            title = itemView.findViewById(R.id.cart_title);
            variant = itemView.findViewById(R.id.cart_variant);
            price = itemView.findViewById(R.id.cart_price);
            quantity = itemView.findViewById(R.id.cart_quantity);
            increase = itemView.findViewById(R.id.cart_increase);
            decrease = itemView.findViewById(R.id.cart_decrease);
            remove = itemView.findViewById(R.id.cart_remove);
        }

        void bind(CartRow row) {
            title.setText(row.product.title);
            StoreVariant storeVariant = variantFor(row.product, row.entry.variantId);
            variant.setText(storeVariant == null ? "Selected variant unavailable" : storeVariant.title);
            quantity.setText(String.valueOf(row.entry.quantity));
            double unitPrice = StoreFormat.parseDouble(storeVariant == null ? null : storeVariant.price);
            price.setText(StoreFormat.moneyLabel(unitPrice * Math.max(1, row.entry.quantity)));

            String imageUrl = row.product.primaryImageUrl();
            if (imageUrl == null || imageUrl.isEmpty()) {
                image.setImageResource(R.mipmap.ic_launcher_foreground);
            } else {
                Picasso.get().load(imageUrl).fit().centerCrop().placeholder(R.mipmap.ic_launcher_foreground).into(image);
            }

            itemView.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onOpen(row);
                }
            });
            increase.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onIncrease(row);
                }
            });
            decrease.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onDecrease(row);
                }
            });
            remove.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onRemove(row);
                }
            });
        }
    }

    private StoreVariant variantFor(StoreProduct product, long variantId) {
        for (StoreVariant variant : product.variants) {
            if (variant.id == variantId) {
                return variant;
            }
        }
        return product.defaultVariant();
    }
}
