package com.saltonlinestore.saltstoreandroid.ui.adapter;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.saltonlinestore.saltstoreandroid.R;
import com.squareup.picasso.Picasso;

import java.util.ArrayList;
import java.util.List;

public class ProductImagePagerAdapter extends RecyclerView.Adapter<ProductImagePagerAdapter.ImageViewHolder> {
    private final List<String> imageUrls = new ArrayList<>();
    private String fallbackLabel = "";

    public void submit(List<String> urls, String label) {
        imageUrls.clear();
        if (urls != null) {
            for (String url : urls) {
                if (url != null && !url.trim().isEmpty()) {
                    imageUrls.add(url.trim());
                }
            }
        }
        fallbackLabel = label == null ? "" : label.trim();
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public ImageViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_product_gallery_page, parent, false);
        return new ImageViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull ImageViewHolder holder, int position) {
        String url = imageUrls.get(position);
        if (url.isEmpty()) {
            holder.image.setImageResource(R.mipmap.ic_launcher_foreground);
        } else {
            Picasso.get()
                    .load(url)
                    .fit()
                    .centerCrop()
                    .placeholder(R.mipmap.ic_launcher_foreground)
                    .into(holder.image);
        }
        holder.itemView.setContentDescription(fallbackLabel.isEmpty() ? "Product image" : fallbackLabel + " image " + (position + 1));
    }

    @Override
    public int getItemCount() {
        return imageUrls.size();
    }

    static class ImageViewHolder extends RecyclerView.ViewHolder {
        final ImageView image;

        ImageViewHolder(@NonNull View itemView) {
            super(itemView);
            image = itemView.findViewById(R.id.product_gallery_image);
        }
    }
}
