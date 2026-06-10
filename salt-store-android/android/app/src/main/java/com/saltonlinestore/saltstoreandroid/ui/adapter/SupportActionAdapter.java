package com.saltonlinestore.saltstoreandroid.ui.adapter;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.core.widget.ImageViewCompat;
import androidx.core.content.ContextCompat;
import androidx.recyclerview.widget.RecyclerView;

import com.saltonlinestore.saltstoreandroid.R;
import com.saltonlinestore.saltstoreandroid.ui.SupportAction;

import java.util.ArrayList;
import java.util.List;

public class SupportActionAdapter extends RecyclerView.Adapter<SupportActionAdapter.SupportActionViewHolder> {
    public interface OnSupportActionListener {
        void onAction(SupportAction action);
    }

    private final List<SupportAction> items = new ArrayList<>();
    private final OnSupportActionListener listener;

    public SupportActionAdapter(OnSupportActionListener listener) {
        this.listener = listener;
    }

    public void submit(List<SupportAction> actions) {
        items.clear();
        if (actions != null) {
            items.addAll(actions);
        }
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public SupportActionViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_support_action, parent, false);
        return new SupportActionViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull SupportActionViewHolder holder, int position) {
        holder.bind(items.get(position));
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    class SupportActionViewHolder extends RecyclerView.ViewHolder {
        private final ImageView icon;
        private final TextView title;
        private final TextView subtitle;

        SupportActionViewHolder(@NonNull View itemView) {
            super(itemView);
            icon = itemView.findViewById(R.id.support_icon);
            title = itemView.findViewById(R.id.support_title);
            subtitle = itemView.findViewById(R.id.support_subtitle);
        }

        void bind(SupportAction action) {
            icon.setImageResource(action.iconRes);
            ImageViewCompat.setImageTintList(icon, ContextCompat.getColorStateList(itemView.getContext(), R.color.salt_surface));
            title.setText(action.title);
            subtitle.setText(action.subtitle);
            itemView.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onAction(action);
                }
            });
        }
    }
}
