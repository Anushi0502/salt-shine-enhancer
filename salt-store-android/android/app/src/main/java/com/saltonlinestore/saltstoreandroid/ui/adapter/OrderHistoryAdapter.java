package com.saltonlinestore.saltstoreandroid.ui.adapter;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.google.android.material.button.MaterialButton;
import com.saltonlinestore.saltstoreandroid.R;
import com.saltonlinestore.saltstoreandroid.data.StoreHistoryStore;
import com.saltonlinestore.saltstoreandroid.util.StoreFormat;
import com.squareup.picasso.Picasso;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.ArrayList;
import java.util.List;

public class OrderHistoryAdapter extends RecyclerView.Adapter<OrderHistoryAdapter.OrderHistoryViewHolder> {
    public interface OnOrderHistoryActionListener {
        void onOpen(StoreHistoryStore.OrderHistoryEntry entry);
        void onRestore(StoreHistoryStore.OrderHistoryEntry entry);
        void onRemove(StoreHistoryStore.OrderHistoryEntry entry);
    }

    private final List<StoreHistoryStore.OrderHistoryEntry> items = new ArrayList<>();
    private final OnOrderHistoryActionListener listener;

    public OrderHistoryAdapter(OnOrderHistoryActionListener listener) {
        this.listener = listener;
    }

    public void submit(List<StoreHistoryStore.OrderHistoryEntry> entries) {
        items.clear();
        if (entries != null) {
            items.addAll(entries);
        }
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public OrderHistoryViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_order_history_entry, parent, false);
        return new OrderHistoryViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull OrderHistoryViewHolder holder, int position) {
        holder.bind(items.get(position));
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    class OrderHistoryViewHolder extends RecyclerView.ViewHolder {
        private final ImageView image;
        private final TextView title;
        private final TextView meta;
        private final TextView subtotal;
        private final TextView itemCount;
        private final TextView source;
        private final MaterialButton openCheckout;
        private final MaterialButton restoreCart;
        private final ImageButton remove;

        OrderHistoryViewHolder(@NonNull View itemView) {
            super(itemView);
            image = itemView.findViewById(R.id.order_history_image);
            title = itemView.findViewById(R.id.order_history_title);
            meta = itemView.findViewById(R.id.order_history_meta);
            subtotal = itemView.findViewById(R.id.order_history_subtotal);
            itemCount = itemView.findViewById(R.id.order_history_count);
            source = itemView.findViewById(R.id.order_history_source);
            openCheckout = itemView.findViewById(R.id.order_history_open);
            restoreCart = itemView.findViewById(R.id.order_history_restore);
            remove = itemView.findViewById(R.id.order_history_remove);
        }

        void bind(StoreHistoryStore.OrderHistoryEntry entry) {
            title.setText(entry.items.isEmpty() ? "Checkout session" : entry.items.get(0).title);
            meta.setText(formatDate(entry.createdAt));
            subtotal.setText(StoreFormat.moneyLabel(entry.subtotal));
            itemCount.setText(entry.itemCount + " items");
            source.setText("cart".equalsIgnoreCase(entry.source) ? "Cart handoff" : "Buy now");

            StoreHistoryStore.OrderHistoryItem first = entry.items.isEmpty() ? null : entry.items.get(0);
            if (first == null || first.image == null || first.image.isEmpty()) {
                image.setImageResource(R.mipmap.ic_launcher_foreground);
            } else {
                Picasso.get().load(first.image).fit().centerCrop().placeholder(R.mipmap.ic_launcher_foreground).into(image);
            }

            boolean canOpen = entry.checkoutUrl != null && !entry.checkoutUrl.trim().isEmpty();
            openCheckout.setEnabled(canOpen);
            openCheckout.setText(canOpen ? "Open checkout" : "No checkout URL");
            restoreCart.setEnabled(!entry.items.isEmpty());

            openCheckout.setOnClickListener(v -> {
                if (listener != null && canOpen) {
                    listener.onOpen(entry);
                }
            });
            restoreCart.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onRestore(entry);
                }
            });
            remove.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onRemove(entry);
                }
            });
        }

        private String formatDate(String raw) {
            if (raw == null || raw.trim().isEmpty()) {
                return "Just now";
            }
            try {
                long millis = Long.parseLong(raw.trim());
                return new SimpleDateFormat("MMM d, h:mm a", Locale.getDefault()).format(new Date(millis));
            } catch (NumberFormatException ignore) {
                return raw;
            }
        }
    }
}
