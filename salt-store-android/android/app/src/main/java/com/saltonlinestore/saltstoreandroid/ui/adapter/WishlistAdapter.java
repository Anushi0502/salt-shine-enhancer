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
import com.saltonlinestore.saltstoreandroid.model.StoreProduct;
import com.saltonlinestore.saltstoreandroid.util.StoreFormat;
import com.squareup.picasso.Picasso;

import java.util.ArrayList;
import java.util.List;

public class WishlistAdapter extends RecyclerView.Adapter<WishlistAdapter.WishlistViewHolder> {
    public static class WishlistRow {
        public final StoreProduct product;

        public WishlistRow(StoreProduct product) {
            this.product = product;
        }
    }

    public interface OnWishlistActionListener {
        void onOpen(WishlistRow row);
        void onRemove(WishlistRow row);
    }

    private final List<WishlistRow> items = new ArrayList<>();
    private final OnWishlistActionListener listener;

    public WishlistAdapter(OnWishlistActionListener listener) {
        this.listener = listener;
    }

    public void submit(List<WishlistRow> rows) {
        items.clear();
        if (rows != null) {
            items.addAll(rows);
        }
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public WishlistViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_wishlist_entry, parent, false);
        return new WishlistViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull WishlistViewHolder holder, int position) {
        holder.bind(items.get(position));
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    class WishlistViewHolder extends RecyclerView.ViewHolder {
        private final ImageView image;
        private final TextView title;
        private final TextView meta;
        private final ImageButton remove;

        WishlistViewHolder(@NonNull View itemView) {
            super(itemView);
            image = itemView.findViewById(R.id.wishlist_image);
            title = itemView.findViewById(R.id.wishlist_title);
            meta = itemView.findViewById(R.id.wishlist_meta);
            remove = itemView.findViewById(R.id.wishlist_remove);
        }

        void bind(WishlistRow row) {
            title.setText(row.product.title);
            meta.setText(
                    (row.product.vendor == null || row.product.vendor.isEmpty() ? "SALT" : row.product.vendor)
                            + " • "
                            + StoreFormat.ellipsize(StoreFormat.stripHtml(row.product.bodyHtml), 64));
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
            remove.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onRemove(row);
                }
            });
        }
    }
}
