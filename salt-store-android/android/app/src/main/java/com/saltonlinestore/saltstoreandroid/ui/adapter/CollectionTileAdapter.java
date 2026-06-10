package com.saltonlinestore.saltstoreandroid.ui.adapter;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.saltonlinestore.saltstoreandroid.R;
import com.saltonlinestore.saltstoreandroid.model.StoreCollection;
import com.squareup.picasso.Picasso;

import java.util.ArrayList;
import java.util.List;

public class CollectionTileAdapter extends RecyclerView.Adapter<CollectionTileAdapter.CollectionTileViewHolder> {
    public interface OnCollectionClickListener {
        void onCollectionClick(StoreCollection collection);
    }

    private final List<StoreCollection> items = new ArrayList<>();
    private final OnCollectionClickListener listener;

    public CollectionTileAdapter(OnCollectionClickListener listener) {
        this.listener = listener;
    }

    public void submit(List<StoreCollection> collections) {
        items.clear();
        if (collections != null) {
            items.addAll(collections);
        }
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public CollectionTileViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_collection_tile, parent, false);
        return new CollectionTileViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull CollectionTileViewHolder holder, int position) {
        holder.bind(items.get(position));
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    class CollectionTileViewHolder extends RecyclerView.ViewHolder {
        private final ImageView image;
        private final TextView title;
        private final TextView meta;
        private final TextView cta;

        CollectionTileViewHolder(@NonNull View itemView) {
            super(itemView);
            image = itemView.findViewById(R.id.collection_tile_image);
            title = itemView.findViewById(R.id.collection_tile_title);
            meta = itemView.findViewById(R.id.collection_tile_meta);
            cta = itemView.findViewById(R.id.collection_tile_cta);
        }

        void bind(StoreCollection collection) {
            title.setText(collection.title);
            meta.setText(collection.productsCount + " items");
            cta.setText("Open");
            if (collection.imageUrl == null || collection.imageUrl.isEmpty()) {
                image.setImageResource(R.mipmap.ic_launcher_foreground);
            } else {
                Picasso.get().load(collection.imageUrl).fit().centerCrop().placeholder(R.mipmap.ic_launcher_foreground).into(image);
            }
            itemView.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onCollectionClick(collection);
                }
            });
        }
    }
}
